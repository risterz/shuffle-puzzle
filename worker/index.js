import { shuffleBoard } from '../game.js';
import { ValidationError, gameOptions, leaderboardOptions, scoreSubmission } from './validation.js';

const GAME_LIFETIME = 2 * 60 * 60 * 1000;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function readJson(request, limit = 60000) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    throw new ValidationError('Send a JSON request.');
  }
  const length = Number(request.headers.get('Content-Length'));
  if (length > limit) throw new ValidationError('The request is too large.');
  const text = await request.text();
  if (new TextEncoder().encode(text).length > limit) throw new ValidationError('The request is too large.');
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError('The JSON request is invalid.');
  }
}

function random() {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
}

async function createGame(request, env) {
  const options = gameOptions(await readJson(request, 2048));
  const id = crypto.randomUUID();
  const now = Date.now();
  const board = shuffleBoard(options.size, random);
  await env.DB.prepare(
    'INSERT INTO games (id, size, mode, board_json, issued_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(id, options.size, options.mode, JSON.stringify(board), now, now + GAME_LIFETIME).run();
  return json({ gameId: id, board }, 201);
}

async function leaderboard(url, env) {
  const { size, mode } = leaderboardOptions(url);
  const { results } = await env.DB.prepare(
    `SELECT player_name AS name, time_seconds AS seconds, moves, created_at AS createdAt
     FROM scores WHERE size = ? AND mode = ?
     ORDER BY time_seconds ASC, moves ASC, created_at ASC, id ASC LIMIT 100`,
  ).bind(size, mode).all();
  return json({ scores: results.map((score, index) => ({ ...score, rank: index + 1 })) });
}

async function submitScore(request, env) {
  const payload = await readJson(request);
  if (!payload || typeof payload.gameId !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.gameId)) {
    throw new ValidationError('The ranked puzzle identifier is invalid.');
  }
  const game = await env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(payload.gameId).first();
  const score = scoreSubmission(payload, game);
  const id = crypto.randomUUID();
  const now = Date.now();
  // D1 batches are transactional. The unique game_id also prevents replay submissions.
  await env.DB.batch([
    env.DB.prepare('INSERT INTO scores (id, game_id, player_name, size, mode, time_seconds, moves, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, game.id, score.name, score.size, score.mode, score.seconds, score.moves, now),
    env.DB.prepare('UPDATE games SET used_at = ? WHERE id = ? AND used_at IS NULL').bind(now, game.id),
  ]);
  const row = await env.DB.prepare(
    'SELECT COUNT(*) + 1 AS rank FROM scores WHERE size = ? AND mode = ? AND (time_seconds < ? OR (time_seconds = ? AND (moves < ? OR (moves = ? AND (created_at < ? OR (created_at = ? AND id < ?))))))',
  ).bind(score.size, score.mode, score.seconds, score.seconds, score.moves, score.moves, now, now, id).first();
  return json({ submitted: true, rank: Number(row.rank), score: { ...score, name: score.name } }, 201);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/games' && request.method === 'POST') return await createGame(request, env);
      if (url.pathname === '/api/scores' && request.method === 'POST') return await submitScore(request, env);
      if (url.pathname === '/api/leaderboard' && request.method === 'GET') return await leaderboard(url, env);
      if (url.pathname.startsWith('/api/')) return json({ error: 'Not found.' }, 404);
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      if (error instanceof ValidationError) return json({ error: error.message }, 400);
      console.error('Leaderboard request failed', error);
      return json({ error: 'The leaderboard is temporarily unavailable. Please try again.' }, 503);
    }
  },
};

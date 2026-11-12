import { isSolved, moveTile } from '../game.js';

export class ValidationError extends Error {}

export function gameOptions(value) {
  if (!value || ![3, 4, 5].includes(value.size) || !['number', 'picture'].includes(value.mode)) {
    throw new ValidationError('Choose a valid difficulty and puzzle mode.');
  }
  return { size: value.size, mode: value.mode };
}

export function leaderboardOptions(url) {
  const size = Number(url.searchParams.get('size') || 3);
  const mode = url.searchParams.get('mode') || 'number';
  return gameOptions({ size, mode });
}

export function playerName(value) {
  if (typeof value !== 'string') throw new ValidationError('Enter a display name.');
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name || [...name].length > 20 || /[\p{Cc}\p{Cf}]/u.test(name)) {
    throw new ValidationError('Use a display name between 1 and 20 characters.');
  }
  return name;
}

export function scoreSubmission(payload, game, now = Date.now()) {
  if (!payload || !game || game.used_at !== null || game.expires_at < now) {
    throw new ValidationError('This puzzle is no longer eligible. Start a new ranked game.');
  }
  if (typeof payload.gameId !== 'string' || payload.gameId !== game.id) {
    throw new ValidationError('The submitted puzzle does not match.');
  }
  if (!Number.isInteger(payload.seconds) || payload.seconds < 1 || payload.seconds > 86400) {
    throw new ValidationError('The completion time is invalid.');
  }
  if (!Array.isArray(payload.moves) || payload.moves.length < 1 || payload.moves.length > 5000) {
    throw new ValidationError('The move history is invalid.');
  }
  // Reject impossible speeds while allowing fast touch and keyboard play.
  if (payload.seconds * 12 < payload.moves.length) {
    throw new ValidationError('The completion time is inconsistent with the moves.');
  }

  let board;
  try {
    board = JSON.parse(game.board_json);
  } catch {
    throw new ValidationError('The original puzzle could not be verified.');
  }
  if (!Array.isArray(board) || board.length !== game.size * game.size || isSolved(board)) {
    throw new ValidationError('The original puzzle is invalid.');
  }
  const expected = [...Array(board.length).keys()];
  if (!board.every((value) => Number.isInteger(value)) || ![...board].sort((a, b) => a - b).every((value, index) => value === expected[index])) {
    throw new ValidationError('The original puzzle is invalid.');
  }

  for (const value of payload.moves) {
    if (!Number.isInteger(value)) throw new ValidationError('Every move must be a tile number.');
    const result = moveTile(board, board.indexOf(value), game.size);
    if (!result.moved) throw new ValidationError('The move history contains an illegal move.');
    board = result.board;
  }
  if (!isSolved(board)) throw new ValidationError('The move history does not solve the puzzle.');

  return {
    name: playerName(payload.name),
    size: game.size,
    mode: game.mode,
    seconds: payload.seconds,
    moves: payload.moves.length,
  };
}

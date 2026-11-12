import assert from 'node:assert/strict';
import test from 'node:test';
import { gameOptions, leaderboardOptions, playerName, scoreSubmission, ValidationError } from '../worker/validation.js';

const now = 1000000;
const fixture = {
  id: '0f7d89ca-91ee-4f47-b0ba-070a9b6fc2cc',
  size: 3,
  mode: 'number',
  board_json: JSON.stringify([1, 2, 3, 4, 5, 6, 7, 0, 8]),
  used_at: null,
  expires_at: now + 10000,
};
const submission = (changes = {}) => ({ gameId: fixture.id, name: '  Little   Solver ', seconds: 12, moves: [8], ...changes });

test('game options allow only supported categories', () => {
  assert.deepEqual(gameOptions({ size: 5, mode: 'picture' }), { size: 5, mode: 'picture' });
  for (const value of [{ size: 6, mode: 'number' }, { size: 3, mode: 'other' }, null]) {
    assert.throws(() => gameOptions(value), ValidationError);
  }
  const url = new URL('https://example.com/api/leaderboard?size=4&mode=picture');
  assert.deepEqual(leaderboardOptions(url), { size: 4, mode: 'picture' });
});

test('player names are trimmed and length checked in Unicode characters', () => {
  assert.equal(playerName('  Little   Solver '), 'Little Solver');
  assert.equal(playerName('🧩'.repeat(20)).length, 40);
  assert.throws(() => playerName('🧩'.repeat(21)), ValidationError);
  assert.throws(() => playerName(''), ValidationError);
  assert.throws(() => playerName('bad\u0000name'), ValidationError);
});

test('valid server-issued move history produces the submitted score', () => {
  assert.deepEqual(scoreSubmission(submission(), fixture, now), {
    name: 'Little Solver', size: 3, mode: 'number', seconds: 12, moves: 1,
  });
});

test('submission rejects reused, expired, unknown and mismatched games', () => {
  for (const game of [null, { ...fixture, used_at: now }, { ...fixture, expires_at: now - 1 }]) {
    assert.throws(() => scoreSubmission(submission(), game, now), ValidationError);
  }
  assert.throws(() => scoreSubmission(submission({ gameId: crypto.randomUUID() }), fixture, now), ValidationError);
});

test('submission rejects illegal, incomplete and malformed histories', () => {
  for (const moves of [[7], [8, 7], [], [8.5], Array(5001).fill(8), '8']) {
    assert.throws(() => scoreSubmission(submission({ moves }), fixture, now), ValidationError);
  }
});

test('submission rejects invalid or inconsistent times', () => {
  for (const seconds of [0, -1, 1.5, 86401, '12']) {
    assert.throws(() => scoreSubmission(submission({ seconds }), fixture, now), ValidationError);
  }
  assert.throws(() => scoreSubmission(submission({ seconds: 1, moves: [8, 5, 8, 7, 4, 5, 6, 3, 2, 5, 8, 7, 4, 1, 2, 5, 8, 7, 4, 5, 6] }), fixture, now), ValidationError);
});

test('submission rejects malformed initial boards', () => {
  for (const board of [[1, 2, 3, 4, 5, 6, 7, 8, 8], [0, 1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3], [1, 2, 3, 4, 5, 6, 7, 0, 8.5]]) {
    assert.throws(() => scoreSubmission(submission(), { ...fixture, board_json: JSON.stringify(board) }, now), ValidationError);
  }
});

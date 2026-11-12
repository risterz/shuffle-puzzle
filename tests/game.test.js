import test from 'node:test';
import assert from 'node:assert/strict';
import { createSolvedBoard, isSolved, canMove, moveTile, shuffleBoard, tileForArrow, arrowForSwipe, formatTime } from '../game.js';

for (const size of [3, 4, 5]) {
  test(`${size}x${size} solved board has the correct sequence`, () => {
    const board = createSolvedBoard(size);
    assert.equal(board.length, size * size);
    assert.equal(board.at(-1), 0);
    assert.equal(isSolved(board), true);
  });

  test(`${size}x${size} shuffle is solvable, complete, and not already solved`, () => {
    const board = shuffleBoard(size);
    assert.equal(isSolved(board), false);
    assert.deepEqual([...board].sort((a, b) => a - b), createSolvedBoard(size).sort((a, b) => a - b));
  });

  test(`${size}x${size} legal moves exchange a tile with the empty space`, () => {
    const board = createSolvedBoard(size);
    const empty = board.indexOf(0);
    const result = moveTile(board, empty - 1, size);
    assert.equal(result.moved, true);
    assert.equal(result.board[empty - 1], 0);
    assert.equal(result.board[empty], size * size - 1);
    assert.equal(isSolved(moveTile(result.board, empty, size).board), true);
    assert.equal(canMove(board, empty, size), false);
    assert.equal(canMove(board, 0, size), false);
  });

  test(`${size}x${size} horizontal moves cannot wrap between rows`, () => {
    const board = createSolvedBoard(size);
    assert.equal(canMove(board, size - 1, size), false);
  });
}

test('arrow keys move tiles in the direction of the arrow', () => {
  const board = createSolvedBoard(3);
  assert.equal(tileForArrow(board, 'ArrowUp', 3), -1);
  assert.equal(tileForArrow(board, 'ArrowLeft', 3), -1);
  assert.equal(tileForArrow(board, 'ArrowRight', 3), 7);
  assert.equal(tileForArrow(board, 'ArrowDown', 3), 5);
});

test('swipes follow arrow-key directions and ignore small taps', () => {
  assert.equal(arrowForSwipe(45, 4), 'ArrowRight');
  assert.equal(arrowForSwipe(-45, 4), 'ArrowLeft');
  assert.equal(arrowForSwipe(4, 45), 'ArrowDown');
  assert.equal(arrowForSwipe(4, -45), 'ArrowUp');
  assert.equal(arrowForSwipe(12, 10), null);
  assert.equal(arrowForSwipe(20, -20), null);
});

test('time formatting handles minutes and padding', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(65), '01:05');
  assert.equal(formatTime(600), '10:00');
});

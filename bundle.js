'use strict';

function createSolvedBoard(size) {
  return [...Array(size * size - 1).keys()].map((value) => value + 1).concat(0);
}

function isSolved(board) {
  return board.every((value, index) => value === (index + 1) % board.length);
}

function canMove(board, index, size) {
  const emptyIndex = board.indexOf(0);
  const sameRow = Math.floor(index / size) === Math.floor(emptyIndex / size);
  const distance = Math.abs(index - emptyIndex);
  return index >= 0 && index < board.length && board[index] !== 0 && (distance === size || (distance === 1 && sameRow));
}

function moveTile(board, index, size) {
  if (!canMove(board, index, size)) return { board, moved: false };
  const next = [...board];
  const emptyIndex = next.indexOf(0);
  [next[index], next[emptyIndex]] = [next[emptyIndex], next[index]];
  return { board: next, moved: true };
}

function shuffleBoard(size, random = Math.random) {
  let board = createSolvedBoard(size);
  let previousEmpty = -1;
  const steps = size * size * 40;

  for (let step = 0; step < steps; step += 1) {
    const emptyIndex = board.indexOf(0);
    const row = Math.floor(emptyIndex / size);
    const column = emptyIndex % size;
    const candidates = [];
    if (row > 0) candidates.push(emptyIndex - size);
    if (row < size - 1) candidates.push(emptyIndex + size);
    if (column > 0) candidates.push(emptyIndex - 1);
    if (column < size - 1) candidates.push(emptyIndex + 1);
    const options = candidates.filter((index) => index !== previousEmpty);
    const chosen = options[Math.floor(random() * options.length)];
    previousEmpty = emptyIndex;
    board = moveTile(board, chosen, size).board;
  }

  return isSolved(board) ? shuffleBoard(size, random) : board;
}

function tileForArrow(board, arrow, size) {
  const empty = board.indexOf(0);
  const row = Math.floor(empty / size);
  const column = empty % size;
  if (arrow === 'ArrowUp' && row < size - 1) return empty + size;
  if (arrow === 'ArrowDown' && row > 0) return empty - size;
  if (arrow === 'ArrowLeft' && column < size - 1) return empty + 1;
  if (arrow === 'ArrowRight' && column > 0) return empty - 1;
  return -1;
}

function arrowForSwipe(deltaX, deltaY, threshold = 30) {
  const horizontal = Math.abs(deltaX) >= Math.abs(deltaY);
  const distance = horizontal ? Math.abs(deltaX) : Math.abs(deltaY);
  if (distance < threshold) return null;
  if (horizontal) return deltaX > 0 ? 'ArrowRight' : 'ArrowLeft';
  return deltaY > 0 ? 'ArrowDown' : 'ArrowUp';
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}


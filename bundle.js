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


const boardElement = document.querySelector('#board');
const timerElement = document.querySelector('#timer');
const movesElement = document.querySelector('#moves');
const bestElement = document.querySelector('#best');
const statusElement = document.querySelector('#status-badge');
const announcer = document.querySelector('#announcer');
const helpDialog = document.querySelector('#help-dialog');
const winDialog = document.querySelector('#win-dialog');
const difficultyButtons = [...document.querySelectorAll('.difficulty-button')];
const pictureButtons = [...document.querySelectorAll('.picture-choice')];
const picturePicker = document.querySelector('#picture-picker');
const previewButton = document.querySelector('#preview-button');
const imageCaption = document.querySelector('#image-caption');
const tiles = new Map();
const leaderboardDialog = document.querySelector('#leaderboard-dialog');
const scoreForm = document.querySelector('#score-form');
const usernameForm = document.querySelector('#username-form');
const playerNameInput = document.querySelector('#player-name');
const leaderboardNameInput = document.querySelector('#leaderboard-name');
const usernameStatus = usernameForm.querySelector('.form-status');
const themeButton = document.querySelector('#theme-button');
const themeColor = document.querySelector('meta[name="theme-color"]');
const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
const saveKey = 'shuffle-current-game-v1';
const rankedSaveKey = 'shuffle-ranked-game-v1';

let size = 3;
let pictureMode = false;
let picture = { src: 'assets/quiet-lake.svg', name: 'Quiet lake' };
let board = [];
let moves = 0;
let seconds = 0;
let startedAt = null;
let timerId = null;
let finished = false;
let completionTimerId = null;
let swipeStart = null;
let swipeDirection = null;
let suppressClickUntil = 0;
let rankedGame = null;
let moveHistory = [];
let gameRequestId = 0;
let leaderboardRequestId = 0;
let scoreSubmitting = false;
let latestScoreSubmitted = false;
let boardRevision = 0;

function applyTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const label = `Switch to ${nextTheme} theme`;
  themeButton.setAttribute('aria-label', label);
  themeButton.title = label;
  themeColor.content = theme === 'dark' ? '#15141c' : '#f7f6f2';
  if (persist) {
    try {
      localStorage.setItem('shuffle-theme', theme);
    } catch {
      // Theme switching still works when browser storage is unavailable.
    }
  }
}

applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
themeButton.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
});
colorScheme.addEventListener('change', (event) => {
  try {
    if (localStorage.getItem('shuffle-theme')) return;
  } catch {
    // Follow the system theme when browser storage is unavailable.
  }
  applyTheme(event.matches ? 'dark' : 'light');
});

function removeRankedGame() {
  rankedGame = null;
  moveHistory = [];
  try {
    localStorage.removeItem(rankedSaveKey);
  } catch {
    // Ranking is optional when browser storage is unavailable.
  }
}

function readRankedGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(rankedSaveKey));
    if (!saved || typeof saved.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(saved.id)) return null;
    if (!isValidSavedBoard(saved.initialBoard, saved.size)) return null;
    if (![3, 4, 5].includes(saved.size) || !['number', 'picture'].includes(saved.mode)) return null;
    if (!Number.isInteger(saved.expiresAt) || saved.expiresAt <= Date.now()) return null;
    if (!Array.isArray(saved.moves) || saved.moves.length > 5000 || !saved.moves.every(Number.isInteger)) return null;
    let replay = [...saved.initialBoard];
    for (const value of saved.moves) {
      const result = moveTile(replay, replay.indexOf(value), saved.size);
      if (!result.moved) return null;
      replay = result.board;
    }
    return { ...saved, board: replay };
  } catch {
    return null;
  }
}

function saveRankedGame() {
  if (!rankedGame) return;
  try {
    localStorage.setItem(rankedSaveKey, JSON.stringify({ ...rankedGame, moves: moveHistory }));
  } catch {
    // An unresumable ranked game can still be played during this session.
  }
}

function prepareRankedGame(saved) {
  rankedGame = { id: saved.id, initialBoard: [...saved.initialBoard], size: saved.size, mode: saved.mode, expiresAt: saved.expiresAt };
  moveHistory = [...saved.moves];
  latestScoreSubmitted = false;
}

async function requestRankedGame() {
  const request = ++gameRequestId;
  const selectedSize = size;
  const selectedMode = pictureMode ? 'picture' : 'number';
  const boardRevisionAtIssue = boardRevision;
  if (window.location.protocol === 'file:') return;
  try {
    const response = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ size: selectedSize, mode: selectedMode }),
    });
    if (!response.ok) return;
    const data = await response.json();
    if (request !== gameRequestId || size !== selectedSize || pictureMode !== (selectedMode === 'picture') || boardRevision !== boardRevisionAtIssue || finished) return;
    if (typeof data.gameId !== 'string' || !isValidSavedBoard(data.board, selectedSize) || isSolved(data.board)) return;
    removeRankedGame();
    board = data.board;
    rankedGame = { id: data.gameId, initialBoard: [...board], size: selectedSize, mode: selectedMode, expiresAt: Date.now() + 2 * 60 * 60 * 1000 };
    moveHistory = [];
    moves = 0;
    seconds = 0;
    movesElement.textContent = '0';
    timerElement.textContent = '00:00';
    renderBoard();
    saveGame();
    saveRankedGame();
  } catch {
    // The local game remains playable while the leaderboard API is unavailable.
  }
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, options);
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('The leaderboard returned an invalid response.');
  }
  if (!response.ok) throw new Error(data.error || 'The leaderboard is temporarily unavailable.');
  return data;
}

async function loadLeaderboard() {
  const request = ++leaderboardRequestId;
  const selectedSize = Number(document.querySelector('#leaderboard-size').value);
  const selectedMode = document.querySelector('#leaderboard-mode').value;
  const status = document.querySelector('#leaderboard-status');
  leaderboardDialog.setAttribute('aria-busy', 'true');
  document.querySelector('#refresh-leaderboard').disabled = true;
  status.textContent = 'Loading scores…';
  try {
    const data = await apiRequest(`/api/leaderboard?size=${selectedSize}&mode=${selectedMode}`);
    if (request !== leaderboardRequestId) return;
    const rows = document.querySelector('#leaderboard-rows');
    rows.replaceChildren();
    for (const score of data.scores) {
      const row = document.createElement('tr');
      for (const value of [score.rank, score.name, formatTime(score.seconds), score.moves]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      rows.append(row);
    }
    status.textContent = data.scores.length ? '' : 'No scores yet. Be the first to set one!';
  } catch (error) {
    if (request !== leaderboardRequestId) return;
    document.querySelector('#leaderboard-rows').replaceChildren();
    status.textContent = window.location.protocol === 'file:' ? 'Leaderboards need the deployed site or Wrangler dev server.' : error.message;
  } finally {
    if (request === leaderboardRequestId) {
      leaderboardDialog.setAttribute('aria-busy', 'false');
      document.querySelector('#refresh-leaderboard').disabled = false;
    }
  }
}

function readPlayerName() {
  try {
    return localStorage.getItem('shuffle-player-name') || '';
  } catch {
    return '';
  }
}

function savePlayerName(name) {
  playerNameInput.value = name;
  leaderboardNameInput.value = name;
  try {
    localStorage.setItem('shuffle-player-name', name);
  } catch {
    // The nickname remains available for this session without browser storage.
  }
}

function readBest() {
  try {
    const value = JSON.parse(localStorage.getItem(`shuffle-best-${pictureMode ? 'picture' : 'number'}-${size}`));
    return value && Number.isInteger(value.moves) && Number.isInteger(value.seconds) ? value : null;
  } catch {
    return null;
  }
}

function updateBest() {
  const best = readBest();
  bestElement.textContent = best ? `${best.moves} moves` : '—';
}

function elapsedSeconds() {
  return startedAt === null ? seconds : seconds + Math.floor((Date.now() - startedAt) / 1000);
}

function renderTime() {
  timerElement.textContent = formatTime(elapsedSeconds());
}

function startTimer() {
  if (startedAt !== null || finished || document.hidden) return;
  startedAt = Date.now();
  timerId = window.setInterval(renderTime, 500);
  statusElement.innerHTML = '<span></span> In the flow';
  statusElement.classList.add('playing');
}

function stopTimer() {
  if (startedAt !== null) seconds = elapsedSeconds();
  startedAt = null;
  window.clearInterval(timerId);
  timerId = null;
  renderTime();
}

function createTiles() {
  boardElement.replaceChildren();
  tiles.clear();
  for (let value = 1; value < size * size; value += 1) {
    const tile = document.createElement('button');
    tile.className = pictureMode ? 'tile image-tile' : 'tile';
    tile.textContent = pictureMode ? '' : value;
    tile.dataset.value = value;
    tile.setAttribute('aria-label', pictureMode ? `Picture piece ${value}` : `Tile ${value}`);
    if (pictureMode) {
      const sourceIndex = value - 1;
      const sourceRow = Math.floor(sourceIndex / size);
      const sourceColumn = sourceIndex % size;
      tile.style.backgroundImage = `url("${picture.src}")`;
      tile.style.backgroundSize = `${size * 100}% ${size * 100}%`;
      tile.style.backgroundPosition = `${sourceColumn * 100 / (size - 1)}% ${sourceRow * 100 / (size - 1)}%`;
    }
    tile.addEventListener('click', () => {
      if (Date.now() < suppressClickUntil) return;
      playMove(board.indexOf(value));
    });
    tiles.set(value, tile);
    boardElement.append(tile);
  }
}

function renderBoard() {
  board.forEach((value, index) => {
    if (!value) return;
    const tile = tiles.get(value);
    const row = Math.floor(index / size);
    const column = index % size;
    tile.style.setProperty('--row', row);
    tile.style.setProperty('--column', column);
    tile.style.setProperty('--size', size);
    tile.classList.toggle('correct', value === index + 1);
    tile.classList.toggle('movable', !finished && moveTile(board, index, size).moved);
    tile.disabled = finished;
    tile.setAttribute('aria-label', `${pictureMode ? 'Picture piece' : 'Tile'} ${value}, row ${row + 1}, column ${column + 1}`);
  });
}

function saveBest() {
  const best = readBest();
  if (!best || moves < best.moves || (moves === best.moves && seconds < best.seconds)) {
    try {
      localStorage.setItem(`shuffle-best-${pictureMode ? 'picture' : 'number'}-${size}`, JSON.stringify({ moves, seconds }));
    } catch {
      // Storage can be unavailable in privacy mode; gameplay still works.
    }
  }
}

function isValidSavedBoard(savedBoard, savedSize) {
  if (!Array.isArray(savedBoard) || savedBoard.length !== savedSize * savedSize) return false;
  const values = [...savedBoard].sort((a, b) => a - b);
  return values.every((value, index) => Number.isInteger(value) && value === index);
}

function saveGame() {
  if (finished) return;
  try {
    localStorage.setItem(saveKey, JSON.stringify({
      version: 1,
      size,
      pictureMode,
      picture,
      board,
      moves,
      seconds: elapsedSeconds(),
    }));
  } catch {
    // Uploaded photos may exceed storage limits; keep the current session playable.
  }
}

function readSavedGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(saveKey));
    if (!saved || saved.version !== 1 || ![3, 4, 5].includes(saved.size)) return null;
    if (typeof saved.pictureMode !== 'boolean' || !isValidSavedBoard(saved.board, saved.size)) return null;
    if (!Number.isInteger(saved.moves) || saved.moves < 0 || !Number.isInteger(saved.seconds) || saved.seconds < 0) return null;
    if (isSolved(saved.board)) return null;
    if (!saved.picture || typeof saved.picture.src !== 'string' || typeof saved.picture.name !== 'string') return null;
    if (!/^(assets\/[a-z-]+\.svg|data:image\/(?:png|jpeg|webp);base64,)/.test(saved.picture.src)) return null;
    return saved;
  } catch {
    return null;
  }
}

function restoreGame(saved) {
  size = saved.size;
  pictureMode = saved.pictureMode;
  picture = { src: saved.picture.src, name: saved.picture.name };
  board = [...saved.board];
  moves = saved.moves;
  seconds = saved.seconds;
  finished = false;
  startedAt = null;

  setPictureMode(pictureMode, false);
  difficultyButtons.forEach((button) => {
    const selected = Number(button.dataset.size) === size;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const selectedPicture = pictureButtons.find((button) => button.dataset.image === picture.src);
  pictureButtons.forEach((button) => {
    const selected = button === selectedPicture;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelector('#upload-label').classList.toggle('selected', !selectedPicture);
  imageCaption.textContent = `${picture.name} · Rebuild the picture, one slide at a time.`;
  movesElement.textContent = moves;
  timerElement.textContent = formatTime(seconds);
  statusElement.innerHTML = `<span></span> ${moves > 0 ? 'Welcome back' : 'Ready to play'}`;
  statusElement.classList.remove('playing');
  boardElement.style.setProperty('--size', size);
  boardElement.dataset.size = size;
  boardElement.setAttribute('aria-label', `${size} by ${size} sliding ${pictureMode ? 'picture' : 'number'} puzzle. Swipe, use arrow keys, or select a tile next to the empty space.`);
  boardElement.parentElement.style.setProperty('--preview-image', `url("${picture.src}")`);
  boardElement.parentElement.classList.remove('previewing', 'completing');
  previewButton.setAttribute('aria-pressed', 'false');
  previewButton.setAttribute('aria-label', 'Show complete picture');
  createTiles();
  renderBoard();
  updateBest();
  if (winDialog.open) winDialog.close();
  if (moves > 0) startTimer();
  announcer.textContent = moves > 0 ? `Game restored with ${moves} moves.` : 'Saved game ready.';
}

function completeGame() {
  finished = true;
  stopTimer();
  try {
    localStorage.removeItem(saveKey);
    localStorage.removeItem(rankedSaveKey);
  } catch {
    // Storage can be unavailable; completion still works.
  }
  scoreForm.hidden = !rankedGame;
  document.querySelector('#unranked-note').hidden = Boolean(rankedGame);
  document.querySelector('#score-status').textContent = '';
  latestScoreSubmitted = false;
  saveBest();
  updateBest();
  renderBoard();
  statusElement.innerHTML = '<span></span> Puzzle complete';
  statusElement.classList.remove('playing');
  document.querySelector('#win-time').textContent = formatTime(seconds);
  document.querySelector('#win-moves').textContent = moves;
  announcer.textContent = `Puzzle complete in ${formatTime(seconds)} and ${moves} moves.`;
  window.clearTimeout(completionTimerId);
  completionTimerId = null;
  const boardWrap = boardElement.parentElement;
  if (pictureMode) {
    boardWrap.classList.remove('previewing');
    boardWrap.classList.add('completing');
    previewButton.setAttribute('aria-pressed', 'false');
    previewButton.setAttribute('aria-label', 'Show complete picture');
    previewButton.hidden = true;
    boardElement.setAttribute('aria-label', `${size} by ${size} completed picture puzzle.`);
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const delay = pictureMode && !reducedMotion ? 1100 : 250;
  completionTimerId = window.setTimeout(() => {
    completionTimerId = null;
    if (finished && !winDialog.open) winDialog.showModal();
  }, delay);
}

function playMove(index) {
  if (finished) return;
  const result = moveTile(board, index, size);
  if (!result.moved) return;
  startTimer();
  const value = board[index];
  board = result.board;
  moves += 1;
  boardRevision += 1;
  if (rankedGame) moveHistory.push(value);
  movesElement.textContent = moves;
  renderBoard();
  saveGame();
  saveRankedGame();
  if (isSolved(board)) completeGame();
}

function newGame() {
  gameRequestId += 1;
  removeRankedGame();
  boardRevision += 1;
  stopTimer();
  window.clearTimeout(completionTimerId);
  completionTimerId = null;
  swipeStart = null;
  swipeDirection = null;
  board = shuffleBoard(size);
  moves = 0;
  seconds = 0;
  startedAt = null;
  finished = false;
  movesElement.textContent = '0';
  timerElement.textContent = '00:00';
  statusElement.innerHTML = '<span></span> Ready to play';
  statusElement.classList.remove('playing');
  boardElement.style.setProperty('--size', size);
  boardElement.dataset.size = size;
  boardElement.setAttribute('aria-label', `${size} by ${size} sliding ${pictureMode ? 'picture' : 'number'} puzzle. Swipe, use arrow keys, or select a tile next to the empty space.`);
  boardElement.parentElement.style.setProperty('--preview-image', `url("${picture.src}")`);
  boardElement.parentElement.classList.remove('previewing', 'completing');
  previewButton.hidden = !pictureMode;
  previewButton.setAttribute('aria-pressed', 'false');
  previewButton.setAttribute('aria-label', 'Show complete picture');
  createTiles();
  renderBoard();
  updateBest();
  if (winDialog.open) winDialog.close();
  saveGame();
  void requestRankedGame();
}

difficultyButtons.forEach((button) => {
  button.addEventListener('click', () => {
    size = Number(button.dataset.size);
    difficultyButtons.forEach((item) => {
      const selected = item === button;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-pressed', selected);
    });
    newGame();
    boardElement.focus({ preventScroll: true });
  });
});

function setPictureMode(enabled, startNewGame = true) {
  pictureMode = enabled;
  document.querySelector('#numbers-mode').classList.toggle('active', !enabled);
  document.querySelector('#pictures-mode').classList.toggle('active', enabled);
  document.querySelector('#numbers-mode').setAttribute('aria-pressed', String(!enabled));
  document.querySelector('#pictures-mode').setAttribute('aria-pressed', String(enabled));
  picturePicker.hidden = !enabled;
  previewButton.hidden = !enabled;
  imageCaption.hidden = !enabled;
  if (startNewGame) newGame();
}

function selectPicture(button) {
  picture = { src: button.dataset.image, name: button.dataset.name };
  pictureButtons.forEach((item) => {
    const selected = item === button;
    item.classList.toggle('selected', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  document.querySelector('#upload-label').classList.remove('selected');
  imageCaption.textContent = `${picture.name} · Rebuild the picture, one slide at a time.`;
  newGame();
}

document.querySelector('#numbers-mode').addEventListener('click', () => setPictureMode(false));
document.querySelector('#pictures-mode').addEventListener('click', () => setPictureMode(true));
pictureButtons.forEach((button) => button.addEventListener('click', () => selectPicture(button)));

previewButton.addEventListener('click', () => {
  if (finished) return;
  const showing = boardElement.parentElement.classList.toggle('previewing');
  previewButton.setAttribute('aria-pressed', String(showing));
  previewButton.setAttribute('aria-label', showing ? 'Hide complete picture' : 'Show complete picture');
});

document.querySelector('#picture-upload').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    announcer.textContent = 'Please choose an image file.';
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    announcer.textContent = 'Please choose an image smaller than 20 megabytes.';
    return;
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 900;
    const context = canvas.getContext('2d');
    const scale = Math.max(900 / image.naturalWidth, 900 / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (900 - width) / 2, (900 - height) / 2, width, height);
    URL.revokeObjectURL(url);
    picture = { src: canvas.toDataURL('image/jpeg', 0.88), name: 'Your photo' };
    pictureButtons.forEach((button) => {
      button.classList.remove('selected');
      button.setAttribute('aria-pressed', 'false');
    });
    document.querySelector('#upload-label').classList.add('selected');
    imageCaption.textContent = 'Your photo · Rebuild the picture, one slide at a time.';
    newGame();
    announcer.textContent = 'Your photo is ready. It stays on this device.';
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    announcer.textContent = 'This image could not be opened. Please try another.';
  };
  image.src = url;
});

boardElement.addEventListener('pointerdown', (event) => {
  if (finished || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
  swipeStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
  swipeDirection = null;
});

boardElement.addEventListener('pointermove', (event) => {
  if (!swipeStart || swipeStart.id !== event.pointerId) return;
  const deltaX = event.clientX - swipeStart.x;
  const deltaY = event.clientY - swipeStart.y;
  const direction = arrowForSwipe(deltaX, deltaY);
  if (direction) {
    event.preventDefault();
    swipeDirection = direction;
    if (!boardElement.hasPointerCapture(event.pointerId)) {
      boardElement.setPointerCapture(event.pointerId);
    }
  }
});

boardElement.addEventListener('pointerup', (event) => {
  if (!swipeStart || swipeStart.id !== event.pointerId) return;
  const direction = swipeDirection || arrowForSwipe(event.clientX - swipeStart.x, event.clientY - swipeStart.y);
  swipeStart = null;
  swipeDirection = null;
  if (!direction) return;
  suppressClickUntil = Date.now() + 500;
  playMove(tileForArrow(board, direction, size));
});

function cancelSwipe() {
  swipeStart = null;
  swipeDirection = null;
}
boardElement.addEventListener('pointercancel', cancelSwipe);

boardElement.addEventListener('keydown', (event) => {
  if (!event.key.startsWith('Arrow')) return;
  event.preventDefault();
  playMove(tileForArrow(board, event.key, size));
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && startedAt !== null) {
    stopTimer();
    saveGame();
  } else if (!document.hidden && moves > 0 && !finished) {
    startTimer();
  }
});
window.addEventListener('pagehide', () => {
  stopTimer();
  saveGame();
});

document.querySelector('#new-game-button').addEventListener('click', newGame);
document.querySelector('#help-button').addEventListener('click', () => helpDialog.showModal());
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => helpDialog.close()));
document.querySelector('#play-again-button').addEventListener('click', newGame);
document.querySelector('#leaderboard-button').addEventListener('click', () => {
  document.querySelector('#leaderboard-size').value = String(size);
  document.querySelector('#leaderboard-mode').value = pictureMode ? 'picture' : 'number';
  leaderboardNameInput.value = readPlayerName();
  usernameStatus.textContent = 'Used when you submit a completed online puzzle.';
  leaderboardDialog.showModal();
  void loadLeaderboard();
});
document.querySelector('[data-close-leaderboard]').addEventListener('click', () => leaderboardDialog.close());
document.querySelector('#refresh-leaderboard').addEventListener('click', loadLeaderboard);
document.querySelector('#leaderboard-size').addEventListener('change', loadLeaderboard);
document.querySelector('#leaderboard-mode').addEventListener('change', loadLeaderboard);
const savedPlayerName = readPlayerName();
playerNameInput.value = savedPlayerName;
leaderboardNameInput.value = savedPlayerName;
usernameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = leaderboardNameInput.value.trim().replace(/\s+/g, ' ');
  if (!name || [...name].length > 20 || /[\p{Cc}\p{Cf}]/u.test(name)) {
    usernameStatus.textContent = 'Use a nickname between 1 and 20 characters.';
    leaderboardNameInput.setCustomValidity('Use a nickname between 1 and 20 characters.');
    leaderboardNameInput.reportValidity();
    return;
  }
  leaderboardNameInput.setCustomValidity('');
  savePlayerName(name);
  usernameStatus.textContent = `Saved as ${name}. Complete an online puzzle to post your score.`;
});
leaderboardNameInput.addEventListener('input', () => leaderboardNameInput.setCustomValidity(''));
scoreForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!rankedGame || !finished || scoreSubmitting || latestScoreSubmitted) return;
  scoreSubmitting = true;
  const button = document.querySelector('#submit-score-button');
  const status = document.querySelector('#score-status');
  button.disabled = true;
  status.textContent = 'Checking your puzzle…';
  try {
    const name = playerNameInput.value.trim();
    playerNameInput.setCustomValidity('');
    const result = await apiRequest('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: rankedGame.id, name, seconds, moves: moveHistory }),
    });
    latestScoreSubmitted = true;
    scoreForm.hidden = true;
    document.querySelector('#unranked-note').hidden = true;
    savePlayerName(result.score.name);
    announcer.textContent = `Score submitted. You are number ${result.rank} on this leaderboard.`;
    document.querySelector('#leaderboard-size').value = String(size);
    document.querySelector('#leaderboard-mode').value = pictureMode ? 'picture' : 'number';
    winDialog.close();
    leaderboardDialog.showModal();
    await loadLeaderboard();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    scoreSubmitting = false;
    button.disabled = false;
  }
});
[helpDialog, winDialog, leaderboardDialog].forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    }
  });
});

const savedGame = readSavedGame();
const savedRankedGame = readRankedGame();
if (savedRankedGame && savedGame && savedRankedGame.size === savedGame.size && savedRankedGame.mode === (savedGame.pictureMode ? 'picture' : 'number') && savedRankedGame.board.every((value, index) => value === savedGame.board[index]) && savedRankedGame.moves.length === savedGame.moves) {
  prepareRankedGame(savedRankedGame);
}
if (savedGame) {
  restoreGame(savedGame);
} else {
  newGame();
}

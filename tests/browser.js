successfully downloaded text file (SHA: a387f8a8bef8f8860a8d07f522ccfa58a6b6d188)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { createSolvedBoard, isSolved, moveTile, shuffleBoard } from '../game.js';


const apiGames = new Map();
const apiScores = [];
const root = new URL('../', import.meta.url);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname;
    if (pathname.startsWith('/api/')) {
      response.setHeader('Content-Type', 'application/json');
      if (pathname === '/api/games' && request.method === 'POST') {
        const id = crypto.randomUUID();
        const board = shuffleBoard(3);
        apiGames.set(id, board);
        const queue = [{ board: [...board], path: [] }];
        const visited = new Set([board.join(',')]);
        let solution = [];
        for (let cursor = 0; cursor < queue.length; cursor += 1) {
          const current = queue[cursor];
          if (isSolved(current.board)) { solution = current.path; break; }
          const empty = current.board.indexOf(0);
          const row = Math.floor(empty / 3);
          const column = empty % 3;
          const neighbors = [row > 0 ? empty - 3 : -1, row < 2 ? empty + 3 : -1, column > 0 ? empty - 1 : -1, column < 2 ? empty + 1 : -1];
          for (const index of neighbors) {
            if (index < 0) continue;
            const next = moveTile(current.board, index, 3).board;
            const key = next.join(',');
            if (!visited.has(key)) {
              visited.add(key);
              queue.push({ board: next, path: [...current.path, current.board[index]] });
            }
          }
        }
        response.end(JSON.stringify({ gameId: id, board, testSolution: solution }));
        return;
      }
      if (pathname === '/api/scores' && request.method === 'POST') {
        let body = '';
        for await (const chunk of request) body += chunk;
        const submission = JSON.parse(body);
        let board = apiGames.get(submission.gameId);
        if (!board || !Array.isArray(submission.moves)) {
          response.writeHead(400).end(JSON.stringify({ error: 'Invalid game.' }));
          return;
        }
        let step = 0;
        for (const value of submission.moves) {
          const result = moveTile(board, board.indexOf(value), 3);
          if (!result.moved) console.error('Test API illegal move', step, value, board, submission.moves.slice(0, 15));
          board = result.board;
          step += 1;
        }
        if (!isSolved(board)) {
          console.error('Test API incomplete solution', board, submission.moves.slice(-10));
          response.writeHead(400).end(JSON.stringify({ error: 'Invalid solution.' }));
          return;
        }
        apiGames.delete(submission.gameId);
        apiScores.push({ ...submission, moves: submission.moves.length });
        response.writeHead(201).end(JSON.stringify({ submitted: true, rank: 1, score: { name: submission.name } }));
        return;
      }
      if (pathname === '/api/leaderboard') {
        const filteredScores = url.searchParams.get('size') === '3' && url.searchParams.get('mode') === 'number' ? apiScores : [];
        response.end(JSON.stringify({ scores: filteredScores.map((score, index) => ({ rank: index + 1, name: score.name, seconds: score.seconds, moves: score.moves })) }));
        return;
      }
    }
    const file = new URL(`.${pathname === '/' ? '/index.html' : pathname}`, root);
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file.pathname)] || 'application/octet-stream' });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const origin = `http://127.0.0.1:${port}`;
const profile = await mkdtemp(join(tmpdir(), 'shuffle-browser-'));
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
if (!existsSync(chromePath)) throw new Error('Chrome not found. Set CHROME_PATH to your Chrome executable.');
const chrome = spawn(chromePath, [
  '--headless=new',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-networking',
  '--disable-extensions',
  '--remote-debugging-port=0',
  '--remote-allow-origins=*',
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

let socket;
let id = 0;
let resolvePageLoad;
const pending = new Map();

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = (event) => reject(new Error(`Could not connect to Chrome: ${url} (${event.message || 'connection failed'})`));
  });
}

function call(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const key = ++id;
    pending.set(key, { resolve, reject });
    socket.send(JSON.stringify({ id: key, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function until(expression, message = expression, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await pause(40);
  }
  throw new Error(`Timed out: ${message}`);
}

async function reload() {
  const loaded = new Promise((resolve) => { resolvePageLoad = resolve; });
  await call('Page.reload', { ignoreCache: true });
  await Promise.race([
    loaded,
    pause(10000).then(() => { throw new Error('Timed out waiting for page load'); }),
  ]);
  await until("document.readyState === 'complete' && document.querySelector('#board .tile')", 'reload');
}

async function viewport(width) {
  await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
  await call('Emulation.setTouchEmulationEnabled', { enabled: width < 600, maxTouchPoints: 1 });
  await pause(100);
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, `Overflow at ${width}px`);
  console.log(`PASS no horizontal overflow at ${width}px`);
}

async function click(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}

const state = () => evaluate("JSON.parse(localStorage.getItem('shuffle-current-game-v1'))");

async function loadSavedGame(saved) {
  const source = `localStorage.setItem('shuffle-current-game-v1', ${JSON.stringify(JSON.stringify(saved))});`;
  const { identifier } = await call('Page.addScriptToEvaluateOnNewDocument', { source });
  await reload();
  await call('Page.removeScriptToEvaluateOnNewDocument', { identifier });
}

async function seedSavedGame() {
  const pictureMode = await evaluate("document.querySelector('#pictures-mode').getAttribute('aria-pressed') === 'true'");
  await loadSavedGame({
    version: 1,
    size: 3,
    pictureMode,
    picture: { src: 'assets/quiet-lake.svg', name: 'Quiet lake' },
    board: [2, 1, 3, 4, 5, 6, 7, 0, 8],
    moves: 0,
    seconds: 0,
  });
}

async function swipe(axis) {
  const before = await state();
  const { board, size } = before;
  const empty = board.indexOf(0);
  const row = Math.floor(empty / size);
  const column = empty % size;
  let source;
  let deltaX = 0;
  let deltaY = 0;
  if (axis === 'vertical') {
    source = row < size - 1 ? empty + size : empty - size;
    deltaY = row < size - 1 ? -70 : 70;
  } else {
    source = column < size - 1 ? empty + 1 : empty - 1;
    deltaX = column < size - 1 ? -70 : 70;
  }
  const point = await evaluate(`(() => {
    const tile = document.querySelector('.tile[data-value="${board[source]}"]');
    tile.scrollIntoView({ block: 'center' });
    const bounds = tile.getBoundingClientRect();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  })()`);
  await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  for (let step = 1; step <= 5; step += 1) {
    await call('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: point.x + deltaX * step / 5, y: point.y + deltaY * step / 5 }],
    });
  }
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await until(`document.querySelector('#moves').textContent === '${before.moves + 1}'`, `${axis} swipe`);
  await pause(100);
  if (!(await state())) {
    console.error('Missing saved state after swipe', await evaluate("({ text: document.querySelector('#status-badge').textContent, html: document.querySelector('#win-dialog').innerText, ranked: localStorage.getItem('shuffle-ranked-game-v1') })"));
  }
  assert.equal((await state()).moves, before.moves + 1, `${axis} swipe made a duplicate move`);
  console.log(`PASS ${axis} swipe makes exactly one move`);
}

async function solveFromStorage() {
  const saved = await state();
  assert.ok(saved, 'Active saved game required');
  assert.equal(saved.size, 3);
  const nearWin = [1, 2, 3, 4, 5, 6, 7, 0, 8];
  await loadSavedGame({ ...saved, board: nearWin, moves: 7, seconds: 12 });
  await until("document.querySelector('#moves').textContent === '7'", 'near-win fixture');
  await click('.tile[data-value="8"]');
  await until("document.querySelector('#status-badge').textContent.includes('Puzzle complete')", 'completion');
}

try {
  let debuggerUrl;
  const deadline = Date.now() + 15000;
  while (!debuggerUrl && Date.now() < deadline) {
    const file = await readFile(join(profile, 'DevToolsActivePort')).catch(() => null);
    if (file) {
      const [debuggerPort, path] = file.toString().trim().split(/\r?\n/);
      debuggerUrl = `ws://127.0.0.1:${debuggerPort}${path}`;
    }
    else await pause(100);
  }
  assert.ok(debuggerUrl, 'Chrome debugger did not start');
  socket = await connect(debuggerUrl);
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Page.loadEventFired') {
      resolvePageLoad?.();
      resolvePageLoad = undefined;
    }
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  };
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  const pageCall = call;
  call = (method, params = {}) => pageCall(method, params, sessionId);
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 375, height: 900, deviceScaleFactor: 1, mobile: true });
  await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    (() => {
      const nativeFetch = window.fetch;
      const originalBoards = new Map();
      window.fetch = async (resource, options) => {
        const response = await nativeFetch(resource, options);
        if (String(resource).endsWith('/api/games')) {
          const data = await response.clone().json();
          originalBoards.set(data.gameId, [...data.board]);
          const board = window.__rankedFixture ? [1, 2, 3, 4, 5, 6, 7, 0, 8] : data.board;
          const empty = board.indexOf(0);
          const target = empty >= 3 ? board[empty - 3] : board[empty + 3];
          window.__testSolution = [...data.testSolution, target];
          return new Response(JSON.stringify({ ...data, board }), { status: response.status, headers: response.headers });
        }
        if (String(resource).endsWith('/api/scores')) {
          const submission = JSON.parse(options.body);
          submission.moves = [...window.__testSolution];
          options = { ...options, body: JSON.stringify(submission) };
          return nativeFetch(resource, options);
        }
        return response;
      };
    })();
  ` });
  const loaded = new Promise((resolve) => { resolvePageLoad = resolve; });
  await call('Page.navigate', { url: origin });
  await Promise.race([
    loaded,
    pause(10000).then(() => { throw new Error('Timed out waiting for initial page load'); }),
  ]);
  await until("document.readyState === 'complete' && document.querySelectorAll('#board .tile').length === 8", 'initial game');

  for (const invalid of [
    '{broken',
    JSON.stringify({ version: 1, size: 6, board: [] }),
    JSON.stringify({ version: 1, size: 3, pictureMode: false, picture: { src: 'assets/quiet-lake.svg', name: 'Quiet lake' }, board: [1, 2, 3, 4, 5, 6, 7, 8, 8], moves: 0, seconds: 0 }),
    JSON.stringify({ version: 1, size: 3, pictureMode: false, picture: { src: 'javascript:alert(1)', name: 'Bad' }, board: [2, 1, 3, 4, 5, 6, 7, 0, 8], moves: 0, seconds: 0 }),
  ]) {
    await loadSavedGame(invalid);
    const fresh = await state();
    assert.equal(fresh.size, 3);
    assert.equal(fresh.moves, 0);
    assert.deepEqual([...fresh.board].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  }
  console.log('PASS malformed and unsafe saved games start fresh');

  const initial = await state();
  const movable = initial.board.indexOf(0) >= 3 ? initial.board.indexOf(0) - 3 : initial.board.indexOf(0) + 3;
  await click(`.tile[data-value="${initial.board[movable]}"]`);
  assert.equal((await state()).moves, 1);
  await pause(1100);
  const saved = await state();
  await reload();
  assert.deepEqual((await state()).board, saved.board);
  assert.equal((await state()).moves, 1);
  assert.ok((await state()).seconds >= 1);
  console.log('PASS tap, exact board, moves and elapsed time persist across reload');

  await swipe('vertical');
  await swipe('horizontal');
  const swiped = await state();
  await reload();
  const restored = await state();
  assert.deepEqual(restored.board, swiped.board);
  assert.equal(restored.moves, swiped.moves);
  assert.ok(restored.seconds >= swiped.seconds);
  console.log('PASS swiped game persists across reload');

  await click('#pictures-mode');
  await click('[data-image="assets/garden.svg"]');
  assert.equal((await state()).picture.src, 'assets/garden.svg');
  await swipe('vertical');
  await reload();
  assert.equal((await state()).pictureMode, true);
  assert.equal((await state()).picture.src, 'assets/garden.svg');
  assert.equal(await evaluate("document.querySelector('[data-image=\"assets/garden.svg\"]').getAttribute('aria-pressed')"), 'true');
  console.log('PASS picture selection and picture game persist');

  await call('DOM.enable');
  const { root: documentNode } = await call('DOM.getDocument');
  const { nodeId } = await call('DOM.querySelector', { nodeId: documentNode.nodeId, selector: '#picture-upload' });
  await call('DOM.setFileInputFiles', { nodeId, files: [decodeURIComponent(new URL('../assets/quiet-lake.svg', import.meta.url).pathname).replace(/^\//, '')] });
  await until("document.querySelector('#upload-label').classList.contains('selected')", 'photo upload');
  assert.equal((await state()).picture.name, 'Your photo');
  assert.match((await state()).picture.src, /^data:image\/jpeg;base64,/);
  console.log('PASS local photo upload creates and saves a playable picture');

  await click('[data-size="5"]');
  await swipe('horizontal');
  await reload();
  assert.equal((await state()).size, 5);
  assert.equal(await evaluate("document.querySelectorAll('#board .image-tile').length"), 24);
  console.log('PASS difficulty and 5 × 5 picture game persist');

  await click('[data-size="3"]');
  await solveFromStorage();
  assert.equal(await evaluate("document.querySelector('#board').parentElement.classList.contains('completing')"), true);
  await pause(260);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#board').parentElement, '::after').opacity"), '1');
  assert.equal(await evaluate("document.querySelector('#win-dialog').open"), false);
  assert.equal(await evaluate("document.querySelector('#preview-button').hidden"), true);
  assert.equal(await evaluate("document.querySelector('#board .tile:not(:disabled)')"), null);
  const completeMoves = await evaluate("document.querySelector('#moves').textContent");
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
  assert.equal(await evaluate("document.querySelector('#moves').textContent"), completeMoves);
  await until("document.querySelector('#win-dialog').open", 'picture results after reveal');
  assert.equal(await evaluate("localStorage.getItem('shuffle-current-game-v1')"), null);
  console.log('PASS picture completion reveals full image, blocks input, then opens results');

  await seedSavedGame();
  await solveFromStorage();
  await click('#new-game-button');
  await pause(1200);
  assert.equal(await evaluate("document.querySelector('#win-dialog').open"), false);
  assert.equal(await evaluate("document.querySelector('#board').parentElement.classList.contains('completing')"), false);
  assert.equal(await evaluate("document.querySelector('#moves').textContent"), '0');
  console.log('PASS replay during reveal cancels stale results');

  await seedSavedGame();
  await solveFromStorage();
  await until("document.querySelector('#win-dialog').open", 'picture results');
  await click('#play-again-button');
  await until("!document.querySelector('#win-dialog').open && document.querySelector('#moves').textContent === '0'", 'replay reset');
  assert.equal(await evaluate("document.querySelector('#win-dialog').open"), false);
  assert.equal(await evaluate("document.querySelector('#board').parentElement.classList.contains('completing')"), false);
  assert.equal(await evaluate("document.querySelector('#preview-button').hidden"), false);
  assert.equal(await evaluate("document.querySelector('#moves').textContent"), '0');
  assert.equal(await evaluate("document.querySelector('#board .tile:not(:disabled)') !== null"), true);
  console.log('PASS replay clears completion state and restores controls');

  await click('#numbers-mode');
  await seedSavedGame();
  await solveFromStorage();
  await until("document.querySelector('#win-dialog').open", 'number results');
  assert.equal(await evaluate("document.querySelector('#board').parentElement.classList.contains('completing')"), false);
  console.log('PASS number completion still opens results without picture reveal');

  await click('#play-again-button');
  await click('#pictures-mode');
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await seedSavedGame();
  await solveFromStorage();
  assert.equal(await evaluate("document.querySelector('#board').parentElement.classList.contains('completing')"), true);
  await until("document.querySelector('#win-dialog').open", 'reduced-motion results', 800);
  console.log('PASS reduced motion skips the long completion hold');
  await click('#play-again-button');
  await call('Emulation.setEmulatedMedia', { features: [] });

  await evaluate('window.__rankedFixture = true');
  await click('#numbers-mode');
  await until("JSON.parse(localStorage.getItem('shuffle-ranked-game-v1'))?.initialBoard.join(',') === '1,2,3,4,5,6,7,0,8'", 'ranked game issued');
  await click('.tile[data-value="8"]');
  await until("document.querySelector('#win-dialog').open", 'ranked win');
  assert.equal(await evaluate("document.querySelector('#score-form').hidden"), false);
  await evaluate("document.querySelector('#player-name').value = 'Risterz'");
  await evaluate("document.querySelector('#score-form').requestSubmit()");
  await until("document.querySelector('#leaderboard-dialog').open && document.querySelector('#leaderboard-rows').children.length === 1", 'score submission and leaderboard');
  assert.equal(await evaluate("document.querySelector('#leaderboard-rows').textContent.includes('Risterz')"), true);
  assert.equal(apiScores.length, 1);
  assert.ok(apiScores[0].moves >= 1 && apiScores[0].moves <= 80);
  console.log('PASS ranked game, full move validation, score submission, and leaderboard display');
  await click('[data-close-leaderboard]');
  await click('#leaderboard-button');
  await until("document.querySelector('#leaderboard-rows').textContent.includes('Risterz')", 'leaderboard reopen');
  await evaluate("document.querySelector('#leaderboard-size').value = '4'; document.querySelector('#leaderboard-size').dispatchEvent(new Event('change'))");
  await until("document.querySelector('#leaderboard-status').textContent.includes('No scores')", 'leaderboard difficulty filter');
  await click('[data-close-leaderboard]');
  console.log('PASS leaderboard filters and empty state');

  for (const width of [320, 375, 768, 1280]) await viewport(width);
  await click('#leaderboard-button');
  await until("document.querySelector('#leaderboard-dialog').open", 'mobile leaderboard');
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'Leaderboard mobile overflow');
  await click('[data-close-leaderboard]');
  console.log('All browser checks passed.');
} finally {
  socket?.close();
  chrome.kill();
  server.close();
  await pause(150);
  await rm(profile, { recursive: true, force: true });
}

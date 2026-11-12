# Shuffle

A responsive sliding-puzzle website built with vanilla HTML, CSS, and JavaScript, with a Cloudflare Worker and D1 leaderboard.

## Online leaderboard

The Worker at `worker/index.js` issues ranked boards and stores results in Cloudflare D1. Scores are ordered by time, then moves. Each ranked board must be solved through legal moves, expires after two hours, and can submit only once. Offline/file games remain fully playable but cannot submit scores.

For a new deployment, create and connect a database:

```sh
npx wrangler login
npx wrangler d1 create shuffle-leaderboard
```

Copy the generated `database_id` into `wrangler.jsonc`, then apply the migration and deploy:

```sh
npx wrangler d1 migrations apply DB --remote
npm run deploy
```

For local development, run `npx wrangler d1 migrations apply DB --local` once, then `npm run build` and `npx wrangler dev`. Use `python -m http.server 8000` for a frontend-only offline version.

## Run

```sh
npm start
```

Open `http://localhost:3000`, or open `index.html` directly in a browser.

After changing `app.js` or `game.js`, run `npm run build` to update `bundle.js`.

## Test

```sh
npm test
npm run build
npm run test:browser
```

The browser tests start a temporary local server and isolated headless Chrome instance; they do not need a development server or downloaded test packages. They default to the standard Windows Chrome installation. Set `CHROME_PATH` if Chrome is installed elsewhere.

## Features

- Solvable 3 × 3, 4 × 4, and 5 × 5 puzzles
- Number and picture modes, with three artworks and local photo upload
- Full-picture preview and seamless picture reveal on completion
- Mouse, touch, and keyboard controls
- Timer, move counter, and locally saved best scores
- Current game automatically saved in this browser; exact board, picture, moves, and time restored on return
- Validated saved games with safe fallback when browser storage is unavailable
- Accessible dialogs, visible focus states, and reduced-motion support
- No runtime dependencies; source modules are bundled for direct-file play

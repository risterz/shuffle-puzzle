# Shuffle

A responsive sliding-puzzle game built with vanilla HTML, CSS, and JavaScript. Play offline in a browser or connect to the Cloudflare Worker and D1 leaderboard for ranked games.

## Features

- Solvable 3 × 3, 4 × 4, and 5 × 5 puzzles
- Number and picture modes, with three built-in artworks and custom photo uploads
- Full-picture preview and seamless picture reveal on completion
- Mouse, touch, and keyboard controls
- Timer, move counter, and locally saved best scores
- Automatic game saves that restore the board, picture, moves, and elapsed time
- Validated saved games with a safe fallback when browser storage is unavailable
- Accessible dialogs, visible focus states, and reduced-motion support
- No runtime dependencies; source modules are bundled for direct-file play

## Quick start

### Full app

Run the local D1 migration once, then start the development server:

```sh
npx wrangler d1 migrations apply DB --local
npm start
```

Open [http://localhost:8787](http://localhost:8787).

### Frontend only

For local play without the online leaderboard:

```sh
npm run build
npm run start:static
```

Open [http://localhost:3000](http://localhost:3000), or open `index.html` directly in a browser. Offline games remain fully playable but cannot submit leaderboard scores.

## Development

After changing `app.js` or `game.js`, rebuild the browser bundle:

```sh
npm run build
```

Useful commands:

| Command | Description |
| --- | --- |
| `npm start` | Build the bundle and start the Cloudflare development server |
| `npm run start:static` | Serve the frontend on port 3000 with Python |
| `npm run build` | Regenerate `bundle.js` from the source modules |
| `npm run deploy` | Build and deploy the Worker to Cloudflare |
| `npm run db:migrate` | Apply D1 migrations to the remote database |

## Online leaderboard

The Worker in `worker/index.js` issues ranked boards and stores results in Cloudflare D1. Scores are ranked by completion time, then move count.

Ranked boards must be solved through legal moves, expire after two hours, and accept only one score submission.

### Deploy

1. Authenticate with Cloudflare and create a D1 database:

   ```sh
   npx wrangler login
   npx wrangler d1 create shuffle-leaderboard
   ```

2. Copy the generated `database_id` into `wrangler.jsonc`.
3. Apply the database migration and deploy:

   ```sh
   npx wrangler d1 migrations apply DB --remote
   npm run deploy
   ```

## Tests

Run the unit tests, rebuild the bundle, and run the browser tests:

```sh
npm test
npm run build
npm run test:browser
```

Browser tests start a temporary local server and an isolated headless Chrome instance. They require neither a running development server nor downloaded test packages.

Tests use the standard Windows Chrome installation by default. Set `CHROME_PATH` if Chrome is installed elsewhere.

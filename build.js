import { readFileSync, writeFileSync } from 'node:fs';

const logic = readFileSync(new URL('./game.js', import.meta.url), 'utf8')
  .replaceAll('export function', 'function');
const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8')
  .replace(/^import .+;\r?\n/, '');

writeFileSync(new URL('./bundle.js', import.meta.url), `'use strict';\n\n${logic}\n${app}`);
console.log('Built bundle.js');

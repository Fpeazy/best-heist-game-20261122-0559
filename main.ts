// VELVET VAULT — the hand-in program (Node 22, standard library only).
// A one-room heist game: the thief crosses a single art-deco gallery in
// side view, reads two amber guard cones and one red camera laser, hacks
// the security terminal, steals the Kancil Emas from its vitrine and
// slips out through the service door. The game itself is the game/
// folder beside this file: plain static files a desktop browser loads
// offline (game/index.html and its ES modules, no library, no network
// request). This program hands it in: it copies game/ and screenshots/
// to the output directory and writes output/dossier.json, the summary
// the judge reads, with the vendored make.fun library.
//
// Play it locally first with `node serve.ts`, then open
// http://localhost:8080. Outside the grader's container,
// MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

function fail(message) {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

function main() {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  const gameDir = join(here, 'game');
  const shotsDir = join(here, 'screenshots');

  if (!existsSync(gameDir)) fail('game/ is missing from the repository');
  if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
  if (!existsSync(shotsDir)) fail('screenshots/ is missing from the repository');

  // The output directory holds game/, screenshots/ and dossier.json.
  // Start from an empty output tree so a stale file can never leak in.
  mkdirSync(out, { recursive: true });
  cpSync(gameDir, join(out, 'game'), { recursive: true });
  cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

  const shotFiles = readdirSync(join(out, 'screenshots')).filter((f) => /\.(png|jpe?g)$/i.test(f));
  if (shotFiles.length < 3 || shotFiles.length > 4) {
    fail(`expected 3-4 screenshots, found ${shotFiles.length}`);
  }
  for (const file of shotFiles) {
    const size = statSync(join(out, 'screenshots', file)).size;
    if (size > 262144) fail(`screenshot ${file} is ${size} bytes, over the 256 KiB cap`);
  }

  // The scorer's own caps (from this competition's gate), checked here
  // so the entry is refused locally rather than at the scorer: the
  // dossier's text budget is 160 KiB; at most 4 screenshots, each at
  // most 256 KiB; the game/ tree at most 993 files and 48 MiB in all,
  // with no path under game/ over 1000 bytes. The screenshots are
  // deterministic staged scenes (?shot=title|stealth|alert|win, seed 1)
  // rendered from the real running game, so the same seed always gives
  // the same frame.
  const dossier = buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });
  writeFileSync(join(out, 'dossier.json'), dossier);
  console.log(`dossier written: ${shotFiles.length} screenshots, ${dossier.length} bytes of dossier.json`);
}

main();

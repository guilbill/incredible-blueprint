# AGENTS.md

Guide for any coding agent working on Machine Incroyable Tribute (MIT), a browser tribute to The Incredible Machine 2. Read it before the first change. The user is Guillaume; he writes in French, the code, commits and README are in English.

## The project in one screen

- TypeScript strict, Vite, Planck.js physics, canvas rendering, Vitest, Playwright e2e (Chromium, Firefox, WebKit). Client side only: no server, no account.
- `src/engine` physics adapter and deterministic math, `src/parts` every part (drawing, bodies, behaviour), `src/game` simulation and goals, `src/level` level format, codec, placement, custom level storage, `src/render` canvas renderer, `src/ui` screens (play board, level list, sound, selection), `src/editor` level editor, `src/lab` design bench (dev only), `levels/` shipped levels and their proven solutions.
- Live site: https://guilbill.github.io/incredible-machine-tribute/ (GitHub Pages from `main`).

## Invariants (never break them)

- **Determinism.** The same machine gives the same result in every browser. No `Math.random`, `Date`, `performance.now`, `Math.hypot/pow/tan/exp/log` in `src/engine`, `src/parts`, `src/game`, `src/level` (the lint test enforces it). Fixed 120 Hz step.
- **Shipped levels.** Every `levels/NN-slug.json` has a `.solution.json` storing `{solution, step, hash}`. Ids are numbered from 01 with no gap. `tests/levels/levels.test.ts` checks validity, the stored step and hash, order independence, a ±10 nudge, and that nothing wins without player parts.
- **Two languages.** Every user-facing string goes through `src/i18n.ts` in FR and EN. Tests run in French (`tests/setup.ts`).
- **Original content only.** Nothing copied from TIM (art, sounds, levels). Sounds are synthesized in `src/ui/sound.ts`.
- **The published site is the game and its editor, nothing else.** The lab (`lab.html`, `src/lab/`) and any other dev tool stay out of the build: never add them to the `vite.config.ts` inputs or import them from the game. `npm run build` ends with `scripts/check-dist.mjs`, which fails if lab code reaches `dist/`; the Pages workflow runs that build.
- **Look.** Blueprint: navy board, light line drawings, yellow for selection and goals, cyan for guides and link targets. Line icons, no emoji.

## Commands

- `npm run dev`: dev server on http://localhost:5173 (the lab is at `/lab.html`).
- `npm run check`: typecheck plus every unit test without the module cache. Run it before every commit (a hook blocks commits when it fails).
- `npm run levels`: table of shipped levels (idea, difficulty, parts, duration).
- `npm run build`, `npm run test:e2e`: before merging.
- Vitest's module cache can hide new files: always `--no-fsModuleCache` (already in `npm run check`).

## How we work

These come from the retrospective of the first build. Apply them without being asked.

1. **Show options before coding anything the user will see, hear or handle.** Icons, drawings, colours, sounds, layouts, gestures: build 3 or 4 variants in the lab with the `propose-options` skill and open them in the browser pane. For an interaction (drag, rotate, select), make it a prototype the user can click, not a picture. Code the chosen one only.
2. **Name the place.** Say "in the drawer", "on the board", "under the board", "on the level card". When the user's words leave the place unclear, ask which one before building.
3. **Ask for the case, not the number.** When a delay, size or threshold is discussed, list the situations it must handle and propose the rule; do not tune it one deploy at a time.
4. **Batch, test locally, deploy once.** Group small adjustments, let the user try them on `localhost:5173`, then ship them together with the `ship` skill.
5. **Levels are played before they ship.** Use the `new-level` skill: one-sentence idea, difficulty 1 to 5, proven solution, then the user plays it before the merge.
6. **Look and listen before saying "done".** Check the real rendering in the browser at desktop and phone widths, and play the sounds you changed. Say plainly what you could not check.
7. **Report on long tasks.** Give a one-line status about every 10 minutes while subagents or long runs are working.
8. **Push, deploy, merge only when asked.** Outward actions wait for an explicit "pousse", "déploie" or "fusionne".

## Git

- Branches: `type/slug` (`feat/editor-ergonomics`, `fix/zone-snap`), never an agent prefix.
- Commits: English, short, conventional (`feat(play): ...`), human tone, no attribution trailer.
- Design notes and plans (`docs/superpowers/`, `docs/specs/`) stay local and untracked.

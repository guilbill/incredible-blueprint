---
name: new-level
description: Design, prove and hand over a new shipped MIT level (levels/NN-slug.json + .solution.json), or rework one. Use for "nouveau niveau", "crée des niveaux", "ce niveau est trop dur", "je ne trouve pas la solution".
---

# New level

Levels proven only by tests can still be unreadable: in the first build the user got stuck on three generated levels in a row. A level is done when the user has played it.

## Steps

1. **Idea first.** Write the idea in one sentence ("the ceiling is crossed with a portal pair") and a difficulty from 1 to 5. Difficulty grows with the level number. Original designs only, nothing from TIM.
2. **Build the files.** `levels/NN-slug.json` (French title of 1 to 4 words, one-sentence goal) and `levels/NN-slug.solution.json` with `{ solution, step, hash, notes: { idea, difficulty } }`. 2 to 6 player parts, at most 2 decoys in the inventory, at most about 25 fixed parts, floor and backstops so near misses land somewhere sensible, positions snapped to 10. Ids stay numbered from 01 with no gap.
3. **Prove it.** Get `step` and `hash` from `runUntilGoal`, then `npx vitest run --no-fsModuleCache tests/levels -t "<id>"` must pass every rule (valid, stored step and hash, any order, ±10 nudge, nothing wins without player parts).
4. **English text** in `src/i18n.ts` (`LEVELS_EN`, keyed by id): natural game English, no em dash.
5. **Check the table.** `npm run levels` shows idea, difficulty, parts and duration; the new row must not stand out (a difficulty 2 needing 6 parts is a smell).
6. **Hand it to the user to play** before any merge: give the dev URL, the level number, and a one-line hint. Do not give the solution unless asked. If they are stuck, ask what they tried, then make the idea more readable (a fixed part as a hint, fewer decoys) rather than explaining it.
7. **Commit** once played and accepted: `feat(levels): ...`.

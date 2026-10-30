---
name: propose-options
description: Show the user 2 to 5 variants side by side in the design lab before coding anything they will see, hear or handle in MIT (part drawings, icons, colours, sounds, layouts, panels, gestures like drag/rotate/select). Use it unprompted whenever a visual, sound or interaction choice is open, and whenever the user says "propose", "fais des propositions", "montre-moi", "dans un onglet", "plus discret", "je ne sais pas".
---

# Propose options in the lab

The user decides fastest when they react to something concrete. In the first build, choices made from a lab page took one or two exchanges; choices described in words took four. So: build the options, open them, let the user pick, code only the pick.

## Steps

1. **Pin down the question in one line**, including the place on screen ("the copy button on the level cards", "the belt in the drawer"). If the place is unclear, ask which one first.
2. **Create `src/lab/topics/<topic>.ts`** with `defineLab` from `src/lab/lab.ts` (see `src/lab/topics/example.ts`):
   - 3 or 4 variants that really differ (not shades of one idea), each with a short `note` on what differs;
   - drawings use the real parts (`drawPart(pen, kind, x, y)`) and the real `Pen`, so the look matches the game;
   - sounds call the real synth (`sound` in `src/ui/sound.ts`) or a candidate written next to it; every sound variant gets `play`;
   - for an interaction (drag, rotate, select, resize, a panel), use `mount(el)` to build a live prototype the user can click. A picture is not enough for a gesture.
3. **Open it** in the browser pane: `http://localhost:5173/lab.html?topic=<topic>` (start the `dev` preview from `.claude/launch.json` if needed). Take one screenshot to check it renders.
4. **Ask one question**: which variant, and what to change. Keep the reply short; the page carries the detail.
5. **Read the pick** if the user clicked "choisir": `localStorage.getItem('lab.choice.<topic>')` in the page.
6. **Iterate** with a new file (`<topic>-v2.ts`) when the user wants variations around one option; keep the old one for comparison.
7. **Code only the chosen variant** in the game, then delete the topic files (the git history keeps them). Keep `example.ts`.

## Rules

- Never ship lab code: `lab.html` is not a build input.
- Sounds stay minimal, synthesized, "blueprint sonore"; no sample files.
- Blueprint look: navy board, light lines, yellow selection, cyan guides, line icons, no emoji.
- Tooltips name the action, not the shortcut.

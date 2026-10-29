# Incredible Machine Tribute

A tribute to **The Incredible Machine**, the Sierra game (1993, then TIM 2 in 1994) I played as a kid. You build Rube Goldberg machines: a ball drops on a seesaw, which wakes a cat, which chases a mouse, which spins a wheel... and if you thought it all through, the goal lights up.

This project brings that feeling back in the browser, with an engineering blueprint look and a more modern interface.

**Play it: https://guilbill.github.io/incredible-machine-tribute/**

The game is available in English and French.

## What's inside

- 10 levels, from the tutorial to "The Big Machine".
- The classic parts: balls, walls, ramps, bucket, trampoline, seesaw, gears, pulleys, conveyor belt, belts and ropes, scissors, candle, hot-air balloon, mouse cage, monkey on a bike, cat, mouse, cheese, mousetrap, fishbowl.
- A few modern parts: magnet, portals, adjustable spring, fan with a timer.
- A level editor. A level has to be solved by its author before it can be shared, as a link or a file.
- Deterministic physics: the same machine gives exactly the same result every run, in Chrome, Firefox or Safari.
- Everything runs in the browser, with no server and no account. It also works offline.

## How to play

1. Drag parts from the drawer on the right onto the board.
2. Click a part to adjust it: the small round arrow rotates it, the chevrons at its ends make it longer or shorter.
3. Connect parts with the **Rope** and **Belt** tools at the top of the drawer.
4. Press **Run** (or Space) and watch the machine do the rest.

## Run it locally

You need Node.js 22.12 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

Other useful commands:

```bash
npm test           # unit tests (Vitest)
npm run build      # production build in dist/
npm run test:e2e   # checks determinism in Chromium, Firefox and WebKit (Playwright)
```

The site is published to GitHub Pages from the `main` branch.

## Under the hood

TypeScript, Vite, canvas rendering and the [Planck.js](https://piqnt.com/planck.js/) physics engine. To get identical results across browsers, the simulation uses a fixed time step and its own trigonometric functions.

## License

Free for everyone: the code is under the [MIT](LICENSE) license. You can use it, copy it, change it and share it.

This project is not affiliated with Sierra or its rights holders. The Incredible Machine is a trademark of its respective owners, and nothing from the original game (art, sounds, levels) is reused here.

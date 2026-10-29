# Minesweeper

A faithful browser recreation of classic Windows (95/98-era) Minesweeper, built with React, TypeScript and Vite. No backend, accounts or network access needed.

## Commands

```bash
npm install          # install dependencies
npm run dev          # development server (http://localhost:5173)
npm test             # unit + UI tests (Vitest, jsdom)
npm run build        # type-check and build to dist/
npm run preview      # serve the production build
npm run test:e2e     # browser checks with Playwright (run `npm run build` first;
                     # first time on a new machine: `npx playwright install chromium`)
```

`dist/` uses relative paths, so it can be hosted from any static folder.

## Features

- Beginner 9×9/10, Intermediate 16×16/40, Expert 30×16/99, and Custom (width and height 1–100, mines 0 to cells − 1) with inline validation.
- First click is always safe. When there is room, the 3×3 area around it is also kept clear. Mines are placed on the first reveal with a single-pass shuffle, so dense boards never retry or loop.
- Iterative flood fill, right-click flags, optional `?` marks, chording (both buttons, middle button, or clicking an opened number), loss reveal with the exploded mine and wrong flags marked, and auto-flagging on a win.
- Classic look: bevels built from CSS borders and inset shadows, pixel-art SVG digits, mines, flags and faces, seven-segment counters, a Win98 title bar, menus and dialogs.
- Timer starts on the first reveal and is computed from timestamps, so throttled tabs do not drift. It stops at a win or loss and is capped at 999.
- Best times per difficulty and per custom configuration, with the classic "type your name" prompt. Statistics include played, won, lost, win % per level and overall, plus current and longest streak. Resetting either one asks for confirmation.
- Options: Marks (?), Sound (off by default, synthesized with Web Audio), Colour-blind numbers, Confirm New Game, and Zoom (Auto/100/150/200/300%).
- Touch: a Flag button appears on touch screens, and press-and-hold also flags. Extra fingers are ignored, and a tap that turns into a scroll is cancelled.
- Keyboard: arrows/Home/End move, Enter/Space opens or chords, F flags, F2 starts a new game, Alt+G/O/H opens menus, Esc closes. Tiles have screen-reader labels.

## Structure

```
src/engine/       pure game logic: types, config/validation, generation, actions, cell views
src/storage/      safe localStorage wrapper, versioned settings and records schemas
src/components/   Board, Cell, LedCounter, FaceButton, Timer, MenuBar, TitleBar, dialogs/
src/hooks/        useZoom (auto-fit sizing)
src/ui/           pixel-art sprite data
src/audio/        optional sounds
src/styles/       tokens.css (colours, bevels) and app.css
e2e/smoke.mjs     Playwright browser checks and screenshots
```

## Storage

Two localStorage keys, each with a `version` field:

- `classic-minesweeper.settings`: difficulty, last custom board, options, zoom, last name used.
- `classic-minesweeper.records`: best times (presets plus `customBestTimes` keyed `WIDTHxHEIGHTxMINES`), per-level played/won, and streaks.

Data is loaded field by field, so damaged or partial data keeps whatever is still valid. If storage is blocked, the game keeps working in memory for the visit. A game counts in statistics only once it is won or lost. Games abandoned by starting a new one are not counted.

## Known limitations

- The title-bar minimise, maximise and close buttons are decoration only.
- On phones, Expert and large custom boards scroll sideways inside the window instead of shrinking tiles below 16 px.
- Records are stored per browser. There is no sync or online leaderboard.
- A custom board whose size and mine count match a preset is recorded as that preset.

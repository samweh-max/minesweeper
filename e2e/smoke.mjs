// End-to-end checks in a real browser (Chromium via Playwright).
//
//   npm run build && npm run test:e2e
//
// Starts `vite preview`, plays real games (including a win found by a small
// solver), checks layout on desktop and phone sizes, collects console errors
// and saves screenshots to e2e/screenshots/.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join(root, 'e2e', 'screenshots');
mkdirSync(shots, { recursive: true });
const PORT = 4173;
const URL = `http://localhost:${PORT}/`;

let failures = 0;
function check(cond, message) {
  if (cond) console.log(`  ✓ ${message}`);
  else {
    failures++;
    console.log(`  ✗ ${message}`);
  }
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('preview server did not start')), 20000);
  server.stdout.on('data', (d) => {
    if (String(d).includes(String(PORT))) {
      clearTimeout(timer);
      resolve();
    }
  });
});

const browser = await chromium.launch();
const consoleErrors = [];
function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${label}: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`${label}: ${e}`));
}

// ---- helpers ---------------------------------------------------------------

const cell = (page, i) => page.locator(`[data-index="${i}"]`);
const face = (page) => page.locator('.face').getAttribute('data-face');
const statusText = (page) => page.locator('[role="status"]').textContent();
const ledLabel = (page, name) => page.getByRole('img', { name: new RegExp(`^${name}`) }).getAttribute('aria-label');

async function chooseMenu(page, menu, item) {
  await page.getByRole('menuitem', { name: menu, exact: true }).click();
  await page.locator('.menu [role^="menuitem"]', { hasText: item }).first().click();
}

async function boardState(page) {
  return page.evaluate(() => {
    const cells = [...document.querySelectorAll('[data-index]')];
    const grid = document.querySelector('.board');
    return {
      width: Number(grid.getAttribute('aria-colcount')),
      height: Number(grid.getAttribute('aria-rowcount')),
      kinds: cells.map((c) => {
        const k = c.getAttribute('data-kind');
        if (k !== 'open') return k;
        const m = /\bn(\d)\b/.exec(c.className);
        return m ? Number(m[1]) : 0;
      }),
    };
  });
}

function neighbours(i, w, h) {
  const x = i % w;
  const y = Math.floor(i / w);
  const out = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(ny * w + nx);
    }
  return out;
}

/** Simple solver: flags certain mines, chords satisfied numbers, guesses when stuck. */
async function playOneGame(page) {
  await cell(page, 40).click();
  for (let step = 0; step < 300; step++) {
    const st = await page.locator('.face').getAttribute('data-face');
    if (st === 'cool' || st === 'dead') return st;
    const { width, height, kinds } = await boardState(page);
    let acted = false;
    for (let i = 0; i < kinds.length && !acted; i++) {
      const n = kinds[i];
      if (typeof n !== 'number' || n === 0) continue;
      const around = neighbours(i, width, height);
      const hidden = around.filter((j) => kinds[j] === 'hidden');
      const flags = around.filter((j) => kinds[j] === 'flag');
      if (hidden.length === 0) continue;
      if (flags.length + hidden.length === n) {
        for (const j of hidden) await cell(page, j).click({ button: 'right' });
        acted = true;
      } else if (flags.length === n) {
        await cell(page, i).click(); // chord on the number
        acted = true;
      }
    }
    if (!acted) {
      const hidden = kinds.map((k, i) => (k === 'hidden' ? i : -1)).filter((i) => i >= 0);
      await cell(page, hidden[Math.floor(Math.random() * hidden.length)]).click();
    }
  }
  return face(page);
}

// ---- desktop ---------------------------------------------------------------

console.log('Desktop 1280 × 800');
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  watch(page, 'desktop');
  await page.goto(URL);
  await page.screenshot({ path: join(shots, 'desktop-beginner.png') });
  check((await page.locator('[role="gridcell"]').count()) === 81, 'beginner board has 81 cells');
  check((await ledLabel(page, 'Mines left')) === 'Mines left: 10', 'mine counter starts at 10');
  check((await ledLabel(page, 'Time')) === 'Time: 0', 'timer does not run before the first click');
  await page.waitForTimeout(1500);
  check((await ledLabel(page, 'Time')) === 'Time: 0', 'timer still 0 after waiting');

  // Tiles are square and evenly spaced.
  const boxes = await page.evaluate(() =>
    [0, 1, 9].map((i) => {
      const r = document.querySelector(`[data-index="${i}"]`).getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
  check(boxes[0].w === boxes[0].h && boxes[0].w >= 16, `tiles are square (${boxes[0].w}px)`);
  check(Math.abs(boxes[1].x - boxes[0].x - boxes[0].w) < 0.01, 'tiles touch horizontally');
  check(Math.abs(boxes[2].y - boxes[0].y - boxes[0].h) < 0.01, 'tiles touch vertically');

  // Context menu suppressed on the board only.
  const prevented = await page.evaluate(() => {
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    const onBoard = !document.querySelector('[data-index="0"]').dispatchEvent(ev);
    const ev2 = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    const onTitle = !document.querySelector('.titlebar').dispatchEvent(ev2);
    return { onBoard, onTitle };
  });
  check(prevented.onBoard && !prevented.onTitle, 'context menu blocked on tiles, not elsewhere');

  // Pressed state + surprised face.
  const box = await cell(page, 0).boundingBox();
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  check((await face(page)) === 'surprised', 'face is surprised while a tile is held');
  await page.screenshot({ path: join(shots, 'desktop-pressed.png') });
  await page.mouse.move(10, 10);
  await page.mouse.up();
  check((await statusText(page)) === 'Ready', 'releasing off the board does nothing');

  // A losing game.
  let lost = false;
  for (let attempt = 0; attempt < 20 && !lost; attempt++) {
    await page.locator('.face').click();
    await cell(page, 40).click();
    check(attempt > 0 || (await ledLabel(page, 'Time')) === 'Time: 1', 'timer starts on the first click');
    const { kinds } = await boardState(page);
    for (let i = 0; i < kinds.length; i++) {
      if (kinds[i] !== 'hidden') continue;
      await cell(page, i).click();
      if ((await face(page)) === 'dead') {
        lost = true;
        break;
      }
      const again = await boardState(page);
      kinds.splice(0, kinds.length, ...again.kinds);
    }
  }
  check(lost, 'a game can be lost');
  check((await statusText(page)) === 'Game over.', 'loss message shown');
  check((await page.locator('[data-kind="exploded"]').count()) >= 1, 'exploded mine is marked');
  const t1 = await ledLabel(page, 'Time');
  await page.screenshot({ path: join(shots, 'desktop-lost.png') });
  await page.waitForTimeout(2200);
  check((await ledLabel(page, 'Time')) === t1, 'timer stops after a loss');

  // A winning game, using the solver.
  let won = false;
  for (let attempt = 0; attempt < 40 && !won; attempt++) {
    if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape');
    await page.locator('.face').click();
    won = (await playOneGame(page)) === 'cool';
  }
  check(won, 'a game can be won');
  if (won) {
    check((await statusText(page)).startsWith('You won!'), 'win message shown');
    check((await ledLabel(page, 'Mines left')) === 'Mines left: 0', 'mine counter reads 0 after a win');
    const nameDialog = page.getByRole('dialog', { name: 'Congratulations' });
    if (await nameDialog.count()) {
      await page.screenshot({ path: join(shots, 'desktop-won-name.png') });
      await nameDialog.getByRole('textbox').fill('Tester');
      await nameDialog.getByRole('button', { name: 'OK' }).click();
    }
    await page.screenshot({ path: join(shots, 'desktop-won.png') });

    // Records survive a reload.
    await page.reload();
    await chooseMenu(page, 'Game', 'Best Times');
    const best = page.getByRole('dialog', { name: 'Fastest Mine Sweepers' });
    const row = await best.getByRole('row', { name: /Beginner/ }).textContent();
    check(/Tester/.test(row) && !/999/.test(row), `best time persisted after reload (${row.trim()})`);
    await page.screenshot({ path: join(shots, 'desktop-best-times.png') });
    await page.keyboard.press('Escape');
    check((await page.getByRole('dialog').count()) === 0, 'Escape closes dialogs');

    await chooseMenu(page, 'Game', 'Statistics');
    const stats = await page.getByRole('dialog', { name: 'Statistics' }).textContent();
    check(/Current winning streak:\s*1/.test(stats), 'statistics persisted with a streak of 1');
    await page.screenshot({ path: join(shots, 'desktop-statistics.png') });
    await page.keyboard.press('Escape');
  }

  // Each difficulty.
  for (const [name, cells, mines] of [
    ['Intermediate', 256, 40],
    ['Expert', 480, 99],
    ['Beginner', 81, 10],
  ]) {
    await chooseMenu(page, 'Game', name);
    check((await page.locator('[role="gridcell"]').count()) === cells, `${name} has ${cells} cells`);
    check((await ledLabel(page, 'Mines left')) === `Mines left: ${mines}`, `${name} has ${mines} mines`);
    await page.screenshot({ path: join(shots, `desktop-${name.toLowerCase()}.png`) });
  }

  // Menu look.
  await page.getByRole('menuitem', { name: 'Game', exact: true }).click();
  await page.screenshot({ path: join(shots, 'desktop-menu.png') });
  await page.keyboard.press('Escape');

  // Custom board, including a very large one.
  await chooseMenu(page, 'Game', 'Custom');
  const custom = page.getByRole('dialog', { name: 'Custom Field' });
  await custom.getByLabel(/Height/).fill('100');
  await custom.getByLabel(/Width/).fill('100');
  await custom.getByLabel(/Mines/).fill('20000');
  await custom.getByRole('button', { name: 'OK' }).click();
  check((await custom.getByRole('alert').count()) === 1, 'too many mines is rejected with a message');
  await page.screenshot({ path: join(shots, 'desktop-custom-error.png') });
  await custom.getByLabel(/Mines/).fill('10');
  await custom.getByRole('button', { name: 'OK' }).click();
  check((await page.locator('[role="gridcell"]').count()) === 10000, '100 × 100 custom board renders');
  const startFlood = Date.now();
  await cell(page, 5050).click();
  await page.locator('[data-index="5050"][data-kind="open"]').waitFor();
  const floodMs = Date.now() - startFlood;
  check(floodMs < 3000, `large flood fill stays responsive (${floodMs} ms)`);
  const noPageScrollX = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  check(noPageScrollX, 'huge board scrolls inside the window, not the page');
  await page.screenshot({ path: join(shots, 'desktop-custom-100x100.png') });

  // Keyboard focus ring.
  if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape'); // e.g. a record on the big board
  await chooseMenu(page, 'Game', 'Beginner');
  await page.locator('.face').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('f');
  check((await cell(page, 10).getAttribute('data-kind')) === 'flag', 'keyboard: arrows move and F flags');
  await page.screenshot({ path: join(shots, 'desktop-keyboard.png') });

  await context.close();
}

// ---- phone -----------------------------------------------------------------

console.log('Phone 390 × 844 (touch)');
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  watch(page, 'phone');
  await page.goto(URL);
  const toggle = page.getByRole('button', { name: /Flag/ });
  check(await toggle.isVisible(), 'flag-mode button visible on touch screens');
  const tile = await cell(page, 0).boundingBox();
  check(tile.width >= 28, `tiles are finger-sized on beginner (${tile.width.toFixed(1)}px)`);
  await page.screenshot({ path: join(shots, 'phone-beginner.png') });

  await toggle.tap();
  await cell(page, 40).tap();
  check((await cell(page, 40).getAttribute('data-kind')) === 'flag', 'tap in flag mode places a flag');
  check((await statusText(page)) === 'Ready', 'flag mode tap does not start the game');
  await toggle.tap();
  await cell(page, 40).tap(); // flagged: ignored
  check((await cell(page, 40).getAttribute('data-kind')) === 'flag', 'tap on a flag does nothing');
  await cell(page, 30).tap();
  check((await cell(page, 30).getAttribute('data-kind')) === 'open', 'tap reveals in reveal mode');
  await page.screenshot({ path: join(shots, 'phone-playing.png') });

  await chooseMenu(page, 'Game', 'Expert');
  const yes = page.getByRole('button', { name: 'Yes' });
  if (await yes.count()) await yes.tap();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check(fits, 'expert on a phone does not scroll the page sideways');
  const expertTile = await cell(page, 0).boundingBox();
  check(expertTile.width >= 16, `expert tiles stay readable (${expertTile.width}px)`);
  await page.screenshot({ path: join(shots, 'phone-expert.png') });

  await chooseMenu(page, 'Game', 'Custom');
  await page.screenshot({ path: join(shots, 'phone-custom-dialog.png') });
  await context.close();
}

await browser.close();
server.kill();

console.log('Console errors/warnings:', consoleErrors.length ? consoleErrors : 'none');
if (consoleErrors.length) failures++;
console.log(failures ? `\n${failures} check(s) failed` : '\nAll browser checks passed');
process.exit(failures ? 1 : 0);

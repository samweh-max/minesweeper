import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { PRESETS, createRng, generateMines } from './engine';
import { RECORDS_KEY, SETTINGS_KEY } from './storage';
import { createMemoryStore, type KeyValueStore } from './storage/storage';

const SEED = 12345;
vi.mock('./engine/rng', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./engine/rng')>()),
  randomSeed: () => SEED,
}));

const START = 40; // centre of the beginner board
const beginnerMines = generateMines(PRESETS.beginner, START, createRng(SEED));
const mineIndex = beginnerMines.findIndex((m) => m === 1);
const safeIndices = [...beginnerMines.keys()].filter((i) => !beginnerMines[i]);

let store: KeyValueStore;

function setup() {
  return render(<App store={store} />);
}

const cell = (i: number) => document.querySelector<HTMLElement>(`[data-index="${i}"]`)!;
const kind = (i: number) => cell(i).getAttribute('data-kind');
const face = () => document.querySelector('.face')!.getAttribute('data-face');
const minesLeft = () => screen.getByRole('img', { name: /^Mines left/ }).getAttribute('aria-label');
const time = () => screen.getByRole('img', { name: /^Time/ }).getAttribute('aria-label');
const status = () => screen.getByRole('status').textContent;

function click(i: number) {
  fireEvent.mouseDown(cell(i), { button: 0, buttons: 1 });
  fireEvent.mouseUp(window, { button: 0, buttons: 0 });
}
function rightClick(i: number) {
  fireEvent.mouseDown(cell(i), { button: 2, buttons: 2 });
  fireEvent.mouseUp(window, { button: 2, buttons: 0 });
}
function openMenu(name: string) {
  fireEvent.mouseDown(screen.getByRole('menuitem', { name }));
}
function chooseMenuItem(menu: string, item: RegExp) {
  openMenu(menu);
  const items = [...screen.getByRole('menu', { name: menu }).querySelectorAll<HTMLElement>('[role^="menuitem"]')];
  const match = items.find((el) => item.test(el.querySelector('.menu__label')!.textContent!));
  if (!match) throw new Error(`No menu item ${item}`);
  fireEvent.click(match);
}
function winBeginner() {
  click(START);
  for (const i of safeIndices) if (kind(i) === 'hidden') click(i);
}
function records() {
  return JSON.parse(store.get(RECORDS_KEY)!);
}

beforeEach(() => {
  store = createMemoryStore();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('starting state', () => {
  it('shows a fresh beginner board', () => {
    setup();
    expect(document.querySelectorAll('[role="gridcell"]')).toHaveLength(81);
    expect(minesLeft()).toBe('Mines left: 10');
    expect(time()).toBe('Time: 0');
    expect(face()).toBe('smile');
    expect(status()).toBe('Ready');
  });
});

describe('playing with the mouse', () => {
  it('first click opens a safe area and starts the timer', () => {
    setup();
    click(START);
    expect(kind(START)).toBe('open');
    expect(document.querySelectorAll('[data-kind="open"]').length).toBeGreaterThan(1);
    expect(time()).toBe('Time: 1');
    expect(status()).toBe('Playing');
  });

  it('shows the surprised face only while a tile is held', () => {
    setup();
    fireEvent.mouseDown(cell(0), { button: 0, buttons: 1 });
    expect(face()).toBe('surprised');
    expect(cell(0).className).toContain('cell--pressed');
    fireEvent.mouseUp(window, { button: 0, buttons: 0 });
    expect(face()).toBe('smile');
  });

  it('right-click flags and unflags without revealing, and blocks the context menu', () => {
    setup();
    rightClick(5);
    expect(kind(5)).toBe('flag');
    expect(minesLeft()).toBe('Mines left: 9');
    expect(time()).toBe('Time: 0'); // flagging does not start the clock
    rightClick(5);
    expect(kind(5)).toBe('hidden');
    expect(minesLeft()).toBe('Mines left: 10');
    expect(fireEvent.contextMenu(cell(5))).toBe(false);
  });

  it('a flagged tile cannot be revealed by a left click', () => {
    setup();
    rightClick(START);
    click(START);
    expect(kind(START)).toBe('flag');
    expect(status()).toBe('Ready');
  });

  it('losing shows the mines, the dead face and stops play', () => {
    setup();
    click(START);
    click(mineIndex);
    expect(face()).toBe('dead');
    expect(status()).toBe('Game over.');
    expect(kind(mineIndex)).toBe('exploded');
    expect(document.querySelectorAll('[data-kind="mine"]')).toHaveLength(9);
    const hidden = safeIndices.find((i) => kind(i) === 'hidden')!;
    click(hidden);
    rightClick(hidden);
    expect(kind(hidden)).toBe('hidden');
    expect(records().stats.beginner).toEqual({ played: 1, won: 0 });
  });

  it('winning shows the cool face, records the time once, and asks for a name', () => {
    setup();
    winBeginner();
    expect(face()).toBe('cool');
    expect(status()).toBe('You won! New best time!');
    expect(minesLeft()).toBe('Mines left: 0');
    const dialog = screen.getByRole('dialog', { name: 'Congratulations' });
    const input = within(dialog).getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Samer' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const saved = records();
    expect(saved.stats.beginner).toEqual({ played: 1, won: 1 });
    expect(saved.bestTimes.beginner.name).toBe('Samer');
    expect(saved.currentStreak).toBe(1);
    expect(JSON.parse(store.get(SETTINGS_KEY)!).playerName).toBe('Samer');
    // Clicking around afterwards must not count the game again.
    click(0);
    expect(records().stats.beginner).toEqual({ played: 1, won: 1 });
  });

  it('chords with both buttons', () => {
    setup();
    click(START);
    // Find an opened number whose mines are all still hidden, flag them, then chord.
    const target = [...document.querySelectorAll<HTMLElement>('[data-kind="open"].n1')][0];
    const idx = Number(target.dataset.index);
    const x = idx % 9;
    const y = Math.floor(idx / 9);
    const around: number[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < 9 && ny < 9) around.push(ny * 9 + nx);
      }
    const mine = around.find((i) => beginnerMines[i])!;
    rightClick(mine);
    fireEvent.mouseDown(cell(idx), { button: 0, buttons: 1 });
    fireEvent.mouseDown(cell(idx), { button: 2, buttons: 3 });
    expect(kind(mine)).toBe('flag'); // second button starts a chord, not a flag toggle
    fireEvent.mouseUp(window, { button: 0, buttons: 2 });
    fireEvent.mouseUp(window, { button: 2, buttons: 0 });
    for (const n of around) if (n !== mine) expect(kind(n)).toBe('open');
  });
});

describe('timer', () => {
  it('counts from the first reveal and stops at the end', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    setup();
    act(() => vi.advanceTimersByTime(5000));
    expect(time()).toBe('Time: 0'); // opening the app does not start it
    click(START);
    act(() => vi.advanceTimersByTime(3200));
    expect(time()).toBe('Time: 4');
    click(mineIndex);
    act(() => vi.advanceTimersByTime(10_000));
    expect(time()).toBe('Time: 4');
    fireEvent.click(document.querySelector('.face')!);
    expect(time()).toBe('Time: 0');
  });
});

describe('restarting', () => {
  it('the face starts a new game and keeps records', () => {
    setup();
    click(START);
    click(mineIndex);
    fireEvent.click(document.querySelector('.face')!);
    expect(face()).toBe('smile');
    expect(status()).toBe('Ready');
    expect(document.querySelectorAll('[data-kind="hidden"]')).toHaveLength(81);
    expect(records().stats.beginner.played).toBe(1);
  });

  it('F2 starts a new game; abandoned games are not counted', () => {
    setup();
    click(START);
    fireEvent.keyDown(window, { key: 'F2' });
    expect(status()).toBe('Ready');
    expect(store.get(RECORDS_KEY)).toBeNull();
  });

  it('asks before abandoning when the option is on', () => {
    store.set(SETTINGS_KEY, JSON.stringify({ confirmAbandon: true }));
    setup();
    click(START);
    fireEvent.click(document.querySelector('.face')!);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'No' }));
    expect(status()).toBe('Playing');
    fireEvent.click(document.querySelector('.face')!);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Yes' }));
    expect(status()).toBe('Ready');
  });
});

describe('difficulty and custom boards', () => {
  it('switches presets from the Game menu', () => {
    setup();
    chooseMenuItem('Game', /^Expert$/);
    expect(document.querySelectorAll('[role="gridcell"]')).toHaveLength(480);
    expect(minesLeft()).toBe('Mines left: 99');
    chooseMenuItem('Game', /^Intermediate$/);
    expect(document.querySelectorAll('[role="gridcell"]')).toHaveLength(256);
    expect(minesLeft()).toBe('Mines left: 40');
    expect(JSON.parse(store.get(SETTINGS_KEY)!).difficulty).toBe('intermediate');
  });

  it('warns before changing difficulty during a game', () => {
    setup();
    click(START);
    chooseMenuItem('Game', /^Expert$/);
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/abandoned/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes' }));
    expect(document.querySelectorAll('[role="gridcell"]')).toHaveLength(480);
  });

  it('applies a valid custom board and rejects invalid values with a message', () => {
    setup();
    chooseMenuItem('Game', /^Custom/);
    const dialog = screen.getByRole('dialog', { name: 'Custom Field' });
    fireEvent.change(within(dialog).getByLabelText(/Height/), { target: { value: '12' } });
    fireEvent.change(within(dialog).getByLabelText(/Width/), { target: { value: '20' } });
    fireEvent.change(within(dialog).getByLabelText(/Mines/), { target: { value: '999' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(within(dialog).getByRole('alert').textContent).toMatch(/at most 239/);
    expect(document.querySelectorAll('[role="gridcell"]')).toHaveLength(81);

    fireEvent.change(within(dialog).getByLabelText(/Mines/), { target: { value: '1.5' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(within(dialog).getByRole('alert').textContent).toMatch(/whole number/);

    fireEvent.change(within(dialog).getByLabelText(/Mines/), { target: { value: '50' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelectorAll('[role="gridcell"]')).toHaveLength(240);
    expect(minesLeft()).toBe('Mines left: 50');
    expect(JSON.parse(store.get(SETTINGS_KEY)!).custom).toEqual({ width: 20, height: 12, mines: 50 });

    // New games keep using it.
    fireEvent.click(document.querySelector('.face')!);
    expect(document.querySelectorAll('[role="gridcell"]')).toHaveLength(240);
  });

  it('records custom-board wins under that board', () => {
    setup();
    chooseMenuItem('Game', /^Custom/);
    const dialog = screen.getByRole('dialog', { name: 'Custom Field' });
    fireEvent.change(within(dialog).getByLabelText(/Height/), { target: { value: '3' } });
    fireEvent.change(within(dialog).getByLabelText(/Width/), { target: { value: '4' } });
    fireEvent.change(within(dialog).getByLabelText(/Mines/), { target: { value: '0' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    click(0); // no mines: first click wins
    expect(face()).toBe('cool');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'OK' }));
    expect(records().customBestTimes['4x3x0']).toBeDefined();
    expect(records().bestTimes.beginner).toBeNull();
  });
});

describe('persistence', () => {
  it('restores records and settings after a reload', () => {
    const first = setup();
    winBeginner();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'OK' }));
    chooseMenuItem('Options', /^Sound$/);
    first.unmount();

    setup();
    chooseMenuItem('Game', /^Statistics/);
    const stats = screen.getByRole('dialog', { name: 'Statistics' });
    const total = within(stats).getByRole('row', { name: /All levels/ });
    expect(total.textContent).toContain('100%');
    fireEvent.keyDown(stats, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    chooseMenuItem('Game', /^Best Times/);
    const best = screen.getByRole('dialog', { name: 'Fastest Mine Sweepers' });
    expect(within(best).getByRole('row', { name: /Beginner/ }).textContent).toMatch(/Anonymous/);
    expect(within(best).getByRole('row', { name: /Expert/ }).textContent).toMatch(/999 seconds/);

    openMenu('Options');
    expect(screen.getByRole('menuitemcheckbox', { name: /Sound/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('reset statistics needs confirmation and keeps best times', () => {
    setup();
    winBeginner();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'OK' }));
    chooseMenuItem('Options', /^Reset Statistics/);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'No' }));
    expect(records().stats.beginner.played).toBe(1);
    chooseMenuItem('Options', /^Reset Statistics/);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Yes' }));
    expect(records().stats.beginner.played).toBe(0);
    expect(records().bestTimes.beginner).not.toBeNull();
  });

  it('starts cleanly from corrupted storage', () => {
    store.set(RECORDS_KEY, '{{{');
    store.set(SETTINGS_KEY, '"oops"');
    setup();
    expect(document.querySelectorAll('[role="gridcell"]')).toHaveLength(81);
  });
});

describe('touch and keyboard', () => {
  function tap(i: number) {
    fireEvent.pointerDown(cell(i), { pointerId: 7, pointerType: 'touch', clientX: 10, clientY: 10 });
    fireEvent.pointerUp(cell(i), { pointerId: 7, pointerType: 'touch', clientX: 10, clientY: 10 });
  }

  it('tap reveals; in flag mode a tap flags instead', () => {
    setup();
    const toggle = screen.getByRole('button', { name: /Flag/ });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    tap(START);
    expect(kind(START)).toBe('flag');
    tap(START);
    expect(kind(START)).toBe('hidden');
    fireEvent.click(toggle);
    tap(START);
    expect(kind(START)).toBe('open');
  });

  it('ignores a second finger and cancels on scroll', () => {
    setup();
    fireEvent.pointerDown(cell(START), { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10 });
    fireEvent.pointerDown(cell(0), { pointerId: 2, pointerType: 'touch', clientX: 50, clientY: 50 });
    fireEvent.pointerUp(cell(0), { pointerId: 2, pointerType: 'touch' });
    expect(status()).toBe('Ready');
    fireEvent.pointerMove(cell(START), { pointerId: 1, pointerType: 'touch', clientX: 60, clientY: 10 });
    fireEvent.pointerUp(cell(START), { pointerId: 1, pointerType: 'touch', clientX: 60, clientY: 10 });
    expect(status()).toBe('Ready');
  });

  it('long press flags', () => {
    vi.useFakeTimers();
    setup();
    fireEvent.pointerDown(cell(3), { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(600));
    fireEvent.pointerUp(cell(3), { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10 });
    expect(kind(3)).toBe('flag');
    expect(status()).toBe('Ready');
  });

  it('arrow keys move, F flags, Enter reveals', () => {
    setup();
    cell(0).focus();
    fireEvent.keyDown(cell(0), { key: 'ArrowRight' });
    fireEvent.keyDown(cell(1), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell(10));
    fireEvent.keyDown(cell(10), { key: 'f' });
    expect(kind(10)).toBe('flag');
    fireEvent.keyDown(cell(10), { key: 'End' });
    expect(document.activeElement).toBe(cell(17));
    for (let i = 0; i < 3; i++) fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(cell(START));
    fireEvent.keyDown(cell(START), { key: 'Enter' });
    expect(kind(START)).toBe('open');
    expect(cell(START).getAttribute('aria-label')).toMatch(/^Row 5, column 5: /);
  });

  it('menus work from the keyboard and Escape closes them', () => {
    setup();
    const game = screen.getByRole('menuitem', { name: 'Game' });
    game.focus();
    fireEvent.keyDown(game, { key: 'ArrowDown' });
    const menu = screen.getByRole('menu', { name: 'Game' });
    expect(menu.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(game);
  });
});

import { validateConfig } from './config';
import { createRng } from './rng';
import {
  MARK_FLAG,
  MARK_NONE,
  MARK_QUESTION,
  type BoardConfig,
  type CellView,
  type GameState,
} from './types';

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Indices of the (up to eight) cells touching `index`. */
export function neighbors(config: BoardConfig, index: number): number[] {
  const { width, height } = config;
  const x = index % width;
  const y = (index - x) / width;
  const result: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    const ny = y + dy;
    if (ny < 0 || ny >= height) continue;
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      if (nx < 0 || nx >= width) continue;
      result.push(ny * width + nx);
    }
  }
  return result;
}

export function cellCount(config: BoardConfig): number {
  return config.width * config.height;
}

// ---------------------------------------------------------------------------
// Board generation
// ---------------------------------------------------------------------------

/**
 * Places exactly `config.mines` mines, never on `safeIndex`.
 *
 * When the board has room, the whole 3 × 3 area around the first click is
 * kept clear as well, so the first click opens an area. On dense custom
 * boards where that is impossible, only the clicked cell is protected. The
 * mines are drawn with a partial Fisher–Yates shuffle over the allowed cells,
 * so generation always finishes in one pass with no retries.
 */
export function generateMines(config: BoardConfig, safeIndex: number, random: () => number): Uint8Array {
  const total = cellCount(config);
  if (config.mines > total - 1) throw new Error('Too many mines for the board size.');

  const area = [safeIndex, ...neighbors(config, safeIndex)];
  const protectedCells = total - area.length >= config.mines ? area : [safeIndex];
  const blocked = new Uint8Array(total);
  for (const i of protectedCells) blocked[i] = 1;

  const candidates: number[] = [];
  for (let i = 0; i < total; i++) if (!blocked[i]) candidates.push(i);

  const mines = new Uint8Array(total);
  for (let k = 0; k < config.mines; k++) {
    const j = k + Math.floor(random() * (candidates.length - k));
    const pick = candidates[j];
    candidates[j] = candidates[k];
    candidates[k] = pick;
    mines[pick] = 1;
  }
  return mines;
}

/** Neighbouring mine count for every cell. */
export function computeCounts(config: BoardConfig, mines: Uint8Array): Uint8Array {
  const counts = new Uint8Array(mines.length);
  for (let i = 0; i < mines.length; i++) {
    if (!mines[i]) continue;
    for (const n of neighbors(config, i)) counts[n]++;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Game lifecycle
// ---------------------------------------------------------------------------

let nextGameId = 1;

/** Creates a fresh game in the `ready` state. Mines are placed on first reveal. */
export function createGame(config: BoardConfig, id: number = nextGameId++): GameState {
  const errors = validateConfig(config);
  if (Object.keys(errors).length > 0) {
    throw new Error(`Invalid board: ${Object.values(errors).join(' ')}`);
  }
  const total = cellCount(config);
  return {
    id,
    config: { width: config.width, height: config.height, mines: config.mines },
    status: 'ready',
    mines: null,
    counts: null,
    revealed: new Uint8Array(total),
    marks: new Uint8Array(total),
    revealedCount: 0,
    flagCount: 0,
    exploded: [],
    startTime: null,
    endTime: null,
  };
}

/**
 * Creates a game with a known mine layout (used by tests and tooling). The
 * game starts in `ready`, and the first reveal does not move any mines.
 */
export function createGameWithMines(config: BoardConfig, mineIndices: readonly number[], id?: number): GameState {
  const game = createGame(config, id);
  const mines = new Uint8Array(cellCount(config));
  for (const i of mineIndices) {
    if (i < 0 || i >= mines.length || mines[i]) throw new Error(`Bad mine index ${i}`);
    mines[i] = 1;
  }
  if (mineIndices.length !== config.mines) throw new Error('Mine list does not match the mine count.');
  return { ...game, mines, counts: computeCounts(config, mines) };
}

export function isOver(state: GameState): boolean {
  return state.status === 'won' || state.status === 'lost';
}

export function remainingMines(state: GameState): number {
  return state.config.mines - state.flagCount;
}

/** Milliseconds of play so far (or in total, once the game has ended). */
export function elapsedMs(state: GameState, now: number): number {
  if (state.startTime === null) return 0;
  const end = state.endTime ?? now;
  return Math.max(0, end - state.startTime);
}

/**
 * Seconds as shown on the classic counter. Like the original, the counter
 * reads 1 as soon as the first cell opens, and it stops at 999.
 */
export function displaySeconds(ms: number | null): number {
  if (ms === null) return 0;
  return Math.min(999, Math.floor(ms / 1000) + 1);
}

/** Makes sure the mines exist, placing them around `index` if this is the first reveal. */
function ensureStarted(state: GameState, index: number, now: number, seed: number): GameState {
  if (state.status !== 'ready') return state;
  let { mines, counts } = state;
  if (!mines || !counts) {
    mines = generateMines(state.config, index, createRng(seed));
    counts = computeCounts(state.config, mines);
  }
  return { ...state, mines, counts, status: 'playing', startTime: now };
}

/**
 * Opens the given cells, flood-filling outward from any cell with no
 * neighbouring mines. Uses an explicit stack so large empty areas cannot
 * overflow the call stack. Caller must ensure no start cell is a mine.
 */
function openCells(state: GameState, starts: readonly number[], now: number): GameState {
  const mines = state.mines!;
  const counts = state.counts!;
  const revealed = state.revealed.slice();
  const marks = state.marks.slice();
  let revealedCount = state.revealedCount;
  const stack = [...starts];

  while (stack.length > 0) {
    const i = stack.pop()!;
    if (revealed[i] || mines[i]) continue;
    revealed[i] = 1;
    marks[i] = MARK_NONE; // a question mark is cleared when the cell opens
    revealedCount++;
    if (counts[i] === 0) {
      for (const n of neighbors(state.config, i)) {
        // Flood fill opens question marks but never removes a flag.
        if (!revealed[n] && marks[n] !== MARK_FLAG) stack.push(n);
      }
    }
  }

  const next: GameState = { ...state, revealed, marks, revealedCount };
  return checkWin(next, now);
}

function checkWin(state: GameState, now: number): GameState {
  const safeCells = cellCount(state.config) - state.config.mines;
  if (state.revealedCount < safeCells) return state;
  // Like the original, a win flags every remaining mine.
  const marks = state.marks.slice();
  const mines = state.mines!;
  for (let i = 0; i < marks.length; i++) marks[i] = mines[i] ? MARK_FLAG : MARK_NONE;
  return { ...state, marks, flagCount: state.config.mines, status: 'won', endTime: now };
}

function lose(state: GameState, hit: readonly number[], now: number): GameState {
  return { ...state, status: 'lost', exploded: [...hit], endTime: now };
}

// ---------------------------------------------------------------------------
// Player actions. Each returns the same object when nothing changes.
// ---------------------------------------------------------------------------

/**
 * Reveals a closed cell. Flagged cells are ignored. The first reveal of a
 * game places the mines (using `seed`) and starts the clock at `now`.
 */
export function reveal(state: GameState, index: number, now: number, seed: number): GameState {
  if (isOver(state)) return state;
  if (index < 0 || index >= state.revealed.length) return state;
  if (state.revealed[index] || state.marks[index] === MARK_FLAG) return state;

  const started = ensureStarted(state, index, now, seed);
  if (started.mines![index]) return lose(started, [index], now);
  return openCells(started, [index], now);
}

/**
 * Chords on an opened number: when the number of flagged neighbours equals
 * the number, every other closed neighbour is opened. A wrongly placed flag
 * therefore sets off the hidden mine, exactly as in the original game.
 */
export function chord(state: GameState, index: number, now: number): GameState {
  if (state.status !== 'playing') return state;
  if (!state.revealed[index]) return state;
  const count = state.counts![index];
  if (count === 0) return state;

  const around = neighbors(state.config, index);
  let flags = 0;
  for (const n of around) if (!state.revealed[n] && state.marks[n] === MARK_FLAG) flags++;
  if (flags !== count) return state;

  const targets = around.filter((n) => !state.revealed[n] && state.marks[n] !== MARK_FLAG);
  if (targets.length === 0) return state;
  const hit = targets.filter((n) => state.mines![n]);
  if (hit.length > 0) return lose(state, hit, now);
  return openCells(state, targets, now);
}

/** True when chording on `index` would open anything right now. */
export function canChord(state: GameState, index: number): boolean {
  return chord(state, index, 0) !== state;
}

/**
 * Cycles the mark on a closed cell: none → flag → (question →) none.
 * Allowed before the first reveal too; it does not start the clock.
 */
export function toggleMark(state: GameState, index: number, useQuestionMarks: boolean): GameState {
  if (isOver(state)) return state;
  if (index < 0 || index >= state.revealed.length || state.revealed[index]) return state;
  const current = state.marks[index];
  let next: number;
  if (current === MARK_NONE) next = MARK_FLAG;
  else if (current === MARK_FLAG) next = useQuestionMarks ? MARK_QUESTION : MARK_NONE;
  else next = MARK_NONE;

  const marks = state.marks.slice();
  marks[index] = next;
  const flagDelta = (next === MARK_FLAG ? 1 : 0) - (current === MARK_FLAG ? 1 : 0);
  return { ...state, marks, flagCount: state.flagCount + flagDelta };
}

/**
 * The main "activate" action used by clicks, taps and the keyboard: reveal a
 * closed cell, or chord an opened number.
 */
export function activate(state: GameState, index: number, now: number, seed: number): GameState {
  if (state.revealed[index]) return chord(state, index, now);
  return reveal(state, index, now, seed);
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

const HIDDEN: CellView = { kind: 'hidden' };
const FLAG: CellView = { kind: 'flag' };
const QUESTION: CellView = { kind: 'question' };
const MINE: CellView = { kind: 'mine' };
const EXPLODED: CellView = { kind: 'exploded' };
const WRONG: CellView = { kind: 'wrong-flag' };
const OPEN: CellView[] = Array.from({ length: 9 }, (_, count) => ({ kind: 'open', count }));

/** What the player should see in a cell. Shared objects keep React memo cheap. */
export function cellView(state: GameState, index: number): CellView {
  if (state.revealed[index]) return OPEN[state.counts![index]];
  const mark = state.marks[index];
  if (state.status === 'lost') {
    const isMine = state.mines![index] === 1;
    if (state.exploded.includes(index)) return EXPLODED;
    if (mark === MARK_FLAG) return isMine ? FLAG : WRONG;
    if (isMine) return MINE;
  }
  if (mark === MARK_FLAG) return FLAG;
  if (mark === MARK_QUESTION) return QUESTION;
  return HIDDEN;
}

/** Board dimensions and mine count. */
export interface BoardConfig {
  readonly width: number;
  readonly height: number;
  readonly mines: number;
}

export type Difficulty = 'beginner' | 'intermediate' | 'expert' | 'custom';

export type GameStatus = 'ready' | 'playing' | 'won' | 'lost';

/** Player marks on a closed cell. */
export const MARK_NONE = 0;
export const MARK_FLAG = 1;
export const MARK_QUESTION = 2;
export type Mark = typeof MARK_NONE | typeof MARK_FLAG | typeof MARK_QUESTION;

/**
 * Complete, immutable game state. Arrays are indexed by `y * width + x`.
 * The engine never mutates an existing state; every action returns a new
 * object with copied arrays where something changed.
 */
export interface GameState {
  readonly id: number;
  readonly config: BoardConfig;
  readonly status: GameStatus;
  /** 1 = mine. `null` until the first reveal places the mines. */
  readonly mines: Uint8Array | null;
  /** Neighbouring mine counts. `null` until the mines are placed. */
  readonly counts: Uint8Array | null;
  /** 1 = revealed. */
  readonly revealed: Uint8Array;
  /** Mark per cell (MARK_NONE, MARK_FLAG, MARK_QUESTION). */
  readonly marks: Uint8Array;
  readonly revealedCount: number;
  readonly flagCount: number;
  /** Mines the player set off (normally one; chording can hit several). */
  readonly exploded: readonly number[];
  /** Epoch ms of the first reveal. */
  readonly startTime: number | null;
  /** Epoch ms when the game was won or lost. */
  readonly endTime: number | null;
}

/** What a single cell should look like. Derived from GameState. */
export type CellView =
  | { kind: 'hidden' }
  | { kind: 'flag' }
  | { kind: 'question' }
  | { kind: 'open'; count: number }
  | { kind: 'mine' }
  | { kind: 'exploded' }
  | { kind: 'wrong-flag' };

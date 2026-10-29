import type { BoardConfig, Difficulty } from './types';

export const PRESETS = {
  beginner: { width: 9, height: 9, mines: 10 },
  intermediate: { width: 16, height: 16, mines: 40 },
  expert: { width: 30, height: 16, mines: 99 },
} as const satisfies Record<Exclude<Difficulty, 'custom'>, BoardConfig>;

export type PresetDifficulty = keyof typeof PRESETS;

export const PRESET_ORDER: readonly PresetDifficulty[] = ['beginner', 'intermediate', 'expert'];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  expert: 'Expert',
  custom: 'Custom',
};

/**
 * Custom board limits. 100 x 100 (10,000 cells) keeps rendering and flood fill
 * fast on ordinary hardware. One cell must always stay free of mines so the
 * first click can be safe.
 */
export const LIMITS = {
  minWidth: 1,
  maxWidth: 100,
  minHeight: 1,
  maxHeight: 100,
  minMines: 0,
} as const;

export function maxMinesFor(width: number, height: number): number {
  return Math.max(0, width * height - 1);
}

export type ConfigField = 'width' | 'height' | 'mines';
export type ConfigErrors = Partial<Record<ConfigField, string>>;

function integerError(label: string, value: number, min: number, max: number): string | undefined {
  if (!Number.isFinite(value)) return `${label} must be a number.`;
  if (!Number.isInteger(value)) return `${label} must be a whole number.`;
  if (value < min || value > max) return `${label} must be between ${min} and ${max}.`;
  return undefined;
}

/** Validates a board configuration. Returns an empty object when valid. */
export function validateConfig(config: BoardConfig): ConfigErrors {
  const errors: ConfigErrors = {};
  const w = integerError('Width', config.width, LIMITS.minWidth, LIMITS.maxWidth);
  const h = integerError('Height', config.height, LIMITS.minHeight, LIMITS.maxHeight);
  if (w) errors.width = w;
  if (h) errors.height = h;

  if (!Number.isFinite(config.mines)) {
    errors.mines = 'Mines must be a number.';
  } else if (!Number.isInteger(config.mines)) {
    errors.mines = 'Mines must be a whole number.';
  } else if (config.mines < LIMITS.minMines) {
    errors.mines = 'Mines cannot be negative.';
  } else if (!w && !h) {
    const max = maxMinesFor(config.width, config.height);
    if (config.mines > max) {
      errors.mines = `Mines must be at most ${max} for a ${config.width} × ${config.height} board (one cell must stay safe for the first click).`;
    }
  }
  return errors;
}

export function isValidConfig(config: BoardConfig): boolean {
  return Object.keys(validateConfig(config)).length === 0;
}

/** Returns the preset matching these exact dimensions, if any. */
export function presetFor(config: BoardConfig): PresetDifficulty | null {
  for (const key of PRESET_ORDER) {
    const p = PRESETS[key];
    if (p.width === config.width && p.height === config.height && p.mines === config.mines) return key;
  }
  return null;
}

/** Stable record key for a custom board, e.g. "20x12x50". */
export function customKey(config: BoardConfig): string {
  return `${config.width}x${config.height}x${config.mines}`;
}

export function parseCustomKey(key: string): BoardConfig | null {
  const m = /^(\d+)x(\d+)x(\d+)$/.exec(key);
  if (!m) return null;
  const config = { width: Number(m[1]), height: Number(m[2]), mines: Number(m[3]) };
  return isValidConfig(config) ? config : null;
}

export function describeConfig(config: BoardConfig): string {
  return `${config.width} × ${config.height}, ${config.mines} ${config.mines === 1 ? 'mine' : 'mines'}`;
}

import { PRESETS, isValidConfig, type BoardConfig, type Difficulty } from '../engine';
import { asBool, asString, isObject, readJson, writeJson, type KeyValueStore } from './storage';

export const SETTINGS_KEY = 'classic-minesweeper.settings';
export const SETTINGS_VERSION = 1;

export type ZoomSetting = 'auto' | 1 | 1.5 | 2 | 3;
export const ZOOM_OPTIONS: readonly ZoomSetting[] = ['auto', 1, 1.5, 2, 3];

export interface Settings {
  difficulty: Difficulty;
  /** Last custom board, used by Custom and as the dialog's defaults. */
  custom: BoardConfig;
  sound: boolean;
  /** Allow "?" marks when cycling a cell's mark. */
  questionMarks: boolean;
  colorBlind: boolean;
  /** Ask before New Game / face click throws away a game in progress. */
  confirmAbandon: boolean;
  zoom: ZoomSetting;
  /** Name offered in the "fastest time" dialog. */
  playerName: string;
}

export const DEFAULT_SETTINGS: Settings = {
  difficulty: 'beginner',
  custom: { width: 20, height: 12, mines: 40 },
  sound: false,
  questionMarks: false,
  colorBlind: false,
  confirmAbandon: false,
  zoom: 'auto',
  playerName: 'Anonymous',
};

const DIFFICULTIES: readonly Difficulty[] = ['beginner', 'intermediate', 'expert', 'custom'];

function sanitizeConfig(value: unknown): BoardConfig {
  if (isObject(value)) {
    const config = { width: value.width, height: value.height, mines: value.mines } as BoardConfig;
    if (isValidConfig(config)) return { ...config };
  }
  return { ...DEFAULT_SETTINGS.custom };
}

/** Turns anything read from storage into valid settings, field by field. */
export function sanitizeSettings(raw: unknown): Settings {
  if (!isObject(raw)) return { ...DEFAULT_SETTINGS, custom: { ...DEFAULT_SETTINGS.custom } };
  const data = migrateSettings(raw);
  const zoom = ZOOM_OPTIONS.includes(data.zoom as ZoomSetting) ? (data.zoom as ZoomSetting) : DEFAULT_SETTINGS.zoom;
  const name = asString(data.playerName, DEFAULT_SETTINGS.playerName, 32).trim();
  return {
    difficulty: DIFFICULTIES.includes(data.difficulty as Difficulty)
      ? (data.difficulty as Difficulty)
      : DEFAULT_SETTINGS.difficulty,
    custom: sanitizeConfig(data.custom),
    sound: asBool(data.sound, DEFAULT_SETTINGS.sound),
    questionMarks: asBool(data.questionMarks, DEFAULT_SETTINGS.questionMarks),
    colorBlind: asBool(data.colorBlind, DEFAULT_SETTINGS.colorBlind),
    confirmAbandon: asBool(data.confirmAbandon, DEFAULT_SETTINGS.confirmAbandon),
    zoom,
    playerName: name || DEFAULT_SETTINGS.playerName,
  };
}

/**
 * Upgrades older stored shapes to the current version. Version 1 is the
 * first schema, so there is nothing to convert yet; data from an unknown
 * newer version is still read field by field, keeping whatever is valid.
 */
function migrateSettings(raw: Record<string, unknown>): Record<string, unknown> {
  return raw;
}

export function loadSettings(store: KeyValueStore): Settings {
  return sanitizeSettings(readJson(store, SETTINGS_KEY));
}

export function saveSettings(store: KeyValueStore, settings: Settings): boolean {
  return writeJson(store, SETTINGS_KEY, { version: SETTINGS_VERSION, ...settings });
}

export function configForDifficulty(difficulty: Difficulty, custom: BoardConfig): BoardConfig {
  return difficulty === 'custom' ? custom : PRESETS[difficulty];
}

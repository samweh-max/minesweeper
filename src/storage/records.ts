import {
  PRESET_ORDER,
  customKey,
  displaySeconds,
  parseCustomKey,
  presetFor,
  type BoardConfig,
  type PresetDifficulty,
} from '../engine';
import { asCount, asString, isObject, readJson, writeJson, type KeyValueStore } from './storage';

export const RECORDS_KEY = 'classic-minesweeper.records';
export const RECORDS_VERSION = 1;

export interface TimeRecord {
  /** Precise completion time; used to rank records. */
  ms: number;
  /** What the classic counter showed (1–999). */
  seconds: number;
  name: string;
  /** ISO date of the win. */
  date: string;
}

export interface CategoryStats {
  played: number;
  won: number;
}

export type StatsCategory = PresetDifficulty | 'custom';
export const STATS_CATEGORIES: readonly StatsCategory[] = [...PRESET_ORDER, 'custom'];

/**
 * Everything the player has achieved. Only completed games (won or lost)
 * are counted. A game that is abandoned by starting a new one is not.
 */
export interface Records {
  bestTimes: Record<PresetDifficulty, TimeRecord | null>;
  /** Best time per custom board, keyed by "WIDTHxHEIGHTxMINES". */
  customBestTimes: Record<string, TimeRecord>;
  stats: Record<StatsCategory, CategoryStats>;
  currentStreak: number;
  bestStreak: number;
}

/** Where a board's results are filed. Custom boards that match a preset count as that preset. */
export type RecordSlot = { kind: 'preset'; difficulty: PresetDifficulty } | { kind: 'custom'; key: string };

export function slotFor(config: BoardConfig): RecordSlot {
  const preset = presetFor(config);
  return preset ? { kind: 'preset', difficulty: preset } : { kind: 'custom', key: customKey(config) };
}

export function emptyRecords(): Records {
  return {
    bestTimes: { beginner: null, intermediate: null, expert: null },
    customBestTimes: {},
    stats: {
      beginner: { played: 0, won: 0 },
      intermediate: { played: 0, won: 0 },
      expert: { played: 0, won: 0 },
      custom: { played: 0, won: 0 },
    },
    currentStreak: 0,
    bestStreak: 0,
  };
}

function sanitizeTime(value: unknown): TimeRecord | null {
  if (!isObject(value)) return null;
  const ms = value.ms;
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null;
  const date = asString(value.date, '', 40);
  return {
    ms,
    seconds: displaySeconds(ms),
    name: asString(value.name, 'Anonymous', 32).trim() || 'Anonymous',
    date: Number.isNaN(Date.parse(date)) ? '' : date,
  };
}

function sanitizeStats(value: unknown): CategoryStats {
  if (!isObject(value)) return { played: 0, won: 0 };
  const played = asCount(value.played);
  const won = Math.min(asCount(value.won), played);
  return { played, won };
}

/** Turns anything read from storage into valid records, keeping every valid part. */
export function sanitizeRecords(raw: unknown): Records {
  const records = emptyRecords();
  if (!isObject(raw)) return records;
  const data = migrateRecords(raw);

  if (isObject(data.bestTimes)) {
    for (const d of PRESET_ORDER) records.bestTimes[d] = sanitizeTime(data.bestTimes[d]);
  }
  if (isObject(data.customBestTimes)) {
    for (const [key, value] of Object.entries(data.customBestTimes)) {
      const config = parseCustomKey(key);
      const time = sanitizeTime(value);
      // Skip keys that are not valid boards or that duplicate a preset.
      if (config && time && !presetFor(config)) records.customBestTimes[customKey(config)] = time;
    }
  }
  if (isObject(data.stats)) {
    for (const c of STATS_CATEGORIES) records.stats[c] = sanitizeStats(data.stats[c]);
  }
  records.currentStreak = asCount(data.currentStreak);
  records.bestStreak = Math.max(asCount(data.bestStreak), records.currentStreak);
  return records;
}

/**
 * Upgrades older stored shapes to the current version. Version 1 is the
 * first schema, so there is nothing to convert yet. This is where a future
 * version would rename or reshape fields before sanitizing.
 */
function migrateRecords(raw: Record<string, unknown>): Record<string, unknown> {
  return raw;
}

export function loadRecords(store: KeyValueStore): Records {
  return sanitizeRecords(readJson(store, RECORDS_KEY));
}

export function saveRecords(store: KeyValueStore, records: Records): boolean {
  return writeJson(store, RECORDS_KEY, { version: RECORDS_VERSION, ...records });
}

export interface GameResult {
  config: BoardConfig;
  won: boolean;
  /** Completion time, only meaningful for wins. */
  ms: number;
  date: Date;
  name: string;
}

export interface RecordOutcome {
  records: Records;
  newBest: boolean;
  slot: RecordSlot;
}

export function bestTimeFor(records: Records, slot: RecordSlot): TimeRecord | null {
  return slot.kind === 'preset' ? records.bestTimes[slot.difficulty] : (records.customBestTimes[slot.key] ?? null);
}

/** Adds one completed game. Returns new records; the input is not changed. */
export function recordGame(records: Records, result: GameResult): RecordOutcome {
  const slot = slotFor(result.config);
  const category: StatsCategory = slot.kind === 'preset' ? slot.difficulty : 'custom';
  const prev = records.stats[category];
  const stats = {
    ...records.stats,
    [category]: { played: prev.played + 1, won: prev.won + (result.won ? 1 : 0) },
  };
  const currentStreak = result.won ? records.currentStreak + 1 : 0;
  const bestStreak = Math.max(records.bestStreak, currentStreak);
  let next: Records = { ...records, stats, currentStreak, bestStreak };

  let newBest = false;
  if (result.won) {
    const existing = bestTimeFor(records, slot);
    if (!existing || result.ms < existing.ms) {
      newBest = true;
      const time: TimeRecord = {
        ms: result.ms,
        seconds: displaySeconds(result.ms),
        name: result.name,
        date: result.date.toISOString(),
      };
      next = withBestTime(next, slot, time);
    }
  }
  return { records: next, newBest, slot };
}

function withBestTime(records: Records, slot: RecordSlot, time: TimeRecord): Records {
  if (slot.kind === 'preset') {
    return { ...records, bestTimes: { ...records.bestTimes, [slot.difficulty]: time } };
  }
  return { ...records, customBestTimes: { ...records.customBestTimes, [slot.key]: time } };
}

/** Changes the name on an existing best time (after the "fastest time" prompt). */
export function renameBestTime(records: Records, slot: RecordSlot, name: string): Records {
  const existing = bestTimeFor(records, slot);
  if (!existing) return records;
  const clean = name.trim().slice(0, 32) || 'Anonymous';
  return withBestTime(records, slot, { ...existing, name: clean });
}

/** Clears games played/won and streaks. Best times are kept. */
export function resetStatistics(records: Records): Records {
  const empty = emptyRecords();
  return { ...records, stats: empty.stats, currentStreak: 0, bestStreak: 0 };
}

/** Clears every best time. Statistics are kept. */
export function clearBestTimes(records: Records): Records {
  return { ...records, bestTimes: emptyRecords().bestTimes, customBestTimes: {} };
}

export interface Totals {
  played: number;
  won: number;
  lost: number;
  /** Whole-number percentage, 0 when nothing has been played. */
  winPercent: number;
}

export function totalsFor(stats: CategoryStats): Totals {
  const lost = stats.played - stats.won;
  const winPercent = stats.played === 0 ? 0 : Math.round((stats.won / stats.played) * 100);
  return { played: stats.played, won: stats.won, lost, winPercent };
}

export function overallTotals(records: Records): Totals {
  const sum = STATS_CATEGORIES.reduce(
    (acc, c) => ({ played: acc.played + records.stats[c].played, won: acc.won + records.stats[c].won }),
    { played: 0, won: 0 },
  );
  return totalsFor(sum);
}

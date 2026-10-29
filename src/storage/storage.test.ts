import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRESETS, type BoardConfig } from '../engine';
import {
  RECORDS_KEY,
  clearBestTimes,
  emptyRecords,
  loadRecords,
  overallTotals,
  recordGame,
  renameBestTime,
  resetStatistics,
  sanitizeRecords,
  saveRecords,
  slotFor,
  type GameResult,
  type Records,
} from './records';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, saveSettings } from './settings';
import { createBrowserStore, createMemoryStore } from './storage';

const win = (config: BoardConfig = PRESETS.beginner, ms = 10_000, name = 'Ann'): GameResult => ({
  config,
  won: true,
  ms,
  date: new Date('2026-01-01T00:00:00Z'),
  name,
});
const loss = (config: BoardConfig = PRESETS.beginner): GameResult => ({ ...win(config), won: false });

function apply(records: Records, ...results: GameResult[]): Records {
  return results.reduce((r, res) => recordGame(r, res).records, records);
}

describe('recordGame', () => {
  it('counts each completed game exactly once', () => {
    const r = apply(emptyRecords(), win(), loss(), loss(PRESETS.expert));
    expect(r.stats.beginner).toEqual({ played: 2, won: 1 });
    expect(r.stats.expert).toEqual({ played: 1, won: 0 });
    expect(overallTotals(r)).toEqual({ played: 3, won: 1, lost: 2, winPercent: 33 });
  });

  it('reports 0% when nothing has been played', () => {
    expect(overallTotals(emptyRecords()).winPercent).toBe(0);
  });

  it('tracks current and best win streaks', () => {
    let r = apply(emptyRecords(), win(), win(), win());
    expect(r.currentStreak).toBe(3);
    expect(r.bestStreak).toBe(3);
    r = apply(r, loss(), win());
    expect(r.currentStreak).toBe(1);
    expect(r.bestStreak).toBe(3);
  });

  it('only wins set best times, and only faster ones replace them', () => {
    let out = recordGame(emptyRecords(), loss());
    expect(out.newBest).toBe(false);
    expect(out.records.bestTimes.beginner).toBeNull();

    out = recordGame(out.records, win(PRESETS.beginner, 20_000));
    expect(out.newBest).toBe(true);
    expect(out.records.bestTimes.beginner).toMatchObject({ ms: 20_000, seconds: 21, name: 'Ann' });

    out = recordGame(out.records, win(PRESETS.beginner, 25_000));
    expect(out.newBest).toBe(false);
    expect(out.records.bestTimes.beginner!.ms).toBe(20_000);

    out = recordGame(out.records, win(PRESETS.beginner, 20_000));
    expect(out.newBest).toBe(false); // a tie keeps the earlier record

    out = recordGame(out.records, win(PRESETS.beginner, 8_000, 'Bob'));
    expect(out.newBest).toBe(true);
    expect(out.records.bestTimes.beginner).toMatchObject({ ms: 8_000, name: 'Bob' });
  });

  it('keeps each difficulty separate', () => {
    const r = apply(emptyRecords(), win(PRESETS.beginner, 5000), win(PRESETS.intermediate, 50_000), win(PRESETS.expert, 150_000));
    expect(r.bestTimes.beginner!.ms).toBe(5000);
    expect(r.bestTimes.intermediate!.ms).toBe(50_000);
    expect(r.bestTimes.expert!.ms).toBe(150_000);
  });

  it('keeps each custom configuration separate', () => {
    const a = { width: 20, height: 10, mines: 30 };
    const b = { width: 10, height: 20, mines: 30 };
    const c = { width: 20, height: 10, mines: 31 };
    const r = apply(emptyRecords(), win(a, 30_000), win(b, 40_000), win(c, 50_000), win(a, 35_000));
    expect(r.customBestTimes['20x10x30'].ms).toBe(30_000);
    expect(r.customBestTimes['10x20x30'].ms).toBe(40_000);
    expect(r.customBestTimes['20x10x31'].ms).toBe(50_000);
    expect(r.bestTimes.beginner).toBeNull();
    expect(r.stats.custom).toEqual({ played: 4, won: 4 });
  });

  it('files a custom board that matches a preset under that preset', () => {
    expect(slotFor({ width: 9, height: 9, mines: 10 })).toEqual({ kind: 'preset', difficulty: 'beginner' });
    expect(slotFor({ width: 9, height: 9, mines: 11 })).toEqual({ kind: 'custom', key: '9x9x11' });
  });

  it('does not change the input records', () => {
    const r = emptyRecords();
    recordGame(r, win());
    expect(r).toEqual(emptyRecords());
  });
});

describe('record maintenance', () => {
  it('renames a best time', () => {
    const r = apply(emptyRecords(), win(PRESETS.expert, 99_000));
    const renamed = renameBestTime(r, { kind: 'preset', difficulty: 'expert' }, '  Zoe  ');
    expect(renamed.bestTimes.expert!.name).toBe('Zoe');
    expect(renameBestTime(r, { kind: 'preset', difficulty: 'expert' }, '').bestTimes.expert!.name).toBe('Anonymous');
  });

  it('reset statistics keeps best times', () => {
    const r = resetStatistics(apply(emptyRecords(), win(), win({ width: 5, height: 5, mines: 3 })));
    expect(overallTotals(r).played).toBe(0);
    expect(r.currentStreak).toBe(0);
    expect(r.bestStreak).toBe(0);
    expect(r.bestTimes.beginner).not.toBeNull();
    expect(Object.keys(r.customBestTimes)).toHaveLength(1);
  });

  it('clearing best times keeps statistics', () => {
    const r = clearBestTimes(apply(emptyRecords(), win(), win({ width: 5, height: 5, mines: 3 })));
    expect(r.bestTimes.beginner).toBeNull();
    expect(r.customBestTimes).toEqual({});
    expect(overallTotals(r).played).toBe(2);
  });
});

describe('saving and loading', () => {
  it('round-trips records and settings', () => {
    const store = createMemoryStore();
    const r = apply(emptyRecords(), win(), loss(), win({ width: 12, height: 7, mines: 9 }, 7000));
    saveRecords(store, r);
    expect(loadRecords(store)).toEqual(r);
    expect(JSON.parse(store.get(RECORDS_KEY)!).version).toBe(1);

    const s = { ...DEFAULT_SETTINGS, difficulty: 'expert' as const, sound: true, zoom: 2 as const };
    saveSettings(store, s);
    expect(loadSettings(store)).toEqual(s);
  });

  it('gives defaults for first-time players', () => {
    const store = createMemoryStore();
    expect(loadRecords(store)).toEqual(emptyRecords());
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
  });

  it('survives malformed JSON', () => {
    const store = createMemoryStore();
    store.set(RECORDS_KEY, '{not json');
    store.set(SETTINGS_KEY, 'null');
    expect(loadRecords(store)).toEqual(emptyRecords());
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps the valid parts of damaged data and drops the rest', () => {
    const r = sanitizeRecords({
      version: 1,
      bestTimes: { beginner: { ms: 4000, name: 'Ann', date: '2026-01-01T00:00:00Z' }, intermediate: { ms: -5 }, expert: 'fast' },
      customBestTimes: {
        '20x10x30': { ms: 30_000, name: 'Cy' },
        '9x9x10': { ms: 1, name: 'cheat' }, // duplicates a preset
        '0x10x5': { ms: 1000 }, // invalid board
        banana: { ms: 1000 },
      },
      stats: { beginner: { played: 3, won: 9 }, expert: { played: -2, won: 'x' }, custom: [] },
      currentStreak: 4,
      bestStreak: 2,
    });
    expect(r.bestTimes.beginner).toMatchObject({ ms: 4000, seconds: 5, name: 'Ann' });
    expect(r.bestTimes.intermediate).toBeNull();
    expect(r.bestTimes.expert).toBeNull();
    expect(Object.keys(r.customBestTimes)).toEqual(['20x10x30']);
    expect(r.stats.beginner).toEqual({ played: 3, won: 3 }); // won can't exceed played
    expect(r.stats.expert).toEqual({ played: 0, won: 0 });
    expect(r.bestStreak).toBe(4);
  });

  it('repairs invalid settings field by field', () => {
    const store = createMemoryStore();
    store.set(
      SETTINGS_KEY,
      JSON.stringify({ difficulty: 'nightmare', custom: { width: 500, height: 2, mines: 1 }, sound: 'yes', zoom: 7, colorBlind: true }),
    );
    const s = loadSettings(store);
    expect(s.difficulty).toBe('beginner');
    expect(s.custom).toEqual(DEFAULT_SETTINGS.custom);
    expect(s.sound).toBe(false);
    expect(s.zoom).toBe('auto');
    expect(s.colorBlind).toBe(true);
  });
});

describe('browser storage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('uses localStorage when it works', () => {
    const store = createBrowserStore();
    expect(store.persistent).toBe(true);
    store.set('k', 'v');
    expect(localStorage.getItem('k')).toBe('v');
  });

  it('falls back to memory when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const store = createBrowserStore();
    expect(store.persistent).toBe(false);
    store.set('k', 'v');
    expect(store.get('k')).toBe('v');
    // Saving through the higher-level helpers must not throw either.
    expect(() => saveRecords(store, emptyRecords())).not.toThrow();
  });

  it('keeps working in memory when a write fails later (e.g. quota)', () => {
    const store = createBrowserStore();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(store.set('k', 'v')).toBe(false);
    expect(store.get('k')).toBe('v');
  });
});

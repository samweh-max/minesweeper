import { PRESET_ORDER, type PresetDifficulty } from '../engine';
import type { Records } from '../storage/records';
import { asString, isObject, readJson, writeJson, type KeyValueStore } from '../storage/storage';

export interface LeaderboardRow {
  rank: number;
  name: string;
  ms: number;
  /** This device's own entry. */
  isMe: boolean;
}

export type OnlineTimes = Partial<Record<PresetDifficulty, number>>;

export interface LeaderboardClient {
  fetchBoard(level: PresetDifficulty, playerId: string, limit?: number): Promise<LeaderboardRow[]>;
  submit(playerId: string, name: string, times: OnlineTimes): Promise<void>;
}

export const LEADERBOARD_SIZE = 10;
/** Longest name the leaderboard keeps. */
export const ONLINE_NAME_MAX = 20;

/** Talks to the two database functions over Supabase's REST API. No SDK needed. */
export function createSupabaseClient(
  url: string,
  key: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): LeaderboardClient | null {
  if (!url || !key) return null;
  const base = url.replace(/\/+$/, '') + '/rest/v1/rpc/';
  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: key };
  // Legacy anon keys are JWTs and go in Authorization too. Newer publishable keys don't.
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;

  async function call(fn: string, body: unknown): Promise<unknown> {
    const res = await fetchImpl(base + fn, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Leaderboard request failed (${res.status})`);
    const text = await res.text();
    return text ? (JSON.parse(text) as unknown) : null;
  }

  return {
    async fetchBoard(level, playerId, limit = LEADERBOARD_SIZE) {
      const data = await call('leaderboard', { p_level: level, p_player: playerId, p_limit: limit });
      if (!Array.isArray(data)) throw new Error('Unexpected leaderboard reply');
      return data.filter(isObject).map((r) => ({
        rank: Number(r.rank),
        name: String(r.name ?? ''),
        ms: Number(r.ms),
        isMe: r.is_me === true,
      }));
    },
    async submit(playerId, name, times) {
      await call('submit_scores', { p_player: playerId, p_name: name, p_times: times });
    },
  };
}

// ---- This device's identity and what it last sent ---------------------------

export const ONLINE_KEY = 'classic-minesweeper.online';
const ONLINE_VERSION = 1;

interface OnlineState {
  playerId: string;
  /** Exactly what the last successful send contained, to skip repeats. */
  lastSent: string;
}

function newId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function loadState(store: KeyValueStore): OnlineState {
  const raw = readJson(store, ONLINE_KEY);
  const data = isObject(raw) ? raw : {};
  const id = asString(data.playerId, '', 36);
  const state = { playerId: UUID.test(id) ? id : '', lastSent: asString(data.lastSent, '', 500) };
  if (!state.playerId) {
    state.playerId = newId();
    state.lastSent = '';
    saveState(store, state);
  }
  return state;
}

function saveState(store: KeyValueStore, state: OnlineState) {
  writeJson(store, ONLINE_KEY, { version: ONLINE_VERSION, ...state });
}

/** The random id that marks this device's entries. Made on first use. */
export function playerIdFor(store: KeyValueStore): string {
  return loadState(store).playerId;
}

export function cleanOnlineName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, ONLINE_NAME_MAX).trim();
}

/** A name the leaderboard will take. "Anonymous" is the default, so it doesn't count. */
export function canPostAs(name: string): boolean {
  const clean = cleanOnlineName(name);
  return clean !== '' && clean.toLowerCase() !== 'anonymous';
}

export function bestTimesToSend(records: Records): OnlineTimes {
  const times: OnlineTimes = {};
  for (const d of PRESET_ORDER) {
    const t = records.bestTimes[d];
    if (t) times[d] = Math.round(t.ms);
  }
  return times;
}

/**
 * Sends this device's best Beginner, Intermediate and Expert times under the
 * player's name. The server keeps only each player's fastest time, so sending
 * the same times again is harmless; it is skipped anyway when nothing changed.
 * Never throws. Returns false when a send failed (it is retried next time).
 */
export async function syncBestTimes(
  store: KeyValueStore,
  client: LeaderboardClient,
  name: string,
  records: Records,
): Promise<boolean> {
  if (!canPostAs(name)) return true;
  const times = bestTimesToSend(records);
  if (Object.keys(times).length === 0) return true;
  const clean = cleanOnlineName(name);
  const state = loadState(store);
  const signature = JSON.stringify([clean, times]);
  if (state.lastSent === signature) return true;
  try {
    await client.submit(state.playerId, clean, times);
    saveState(store, { ...loadState(store), lastSent: signature });
    return true;
  } catch {
    return false;
  }
}

/** Leaderboard times show hundredths, so close races are visible. */
export function formatOnlineTime(ms: number): string {
  return (Math.floor(ms / 10) / 100).toFixed(2);
}

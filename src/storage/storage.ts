/**
 * A tiny key/value store over localStorage that never throws. If storage is
 * unavailable (private mode, blocked cookies, quota errors) it falls back to
 * memory so the game keeps working for the current visit.
 */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): boolean;
  remove(key: string): void;
  /** False when values only live in memory for this visit. */
  readonly persistent: boolean;
}

export function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    persistent: false,
    get: (key) => map.get(key) ?? null,
    set: (key, value) => {
      map.set(key, value);
      return true;
    },
    remove: (key) => {
      map.delete(key);
    },
  };
}

function probe(storage: Storage): boolean {
  try {
    const key = '__minesweeper_probe__';
    storage.setItem(key, '1');
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function createBrowserStore(): KeyValueStore {
  let storage: Storage | null = null;
  try {
    if (typeof window !== 'undefined' && window.localStorage && probe(window.localStorage)) {
      storage = window.localStorage;
    }
  } catch {
    storage = null;
  }
  if (!storage) return createMemoryStore();

  const fallback = createMemoryStore();
  const local = storage;
  return {
    persistent: true,
    get(key) {
      try {
        return local.getItem(key) ?? fallback.get(key);
      } catch {
        return fallback.get(key);
      }
    },
    set(key, value) {
      fallback.set(key, value);
      try {
        local.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      fallback.remove(key);
      try {
        local.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

/** Parses JSON, returning `undefined` instead of throwing. */
export function readJson(store: KeyValueStore, key: string): unknown {
  const raw = store.get(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export function writeJson(store: KeyValueStore, key: string, value: unknown): boolean {
  try {
    return store.set(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

// Small validation helpers shared by the settings and records loaders.

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 1e9 ? value : 0;
}

export function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function asString(value: unknown, fallback: string, maxLength = 64): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : fallback;
}

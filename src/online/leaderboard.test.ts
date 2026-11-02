import { describe, expect, it, vi } from 'vitest';
import { emptyRecords, type Records } from '../storage/records';
import { createMemoryStore } from '../storage/storage';
import {
  ONLINE_KEY,
  canPostAs,
  cleanOnlineName,
  createSupabaseClient,
  formatOnlineTime,
  playerIdFor,
  syncBestTimes,
  type LeaderboardClient,
} from './leaderboard';

function withBeginner(ms: number): Records {
  const r = emptyRecords();
  r.bestTimes.beginner = { ms, seconds: Math.ceil(ms / 1000), name: 'x', date: '' };
  return r;
}

function fakeClient(fail = false) {
  const submit = vi.fn<LeaderboardClient['submit']>(async () => {
    if (fail) throw new Error('offline');
  });
  const client: LeaderboardClient = { fetchBoard: vi.fn(async () => []), submit };
  return { client, submit };
}

describe('player id', () => {
  it('is made once and kept', () => {
    const store = createMemoryStore();
    const id = playerIdFor(store);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(playerIdFor(store)).toBe(id);
  });

  it('replaces a broken stored id', () => {
    const store = createMemoryStore();
    store.set(ONLINE_KEY, JSON.stringify({ playerId: 'nope' }));
    expect(playerIdFor(store)).toMatch(/^[0-9a-f]{8}-/);
  });
});

describe('names', () => {
  it('tidies spaces and length', () => {
    expect(cleanOnlineName('  Sam   W  ')).toBe('Sam W');
    expect(cleanOnlineName('x'.repeat(30))).toHaveLength(20);
  });
  it('needs a real name', () => {
    expect(canPostAs('Anonymous')).toBe(false);
    expect(canPostAs('   ')).toBe(false);
    expect(canPostAs('Samer')).toBe(true);
  });
});

describe('syncBestTimes', () => {
  it('sends preset best times under the player name, once', async () => {
    const store = createMemoryStore();
    const { client, submit } = fakeClient();
    const records = withBeginner(12345.6);
    expect(await syncBestTimes(store, client, ' Samer ', records)).toBe(true);
    expect(submit).toHaveBeenCalledWith(playerIdFor(store), 'Samer', { beginner: 12346 });
    await syncBestTimes(store, client, 'Samer', records);
    expect(submit).toHaveBeenCalledTimes(1);
    // A new name or a new time sends again.
    await syncBestTimes(store, client, 'Sam', records);
    await syncBestTimes(store, client, 'Sam', withBeginner(9000));
    expect(submit).toHaveBeenCalledTimes(3);
  });

  it('sends nothing without a name or a time', async () => {
    const store = createMemoryStore();
    const { client, submit } = fakeClient();
    await syncBestTimes(store, client, 'Anonymous', withBeginner(5000));
    await syncBestTimes(store, client, 'Samer', emptyRecords());
    expect(submit).not.toHaveBeenCalled();
  });

  it('retries after a failed send', async () => {
    const store = createMemoryStore();
    const failing = fakeClient(true);
    expect(await syncBestTimes(store, failing.client, 'Samer', withBeginner(5000))).toBe(false);
    const working = fakeClient();
    await syncBestTimes(store, working.client, 'Samer', withBeginner(5000));
    expect(working.submit).toHaveBeenCalledTimes(1);
  });
});

describe('Supabase client', () => {
  it('is off without settings', () => {
    expect(createSupabaseClient('', '')).toBeNull();
  });

  it('calls the database functions', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify([{ rank: 1, name: 'Ali', ms: 3000, is_me: false }]), { status: 200 }),
    );
    const client = createSupabaseClient('https://abc.supabase.co/', 'eyJkey', fetchImpl as typeof fetch)!;
    const rows = await client.fetchBoard('expert', 'p1');
    expect(rows).toEqual([{ rank: 1, name: 'Ali', ms: 3000, isMe: false }]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://abc.supabase.co/rest/v1/rpc/leaderboard');
    expect(JSON.parse(init!.body as string)).toEqual({ p_level: 'expert', p_player: 'p1', p_limit: 10 });
    expect(init!.headers).toMatchObject({ apikey: 'eyJkey', Authorization: 'Bearer eyJkey' });
  });

  it('sends only the apikey header for publishable keys, and reports errors', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 400 }));
    const client = createSupabaseClient('https://abc.supabase.co', 'sb_publishable_x', fetchImpl as typeof fetch)!;
    await expect(client.submit('p1', 'Samer', { beginner: 5000 })).rejects.toThrow('400');
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).not.toHaveProperty('Authorization');
  });
});

it('formats times with hundredths', () => {
  expect(formatOnlineTime(12345)).toBe('12.34');
  expect(formatOnlineTime(999)).toBe('0.99');
});

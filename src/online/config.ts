/**
 * Where the shared leaderboard lives (a free Supabase project).
 * The anon key is meant to be public: the database only lets it call the
 * two leaderboard functions in supabase/leaderboard.sql.
 * Both can also be set at build time with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
 */
const env = import.meta.env as Record<string, string | undefined>;

export const SUPABASE_URL = env.VITE_SUPABASE_URL || 'https://gkzjmmuoojwbgxgxzgbd.supabase.co';
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_1_lzgJOe67tjhV4iS7ByTg_xhwduSxi';

import { useSyncExternalStore } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { TABLES, type Draft, type TableName, type Tables } from './types';
import { DEFAULT_ROUTINES } from './programme';
import { SEED } from './seed';

/*
  Offline-first store. Everything lives in memory + localStorage on the phone,
  and every change is queued in an outbox that is pushed to Supabase when signed in
  and online. So the gym's bad signal never loses a set.
*/

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined;
export const supabase: SupabaseClient | null = URL_ && KEY ? createClient(URL_, KEY) : null;

type Rows = { [T in TableName]: Record<string, Tables[T]> };
type Op = { table: TableName; id: string; kind: 'upsert' | 'delete'; seq: number };
export type SyncState = 'local' | 'syncing' | 'synced' | 'offline' | 'error';

interface State {
  data: Rows;
  outbox: Op[];
  draft: Draft | null;
  session: Session | null;
  sync: SyncState;
  syncError: string;
  seeded: number;
  prefs: { proteinTarget: number; waistUnit: 'cm' | 'in' };
}

const LS = 'fit.v1';
const SEED_VERSION = 1;
const empty = (): Rows => Object.fromEntries(TABLES.map(t => [t, {}])) as Rows;

function load(): State {
  let saved: Partial<State> = {};
  try { saved = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { /* ignore */ }
  return {
    data: { ...empty(), ...(saved.data || {}) },
    outbox: saved.outbox || [],
    draft: saved.draft || null,
    session: null,
    sync: 'local',
    syncError: '',
    seeded: saved.seeded || 0,
    prefs: { proteinTarget: 130, waistUnit: 'cm', ...(saved.prefs || {}) },
  };
}

let state = load();
const listeners = new Set<() => void>();
let persistTimer: ReturnType<typeof setTimeout> | undefined;

function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const { data, outbox, draft, seeded, prefs } = state;
    try { localStorage.setItem(LS, JSON.stringify({ data, outbox, draft, seeded, prefs })); } catch { /* storage full */ }
  }, 150);
}
function emit() { state = { ...state }; persist(); listeners.forEach(l => l()); }

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => sel(state));
}
export const getState = () => state;

/* ---------- mutations ---------- */
const now = () => new Date().toISOString();

let seq = Date.now();
function queue(table: TableName, id: string, kind: Op['kind']) {
  state.outbox = [...state.outbox.filter(o => !(o.table === table && o.id === id)), { table, id, kind, seq: seq++ }];
}

export function put<T extends TableName>(table: T, rows: Tables[T] | Tables[T][]) {
  const list = Array.isArray(rows) ? rows : [rows];
  const t = { ...state.data[table] } as Record<string, Tables[T]>;
  for (const r of list) {
    const row = { ...r, updated_at: now() } as Tables[T];
    t[(row as { id: string }).id] = row;
    queue(table, (row as { id: string }).id, 'upsert');
  }
  state.data = { ...state.data, [table]: t };
  emit(); scheduleFlush();
}

export function remove(table: TableName, ids: string | string[]) {
  const list = Array.isArray(ids) ? ids : [ids];
  const t = { ...state.data[table] } as Record<string, unknown>;
  for (const id of list) { delete t[id]; queue(table, id, 'delete'); }
  state.data = { ...state.data, [table]: t } as Rows;
  emit(); scheduleFlush();
}

export function setDraft(d: Draft | null) { state.draft = d ? { ...d } : null; emit(); }
export function setPrefs(p: Partial<State['prefs']>) { state.prefs = { ...state.prefs, ...p }; emit(); }

export const all = <T extends TableName>(table: T): Tables[T][] => Object.values(state.data[table]) as Tables[T][];

/* ---------- first-run seed: programme + Mon 23 / Wed 25 Nov workouts ---------- */
export function ensureSeed() {
  if (state.seeded >= SEED_VERSION) return;
  const has = (t: TableName, id: string) => !!state.data[t][id];
  put('routines', DEFAULT_ROUTINES.filter(r => !has('routines', r.id)));
  put('workouts', SEED.workouts.filter(w => !has('workouts', w.id)));
  put('set_logs', SEED.sets.filter(s => !has('set_logs', s.id)));
  state.seeded = SEED_VERSION; emit();
}

/* ---------- Supabase sync ---------- */
let flushing = false, flushTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleFlush() { clearTimeout(flushTimer); flushTimer = setTimeout(flush, 800); }

const strip = (row: object) => { const { user_id: _u, ...rest } = row as Record<string, unknown>; return rest; };

export async function flush() {
  if (!supabase || !state.session || flushing) return;
  if (!navigator.onLine) { state.sync = 'offline'; emit(); return; }
  if (!state.outbox.length) { if (state.sync !== 'synced') { state.sync = 'synced'; emit(); } return; }
  flushing = true; state.sync = 'syncing'; emit();
  try {
    for (const table of TABLES) {
      const ops = state.outbox.filter(o => o.table === table);
      if (!ops.length) continue;
      const ups = ops.filter(o => o.kind === 'upsert').map(o => state.data[table][o.id]).filter(Boolean).map(strip);
      const dels = ops.filter(o => o.kind === 'delete').map(o => o.id);
      for (let i = 0; i < ups.length; i += 200) {
        const { error } = await supabase.from(table).upsert(ups.slice(i, i + 200), { onConflict: 'user_id,id' });
        if (error) throw error;
      }
      if (dels.length) { const { error } = await supabase.from(table).delete().in('id', dels); if (error) throw error; }
      // drop only the ops we sent; anything re-queued meanwhile has a new seq
      const sent = new Set(ops.map(o => o.seq));
      state.outbox = state.outbox.filter(o => !sent.has(o.seq));
    }
    state.sync = 'synced'; state.syncError = '';
  } catch (e) {
    state.sync = navigator.onLine ? 'error' : 'offline';
    state.syncError = (e as { message?: string })?.message || String(e);
  } finally {
    flushing = false; emit();
    if (state.outbox.length && state.sync === 'synced') scheduleFlush();
  }
}

/** Download everything; local rows with unsent changes win. */
export async function pull() {
  if (!supabase || !state.session) return;
  state.sync = 'syncing'; emit();
  try {
    const next = { ...state.data };
    for (const table of TABLES) {
      const rows: Record<string, unknown>[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from(table).select('*').range(from, from + 999);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const pending = new Set(state.outbox.filter(o => o.table === table).map(o => o.id));
      const t: Record<string, unknown> = {};
      for (const r of rows) t[r.id as string] = strip(r);
      for (const id of pending) { const local = state.data[table][id]; if (local) t[id] = local; else delete t[id]; }
      (next as Record<string, unknown>)[table] = t;
    }
    state.data = next as Rows; state.sync = 'synced'; state.syncError = '';
  } catch (e) {
    state.sync = navigator.onLine ? 'error' : 'offline';
    state.syncError = (e as { message?: string })?.message || String(e);
  }
  emit();
  await flush();
}

export async function initSync() {
  ensureSeed();
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  state.session = data.session; emit();
  supabase.auth.onAuthStateChange((_ev, session) => {
    const was = state.session?.user.id;
    state.session = session; emit();
    if (session && session.user.id !== was) pull();
    if (!session) { state.sync = 'local'; emit(); }
  });
  if (state.session) await pull();
  window.addEventListener('online', () => flush());
  setInterval(() => { if (state.outbox.length) flush(); }, 30000);
}

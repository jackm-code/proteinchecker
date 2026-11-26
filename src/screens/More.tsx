import { useState } from 'react';
import { flush, pull, setPrefs, supabase, useStore } from '../lib/store';
import { download, exportJson, exportSetsCsv, exportTableCsv, importHevy, weeklySnapshot } from '../lib/io';
import { shiftDay, weekStart } from '../lib/dates';
import { toast } from '../ui/toast';
import { TABLES } from '../lib/types';

export default function More() {
  const session = useStore(s => s.session);
  const sync = useStore(s => s.sync);
  const syncError = useStore(s => s.syncError);
  const pending = useStore(s => s.outbox.length);
  const target = useStore(s => s.prefs.proteinTarget);
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [f, setF] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);

  const auth = async (e: React.FormEvent) => {
    e.preventDefault(); if (!supabase) return;
    setBusy(true);
    const { error, data } = mode === 'in'
      ? await supabase.auth.signInWithPassword(f)
      : await supabase.auth.signUp({ ...f, options: { emailRedirectTo: location.origin + location.pathname } });
    setBusy(false);
    if (error) return toast(error.message);
    if (mode === 'up' && !data.session) toast('Check your email to confirm, then sign in here.');
    else toast('Signed in. Syncing…');
    setF({ email: f.email, password: '' });
  };

  const status = !supabase ? 'Sync isn’t set up in this build, so data stays on this phone.'
    : !session ? 'Not signed in. Everything is saved on this phone and will upload when you sign in.'
    : sync === 'synced' ? 'Synced to your account.'
    : sync === 'syncing' ? 'Syncing…'
    : sync === 'offline' ? `Offline. ${pending} change${pending === 1 ? '' : 's'} saved on this phone, will upload when you’re back online.`
    : `Couldn’t sync (${syncError}). Your data is safe on this phone.`;

  const ws = weekStart(new Date());

  return (
    <div className="mx-auto max-w-[720px] px-[max(4vw,14px)] pt-5">
      <h1 className="text-[40px]">More</h1>

      <h2 className="h2">Account</h2>
      <p className={'rounded-xl px-3 py-2 ' + (sync === 'error' ? 'bg-red text-white' : 'bg-card')}>{status}</p>
      {supabase && !session && (
        <form className="card mt-3 grid gap-2" onSubmit={auth}>
          <label className="label grid gap-1">Email<input className="field" type="email" autoComplete="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
          <label className="label grid gap-1">Password<input className="field" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={8} required value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></label>
          <button className="btn" disabled={busy}>{mode === 'in' ? 'Sign in' : 'Create account'}</button>
          <button type="button" className="text-sm text-blue" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? 'First time? Create an account' : 'Have an account? Sign in'}</button>
        </form>
      )}
      {session && (
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="mut self-center">{session.user.email}</span>
          <button className="ghost" onClick={() => pull().then(flush)}>Sync now</button>
          <button className="ghost" onClick={() => supabase!.auth.signOut()}>Sign out</button>
        </div>
      )}

      <h2 className="h2">Settings</h2>
      <label className="card flex items-center justify-between gap-3">
        <span>Daily protein target (g)</span>
        <input className="numin w-24" inputMode="numeric" value={target} onChange={e => { const v = +e.target.value.replace(/\D/g, ''); if (v) setPrefs({ proteinTarget: Math.min(400, v) }); }} />
      </label>

      <h2 className="h2">Export</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <button className="ghost" onClick={exportSetsCsv}>All sets (CSV)</button>
        <button className="ghost" onClick={exportJson}>Everything (JSON)</button>
        <button className="ghost" onClick={() => download(`week-${ws}.json`, JSON.stringify(weeklySnapshot(ws), null, 2), 'application/json')}>This week’s snapshot</button>
        <button className="ghost" onClick={() => { const p = shiftDay(ws, -7); download(`week-${p}.json`, JSON.stringify(weeklySnapshot(p), null, 2), 'application/json'); }}>Last week’s snapshot</button>
      </div>
      <details className="mt-2"><summary className="mut cursor-pointer">Single tables (CSV)</summary>
        <div className="mt-2 flex flex-wrap gap-2">{TABLES.map(t => <button key={t} className="chip" onClick={() => exportTableCsv(t)}>{t}</button>)}</div>
      </details>
      <p className="mut mt-2">The weekly snapshot is the file Claude reads for your weekly review.</p>

      <h2 className="h2">Import from Hevy</h2>
      <p className="mut mb-2">In Hevy: Settings → Export & import data → Export workouts. Then choose the CSV here. Workouts already in the app are skipped.</p>
      <label className="ghost w-full cursor-pointer">Choose Hevy CSV
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={async e => {
          const file = e.target.files?.[0]; if (!file) return;
          try { const r = importHevy(await file.text()); toast(`Imported ${r.workouts} workouts, ${r.sets} sets${r.skipped ? ` (${r.skipped} rows skipped)` : ''}`); }
          catch (err) { toast((err as Error).message); }
          e.target.value = '';
        }} />
      </label>

      <h2 className="h2">Install on your phone</h2>
      <ul className="list-disc pl-5 text-sm">
        <li><b>iPhone:</b> open this page in Safari, tap Share, then “Add to Home Screen”.</li>
        <li><b>Android:</b> open in Chrome, tap ⋮, then “Install app”.</li>
      </ul>
      <p className="mut mt-2 mb-8">It then opens full screen like a normal app, and works with no signal in the gym.</p>
    </div>
  );
}

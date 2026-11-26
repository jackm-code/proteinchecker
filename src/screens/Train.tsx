import { useState } from 'react';
import { put, remove, useStore } from '../lib/store';
import { DEFAULT_ROUTINES, CARDIO_TYPES, exOf } from '../lib/programme';
import { cardioRow, nextRoutine, startWorkout } from '../lib/workout';
import { dur, fmtDay, fmtKg, fmtTime } from '../lib/dates';
import { totalKg } from '../lib/calc';
import { ConfirmButton } from '../ui/confirm';
import { toast } from '../ui/toast';
import type { Routine, SetLog } from '../lib/types';

const PLATE: Record<string, string> = { A: 'bg-red text-white', B: 'bg-blue text-white', C: 'bg-yel text-[#1a1400]' };

export function Plate({ k, size = 64 }: { k: string; size?: number }) {
  return <div className={'grid shrink-0 place-items-center rounded-full font-display font-bold ' + (PLATE[k] || 'bg-mut text-white')}
    style={{ width: size, height: size, fontSize: size * 0.47, boxShadow: 'inset 0 0 0 6px rgba(0,0,0,.18), inset 0 0 0 20px rgba(255,255,255,.08)' }}>{k}</div>;
}

export function useRoutines(): Routine[] {
  const r = useStore(s => s.data.routines);
  const list = Object.values(r);
  return (list.length ? list : DEFAULT_ROUTINES).sort((a, b) => a.key.localeCompare(b.key));
}

export default function Train({ onOpenWorkout }: { onOpenWorkout: () => void }) {
  const draft = useStore(s => s.draft);
  const workouts = useStore(s => s.data.workouts);
  const setLogs = useStore(s => s.data.set_logs);
  const cardio = useStore(s => s.data.cardio_logs);
  const routines = useRoutines();
  const [replacing, setReplacing] = useState<string | null>(null);
  const next = nextRoutine(routines);

  const lastDone = (key: string) => {
    const w = Object.values(workouts).filter(x => x.routine_key === key).sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
    return w ? fmtDay(w.started_at) : 'Not done yet';
  };
  const begin = (r: Routine | null) => {
    if (draft && replacing !== (r?.key || 'free')) { setReplacing(r?.key || 'free'); setTimeout(() => setReplacing(null), 3000); return; }
    setReplacing(null); startWorkout(r); onOpenWorkout();
  };
  const hist = Object.values(workouts).sort((a, b) => b.started_at.localeCompare(a.started_at));
  const setsBy = new Map<string, SetLog[]>();
  for (const s of Object.values(setLogs)) (setsBy.get(s.workout_id) || setsBy.set(s.workout_id, []).get(s.workout_id)!).push(s);

  return (
    <div className="mx-auto max-w-[720px] px-[max(4vw,14px)] pt-5">
      <h1 className="text-[40px]">Train</h1>
      <p className="mut">{next ? <>Next up: <b className="text-ink">{next.name}</b>. It’s the session you did least recently, so missed days don’t matter.</> : 'Pick a session.'}</p>

      {draft && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-done px-4 py-3.5">
          <div><b>{draft.name} in progress</b><div className="mut">Started {fmtTime(new Date(draft.started))}</div></div>
          <button className="btn" onClick={onOpenWorkout}>Resume</button>
        </div>
      )}

      <div className="mt-4 grid gap-3">
        {routines.map(r => (
          <div key={r.id} className={'card grid grid-cols-[64px_minmax(0,1fr)] items-start gap-3.5 ' + (next?.key === r.key && !draft ? 'ring-2 ring-blue' : '')}>
            <Plate k={r.key} />
            <div>
              <h3 className="text-[21px]">{r.name}</h3>
              <div className="mut">{r.sub} · last: {lastDone(r.key)}</div>
              <ul className="my-2 list-disc pl-5 text-sm text-mut">
                {r.exercises.map(e => <li key={e.exercise_id}>{exOf(e.exercise_id).name} · {e.sets}×{e.rep_min}–{e.rep_max}</li>)}
              </ul>
              <p className="mb-3 text-sm text-mut">Cardio after: {r.cardio}</p>
              <button className={draft ? 'ghost' : 'btn'} onClick={() => begin(r)}>
                {replacing === r.key ? 'Tap again to replace current workout' : 'Start ' + r.name}
              </button>
            </div>
          </div>
        ))}
      </div>
      <button className="ghost mt-3 w-full" onClick={() => begin(null)}>{replacing === 'free' ? 'Tap again to replace current workout' : 'Start an empty workout'}</button>

      <QuickCardio />

      <h2 className="h2">History</h2>
      {!hist.length && <p className="mut">Finished workouts will appear here.</p>}
      {hist.map(w => {
        const ss = (setsBy.get(w.id) || []).filter(s => !s.is_warmup);
        const vol = ss.reduce((a, s) => a + totalKg(s) * s.reps, 0);
        const byEx = new Map<string, typeof ss>();
        ss.sort((a, b) => a.completed_at.localeCompare(b.completed_at) || a.set_no - b.set_no)
          .forEach(s => (byEx.get(s.exercise_name) || byEx.set(s.exercise_name, []).get(s.exercise_name)!).push(s));
        const cs = Object.values(cardio).filter(c => c.workout_id === w.id);
        return (
          <details key={w.id} className="border-b border-line py-3">
            <summary className="flex cursor-pointer list-none flex-wrap justify-between gap-2.5">
              <span><b>{w.name}</b><br /><span className="mut">{fmtDay(w.started_at, { weekday: 'long', day: 'numeric', month: 'short' })}</span></span>
              <span className="mut text-right">{w.ended_at ? dur(+new Date(w.ended_at) - +new Date(w.started_at)) + ' · ' : ''}{ss.length} sets<br />{fmtKg(vol)} kg</span>
            </summary>
            {[...byEx.entries()].map(([n, xs]) => (
              <div key={n} className="my-2 text-sm text-mut"><b className="font-semibold text-ink">{n}</b><br />
                {xs.map(s => (s.bar_kg ? `${fmtKg(s.kg)}+${fmtKg(s.bar_kg)}bar` : s.kg ? fmtKg(s.kg) + 'kg' : 'BW') + ' × ' + s.reps).join(' · ')}</div>
            ))}
            {cs.map(c => <div key={c.id} className="my-2 text-sm text-mut"><b className="font-semibold text-ink">Cardio</b><br />{c.type} · {c.minutes} min{c.avg_hr ? ` · ${c.avg_hr} bpm` : ''}{c.rpe ? ` · RPE ${c.rpe}` : ''}{c.distance_km ? ` · ${c.distance_km} km` : ''}</div>)}
            {w.notes && <p className="mut my-2">{w.notes}</p>}
            <ConfirmButton confirmText="Tap again to delete" onConfirm={() => {
              remove('set_logs', (setsBy.get(w.id) || []).map(s => s.id)); remove('cardio_logs', cs.map(c => c.id)); remove('workouts', w.id); toast('Workout deleted');
            }}>Delete workout</ConfirmButton>
          </details>
        );
      })}
    </div>
  );
}

function QuickCardio() {
  const [open, setOpen] = useState(false);
  const [c, setC] = useState({ type: 'Walk', minutes: '', avg_hr: '', rpe: '', distance_km: '' });
  const cardio = useStore(s => s.data.cardio_logs);
  const recent = Object.values(cardio).filter(x => !x.workout_id).sort((a, b) => b.performed_at.localeCompare(a.performed_at)).slice(0, 5);
  return (
    <section className="card mt-5">
      <div className="flex items-center justify-between gap-3">
        <div><h3 className="text-[21px]">Non-gym day?</h3><p className="mut">Aim for 8–10k steps, plus an optional 30–40 min walk or easy ride.</p></div>
        <button className="ghost shrink-0" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Log cardio'}</button>
      </div>
      {open && (
        <form className="mt-3" onSubmit={e => {
          e.preventDefault(); if (!+c.minutes) return toast('Add the minutes first');
          put('cardio_logs', cardioRow(c, null, new Date().toISOString())); setC({ ...c, minutes: '', avg_hr: '', rpe: '', distance_km: '' }); setOpen(false); toast('Cardio saved');
        }}>
          <CardioFields c={c} set={setC} />
          <button className="btn mt-3 w-full">Save cardio</button>
        </form>
      )}
      {!!recent.length && <p className="mut mt-2">Recent: {recent.map(r => `${fmtDay(r.performed_at)} ${r.type} ${r.minutes} min`).join(' · ')}</p>}
    </section>
  );
}

export function CardioFields({ c, set }: { c: { type: string; minutes: string; avg_hr: string; rpe: string; distance_km: string }; set: (c: any) => void }) {
  const f = (k: string, label: string, mode: 'decimal' | 'numeric' = 'decimal') => (
    <label className="label grid gap-1">{label}
      <input className="numin" inputMode={mode} value={(c as any)[k]} onChange={e => set({ ...c, [k]: e.target.value.replace(',', '.').replace(/[^0-9.]/g, '') })} /></label>
  );
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      <label className="label col-span-2 grid gap-1 sm:col-span-1">Type
        <select className="field" value={c.type} onChange={e => set({ ...c, type: e.target.value })}>
          <option value="">Choose…</option>{CARDIO_TYPES.map(t => <option key={t}>{t}</option>)}
        </select></label>
      {f('minutes', 'Minutes')}{f('avg_hr', 'Avg HR', 'numeric')}{f('rpe', 'RPE (1–10)')}{f('distance_km', 'Distance km')}
    </div>
  );
}

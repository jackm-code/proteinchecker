import { useEffect, useRef, useState } from 'react';
import { getState, setDraft, useStore } from '../lib/store';
import { EXERCISES, REST_PRESETS, exOf, formUrl } from '../lib/programme';
import { draftExercise, finishWorkout, lastSession } from '../lib/workout';
import { fmtKg, mmss } from '../lib/dates';
import { ConfirmButton } from '../ui/confirm';
import { toast } from '../ui/toast';
import { CardioFields, useRoutines } from './Train';
import type { Draft, DraftSet } from '../lib/types';

/* ---------- rest timer (keeps time from timestamps, so it survives the phone locking) ---------- */
let ac: AudioContext | null = null;
function unlockAudio() {
  try { ac = ac || new (window.AudioContext || (window as any).webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch { /* no audio */ }
}
function beep() {
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* */ }
  if (!ac) return;
  [0, 0.25, 0.5].forEach(o => {
    const os = ac!.createOscillator(), g = ac!.createGain(); os.frequency.value = 880; os.connect(g); g.connect(ac!.destination);
    const t = ac!.currentTime + o; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); os.start(t); os.stop(t + 0.2);
  });
}
const mutate = (fn: (d: Draft) => void) => { const d = structuredClone(getState().draft!); fn(d); setDraft(d); };

function RestBar() {
  const rest = useStore(s => s.draft?.rest || null);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 250); return () => clearInterval(t); }, []);
  const left = rest ? (rest.end - Date.now()) / 1000 : 0;
  useEffect(() => {
    if (rest && left <= 0 && !rest.beeped) {
      beep(); mutate(d => { if (d.rest) d.rest.beeped = true; });
      const end = rest.end; setTimeout(() => { const r = getState().draft?.rest; if (r && r.end === end) mutate(d => { d.rest = null; }); }, 6000);
    }
  });
  const adj = (v: number) => mutate(d => { if (!d.rest) return; d.rest.end += v * 1000; d.rest.total = Math.max(d.rest.total, (d.rest.end - Date.now()) / 1000); d.rest.beeped = false; });
  return (
    <div role="timer" aria-live="polite" className={'fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-10 bg-red text-white transition-transform motion-reduce:transition-none ' + (rest ? '' : 'translate-y-[200%]')}>
      <div className="absolute left-0 top-0 h-1 bg-white/70" style={{ width: rest ? Math.max(0, Math.min(100, left / rest.total * 100)) + '%' : 0 }} />
      <div className="mx-auto flex max-w-[720px] items-center gap-2.5 px-[max(4vw,14px)] py-2.5">
        <div className="num min-w-24 text-[44px]">{rest ? (left > 0 ? mmss(left) : 'Go') : '0:00'}</div>
        <div className="flex-1 text-[13px] leading-tight">{rest ? (left > 0 ? 'Rest · ' + rest.label : 'Rest over · next set') : ''}</div>
        {([['-15', '−15'], ['15', '+15']] as const).map(([v, l]) => <button key={v} className="min-h-11 rounded-xl bg-white/20 px-3 font-semibold" onClick={() => adj(+v)}>{l}</button>)}
        <button className="min-h-11 rounded-xl bg-white/20 px-3 font-semibold" onClick={() => mutate(d => { d.rest = null; })}>Skip</button>
      </div>
    </div>
  );
}

function Elapsed({ since }: { since: number }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(t); }, []);
  return <span className="num block text-xl">{mmss((Date.now() - since) / 1000)}</span>;
}

const clean = (v: string) => v.replace(',', '.').replace(/[^0-9.]/g, '');

export default function WorkoutScreen({ onHome }: { onHome: () => void }) {
  const d = useStore(s => s.draft)!;
  const routines = useRoutines();
  const routine = routines.find(r => r.key === d.routine_key);
  const [newEx, setNewEx] = useState('');
  const top = useRef<HTMLDivElement>(null);

  const tick = (i: number, j: number, warm: boolean) => {
    unlockAudio();
    mutate(dd => {
      const e = dd.ex[i]; const s = (warm ? e.warmups : e.sets)[j];
      s.done = !s.done;
      if (!s.done) { s.doneAt = undefined; return; }
      s.doneAt = new Date().toISOString();
      if (s.reps === '') s.reps = String(e.rep_max || 10);
      if (s.kg === '') s.kg = '0';
      if (warm) { dd.rest = { end: Date.now() + 60000, total: 60, label: 'Ramp-up set', beeped: false }; return; }
      const last = j === e.sets.length - 1, nx = last ? dd.ex[i + 1] : null;
      const label = last ? (nx ? 'Next: ' + nx.name : 'Last set done') : `Next: set ${j + 2} of ${e.name}`;
      dd.rest = { end: Date.now() + e.rest_s * 1000, total: e.rest_s, label, beeped: false };
    });
  };
  const edit = (i: number, j: number, warm: boolean, f: 'kg' | 'reps', v: string) =>
    mutate(dd => { ((warm ? dd.ex[i].warmups : dd.ex[i].sets)[j])[f] = clean(v); });

  const finish = () => {
    const r = finishWorkout();
    toast(r.sets ? `Saved · ${r.sets} sets · ${fmtKg(r.vol)} kg lifted` : 'Nothing ticked, so nothing saved');
    onHome();
  };

  const row = (s: DraftSet, i: number, j: number, warm: boolean, prev: string) => (
    <div key={(warm ? 'w' : 's') + j} className={'grid grid-cols-[34px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_48px] items-center gap-2 rounded-xl px-1 py-1.5 max-[420px]:grid-cols-[30px_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_44px] max-[420px]:gap-1.5 ' + (s.done ? 'bg-done' : '')}>
      <span className={'text-center font-display text-lg font-bold ' + (warm ? 'text-mut' : '')}>{warm ? 'W' + (j + 1) : j + 1}</span>
      <span className="truncate text-[13px] text-mut">{prev}</span>
      <input className="numin" inputMode="decimal" aria-label={`${warm ? 'Ramp-up' : 'Set'} ${j + 1} kg`} placeholder="kg" value={s.kg} onChange={e => edit(i, j, warm, 'kg', e.target.value)} />
      <input className="numin" inputMode="numeric" aria-label={`${warm ? 'Ramp-up' : 'Set'} ${j + 1} reps`} placeholder={warm ? s.reps : `${d.ex[i].rep_min}–${d.ex[i].rep_max}`} value={s.reps} onChange={e => edit(i, j, warm, 'reps', e.target.value)} />
      <button className={'grid min-h-11 w-12 place-items-center rounded-xl max-[420px]:w-11 ' + (s.done ? 'bg-blue text-white' : 'bg-card')} onClick={() => tick(i, j, warm)} aria-label={`Complete ${warm ? 'ramp-up' : 'set'} ${j + 1}`} aria-pressed={s.done}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5l5 5L20 6.5" /></svg>
      </button>
    </div>
  );

  const checklist = (title: string, items: string[], done: boolean[], key: 'warmupDone' | 'cooldownDone', hint: string) => items.length ? (
    <details className="border-b border-line py-4" open={key === 'warmupDone' && !done.every(Boolean)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <h3 className="text-[21px] text-blue">{title}</h3><span className="mut">{done.filter(Boolean).length}/{items.length} · {hint}</span>
      </summary>
      <ul className="mt-2 grid gap-1">
        {items.map((t, k) => (
          <li key={k}><label className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="checkbox" className="size-5 accent-[var(--blue)]" checked={!!done[k]} onChange={() => mutate(dd => { dd[key][k] = !dd[key][k]; })} />
            <span className={done[k] ? 'text-mut line-through' : ''}>{t}</span></label></li>
        ))}
      </ul>
    </details>
  ) : null;

  return (
    <>
      <div ref={top} className="sticky top-0 z-10 flex items-center justify-between gap-2.5 border-b border-line bg-bg px-[max(4vw,14px)] py-2 pt-[max(8px,env(safe-area-inset-top))]">
        <button className="ghost" onClick={onHome}>Home</button>
        <div className="text-center"><b className="block text-[15px]">{d.name}</b><Elapsed since={d.started} /></div>
        <button className="btn" onClick={finish}>Finish</button>
      </div>
      <div className="mx-auto max-w-[720px] px-[max(4vw,14px)] pb-24">
        {routine && checklist('Warm-up', routine.warmup, d.warmupDone, 'warmupDone', 'about 8 min')}

        {d.ex.map((e, i) => {
          const last = lastSession(e.exercise_id);
          const prev = (j: number) => { const p = last?.sets[j]; return p ? (p.kg || p.bar_kg ? fmtKg(p.kg) + 'kg' : 'BW') + ' × ' + p.reps : 'Target ' + e.rep_min + '–' + e.rep_max; };
          const ex = exOf(e.exercise_id, e.name);
          return (
            <section key={i} className="border-b border-line py-5">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <h3 className="text-[21px] text-blue">{e.name}</h3>
                <button className="chip" aria-label="Change rest time" onClick={() => mutate(dd => { const r = dd.ex[i]; r.rest_s = REST_PRESETS[(REST_PRESETS.indexOf(r.rest_s) + 1) % REST_PRESETS.length] || 90; })}>Rest {mmss(e.rest_s)}</button>
              </div>
              {e.notes && <p className="mt-1.5 text-sm text-mut">{e.notes}</p>}
              {e.suggestion && <p className="mt-1.5 text-sm"><b>Suggested:</b> {e.suggestion}</p>}
              {ex.barKg ? <p className="mt-1.5 text-sm text-mut">Enter plates only. The {ex.barKg} kg bar is added to your totals.</p> : null}
              <a className="inline-block pt-2 text-sm font-medium text-blue underline-offset-4" href={formUrl(e.name)} target="_blank" rel="noopener">Watch proper form ↗</a>
              <div className="mt-3 mb-1 grid grid-cols-[34px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_48px] gap-2 px-1 text-xs text-mut max-[420px]:grid-cols-[30px_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_44px] max-[420px]:gap-1.5">
                <span>Set</span><span>Previous</span><span className="text-center">{ex.equipment === 'assisted' ? 'Assist kg' : 'kg'}</span><span className="text-center">Reps</span><span />
              </div>
              {e.warmups.map((s, j) => row(s, i, j, true, j === 0 ? 'Ramp-up ~50%' : 'Ramp-up ~75%'))}
              {e.sets.map((s, j) => row(s, i, j, false, prev(j)))}
              <div className="mt-2.5 flex gap-2">
                <button className="ghost flex-1" onClick={() => mutate(dd => { const l = dd.ex[i].sets.at(-1); dd.ex[i].sets.push({ kg: l?.kg || '', reps: '', done: false }); })}>+ Add set</button>
                <button className="ghost flex-1" onClick={() => mutate(dd => { if (dd.ex[i].sets.length > 1) dd.ex[i].sets.pop(); })}>Remove set</button>
              </div>
              <div className="mt-2 flex">
                <ConfirmButton className="ghost flex-1" confirmText="Tap again to remove exercise" onConfirm={() => mutate(dd => { dd.ex.splice(i, 1); })}>Remove exercise</ConfirmButton>
              </div>
            </section>
          );
        })}

        <form className="mt-5 flex gap-2" onSubmit={ev => {
          ev.preventDefault(); const n = newEx.trim(); if (!n) return;
          const known = EXERCISES.find(x => x.name.toLowerCase() === n.toLowerCase());
          mutate(dd => { dd.ex.push(draftExercise({ exercise_id: known?.id || n, sets: 3, rep_min: 10, rep_max: 12, rest_s: known?.compound ? 120 : 90 }, false, known ? undefined : n)); });
          setNewEx('');
        }}>
          <input className="field" list="exlist" placeholder="Add an exercise, e.g. Plank" aria-label="Exercise name" maxLength={60} value={newEx} onChange={e => setNewEx(e.target.value)} />
          <datalist id="exlist">{EXERCISES.map(x => <option key={x.id} value={x.name} />)}</datalist>
          <button className="btn">Add</button>
        </form>

        <section className="border-b border-line py-5">
          <h3 className="text-[21px] text-blue">Cardio</h3>
          <p className="mut mb-3">{routine ? 'Plan: ' + routine.cardio + '. Lift first, cardio after.' : 'Lift first, cardio after.'}</p>
          <CardioFields c={d.cardio} set={c => mutate(dd => { dd.cardio = c; })} />
        </section>

        {routine && checklist('Cool-down', routine.cooldown, d.cooldownDone, 'cooldownDone', 'about 5 min')}

        <div className="mt-6 flex gap-2">
          <ConfirmButton className="ghost flex-1" confirmText="Tap again to discard" onConfirm={() => { setDraft(null); onHome(); }}>Discard workout</ConfirmButton>
          <button className="btn flex-1" onClick={finish}>Finish workout</button>
        </div>
      </div>
      <RestBar />
    </>
  );
}

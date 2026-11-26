import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { bestE1rm, sessionsFor, weeklyReview } from '../lib/calc';
import { MUSCLE_LABEL, WEEKLY_TARGET, exOf } from '../lib/programme';
import { fmtDay, shiftDay, weekStart } from '../lib/dates';
import { useRoutines } from './Train';
import type { Muscle, SetLog, Workout } from '../lib/types';

export default function Progress() {
  const setsMap = useStore(s => s.data.set_logs);
  const workoutsMap = useStore(s => s.data.workouts);
  const reviewsMap = useStore(s => s.data.weekly_reviews);
  const bodyMap = useStore(s => s.data.body_metrics);
  const routines = useRoutines();
  const sets = useMemo(() => Object.values(setsMap), [setsMap]);
  const workouts = useMemo(() => Object.values(workoutsMap), [workoutsMap]);
  const thisWeek = weekStart(new Date());
  const [ws, setWs] = useState(thisWeek);
  const review = useMemo(() => weeklyReview(sets, workouts, routines, ws), [sets, workouts, routines, ws]);

  const exIds = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sets) if (!s.is_warmup && (s.kg > 0 || s.bar_kg > 0)) m.set(s.exercise_id, s.exercise_name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [sets]);
  const [exId, setExId] = useState<string>('');
  const chosen = exId || exIds[0]?.[0] || '';
  const sess = useMemo(() => chosen ? sessionsFor(chosen, sets, workouts) : [], [chosen, sets, workouts]);
  const weight = Object.values(bodyMap).filter(b => b.weight_kg).sort((a, b) => b.date.localeCompare(a.date))[0]?.weight_kg || null;
  const saved = Object.values(reviewsMap).sort((a, b) => b.week_start.localeCompare(a.week_start));

  const muscles = (Object.keys(MUSCLE_LABEL) as Muscle[]).filter(m => m !== 'other' || review.perMuscle.other);

  return (
    <div className="mx-auto max-w-[720px] px-[max(4vw,14px)] pt-5">
      <h1 className="text-[40px]">Progress</h1>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button className="ghost w-11 px-0" aria-label="Previous week" onClick={() => setWs(shiftDay(ws, -7))}>‹</button>
        <b>{ws === thisWeek ? 'This week' : 'Week of ' + fmtDay(ws, { day: 'numeric', month: 'short' })}</b>
        <button className="ghost w-11 px-0" aria-label="Next week" disabled={ws >= thisWeek} onClick={() => setWs(shiftDay(ws, 7))}>›</button>
      </div>

      <h2 className="h2">What improved</h2>
      {review.improved.length ? <ul className="grid gap-1.5">{review.improved.map(t => <li key={t} className="rounded-xl bg-done px-3 py-2">↑ {t}</li>)}</ul>
        : <p className="mut">Nothing beat a previous best this week yet. With only a couple of sessions logged, the next 2–3 sessions set your real baseline.</p>}

      <h2 className="h2">Weakest areas</h2>
      {ws === thisWeek && <p className="mut mb-2">The week isn’t over, so set counts will rise as you train. Check again on Sunday.</p>}
      {review.weakest.length ? (
        <div className="grid gap-2">
          {review.weakest.map(w => (
            <div key={w.muscle} className="card">
              <b>{MUSCLE_LABEL[w.muscle]}</b>
              <ul className="mt-1 list-disc pl-5 text-sm text-mut">{w.reasons.map(r => <li key={r}>{r}</li>)}</ul>
            </div>
          ))}
        </div>
      ) : <p className="mut">No weak spots flagged for this week.</p>}
      {review.deload && <p className="mt-3 rounded-xl bg-done px-3 py-2">{review.deload}</p>}

      <h2 className="h2">Sets per muscle</h2>
      <p className="mut mb-2">Completed working sets. Target {WEEKLY_TARGET.min}–{WEEKLY_TARGET.max} a week.</p>
      <div className="grid gap-1.5">
        {muscles.map(m => {
          const n = review.perMuscle[m], max = 20;
          return (
            <div key={m} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2rem] items-center gap-2 text-sm">
              <span className="truncate">{MUSCLE_LABEL[m]}</span>
              <div className="relative h-4 rounded bg-card">
                <div className="absolute inset-y-0 rounded bg-line/60" style={{ left: WEEKLY_TARGET.min / max * 100 + '%', right: 0 }} />
                <div className={'absolute inset-y-0 left-0 rounded ' + (n >= WEEKLY_TARGET.min ? 'bg-grn' : 'bg-blue')} style={{ width: Math.min(100, n / max * 100) + '%' }} />
              </div>
              <b className="num text-right text-lg">{n}</b>
            </div>
          );
        })}
      </div>
      <p className="mut mt-1">Shaded area = target zone.</p>

      <h2 className="h2">Estimated 1RM</h2>
      {exIds.length ? <>
        <select className="field" value={chosen} onChange={e => setExId(e.target.value)} aria-label="Exercise">
          {exIds.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <E1rmChart pts={sess.map(s => ({ d: s.workout.started_at, v: bestE1rm(s.sets) }))} />
        <p className="mut mt-1">Best set each session, using kg × (1 + reps ÷ 30), bar included.{exOf(chosen).equipment === 'dumbbell' ? ' Dumbbell weights are per hand.' : ''}</p>
      </> : <p className="mut">Log some weighted sets to see this.</p>}

      <h2 className="h2">Strength for your size</h2>
      {weight ? <Relative weight={weight} sets={sets} workouts={workouts} /> : <p className="mut">Add your bodyweight on the Body tab to unlock this.</p>}

      {!!saved.length && <>
        <h2 className="h2">Weekly reviews</h2>
        {saved.map(r => (
          <details key={r.id} className="border-b border-line py-3">
            <summary className="cursor-pointer list-none font-semibold">Week of {fmtDay(r.week_start, { day: 'numeric', month: 'short' })}</summary>
            <div className="mt-2 whitespace-pre-wrap text-sm">{r.summary_md}</div>
          </details>
        ))}
      </>}
    </div>
  );
}

function E1rmChart({ pts }: { pts: { d: string; v: number }[] }) {
  if (!pts.length) return null;
  const W = 420, H = 170, pl = 34, pb = 22, pt = 10;
  const vs = pts.map(p => p.v), min = Math.min(...vs) * 0.9, max = Math.max(...vs) * 1.05 || 1;
  const x = (i: number) => pts.length === 1 ? (W + pl) / 2 : pl + 8 + i * (W - pl - 16) / (pts.length - 1);
  const y = (v: number) => pt + (H - pt - pb) * (1 - (v - min) / (max - min || 1));
  return (
    <svg className="mt-3 w-full text-[10px]" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Estimated one-rep max per session">
      {[min, (min + max) / 2, max].map(v => <g key={v}><line x1={pl} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x="0" y={y(v) + 3} fill="var(--mut)">{v.toFixed(0)}</text></g>)}
      <polyline points={pts.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')} fill="none" stroke="var(--blue)" strokeWidth="2.5" strokeLinejoin="round" />
      {pts.map((p, i) => <g key={i}><circle cx={x(i)} cy={y(p.v)} r="4" fill="var(--blue)"><title>{fmtDay(p.d)}: {p.v.toFixed(1)} kg</title></circle>
        <text x={x(i)} y={H - 6} textAnchor="middle" fill="var(--mut)">{fmtDay(p.d, { day: 'numeric', month: 'short' })}</text></g>)}
    </svg>
  );
}

function Relative({ weight, sets, workouts }: { weight: number; sets: SetLog[]; workouts: Workout[] }) {
  const best = (id: string) => { const s = sessionsFor(id, sets, workouts); return s.length ? bestE1rm(s[s.length - 1].sets) : 0; };
  // for ratios, count both dumbbells so they compare fairly with bars and cables
  const both = (id: string) => best(id) * (exOf(id).equipment === 'dumbbell' ? 2 : 1);
  const lifts = ['barbell-squat', 'db-bench', 'incline-db-press', 'lat-pulldown', 'db-ohp', 'db-rdl', 'cs-incline-row'].map(id => ({ id, v: best(id) })).filter(l => l.v);
  const ratio = (a: string, b: string, label: string, good: string) => {
    const va = both(a), vb = both(b); if (!va || !vb) return null;
    return <li key={label}>{label}: <b>{(va / vb).toFixed(2)}</b> <span className="text-mut">({good})</span></li>;
  };
  return <>
    <ul className="grid gap-1 text-sm">
      {lifts.map(l => <li key={l.id}>{exOf(l.id).name}: <b>{(l.v / weight).toFixed(2)}×</b> bodyweight <span className="text-mut">(est. 1RM {l.v.toFixed(0)} kg{exOf(l.id).equipment === 'dumbbell' ? ', per dumbbell' : ''})</span></li>)}
    </ul>
    <ul className="mt-3 grid gap-1 text-sm">
      {ratio('cs-incline-row', 'db-bench', 'Row ÷ bench', 'aim for about 1.0; lower means pulling lags pushing')}
      {ratio('lat-pulldown', 'db-ohp', 'Pulldown ÷ overhead press', 'pulldown should be clearly heavier')}
    </ul>
    <p className="mut mt-1">Based on your latest bodyweight, {weight} kg.</p>
  </>;
}

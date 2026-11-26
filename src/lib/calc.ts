import { exerciseFor, exOf, MUSCLE_LABEL, WEEKLY_TARGET } from './programme';
import type { Exercise, Muscle, Routine, RoutineExercise, SetLog, Workout } from './types';
import { weekStart } from './dates';

/** Epley estimated 1RM. Uses total load (plates + bar). */
export function e1rm(totalKg: number, reps: number): number {
  if (!(totalKg > 0) || !(reps > 0)) return 0;
  return totalKg * (1 + reps / 30);
}
export const totalKg = (s: Pick<SetLog, 'kg' | 'bar_kg'>) => (+s.kg || 0) + (+s.bar_kg || 0);
export const round = (n: number, step: number) => step > 0 ? Math.round(n / step) * step : n;

export interface Session { workout: Workout; sets: SetLog[] }

/** Working sets for one exercise, grouped per workout, oldest first. */
export function sessionsFor(exerciseId: string, sets: SetLog[], workouts: Workout[]): Session[] {
  const byW = new Map<string, SetLog[]>();
  for (const s of sets) {
    if (s.exercise_id !== exerciseId || s.is_warmup) continue;
    (byW.get(s.workout_id) || byW.set(s.workout_id, []).get(s.workout_id)!).push(s);
  }
  const wById = new Map(workouts.map(w => [w.id, w]));
  return [...byW.entries()]
    .filter(([id]) => wById.has(id))
    .map(([id, ss]) => ({ workout: wById.get(id)!, sets: ss.sort((a, b) => a.set_no - b.set_no) }))
    .sort((a, b) => a.workout.started_at.localeCompare(b.workout.started_at));
}

export const bestE1rm = (ss: SetLog[]) => Math.max(0, ...ss.map(s => e1rm(totalKg(s), s.reps)));

/** Starting weight for today: double progression from last session's final set. */
export function suggestStart(ex: Exercise, re: Pick<RoutineExercise, 'rep_min' | 'rep_max'>, last: Session | undefined):
  { kg: number | null; reason: string } {
  if (!last || !last.sets.length) return { kg: null, reason: '' };
  if (ex.equipment === 'bodyweight') {
    const allTop = last.sets.every(s => s.reps >= re.rep_max);
    return { kg: 0, reason: allTop ? 'Hit the top of the range last time. Make it harder: slower reps, pause at the top.' : '' };
  }
  const first = last.sets[0], final = last.sets[last.sets.length - 1];
  const allTop = last.sets.every(s => s.reps >= re.rep_max);
  const dir = ex.equipment === 'assisted' ? -1 : 1;
  if (allTop) {
    const kg = Math.max(0, final.kg + dir * ex.increment);
    return { kg, reason: `All sets hit ${re.rep_max} last time, so ${dir > 0 ? 'add' : 'drop assistance by'} ${ex.increment} kg.` };
  }
  if (first.kg > 0 && dir * (first.kg - final.kg) / first.kg > 0.2) {
    return { kg: final.kg, reason: `Last time set 1 was too heavy (${first.kg} → ${final.kg} kg). Start at ${final.kg} kg.` };
  }
  return { kg: final.kg, reason: `Same as your last set. Aim for more reps in every set.` };
}

/** Ramp-up sets before the first compound lift: ~50% × 8 then ~75% × 4. Logged kg (excluding bar). */
export function rampUp(ex: Exercise, workKg: number): { kg: number; reps: number }[] {
  if (!ex.compound || ex.equipment === 'assisted' || ex.equipment === 'bodyweight') return [];
  const bar = ex.barKg || 0;
  const total = workKg + bar;
  if (total <= 0) return [];
  const step = ex.equipment === 'barbell' ? 2.5 : ex.equipment === 'dumbbell' ? 1 : ex.increment || 2.5;
  return [[0.5, 8], [0.75, 4]].map(([p, reps]) => ({ kg: Math.max(0, round(total * p - bar, step)), reps }));
}


/** Completed direct (primary) working sets per muscle, for sets in the given list. */
export function setsPerMuscle(sets: SetLog[]): Record<Muscle, number> {
  const out = Object.fromEntries(Object.keys(MUSCLE_LABEL).map(k => [k, 0])) as Record<Muscle, number>;
  for (const s of sets) if (!s.is_warmup) out[exOf(s.exercise_id, s.exercise_name).primary]++;
  return out;
}

export function setsInWeek(sets: SetLog[], workouts: Workout[], ws: string): SetLog[] {
  const ids = new Set(workouts.filter(w => weekStart(new Date(w.started_at)) === ws).map(w => w.id));
  return sets.filter(s => ids.has(s.workout_id));
}

export interface Signal { muscle: Muscle; exercise?: string; kind: 'stalled' | 'shortfall' | 'drop' | 'volume'; text: string; weight: number }
export interface Review {
  weekStart: string;
  perMuscle: Record<Muscle, number>;
  signals: Signal[];
  weakest: { muscle: Muscle; score: number; reasons: string[] }[];
  improved: string[];
  deload: string | null;
}

function routineTarget(routines: Routine[], exId: string) {
  for (const r of routines) { const re = r.exercises.find(e => e.exercise_id === exId); if (re) return re; }
  return null;
}

/** Weekly review: the five weakness signals from the spec, scored per muscle. */
export function weeklyReview(sets: SetLog[], workouts: Workout[], routines: Routine[], ws: string): Review {
  const weekSets = setsInWeek(sets, workouts, ws);
  const perMuscle = setsPerMuscle(weekSets);
  const signals: Signal[] = [];
  const improved: string[] = [];
  const upToWeek = workouts.filter(w => weekStart(new Date(w.started_at)) <= ws);

  const exIds = [...new Set(sets.filter(s => !s.is_warmup).map(s => s.exercise_id))];
  for (const id of exIds) {
    const sess = sessionsFor(id, sets, upToWeek);
    if (!sess.length) continue;
    const name = sess[sess.length - 1].sets[0].exercise_name;
    const ex = exOf(id, name);
    const m = ex.primary;
    const last = sess[sess.length - 1];
    const inWeek = weekStart(new Date(last.workout.started_at)) === ws;
    const rt = routineTarget(routines, id);

    // 1. stalled: no e1RM gain over the last 3 sessions
    if (sess.length >= 3 && ex.equipment !== 'bodyweight' && ex.equipment !== 'assisted') {
      const tail = sess.slice(-3).map(s => bestE1rm(s.sets));
      if (tail[2] <= tail[0] + 0.01) signals.push({ muscle: m, exercise: name, kind: 'stalled', weight: 1.5, text: `${name}: no estimated 1RM gain over 3 sessions` });
    }
    if (!inWeek) continue;
    // 2. rep shortfall
    if (rt) {
      const short = last.sets.filter(s => s.reps < rt.rep_min).length;
      if (short) signals.push({ muscle: m, exercise: name, kind: 'shortfall', weight: 0.5 * short, text: `${name}: ${short} set${short > 1 ? 's' : ''} below ${rt.rep_min} reps` });
    }
    // 3. big drop from set 1 to set 3
    if (last.sets.length >= 3) {
      const a = last.sets[0], c = last.sets[2];
      const kgDrop = a.kg > 0 ? (a.kg - c.kg) / a.kg : 0, repDrop = a.reps > 0 ? (a.reps - c.reps) / a.reps : 0;
      if (ex.equipment !== 'assisted' && (kgDrop > 0.2 || repDrop > 0.2))
        signals.push({ muscle: m, exercise: name, kind: 'drop', weight: 0.5, text: `${name}: dropped ${Math.round(Math.max(kgDrop, repDrop) * 100)}% from set 1 to 3 (start lighter or rest longer)` });
    }
    // what improved
    if (sess.length >= 2) {
      const prevBest = Math.max(...sess.slice(0, -1).map(s => bestE1rm(s.sets)));
      const now = bestE1rm(last.sets);
      if (now > prevBest + 0.01 && prevBest > 0) improved.push(`${name}: est. 1RM ${prevBest.toFixed(1)} → ${now.toFixed(1)} kg`);
      else if (ex.equipment === 'bodyweight') {
        const pr = Math.max(...sess.slice(0, -1).map(s => s.sets.reduce((a, b) => a + b.reps, 0)));
        const nr = last.sets.reduce((a, b) => a + b.reps, 0);
        if (nr > pr) improved.push(`${name}: ${pr} → ${nr} total reps`);
      }
    }
  }
  // 5. volume deficit (only muscles in the programme)
  const programmed = new Set<Muscle>(routines.flatMap(r => r.exercises.map(e => exerciseFor(e.exercise_id).primary)));
  for (const m of programmed) {
    const n = perMuscle[m];
    if (n < WEEKLY_TARGET.min) signals.push({ muscle: m, kind: 'volume', weight: (WEEKLY_TARGET.min - n) / 4, text: `${MUSCLE_LABEL[m]}: ${n} of ${WEEKLY_TARGET.min} weekly sets` });
  }

  const score = new Map<Muscle, { score: number; reasons: string[] }>();
  for (const s of signals) {
    const v = score.get(s.muscle) || { score: 0, reasons: [] };
    v.score += s.weight; v.reasons.push(s.text); score.set(s.muscle, v);
  }
  const weakest = [...score.entries()].map(([muscle, v]) => ({ muscle, ...v }))
    .sort((a, b) => b.score - a.score).slice(0, 3);

  // deload every 6–8 weeks of training
  const first = workouts.map(w => w.started_at).sort()[0];
  let deload: string | null = null;
  if (first) {
    const weeks = Math.floor((new Date(ws).getTime() - new Date(weekStart(new Date(first))).getTime()) / (7 * 864e5)) + 1;
    if (weeks >= 6) deload = `Week ${weeks} of training. Plan a deload week (about half the sets, same weights) between weeks 6 and 8.`;
  }
  return { weekStart: ws, perMuscle, signals, weakest, improved, deload };
}

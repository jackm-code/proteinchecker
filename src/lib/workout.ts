import { all, getState, put, setDraft } from './store';
import { exOf } from './programme';
import { rampUp, sessionsFor, suggestStart, totalKg } from './calc';
import { uid } from './dates';
import type { CardioLog, Draft, DraftExercise, Routine, RoutineExercise, SetLog } from './types';

export function lastSession(exId: string) {
  const s = sessionsFor(exId, all('set_logs'), all('workouts'));
  return s[s.length - 1];
}

export function draftExercise(re: RoutineExercise, withRamp: boolean, nameOverride?: string): DraftExercise {
  const ex = exOf(re.exercise_id, nameOverride);
  const last = lastSession(ex.id);
  const sug = suggestStart(ex, re, last);
  const kg = sug.kg != null ? String(sug.kg) : ex.equipment === 'bodyweight' ? '0' : '';
  const ramps = withRamp && sug.kg ? rampUp(ex, sug.kg) : [];
  return {
    exercise_id: ex.id, name: ex.name, rep_min: re.rep_min, rep_max: re.rep_max, rest_s: re.rest_s,
    notes: re.notes || '', suggestion: sug.reason,
    warmups: ramps.map(r => ({ kg: String(r.kg), reps: String(r.reps), done: false, warmup: true })),
    sets: Array.from({ length: re.sets }, () => ({ kg, reps: '', done: false })),
  };
}

export function startWorkout(r: Routine | null) {
  const exs = r?.exercises || [];
  const firstCompound = exs.findIndex(e => exOf(e.exercise_id).compound);
  const d: Draft = {
    id: uid(), routine_key: r?.key || null, name: r?.name || 'Workout', started: Date.now(), rest: null,
    warmupDone: (r?.warmup || []).map(() => false), cooldownDone: (r?.cooldown || []).map(() => false),
    cardio: { type: '', minutes: '', avg_hr: '', rpe: '', distance_km: '' },
    ex: exs.map((e, i) => draftExercise(e, i === firstCompound)),
  };
  setDraft(d);
}

/** Save ticked sets (and any cardio) as a finished workout. */
export function finishWorkout(): { sets: number; vol: number } {
  const d = getState().draft!;
  const now = new Date().toISOString();
  const logs: SetLog[] = [];
  for (const e of d.ex) {
    const ex = exOf(e.exercise_id, e.name);
    const bar = ex.barKg || 0;
    const push = (s: Draft['ex'][number]['sets'][number], no: number, warm: boolean) => logs.push({
      id: uid(), workout_id: d.id, exercise_id: ex.id, exercise_name: e.name, set_no: no,
      kg: +s.kg || 0, bar_kg: bar, reps: +s.reps || 0, rir: null, is_warmup: warm, completed_at: s.doneAt || now,
    });
    e.warmups.forEach((s, j) => s.done && push(s, j + 1, true));
    let n = 0; e.sets.forEach(s => s.done && push(s, ++n, false));
  }
  const working = logs.filter(l => !l.is_warmup);
  const c = d.cardio;
  const hasCardio = !!(+c.minutes);
  if (!working.length && !hasCardio) { setDraft(null); return { sets: 0, vol: 0 }; }
  put('workouts', { id: d.id, routine_key: d.routine_key, name: d.name, started_at: new Date(d.started).toISOString(), ended_at: now, notes: '' });
  if (logs.length) put('set_logs', logs);
  if (hasCardio) put('cardio_logs', cardioRow(c, d.id, now));
  setDraft(null);
  return { sets: working.length, vol: working.reduce((a, s) => a + totalKg(s) * s.reps, 0) };
}

export function cardioRow(c: Draft['cardio'], workoutId: string | null, at: string): CardioLog {
  return {
    id: uid(), workout_id: workoutId, performed_at: at, type: c.type || 'Other', minutes: +c.minutes || 0,
    avg_hr: c.avg_hr ? +c.avg_hr : null, rpe: c.rpe ? +c.rpe : null, distance_km: c.distance_km ? +c.distance_km : null,
  };
}

/** Which session to do next: the routine done least recently (copes with missed or swapped days). */
export function nextRoutine(routines: Routine[]): Routine | undefined {
  const last = new Map<string, string>();
  for (const w of all('workouts')) if (w.routine_key && (last.get(w.routine_key) || '') < w.started_at) last.set(w.routine_key, w.started_at);
  return [...routines].sort((a, b) => (last.get(a.key) || '').localeCompare(last.get(b.key) || '') || a.key.localeCompare(b.key))[0];
}

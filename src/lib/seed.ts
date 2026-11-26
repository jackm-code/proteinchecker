import type { SetLog, Workout } from './types';
import { exOf } from './programme';

/* Training so far (handover spec, section 2). Times are approximate; the dates are right. */
type S = [string, [number, number][]];

const MON: S[] = [
  ['incline-db-press', [[7.5, 12], [7.5, 12], [7.5, 12]]],
  // plates only, on a standard 20 kg bar (confirmed by Jack 26 Nov)
  ['barbell-squat', [[0, 10], [2.5, 8], [5, 4], [3.75, 8], [3.75, 8], [3.75, 8]]],
  ['cs-incline-row', [[7.5, 5], [10, 6], [10, 6], [10, 12], [7.5, 14]]],
  ['seated-leg-curl', [[50, 15], [50, 12], [42.5, 12]]],
  ['seated-incline-curl', [[7.5, 12], [7.5, 12], [7.5, 12]]],
  ['db-triceps-ext', [[7.5, 12], [7.5, 12], [7.5, 12]]],
];
const WED: S[] = [
  ['db-bench', [[10, 8], [10, 10], [10, 8]]],
  ['incline-db-press', [[10, 8], [10, 10], [10, 9]]],
  ['goblet-squat', [[10, 12], [10, 10], [10, 10]]],
  ['lat-pulldown', [[50.5, 8], [43.5, 8], [40, 10]]],
  ['cable-fly-low-high', [[6.25, 8], [3.25, 12], [3.25, 12]]],
  ['hanging-knee-raise', [[0, 12], [0, 12], [0, 12]]],
  // Cable crunch skipped (couldn't get the angle). Swapped for ab crunch machine from now on.
];

function build(id: string, key: string, name: string, start: string, mins: number, notes: string, ex: S[]) {
  const started = new Date(start);
  const w: Workout = { id, routine_key: key, name, started_at: started.toISOString(), ended_at: new Date(+started + mins * 60000).toISOString(), notes };
  const sets: SetLog[] = [];
  let t = +started;
  for (const [exId, rows] of ex) {
    const e = exOf(exId);
    rows.forEach(([kg, reps], i) => {
      t += 90000;
      sets.push({ id: `${id}-${exId}-${i + 1}`, workout_id: id, exercise_id: exId, exercise_name: e.name, set_no: i + 1, kg, bar_kg: e.barKg || 0, reps, rir: null, is_warmup: false, completed_at: new Date(t).toISOString() });
    });
  }
  return { w, sets };
}

const a = build('seed-2026-11-23', 'A', 'Full Body A', '2026-11-23T18:00:00Z', 60, 'Logged in Hevy. Rest was 45s on everything (too short).', MON);
const b = build('seed-2026-11-25', 'B', 'Full Body B', '2026-11-25T18:00:00Z', 42, 'Logged in Lift Log. Cable crunch skipped.', WED);

export const SEED = { workouts: [a.w, b.w], sets: [...a.sets, ...b.sets] };

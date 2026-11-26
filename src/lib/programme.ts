import type { Exercise, Muscle, Routine } from './types';

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest', back: 'Back / lats', quads: 'Quads', hams_glutes: 'Hamstrings / glutes',
  shoulders: 'Shoulders', abs: 'Abs', biceps: 'Biceps', triceps: 'Triceps', calves: 'Calves', other: 'Other',
};

const X = (
  id: string, name: string, primary: Muscle, secondary: Muscle[], equipment: Exercise['equipment'],
  compound: boolean, increment: number, barKg?: number,
): Exercise => ({ id, name, primary, secondary, equipment, compound, increment, barKg });

export const EXERCISES: Exercise[] = [
  X('incline-db-press', 'Incline Bench Press (Dumbbell)', 'chest', ['shoulders', 'triceps'], 'dumbbell', true, 2.5),
  X('barbell-squat', 'Squat (Barbell)', 'quads', ['hams_glutes'], 'barbell', true, 2.5, 20),
  X('cs-incline-row', 'Chest Supported Incline Row (Dumbbell)', 'back', ['biceps'], 'dumbbell', true, 2.5),
  X('seated-leg-curl', 'Seated Leg Curl (Machine)', 'hams_glutes', [], 'machine', false, 2.5),
  X('seated-incline-curl', 'Seated Incline Curl (Dumbbell)', 'biceps', [], 'dumbbell', false, 1),
  X('db-triceps-ext', 'Triceps Extension (Dumbbell)', 'triceps', [], 'dumbbell', false, 1),
  X('db-bench', 'Bench Press (Dumbbell)', 'chest', ['shoulders', 'triceps'], 'dumbbell', true, 2.5),
  X('goblet-squat', 'Goblet Squat', 'quads', ['hams_glutes'], 'dumbbell', true, 2.5),
  X('lat-pulldown', 'Lat Pulldown (Cable)', 'back', ['biceps'], 'cable', true, 2.5),
  X('cable-fly-low-high', 'Cable Fly (Low to High)', 'chest', [], 'cable', false, 1.25),
  X('ab-crunch-machine', 'Ab Crunch Machine', 'abs', [], 'machine', false, 2.5),
  X('cable-crunch', 'Cable Crunch (Kneeling)', 'abs', [], 'cable', false, 2.5),
  X('hanging-knee-raise', 'Hanging Knee Raise', 'abs', [], 'bodyweight', false, 0),
  X('db-rdl', 'Romanian Deadlift (Dumbbell)', 'hams_glutes', ['back'], 'dumbbell', true, 2.5),
  X('db-ohp', 'Seated Overhead Press (Dumbbell)', 'shoulders', ['triceps'], 'dumbbell', true, 2.5),
  X('hip-thrust', 'Hip Thrust (Barbell)', 'hams_glutes', ['quads'], 'barbell', true, 5, 20),
  X('assisted-pullup', 'Assisted Pull-up', 'back', ['biceps'], 'assisted', true, 5),
  X('cable-lateral-raise', 'Lateral Raise (Cable)', 'shoulders', [], 'cable', false, 1.25),
  X('reverse-pec-deck', 'Reverse Pec Deck', 'shoulders', ['back'], 'machine', false, 2.5),
  X('standing-calf-raise', 'Standing Calf Raise', 'calves', [], 'machine', false, 5),
];

const BY_ID = new Map(EXERCISES.map(e => [e.id, e]));
const BY_NAME = new Map(EXERCISES.map(e => [e.name.toLowerCase(), e]));

export const slug = (name: string) =>
  name.toLowerCase().replace(/[()]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Known exercise, or a plain custom one (counted as "other"). */
export function exerciseFor(idOrName: string): Exercise {
  return BY_ID.get(idOrName) || BY_NAME.get(idOrName.toLowerCase()) || {
    id: slug(idOrName), name: idOrName,
    primary: 'other', secondary: [], equipment: 'machine', compound: false, increment: 2.5,
  };
}

export const formUrl = (name: string) =>
  'https://www.youtube.com/results?search_query=' + encodeURIComponent(name.replace(/[()]/g, '') + ' proper form technique');

const R = (exercise_id: string, sets: number, rep_min: number, rep_max: number, rest_s: number, notes = '') =>
  ({ exercise_id, sets, rep_min, rep_max, rest_s, notes });

/** Programme v1, 26 Nov 2026. */
export const DEFAULT_ROUTINES: Routine[] = [
  {
    id: 'routine-A', key: 'A', name: 'Full Body A', sub: 'Monday · strength base', day_hint: 1,
    exercises: [
      R('incline-db-press', 3, 10, 12, 120),
      R('barbell-squat', 3, 8, 10, 180, 'Pause 2s at the bottom. Log plates only; the 20 kg bar is added for you.'),
      R('cs-incline-row', 3, 8, 12, 120),
      R('seated-leg-curl', 3, 12, 15, 90),
      R('seated-incline-curl', 3, 10, 12, 90),
      R('db-triceps-ext', 3, 10, 12, 90),
    ],
    warmup: ['3–5 min easy bike or rower', 'Hip openers and leg swings (10 each side)', 'Cat-cow ×8 and dead bugs ×8 each side', 'Ramp-up sets on your first lift (shown below)'],
    cooldown: ['2–3 min easy walk or bike', 'Hip flexor stretch 30s each side', 'Hamstring stretch 30s each side', 'Lat stretch 30s each side'],
    cardio: '10–15 min Zone 2 (bike or incline walk, can still talk)',
  },
  {
    id: 'routine-B', key: 'B', name: 'Full Body B', sub: 'Wednesday · chest & abs', day_hint: 3,
    exercises: [
      R('db-bench', 3, 8, 10, 150, 'Lower over 2–3s to a deep stretch'),
      R('incline-db-press', 3, 10, 12, 120),
      R('goblet-squat', 3, 10, 12, 120),
      R('lat-pulldown', 3, 10, 12, 105),
      R('cable-fly-low-high', 3, 12, 15, 90, 'Deep stretch at the bottom'),
      R('ab-crunch-machine', 3, 10, 15, 75, 'Replaces the kneeling cable crunch. Curl ribs toward hips. No machine? Do weighted crunches holding a plate or dumbbell.'),
      R('hanging-knee-raise', 3, 8, 12, 75, 'Tuck pelvis up at the top, no swinging. Next step: 1s pause at the top, then straight legs.'),
    ],
    warmup: ['3–5 min easy bike or rower', 'Arm circles ×10 each way', 'Band pull-aparts ×15', 'Cat-cow ×8 and dead bugs ×8 each side', 'Ramp-up sets on your first lift (shown below)'],
    cooldown: ['2–3 min easy walk or bike', 'Chest doorway stretch 30s each side', 'Lat stretch 30s each side', 'Hip flexor stretch 30s each side'],
    cardio: '10 min intervals on bike or rower: 8 × 30s hard / 60s easy',
  },
  {
    id: 'routine-C', key: 'C', name: 'Full Body C', sub: 'Friday · posterior chain & shoulders', day_hint: 5,
    exercises: [
      R('db-rdl', 3, 8, 10, 150),
      R('db-ohp', 3, 8, 10, 120),
      R('hip-thrust', 3, 10, 12, 120, 'Log plates only; the 20 kg bar is added for you.'),
      R('assisted-pullup', 3, 10, 12, 120, 'Log the assistance weight. Lower = stronger. Or single-arm lat pulldown.'),
      R('cable-lateral-raise', 3, 12, 15, 75),
      R('reverse-pec-deck', 3, 12, 15, 60, 'Or face pull'),
      R('standing-calf-raise', 3, 10, 15, 75, 'Pause 2s at the bottom'),
    ],
    warmup: ['3–5 min easy bike or rower', 'Hip openers and leg swings (10 each side)', 'Arm circles ×10 each way', 'Cat-cow ×8 and dead bugs ×8 each side', 'Ramp-up sets on your first lift (shown below)'],
    cooldown: ['2–3 min easy walk or bike', 'Hamstring stretch 30s each side', 'Hip flexor stretch 30s each side', 'Chest doorway stretch 30s each side'],
    cardio: '15–20 min Zone 2 (incline walk or cross-trainer)',
  },
];

export const CARDIO_TYPES = ['Bike', 'Rower', 'Incline walk', 'Cross-trainer', 'Walk', 'Run', 'Other'];
export const REST_PRESETS = [45, 60, 75, 90, 105, 120, 150, 180, 240];

/** Weekly direct-set target per muscle. */
export const WEEKLY_TARGET = { min: 10, max: 20, perSessionMax: 11 };

/** Look up by stored id, falling back to the stored name for custom exercises. */
export const exOf = (id: string, name?: string): Exercise => BY_ID.get(id) || exerciseFor(name || id);

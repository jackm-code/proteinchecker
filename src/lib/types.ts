export type Muscle =
  | 'chest' | 'back' | 'quads' | 'hams_glutes' | 'shoulders'
  | 'abs' | 'biceps' | 'triceps' | 'calves' | 'other';

export interface Exercise {
  id: string;
  name: string;
  primary: Muscle;
  secondary: Muscle[];
  equipment: 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'bodyweight' | 'assisted';
  compound: boolean;
  /** Bar weight added on top of logged plates (barbell lifts). */
  barKg?: number;
  /** Smallest sensible weight jump. */
  increment: number;
}

export interface RoutineExercise {
  exercise_id: string;
  sets: number;
  rep_min: number;
  rep_max: number;
  rest_s: number;
  notes?: string;
}

export interface Routine {
  id: string;
  key: string; // A, B, C
  name: string;
  sub: string;
  day_hint: number; // 1 = Mon
  exercises: RoutineExercise[];
  warmup: string[];
  cooldown: string[];
  cardio: string;
  updated_at?: string;
}

export interface Workout {
  id: string;
  routine_key: string | null;
  name: string;
  started_at: string;
  ended_at: string | null;
  notes: string;
  updated_at?: string;
}

export interface SetLog {
  id: string;
  workout_id: string;
  exercise_id: string;
  exercise_name: string;
  set_no: number;
  /** Load logged: plates (barbell), one dumbbell, stack, or assistance. */
  kg: number;
  /** Bar weight, stored separately so totals are right. */
  bar_kg: number;
  reps: number;
  rir: number | null;
  is_warmup: boolean;
  completed_at: string;
  updated_at?: string;
}

export interface CardioLog {
  id: string;
  workout_id: string | null;
  performed_at: string;
  type: string;
  minutes: number;
  avg_hr: number | null;
  rpe: number | null;
  distance_km: number | null;
  updated_at?: string;
}

export interface BodyMetric {
  id: string;
  date: string; // YYYY-MM-DD
  weight_kg: number | null;
  waist_cm: number | null;
  body_fat_pct: number | null;
  muscle_kg: number | null;
  source: 'manual' | 'inbody';
  notes: string;
  updated_at?: string;
}

export interface FoodEntry {
  id: string;
  eaten_at: string;
  day: string; // YYYY-MM-DD local
  meal_window: string;
  name: string;
  protein_g: number;
  kcal: number;
  source: 'quick' | 'manual' | 'recent';
  updated_at?: string;
}

export interface WeeklyReview {
  id: string;
  week_start: string;
  summary_md: string;
  weak_groups: string[];
  plan_json: unknown;
  updated_at?: string;
}

export interface Tables {
  routines: Routine;
  workouts: Workout;
  set_logs: SetLog;
  cardio_logs: CardioLog;
  body_metrics: BodyMetric;
  food_entries: FoodEntry;
  weekly_reviews: WeeklyReview;
}
export type TableName = keyof Tables;
export const TABLES: TableName[] = [
  'routines', 'workouts', 'set_logs', 'cardio_logs', 'body_metrics', 'food_entries', 'weekly_reviews',
];

/* ---------- in-progress workout (kept on the phone) ---------- */
export interface DraftSet { kg: string; reps: string; done: boolean; warmup?: boolean; doneAt?: string }
export interface DraftExercise {
  exercise_id: string;
  name: string;
  rep_min: number;
  rep_max: number;
  rest_s: number;
  notes: string;
  suggestion: string;
  warmups: DraftSet[];
  sets: DraftSet[];
}
export interface Draft {
  id: string;
  routine_key: string | null;
  name: string;
  started: number;
  rest: { end: number; total: number; label: string; beeped: boolean } | null;
  warmupDone: boolean[];
  cooldownDone: boolean[];
  cardio: { type: string; minutes: string; avg_hr: string; rpe: string; distance_km: string };
  ex: DraftExercise[];
}

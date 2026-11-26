import { TABLES, type SetLog, type Workout } from './types';
import { all, getState, put } from './store';
import { EXERCISES, slug } from './programme';
import { weeklyReview } from './calc';
import { dayKey, shiftDay, uid } from './dates';

export function download(name: string, text: string, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const cell = (v: unknown) => {
  const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export function toCsv(rows: object[]): string {
  if (!rows.length) return '';
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  return [cols.join(','), ...rows.map(r => cols.map(c => cell((r as Record<string, unknown>)[c])).join(','))].join('\n');
}

export function exportJson() {
  const data = Object.fromEntries(TABLES.map(t => [t, all(t)]));
  download(`fitness-export-${dayKey(new Date())}.json`, JSON.stringify({ exported_at: new Date().toISOString(), ...data }, null, 2), 'application/json');
}

/** One CSV of every set, joined with its workout. Easiest to open in a spreadsheet. */
export function exportSetsCsv() {
  const w = new Map(all('workouts').map(x => [x.id, x]));
  const rows = all('set_logs').map(s => ({
    date: w.get(s.workout_id)?.started_at.slice(0, 10), workout: w.get(s.workout_id)?.name,
    exercise: s.exercise_name, set_no: s.set_no, kg: s.kg, bar_kg: s.bar_kg, total_kg: s.kg + s.bar_kg,
    reps: s.reps, rir: s.rir, warmup: s.is_warmup,
  })).sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.exercise.localeCompare(b.exercise) || a.set_no - b.set_no);
  download(`fitness-sets-${dayKey(new Date())}.csv`, toCsv(rows), 'text/csv');
}
export function exportTableCsv(t: (typeof TABLES)[number]) {
  download(`fitness-${t}-${dayKey(new Date())}.csv`, toCsv(all(t) as object[]), 'text/csv');
}

/** The week's data in one JSON file, for Claude's weekly review. */
export function weeklySnapshot(ws: string) {
  const end = shiftDay(ws, 7);
  const inWeek = (iso: string) => iso.slice(0, 10) >= ws && iso.slice(0, 10) < end;
  const workouts = all('workouts').filter(w => inWeek(w.started_at));
  const ids = new Set(workouts.map(w => w.id));
  const s = getState();
  return {
    week_start: ws,
    workouts: workouts.map(w => ({ ...w, sets: all('set_logs').filter(x => x.workout_id === w.id).sort((a, b) => a.completed_at.localeCompare(b.completed_at)) })),
    cardio: all('cardio_logs').filter(c => inWeek(c.performed_at)),
    body: all('body_metrics').filter(b => b.date >= ws && b.date < end),
    nutrition_by_day: Object.entries(all('food_entries').filter(f => f.day >= ws && f.day < end).reduce((acc, f) => {
      const d = (acc[f.day] ||= { protein_g: 0, kcal: 0, items: 0 }); d.protein_g += f.protein_g; d.kcal += f.kcal; d.items++; return acc;
    }, {} as Record<string, { protein_g: number; kcal: number; items: number }>)).map(([day, v]) => ({ day, ...v })),
    protein_target: s.prefs.proteinTarget,
    routines: all('routines'),
    computed_review: weeklyReview(all('set_logs'), all('workouts'), all('routines'), ws),
    history_set_count: all('set_logs').filter(x => !ids.has(x.workout_id)).length,
  };
}

/* ---------- Hevy CSV import ---------- */
export function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); out.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); out.push(row); }
  return out.filter(r => r.some(x => x.trim()));
}

function hevyDate(s: string): Date | null {
  // e.g. "23 Nov 2026, 18:02" or ISO
  const iso = new Date(s); if (!isNaN(+iso)) return iso;
  const m = s.match(/(\d{1,2}) (\w{3}) (\d{4}),? (\d{1,2}):(\d{2})/);
  if (!m) return null;
  const mon = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].toLowerCase());
  return mon < 0 ? null : new Date(+m[3], mon, +m[1], +m[4], +m[5]);
}

export function importHevy(text: string): { workouts: number; sets: number; skipped: number } {
  const rows = parseCsv(text);
  const head = rows.shift()?.map(h => h.trim().toLowerCase()) || [];
  const col = (n: string) => head.indexOf(n);
  const need = ['title', 'start_time', 'exercise_title', 'set_index', 'weight_kg', 'reps'];
  if (need.some(n => col(n) < 0)) throw new Error('This doesn’t look like a Hevy workout export (missing ' + need.filter(n => col(n) < 0).join(', ') + ').');
  const existing = new Set(all('workouts').map(w => w.started_at.slice(0, 16)));
  const workouts = new Map<string, Workout>(); const sets: SetLog[] = []; let skipped = 0;
  const byName = new Map(EXERCISES.map(e => [e.name.toLowerCase(), e]));
  for (const r of rows) {
    const start = hevyDate(r[col('start_time')] || ''); if (!start) { skipped++; continue; }
    const startIso = start.toISOString();
    if (existing.has(startIso.slice(0, 16))) { skipped++; continue; }
    const wid = 'hevy-' + startIso;
    if (!workouts.has(wid)) {
      const end = col('end_time') >= 0 ? hevyDate(r[col('end_time')]) : null;
      workouts.set(wid, { id: wid, routine_key: null, name: r[col('title')] || 'Hevy workout', started_at: startIso, ended_at: end ? end.toISOString() : null, notes: 'Imported from Hevy' });
    }
    const title = r[col('exercise_title')] || 'Exercise';
    const ex = byName.get(title.toLowerCase());
    const exId = ex?.id || slug(title);
    const type = col('set_type') >= 0 ? r[col('set_type')] : 'normal';
    const no = (+r[col('set_index')] || 0) + 1;
    const reps = +r[col('reps')] || 0;
    if (!reps && col('duration_seconds') >= 0 && +r[col('duration_seconds')]) { skipped++; continue; }
    sets.push({ id: `${wid}-${exId}-${no}-${uid().slice(0, 6)}`, workout_id: wid, exercise_id: exId, exercise_name: ex?.name || title, set_no: no,
      // Jack logs barbell lifts as plates only, so add the bar as in the app
      kg: +r[col('weight_kg')] || 0, bar_kg: ex?.barKg || 0, reps, rir: null, is_warmup: type === 'warmup', completed_at: startIso });
  }
  put('workouts', [...workouts.values()]); put('set_logs', sets);
  return { workouts: workouts.size, sets: sets.length, skipped };
}

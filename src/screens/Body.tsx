import { useState } from 'react';
import { put, remove, setPrefs, useStore } from '../lib/store';
import { fmtDay, todayKey, uid } from '../lib/dates';
import { ConfirmButton } from '../ui/confirm';
import { toast } from '../ui/toast';
import type { BodyMetric } from '../lib/types';

const IN = 2.54;
const num = (v: string) => v.replace(',', '.').replace(/[^0-9.]/g, '');

export default function Body() {
  const metrics = useStore(s => s.data.body_metrics);
  const unit = useStore(s => s.prefs.waistUnit);
  const rows = Object.values(metrics).sort((a, b) => b.date.localeCompare(a.date));
  const isFriday = new Date().getDay() === 5;
  const doneToday = rows.some(r => r.date === todayKey() && r.source === 'inbody');
  const [f, setF] = useState({ date: todayKey(), weight: '', waist: '', fat: '', muscle: '', inbody: isFriday, notes: '' });

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.weight && !f.waist && !f.fat && !f.muscle) return toast('Enter at least one measurement');
    const waist = f.waist ? (unit === 'in' ? +f.waist * IN : +f.waist) : null;
    const row: BodyMetric = {
      id: uid(), date: f.date, weight_kg: f.weight ? +f.weight : null, waist_cm: waist ? Math.round(waist * 10) / 10 : null,
      body_fat_pct: f.fat ? +f.fat : null, muscle_kg: f.muscle ? +f.muscle : null, source: f.inbody ? 'inbody' : 'manual', notes: f.notes.trim(),
    };
    put('body_metrics', row);
    setF({ ...f, weight: '', waist: '', fat: '', muscle: '', notes: '' });
    toast('Saved');
  };
  const showWaist = (cm: number) => unit === 'in' ? (cm / IN).toFixed(1) + ' in' : cm.toFixed(1) + ' cm';

  const series = (k: 'weight_kg' | 'waist_cm' | 'body_fat_pct') => rows.filter(r => r[k] != null).map(r => ({ d: r.date, v: r[k] as number })).reverse();
  const change = (k: 'weight_kg' | 'waist_cm' | 'body_fat_pct') => { const s = series(k); return s.length > 1 ? s[s.length - 1].v - s[0].v : null; };

  return (
    <div className="mx-auto max-w-[720px] px-[max(4vw,14px)] pt-5">
      <h1 className="text-[40px]">Body</h1>
      <p className="mut">Weigh in and add your InBody scan every Friday. Bodyweight powers the strength-for-your-size checks.</p>

      {isFriday && !doneToday && <div className="mt-4 rounded-2xl bg-done px-4 py-3.5"><b>It’s Friday.</b> Add today’s InBody results below.</div>}

      <form className="card mt-4 grid gap-2" onSubmit={save}>
        <div className="grid grid-cols-2 gap-2">
          <label className="label grid gap-1">Date<input className="field" type="date" max={todayKey()} value={f.date} onChange={e => setF({ ...f, date: e.target.value || todayKey() })} /></label>
          <label className="label flex items-end gap-2 pb-2.5"><input type="checkbox" className="size-5 accent-[var(--blue)]" checked={f.inbody} onChange={e => setF({ ...f, inbody: e.target.checked })} /><span className="text-base text-ink">InBody scan</span></label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="label grid gap-1">Weight (kg)<input className="numin" inputMode="decimal" value={f.weight} onChange={e => setF({ ...f, weight: num(e.target.value) })} /></label>
          <label className="label grid gap-1">
            <span className="flex justify-between">Waist ({unit})
              <button type="button" className="text-blue" onClick={() => setPrefs({ waistUnit: unit === 'cm' ? 'in' : 'cm' })}>Use {unit === 'cm' ? 'inches' : 'cm'}</button></span>
            <input className="numin" inputMode="decimal" value={f.waist} onChange={e => setF({ ...f, waist: num(e.target.value) })} /></label>
          <label className="label grid gap-1">Body fat (%)<input className="numin" inputMode="decimal" value={f.fat} onChange={e => setF({ ...f, fat: num(e.target.value) })} /></label>
          <label className="label grid gap-1">Skeletal muscle (kg)<input className="numin" inputMode="decimal" value={f.muscle} onChange={e => setF({ ...f, muscle: num(e.target.value) })} /></label>
        </div>
        <label className="label grid gap-1">Notes<input className="field" maxLength={200} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></label>
        <button className="btn">Save</button>
        <p className="mut">Measure waist at belly-button height, first thing in the morning. It changes before the mirror does.</p>
      </form>

      {!!rows.length && <>
        <h2 className="h2">Trend</h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          {([['weight_kg', 'Weight', (v: number) => v.toFixed(1) + ' kg'], ['waist_cm', 'Waist', showWaist], ['body_fat_pct', 'Body fat', (v: number) => v.toFixed(1) + '%']] as const).map(([k, l, fmt]) => {
            const s = series(k), c = change(k);
            return <div key={k} className="card p-3">
              <small className="text-xs text-mut">{l}</small>
              <b className="num block text-2xl">{s.length ? fmt(s[s.length - 1].v) : '–'}</b>
              {c != null && <small className={'text-xs ' + (c <= 0 ? 'text-grn' : 'text-warn')}>{c > 0 ? '+' : ''}{k === 'waist_cm' && unit === 'in' ? (c / IN).toFixed(1) : c.toFixed(1)} since {fmtDay(s[0].d, { day: 'numeric', month: 'short' })}</small>}
              <Spark pts={s.map(p => p.v)} />
            </div>;
          })}
        </div>

        <h2 className="h2">Entries</h2>
        {rows.map(r => (
          <div key={r.id} className="flex items-center justify-between gap-3 border-b border-line py-2.5">
            <div><b>{fmtDay(r.date)}</b>{r.source === 'inbody' && <span className="ml-2 rounded-full bg-blue px-2 py-0.5 text-xs font-semibold text-white">InBody</span>}
              <div className="mut">{[r.weight_kg != null && r.weight_kg + ' kg', r.waist_cm != null && 'waist ' + showWaist(r.waist_cm), r.body_fat_pct != null && r.body_fat_pct + '% fat', r.muscle_kg != null && r.muscle_kg + ' kg muscle'].filter(Boolean).join(' · ')}{r.notes ? ' · ' + r.notes : ''}</div></div>
            <ConfirmButton confirmText="Delete?" onConfirm={() => remove('body_metrics', r.id)}>✕</ConfirmButton>
          </div>
        ))}
      </>}
    </div>
  );
}

function Spark({ pts }: { pts: number[] }) {
  if (pts.length < 2) return null;
  const min = Math.min(...pts), max = Math.max(...pts), r = max - min || 1;
  const d = pts.map((v, i) => `${(i / (pts.length - 1)) * 100},${28 - ((v - min) / r) * 24}`).join(' ');
  return <svg viewBox="0 0 100 30" className="mt-1 h-7 w-full" preserveAspectRatio="none" aria-hidden="true"><polyline points={d} fill="none" stroke="var(--blue)" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>;
}

import { useEffect, useState } from 'react';
import { put, remove, useStore } from '../lib/store';
import { dayKey, fmtDay, fmtTime, parseDay, shiftDay, todayKey, uid } from '../lib/dates';
import { toast } from '../ui/toast';
import type { FoodEntry } from '../lib/types';
import { estimateFood, shrink, type Estimate } from '../lib/estimate';

/* Ported from the Protein Tracker: target split across four eating windows. */
const WINDOWS = [
  { id: 'breakfast', label: 'Breakfast', share: 35 / 130, from: 0, to: 11, tip: 'Appetite is normal. Eggs plus Greek yoghurt or skyr.' },
  { id: 'midday', label: 'Midday', share: 30 / 130, from: 11, to: 16, tip: 'Low appetite. Drink it: a ready-made protein shake.' },
  { id: 'dinner', label: 'Dinner', share: 40 / 130, from: 16, to: 20, tip: 'A palm-and-a-half of chicken, mince or fish.' },
  { id: 'evening', label: 'Evening', share: 25 / 130, from: 20, to: 24, tip: 'Appetite is back. Skyr, cottage cheese or a shake.' },
];
const QUICK = [
  { name: 'Protein shake (ready-made)', protein: 30, kcal: 180 },
  { name: 'Skyr pot (150 g)', protein: 16, kcal: 95 },
  { name: 'Greek yoghurt 0% (170 g)', protein: 17, kcal: 100 },
  { name: '2 eggs', protein: 13, kcal: 150 },
  { name: 'Chicken breast (150 g)', protein: 45, kcal: 240 },
  { name: 'Tin of tuna', protein: 25, kcal: 110 },
  { name: 'Cottage cheese (150 g)', protein: 16, kcal: 120 },
  { name: 'Protein bar', protein: 20, kcal: 200 },
];
const windowAt = (h: number) => (WINDOWS.find(w => h >= w.from && h < w.to) || WINDOWS[3]).id;
const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (d: Date) => `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function totals(entries: FoodEntry[]) {
  const byWin: Record<string, number> = Object.fromEntries(WINDOWS.map(w => [w.id, 0]));
  let protein = 0, kcal = 0;
  for (const e of entries) { byWin[e.meal_window] = (byWin[e.meal_window] || 0) + e.protein_g; protein += e.protein_g; kcal += e.kcal; }
  return { byWin, protein, kcal };
}

export default function Food() {
  const food = useStore(s => s.data.food_entries);
  const target = useStore(s => s.prefs.proteinTarget);
  const [view, setView] = useState(todayKey());
  const [, setNow] = useState(0);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  const all = Object.values(food);
  const byDay = new Map<string, FoodEntry[]>();
  for (const e of all) (byDay.get(e.day) || byDay.set(e.day, []).get(e.day)!).push(e);
  const day = (byDay.get(view) || []).slice().sort((a, b) => a.eaten_at.localeCompare(b.eaten_at));
  const t = totals(day);
  const isToday = view === todayKey();
  const winTarget = (w: (typeof WINDOWS)[number]) => Math.round(target * w.share);

  const add = (e: { name: string; protein: number; kcal: number; source: FoodEntry['source']; when?: Date; window?: string }) => {
    let when = e.when;
    if (!when) { const now = new Date(); when = isToday ? now : parseDay(view); if (!isToday) when.setHours(now.getHours(), now.getMinutes()); }
    const k = dayKey(when);
    put('food_entries', { id: uid(), eaten_at: when.toISOString(), day: k, meal_window: e.window || windowAt(when.getHours()), name: e.name.slice(0, 80), protein_g: Math.round(e.protein), kcal: Math.round(e.kcal), source: e.source });
    if (k !== view) setView(k);
    toast(`Added ${Math.round(e.protein)} g · ${e.name}`);
  };

  // nudge
  const left = Math.max(0, target - Math.round(t.protein));
  let nudge = '';
  if (!isToday) nudge = t.protein >= target * 0.9 ? 'Target hit on this day.' : `Finished ${Math.round(t.protein)} g, ${left} g short of target.`;
  else if (!left) nudge = 'Target hit. Nice work.';
  else {
    const idx = WINDOWS.findIndex(w => w.id === windowAt(new Date().getHours())), cur = WINDOWS[idx];
    let behind = 0; for (let i = 0; i < idx; i++) behind += Math.max(0, winTarget(WINDOWS[i]) - t.byWin[WINDOWS[i].id]);
    const curLeft = Math.max(0, winTarget(cur) - t.byWin[cur.id]);
    if (cur.id === 'midday' && curLeft > 0) nudge = `Midday: ${curLeft + behind} g to go. Grab your protein shake.`;
    else if (curLeft + behind > 0) nudge = `${cur.label}: aim for ${curLeft + behind} g now${behind ? ` (includes ${behind} g from earlier)` : ''}.`;
    else { const nx = WINDOWS[idx + 1]; nudge = nx ? `${cur.label} done. Next up: ${nx.label.toLowerCase()}, about ${winTarget(nx)} g.` : `${left} g left for today.`; }
  }

  // recent foods (manual entries, newest first, unique by name)
  const seen = new Set<string>(); const recent: FoodEntry[] = [];
  for (const e of all.slice().sort((a, b) => b.eaten_at.localeCompare(a.eaten_at))) {
    const k = e.name.toLowerCase();
    if (e.source !== 'quick' && !seen.has(k) && recent.length < 8) { seen.add(k); recent.push(e); }
  }

  const pct = Math.min(1, t.protein / target), C = 2 * Math.PI * 56;
  const nowId = isToday ? windowAt(new Date().getHours()) : null;
  const nowIdx = isToday ? WINDOWS.findIndex(w => w.id === nowId) : 99;

  return (
    <div className="mx-auto max-w-[720px] px-[max(4vw,14px)] pt-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[40px]">Food</h1><p className="mut">Protein target {target} g across four eating windows</p></div>
        <div className="flex items-center gap-1">
          <button className="ghost w-11 px-0" aria-label="Previous day" onClick={() => setView(shiftDay(view, -1))}>‹</button>
          <span className="min-w-24 text-center font-semibold">{isToday ? 'Today' : fmtDay(view)}</span>
          <button className="ghost w-11 px-0" aria-label="Next day" disabled={isToday} onClick={() => setView(shiftDay(view, 1))}>›</button>
        </div>
      </div>

      <section className="card mt-4 grid grid-cols-[132px_minmax(0,1fr)] items-center gap-4 max-[380px]:grid-cols-1">
        <div className="relative size-[132px]">
          <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
            <circle cx="66" cy="66" r="56" fill="none" stroke="var(--line)" strokeWidth="12" />
            <circle cx="66" cy="66" r="56" fill="none" stroke={pct >= 0.9 ? 'var(--grn)' : 'var(--blue)'} strokeWidth="12" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} transform="rotate(-90 66 66)" />
          </svg>
          <div className="absolute inset-0 grid place-content-center text-center"><span className="num text-[40px]">{Math.round(t.protein)}</span><span className="mut">of {target} g</span></div>
        </div>
        <div>
          <p className="font-medium">{nudge}</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <Kpi v={left + ' g'} l="protein left" /><Kpi v={Math.round(t.kcal).toLocaleString('en-GB')} l="kcal logged" /><Kpi v={String(day.length)} l="items" />
          </div>
        </div>
      </section>

      <h2 className="h2">Eating windows</h2>
      <div className="grid gap-2">
        {WINDOWS.map((w, i) => {
          const got = Math.round(t.byWin[w.id]), tg = winTarget(w), hit = got >= tg * 0.9;
          const pill = hit ? ['Hit', 'bg-grn text-white'] : i < nowIdx ? [`${tg - got} g short`, 'bg-warn text-white'] : i === nowIdx ? ['Now', 'bg-blue text-white'] : ['Later', 'bg-line text-mut'];
          return (
            <div key={w.id} className={'card ' + (w.id === nowId ? 'ring-2 ring-blue' : '')}>
              <div className="flex items-center justify-between gap-2"><b>{w.label}</b><span className="text-sm"><b className="num text-lg">{got}</b> / {tg} g <span className={'ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ' + pill[1]}>{pill[0]}</span></span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-line"><i className="block h-full rounded-full bg-blue" style={{ width: Math.min(100, got / tg * 100) + '%' }} /></div>
              <p className="mt-1.5 text-sm text-mut">{w.tip}</p>
            </div>
          );
        })}
      </div>

      <h2 className="h2">Log food</h2>
      <SnapEntry onAdd={add} />
      <p className="label mt-4 mb-1.5">Quick add</p>
      <div className="flex flex-wrap gap-2">
        {QUICK.map(q => <button key={q.name} className="chip gap-2" onClick={() => add({ ...q, source: 'quick' })}>{q.name}<b>{q.protein} g</b></button>)}
      </div>
      {!!recent.length && <>
        <p className="label mt-4 mb-1.5">Your recent foods</p>
        <div className="flex flex-wrap gap-2">
          {recent.map(e => <button key={e.id} className="chip gap-2" onClick={() => add({ name: e.name, protein: e.protein_g, kcal: e.kcal, source: 'recent' })}>{e.name}<b>{Math.round(e.protein_g)} g</b></button>)}
        </div>
      </>}
      <ManualEntry onAdd={add} />

      <h2 className="h2">{isToday ? 'Today’s log' : 'Log for ' + fmtDay(view, { day: 'numeric', month: 'short' })}</h2>
      {!day.length && <p className="mut">{isToday ? 'Nothing logged yet. Tap a quick add or type what you ate.' : 'Nothing logged on this day.'}</p>}
      <div className="grid">
        {day.map(e => (
          <div key={e.id} className="grid grid-cols-[48px_minmax(0,1fr)_auto_44px] items-center gap-2 border-b border-line py-2">
            <span className="mut">{fmtTime(e.eaten_at)}</span>
            <span>{e.name}<small className="block text-mut">{WINDOWS.find(w => w.id === e.meal_window)?.label}{e.kcal ? ` · ${Math.round(e.kcal)} kcal` : ''}</small></span>
            <span className="num text-xl">{Math.round(e.protein_g)}<small className="text-sm font-normal"> g</small></span>
            <button className="ghost w-11 px-0" aria-label={'Remove ' + e.name} onClick={() => remove('food_entries', e.id)}>✕</button>
          </div>
        ))}
      </div>

      <History byDay={byDay} target={target} view={view} onPick={setView} />
    </div>
  );
}

const Kpi = ({ v, l }: { v: string; l: string }) => <div className="rounded-xl bg-bg p-2"><b className="num block text-xl">{v}</b><small className="text-xs text-mut">{l}</small></div>;

function ManualEntry({ onAdd }: { onAdd: (e: { name: string; protein: number; kcal: number; source: 'manual'; when: Date; window: string }) => void }) {
  const [f, setF] = useState({ name: '', protein: '', kcal: '', when: '' });
  return (
    <form className="card mt-4 grid gap-2" onSubmit={e => {
      e.preventDefault();
      if (!f.name.trim() || !(+f.protein >= 0) || f.protein === '') return toast('Add a name and the protein grams');
      const when = f.when ? new Date(f.when) : new Date();
      onAdd({ name: f.name.trim(), protein: +f.protein, kcal: +f.kcal || 0, source: 'manual', when, window: windowAt(when.getHours()) });
      setF({ name: '', protein: '', kcal: '', when: '' });
    }}>
      <label className="label grid gap-1">What did you eat?<input className="field" value={f.name} maxLength={80} placeholder="e.g. Chicken wrap and chips" onChange={e => setF({ ...f, name: e.target.value })} /></label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="label grid gap-1">Protein (g)<input className="numin" inputMode="decimal" value={f.protein} onChange={e => setF({ ...f, protein: e.target.value.replace(/[^0-9.]/g, '') })} /></label>
        <label className="label grid gap-1">Calories<input className="numin" inputMode="numeric" value={f.kcal} onChange={e => setF({ ...f, kcal: e.target.value.replace(/[^0-9]/g, '') })} /></label>
        <label className="label col-span-2 grid gap-1 sm:col-span-1">When (blank = now)<input className="field" type="datetime-local" max={toLocalInput(new Date())} value={f.when} onChange={e => setF({ ...f, when: e.target.value })} /></label>
      </div>
      <button className="btn">Add to log</button>
      <p className="mut">Tip: check the label, or search “[food] protein per 100 g”. Foods you add here appear in your recent foods for one-tap logging.</p>
    </form>
  );
}

function History({ byDay, target, view, onPick }: { byDay: Map<string, FoodEntry[]>; target: number; view: string; onPick: (k: string) => void }) {
  const N = 14, today = todayKey();
  const keys = Array.from({ length: N }, (_, i) => shiftDay(today, i - (N - 1)));
  const vals = keys.map(k => totals(byDay.get(k) || []).protein);
  const W = 420, H = 150, padL = 28, padB = 22, top = 8, max = Math.max(target * 1.25, ...vals);
  const y = (v: number) => top + (H - top - padB) * (1 - v / max), bw = (W - padL) / N;
  const last7 = vals.slice(-7), avg7 = Math.round(last7.reduce((a, b) => a + b, 0) / 7), hits7 = last7.filter(v => v >= target * 0.9).length;
  let streak = 0;
  for (let i = vals.length - 1; i >= 0; i--) { if (vals[i] >= target * 0.9) streak++; else if (i === vals.length - 1) continue; else break; }
  return (
    <section className="mt-7">
      <h2 className="h2">Last 14 days</h2>
      <svg className="w-full text-[10px]" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Protein per day for the last 14 days">
        <line x1={padL} x2={W} y1={y(target)} y2={y(target)} stroke="var(--mut)" strokeDasharray="4 4" />
        <text x="0" y={y(target) + 4} fill="var(--mut)">{target}</text>
        <text x="0" y={H - padB + 4} fill="var(--mut)">0</text>
        {keys.map((k, i) => {
          const v = vals[i], x = padL + i * bw + 3;
          return <g key={k} onClick={() => onPick(k)} className="cursor-pointer">
            <rect x={x} y={v > 0 ? y(v) : H - padB - 2} width={bw - 6} height={v > 0 ? Math.max(2, H - padB - y(v)) : 2} rx="3"
              fill={v >= target * 0.9 ? 'var(--grn)' : v > 0 ? 'var(--blue)' : 'var(--line)'} stroke={k === view ? 'var(--ink)' : 'none'} strokeWidth="1.5">
              <title>{fmtDay(k, { day: 'numeric', month: 'short' })}: {Math.round(v)} g</title></rect>
            <text x={x + (bw - 6) / 2} y={H - 6} textAnchor="middle" fill="var(--mut)">{parseDay(k).toLocaleDateString('en-GB', { weekday: 'narrow' })}</text>
          </g>;
        })}
      </svg>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center"><Kpi v={avg7 + ' g'} l="7-day average" /><Kpi v={hits7 + ' / 7'} l="days on target" /><Kpi v={String(streak)} l="day streak" /></div>
      <p className="mut mt-2">Tap a bar to open that day. Green means within 10% of target.</p>
    </section>
  );
}

function SnapEntry({ onAdd }: { onAdd: (e: { name: string; protein: number; kcal: number; source: 'photo'; when?: Date }) => void }) {
  const [mode, setMode] = useState<'meal' | 'label'>('meal');
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [text, setText] = useState('');
  const [grams, setGrams] = useState('');
  const [busy, setBusy] = useState(false);
  const [est, setEst] = useState<(Estimate & { protein: string; kcal: string }) | null>(null);

  const reset = () => { if (photo) URL.revokeObjectURL(photo.url); setPhoto(null); setText(''); setGrams(''); setEst(null); };
  const pick = async (file: File | undefined, m: 'meal' | 'label') => {
    if (!file) return;
    setMode(m); setEst(null);
    if (photo) URL.revokeObjectURL(photo.url);
    const blob = await shrink(file); setPhoto({ blob, url: URL.createObjectURL(blob) });
  };
  const run = async () => {
    if (!photo && !text.trim()) return toast('Take a photo or describe what you ate');
    setBusy(true);
    try {
      const r = await estimateFood({ mode, text: text.trim(), grams: +grams || undefined, photo: photo?.blob });
      const p = r.items.reduce((a, i) => a + (+i.protein_g || 0), 0), k = r.items.reduce((a, i) => a + (+i.kcal || 0), 0);
      setEst({ ...r, protein: String(Math.round(p)), kcal: String(Math.round(k)) });
    } catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  };
  // Label: recompute from per-100 g values when grams change
  const regrams = (g: string) => {
    setGrams(g);
    const l = est?.label;
    if (est && l && +g > 0 && l.protein_per_100g != null) {
      setEst({ ...est, protein: String(Math.round(l.protein_per_100g * +g / 100)), kcal: l.kcal_per_100g != null ? String(Math.round(l.kcal_per_100g * +g / 100)) : est.kcal });
    }
  };

  return (
    <div className="card grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="btn cursor-pointer">📷 Snap meal<input type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => { pick(e.target.files?.[0], 'meal'); e.target.value = ''; }} /></label>
        <label className="ghost cursor-pointer">🏷️ Snap label<input type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => { pick(e.target.files?.[0], 'label'); e.target.value = ''; }} /></label>
      </div>
      {photo && <div className="flex items-center gap-3"><img src={photo.url} alt="Your food" className="size-16 rounded-xl object-cover" /><span className="mut flex-1">{mode === 'label' ? 'Nutrition label' : 'Meal photo'}</span><button className="ghost" onClick={reset}>Remove</button></div>}
      <input className="field" maxLength={300} value={text} onChange={e => setText(e.target.value)} placeholder={photo ? 'Add detail (optional), e.g. “large portion”' : 'Or describe it, e.g. Greggs chicken bake'} aria-label="Describe your food" />
      {mode === 'label' && photo && <label className="label grid gap-1">How much did you eat? (g, optional)<input className="numin" inputMode="numeric" value={grams} onChange={e => regrams(e.target.value.replace(/\D/g, ''))} /></label>}
      {!est && <button className="btn" disabled={busy} onClick={run}>{busy ? 'Estimating…' : 'Estimate'}</button>}
      {est && (
        <div className="grid gap-2 rounded-xl bg-bg p-3">
          <b>{est.summary}</b>
          <ul className="list-disc pl-5 text-sm text-mut">{est.items.map((i, k) => <li key={k}>{i.name}{i.portion ? ` (${i.portion})` : ''}: {Math.round(i.protein_g)} g protein, {Math.round(i.kcal)} kcal</li>)}</ul>
          {est.label && est.label.protein_per_100g != null && <p className="mut">Label: {est.label.protein_per_100g} g protein{est.label.kcal_per_100g != null ? `, ${est.label.kcal_per_100g} kcal` : ''} per 100 g{est.label.serving_g ? ` · serving ${est.label.serving_g} g` : ''}</p>}
          {est.tip && <p className="mut">Tip: {est.tip}</p>}
          <p className="mut">Confidence: {est.confidence}. Adjust the numbers if you know better.</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="label grid gap-1">Protein (g)<input className="numin" inputMode="decimal" value={est.protein} onChange={e => setEst({ ...est, protein: e.target.value.replace(/[^0-9.]/g, '') })} /></label>
            <label className="label grid gap-1">Calories<input className="numin" inputMode="numeric" value={est.kcal} onChange={e => setEst({ ...est, kcal: e.target.value.replace(/\D/g, '') })} /></label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="ghost" onClick={() => setEst(null)}>Discard</button>
            <button className="btn" onClick={() => { onAdd({ name: est.summary.slice(0, 60), protein: +est.protein || 0, kcal: +est.kcal || 0, source: 'photo' }); reset(); }}>Add to log</button>
          </div>
        </div>
      )}
      <p className="mut">Photo estimates are free (Google Gemini) and need you signed in. Labels are read exactly; meals are a best guess.</p>
    </div>
  );
}

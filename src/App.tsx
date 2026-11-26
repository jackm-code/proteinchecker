import { useEffect, useState } from 'react';
import { useStore } from './lib/store';
import { Toaster } from './ui/toast';
import Train from './screens/Train';
import WorkoutScreen from './screens/Workout';
import Food from './screens/Food';
import Body from './screens/Body';
import Progress from './screens/Progress';
import More from './screens/More';

const TABS = [
  { id: 'train', label: 'Train', icon: 'M4 10v4M20 10v4M7 7v10M17 7v10M7 12h10' },
  { id: 'food', label: 'Food', icon: 'M7 3v8a2 2 0 0 0 4 0V3M9 11v10M17 3c-2 0-3 2-3 5s1 4 3 4v9' },
  { id: 'body', label: 'Body', icon: 'M12 3a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM6 10h12M12 10v5M9 21l3-6 3 6' },
  { id: 'progress', label: 'Progress', icon: 'M4 19h16M6 16l4-5 3 3 5-7' },
  { id: 'more', label: 'More', icon: 'M5 12h.01M12 12h.01M19 12h.01' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const fromHash = (): Tab => {
  const h = location.hash.slice(1) as Tab;
  return TABS.some(t => t.id === h) ? h : 'train';
};

export default function App() {
  const [tab, setTab] = useState<Tab>(fromHash);
  const [inWorkout, setInWorkout] = useState(true);
  const hasDraft = useStore(s => !!s.draft);
  useEffect(() => { const f = () => setTab(fromHash()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const go = (t: Tab) => { location.hash = t; setTab(t); scrollTo(0, 0); };
  const showWorkout = tab === 'train' && hasDraft && inWorkout;

  return (
    <>
      <Toaster />
      <main className="pb-[calc(84px+env(safe-area-inset-bottom))]">
        {showWorkout ? <WorkoutScreen onHome={() => { setInWorkout(false); scrollTo(0, 0); }} />
          : tab === 'train' ? <Train onOpenWorkout={() => { setInWorkout(true); scrollTo(0, 0); }} />
          : tab === 'food' ? <Food />
          : tab === 'body' ? <Body />
          : tab === 'progress' ? <Progress />
          : <More />}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-[720px] grid-cols-5">
          {TABS.map(t => (
            <button key={t.id} type="button" onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}
              className={'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ' + (tab === t.id ? 'text-blue' : 'text-mut')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={t.icon} /></svg>
              {t.label}
              {t.id === 'train' && hasDraft && <span className="sr-only">(workout in progress)</span>}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}

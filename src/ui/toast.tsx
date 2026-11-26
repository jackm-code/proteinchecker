import { useEffect, useState } from 'react';

let push: (m: string) => void = () => {};
export const toast = (m: string) => push(m);

export function Toaster() {
  const [msg, setMsg] = useState<{ m: string; k: number } | null>(null);
  useEffect(() => { push = m => setMsg({ m, k: Date.now() }); }, []);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3200); return () => clearTimeout(t); }, [msg]);
  return msg ? <div role="status" className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 font-medium text-bg max-w-[90vw]">{msg.m}</div> : null;
}

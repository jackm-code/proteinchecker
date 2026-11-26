import { useEffect, useState, type ReactNode } from 'react';

/** Destructive actions need a second tap within 3 seconds. */
export function ConfirmButton({ onConfirm, children, confirmText, className = 'ghost' }:
  { onConfirm: () => void; children: ReactNode; confirmText: string; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t); }, [armed]);
  return <button type="button" className={className + (armed ? ' !bg-red !text-white' : '')}
    onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>{armed ? confirmText : children}</button>;
}

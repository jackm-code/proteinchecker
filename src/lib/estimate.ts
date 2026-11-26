import { supabase } from './store';

export interface Estimate {
  summary: string;
  items: { name: string; portion: string; protein_g: number; kcal: number }[];
  confidence: 'high' | 'medium' | 'low';
  tip: string;
  label?: { protein_per_100g?: number | null; kcal_per_100g?: number | null; serving_g?: number | null } | null;
}

/** Shrink a phone photo to max 1024px JPEG so it uploads fast on gym signal. */
export async function shrink(file: Blob): Promise<Blob> {
  try {
    const img = await createImageBitmap(file);
    const s = Math.min(1, 1024 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(b => r(b || file), 'image/jpeg', 0.82));
  } catch { return file; }
}

const toBase64 = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] || '');
  r.onerror = rej; r.readAsDataURL(b);
});

export async function estimateFood(o: { mode: 'meal' | 'label'; text: string; grams?: number; photo?: Blob | null }): Promise<Estimate> {
  if (!supabase) throw new Error('Estimates need sync set up.');
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) throw new Error('Sign in under More to use photo estimates.');
  if (!navigator.onLine) throw new Error('You’re offline. Use quick add or type the numbers instead.');
  const body: Record<string, unknown> = { mode: o.mode, text: o.text, grams: o.grams || null };
  if (o.photo) { body.image = await toBase64(o.photo); body.mime = o.photo.type || 'image/jpeg'; }
  const { data, error } = await supabase.functions.invoke('estimate-food', { body });
  if (error) {
    let msg = 'Couldn’t estimate that. Try again or describe it differently.';
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.message) msg = j.message; } catch { /* keep default */ }
    throw new Error(msg);
  }
  const items = Array.isArray(data?.items) ? data.items.filter((i: { name?: string }) => i?.name) : [];
  if (!items.length) throw new Error('Couldn’t work out what that was. Try a clearer photo or add a description.');
  return { ...data, items } as Estimate;
}

// Estimates protein and calories from a meal photo, a nutrition label photo, or a text description.
// Calls Google's Gemini API (free tier). The API key lives in Supabase secrets, never in the app.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   GEMINI_API_KEY   required, from aistudio.google.com
//   ALLOWED_EMAILS   optional, comma-separated; only these accounts can use estimates
//   GEMINI_MODEL     optional, comma-separated models to try in order

const KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const MODELS = (Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-2.5-flash')
  .split(',').map(s => s.trim()).filter(Boolean);
const ALLOWED = (Deno.env.get('ALLOWED_EMAILS') ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING', description: 'Short meal name, max 6 words' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' }, portion: { type: 'STRING' },
          protein_g: { type: 'NUMBER' }, kcal: { type: 'NUMBER' },
        },
        required: ['name', 'portion', 'protein_g', 'kcal'],
      },
    },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    tip: { type: 'STRING' },
    label: {
      type: 'OBJECT', nullable: true,
      description: 'Only for a nutrition label photo',
      properties: {
        protein_per_100g: { type: 'NUMBER', nullable: true },
        kcal_per_100g: { type: 'NUMBER', nullable: true },
        serving_g: { type: 'NUMBER', nullable: true },
        protein_per_serving: { type: 'NUMBER', nullable: true },
        kcal_per_serving: { type: 'NUMBER', nullable: true },
      },
    },
  },
  required: ['summary', 'items', 'confidence', 'tip'],
};

function prompt(mode: string, text: string, grams: number | null, hasImage: boolean) {
  const base = `You estimate protein and calories for food logged in a personal protein tracker used in the UK.
Use typical UK portion sizes. If a UK shop, chain or brand is named (e.g. Tesco, M&S, Greggs, Pret, Nando's, Myprotein), use that product's published nutrition if you know it. If a quantity is given, use it.
"tip" is one short sentence on an easy way to add protein to this meal, or "" if it is already high-protein.`;
  if (mode === 'label') {
    return `${base}
The photo shows a nutrition label. Read the protein and energy (kcal) values exactly as printed, per 100 g and per serving where shown, and fill "label".
${grams ? `The user ate ${grams} g. Base "items" on ${grams} g.` : 'Base "items" on one serving if a serving size is printed, otherwise on 100 g.'}
${text ? `The user says: ${JSON.stringify(text)}` : ''}
If you cannot read a value, say so in "tip" and set confidence to "low".`;
  }
  return `${base}
${hasImage ? 'A photo of the meal is attached. Identify each food and estimate its portion from the photo.' : ''}
User's description: ${text ? JSON.stringify(text) : '(none, use the photo)'}
Set "label" to null.`;
}

async function callGemini(model: string, body: unknown) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

function emailFromJwt(auth: string): string {
  try {
    const payload = auth.replace(/^Bearer /, '').split('.')[1];
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    return String(JSON.parse(atob(b64 + '==='.slice((b64.length + 3) % 4))).email ?? '').toLowerCase();
  } catch { return ''; }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!KEY) return json({ error: 'not_configured', message: 'Add GEMINI_API_KEY in Supabase secrets.' }, 503);

  // The gateway has already verified the JWT; this limits use to Jack's own account(s).
  if (ALLOWED.length && !ALLOWED.includes(emailFromJwt(req.headers.get('Authorization') ?? ''))) {
    return json({ error: 'forbidden', message: 'This account can’t use photo estimates.' }, 403);
  }

  let input: { mode?: string; text?: string; grams?: number; image?: string; mime?: string };
  try { input = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const mode = input.mode === 'label' ? 'label' : 'meal';
  const text = String(input.text ?? '').slice(0, 300);
  const grams = Number(input.grams) > 0 ? Math.min(5000, Number(input.grams)) : null;
  const image = typeof input.image === 'string' ? input.image : '';
  if (!text && !image) return json({ error: 'bad_request', message: 'Send a photo or a description.' }, 400);
  if (image.length > 4_000_000) return json({ error: 'too_large', message: 'Photo too large.' }, 413);

  const parts: unknown[] = [{ text: prompt(mode, text, grams, !!image) }];
  if (image) parts.push({ inline_data: { mime_type: input.mime || 'image/jpeg', data: image } });
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 },
  };

  let last = { status: 500, data: {} as Record<string, unknown> };
  for (const model of MODELS) {
    last = await callGemini(model, body);
    if (last.status === 200) {
      const txt = (last.data as any)?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
      try { return json({ model, ...JSON.parse(txt) }); }
      catch { return json({ error: 'bad_response', message: 'Couldn’t read the estimate. Try again.' }, 502); }
    }
    // try the next model if this one is missing or its free quota is used up
    if (![404, 429].includes(last.status)) break;
  }
  const code = last.status === 429 ? 'rate_limited' : 'upstream_error';
  return json({ error: code, message: code === 'rate_limited' ? 'Free daily limit reached. Try again later.' : 'The estimate service failed. Try again.' }, last.status === 429 ? 429 : 502);
});

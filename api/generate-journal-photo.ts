// Serverless function: generate a "photo of the day" from a diary note using
// Google's Gemini image model ("Nano Banana"). Runs server-side so the API key
// (GOOGLE_AI_API_KEY, set in Vercel project env) never reaches the browser —
// unlike the client-side Anthropic calls in src/lib, image-gen providers can't
// be called safely from the client (key exposure; Replicate has no CORS).
//
// Local `vite dev` does not run this file — use `vercel dev` or a deploy to
// exercise it. UI tests mock the /api route (see the Playwright fixtures).
//
// Provider seam: swapping Gemini for Replicate/Flux means replacing the
// generateImage() body below; the request/response contract stays the same.
export const config = { runtime: 'edge' }

const MODEL = 'gemini-2.5-flash-image' // "Nano Banana"

// The note is a ~150-char diary line. We ask for an evocative, tasteful image
// of the moment rather than a literal scene, and forbid text (image models
// tend to bake in gibberish captions).
function buildPrompt(note: string): string {
  return [
    `A beautiful, evocative photograph capturing the feeling of this diary entry: "${note}".`,
    'Natural lighting, shallow depth of field, warm and cohesive muted palette,',
    'square 1:1 composition. No text, no words, no watermarks, no borders.',
  ].join(' ')
}

async function generateImage(note: string, apiKey: string): Promise<{ dataUrl: string }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(note) }] }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    },
  )

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Gemini ${res.status}: ${detail.slice(0, 300)}`)
  }

  const data = await res.json()
  const parts: Array<{ inlineData?: { mimeType: string; data: string } }> =
    data?.candidates?.[0]?.content?.parts ?? []
  const img = parts.find(p => p.inlineData)?.inlineData
  if (!img) throw new Error('Gemini returned no image (the prompt may have been blocked)')

  return { dataUrl: `data:${img.mimeType};base64,${img.data}` }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) return json({ error: 'GOOGLE_AI_API_KEY is not configured' }, 500)

  let note = ''
  try {
    note = String((await req.json())?.note ?? '').trim()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (!note) return json({ error: 'A diary note is required to generate a photo' }, 400)

  try {
    const { dataUrl } = await generateImage(note.slice(0, 300), apiKey)
    return json({ image: dataUrl })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Image generation failed' }, 502)
  }
}

import { compressSrcToSquareJpeg } from '@/lib/image'

// Ask the serverless function to generate a "photo of the day" from a diary
// note, then shrink the result to the same tiny square JPEG used for uploaded
// photos so it can live inline in the database. Returns a photo_data data URL.
export async function generateJournalPhoto(note: string): Promise<string> {
  const res = await fetch('/api/generate-journal-photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body?.image) {
    throw new Error(body?.error || `Generation failed (${res.status})`)
  }

  return compressSrcToSquareJpeg(body.image)
}

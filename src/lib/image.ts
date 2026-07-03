// Center-crop an image file to a square and resize it, returning a JPEG data
// URL. Keeps journal photos tiny (~30-60KB) so they can live in the database.
export async function compressToSquareJpeg(file: File, size = 400, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', quality)
}

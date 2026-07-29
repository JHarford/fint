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

// Center-crop an already-loaded image source (e.g. a data URL from image
// generation) to a square JPEG, mirroring compressToSquareJpeg's output so
// generated and uploaded journal photos are stored identically (~30-60KB).
export async function compressSrcToSquareJpeg(src: string, size = 400, quality = 0.82): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Could not load generated image'))
    el.src = src
  })
  const side = Math.min(img.width, img.height)
  const sx = (img.width - side) / 2
  const sy = (img.height - side) / 2
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)
  return canvas.toDataURL('image/jpeg', quality)
}

// Resize (no crop) for vision-model input: enough detail to identify food,
// small enough to send. Returns bare base64 (no data: prefix).
export async function compressForVision(file: File, maxDim = 1024, quality = 0.8): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', quality).split(',')[1]
}

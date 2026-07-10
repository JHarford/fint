import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import type { IScannerControls } from '@zxing/browser'

// Full-screen barcode scanner (same blur/tint layering as other overlays).
// The zxing decoder is lazy-loaded — it only ships when the user scans.
export function BarcodeScanner({ onResult, onClose }: {
  onResult: (code: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(true)

  useEffect(() => {
    let controls: IScannerControls | null = null
    let done = false
    ;(async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (!videoRef.current) return
        const reader = new BrowserMultiFormatReader()
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, result => {
          if (result && !done) {
            done = true
            controls?.stop()
            onResult(result.getText())
          }
        })
        setStarting(false)
      } catch (e) {
        console.error('Scanner failed:', e)
        setError(e instanceof Error && e.name === 'NotAllowedError'
          ? 'Camera access was blocked — allow it in Settings for this app'
          : 'Could not start the camera')
        setStarting(false)
      }
    })()
    return () => { done = true; controls?.stop() }
  }, [onResult])

  return createPortal(
    <div className="fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-x-0 top-[12%] flex justify-center px-6 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[360px] rounded-xl border bg-background shadow-xl p-3 space-y-2 animate-in fade-in-0 zoom-in-95 duration-150">
          <div className="flex items-center justify-between">
            <span className="font-display font-semibold text-sm">Scan a barcode</span>
            <button className="text-muted-foreground hover:text-foreground p-1" onClick={onClose}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3]">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            {starting && !error && (
              <div className="absolute inset-0 flex items-center justify-center text-white/80">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            )}
            {/* Guide line */}
            <div className="absolute inset-x-8 top-1/2 h-0.5 bg-primary/70 rounded-full" />
          </div>
          {error
            ? <p className="text-xs text-destructive">{error}</p>
            : <p className="text-[11px] text-muted-foreground">Point at the barcode — it reads automatically.</p>}
        </div>
      </div>
    </div>,
    document.body,
  )
}

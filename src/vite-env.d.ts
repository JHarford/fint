/// <reference types="vite/client" />

// Injected at build time via `define` in vite.config.ts
declare const __APP_VERSION__: string
declare const __COMMIT_SHA__: string

// gifenc ships no TypeScript types
declare module 'gifenc' {
  export function quantize(data: Uint8ClampedArray | Uint8Array, maxColors: number): number[][]
  export function applyPalette(data: Uint8ClampedArray | Uint8Array, palette: number[][]): Uint8Array
  export function GIFEncoder(): {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: { palette?: number[][]; delay?: number }): void
    finish(): void
    bytes(): Uint8Array
  }
}

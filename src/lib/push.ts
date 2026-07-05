// Web Push subscribe/unsubscribe. The VAPID public key is baked in at build
// time (VITE_VAPID_PUBLIC_KEY); the matching private key lives on the droplet,
// which is the only thing that ever sends pushes (see DROPLET.md).
import { supabase } from './supabase'

export const VAPID_PUBLIC_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

export async function enablePush(): Promise<PushSubscription> {
  if (!VAPID_PUBLIC_KEY) throw new Error('Build has no VITE_VAPID_PUBLIC_KEY — set it and redeploy')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted')

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
  })

  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Browser returned an incomplete push subscription')
  }
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent.slice(0, 200),
    },
    { onConflict: 'endpoint' },
  )
  if (error) {
    await sub.unsubscribe().catch(() => {})
    throw error
  }
  return sub
}

export async function disablePush(): Promise<void> {
  const sub = await getCurrentSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
}

// Local-only notification so the user can check what pushes will look like
// without involving the droplet.
export async function showTestNotification(): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  await reg.showNotification('LifeFlow', {
    body: 'Notifications are working on this device 🎉',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag: 'lifeflow-test',
  })
}

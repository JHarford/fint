import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bell, BellOff, BellRing } from 'lucide-react'
import { pushSupported, getCurrentSubscription, enablePush, disablePush, showTestNotification, VAPID_PUBLIC_KEY } from '@/lib/push'

type PushState = 'checking' | 'unsupported' | 'unconfigured' | 'denied' | 'off' | 'on'

export function NotificationsManager() {
  const [state, setState] = useState<PushState>('checking')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      if (!pushSupported()) return setIf('unsupported')
      if (!VAPID_PUBLIC_KEY) return setIf('unconfigured')
      if (Notification.permission === 'denied') return setIf('denied')
      const sub = await getCurrentSubscription().catch(() => null)
      setIf(sub ? 'on' : 'off')
    }
    const setIf = (s: PushState) => { if (!cancelled) setState(s) }
    check()
    return () => { cancelled = true }
  }, [])

  const enable = async () => {
    setBusy(true); setError('')
    try {
      await enablePush()
      setState('on')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not enable notifications')
      if (Notification.permission === 'denied') setState('denied')
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true); setError('')
    try {
      await disablePush()
      setState('off')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not disable notifications')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="flex items-center gap-2">
          Notifications
          {state === 'on' && <Badge variant="outline" className="gap-1 border-emerald-400 text-emerald-700 dark:text-emerald-400"><BellRing className="w-3 h-3" /> on</Badge>}
        </CardTitle>
        {state === 'on' ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => showTestNotification().catch(e => setError(String(e)))}>
              Send test
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={disable}>
              <BellOff className="w-4 h-4 mr-1" /> Disable
            </Button>
          </div>
        ) : state === 'off' ? (
          <Button size="sm" disabled={busy} onClick={enable}>
            <Bell className="w-4 h-4 mr-1" /> Enable on this device
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Morning check-in nudges, streak milestones and coach messages, sent by
          your droplet even when the app is closed. Each device you enable is
          subscribed separately.
        </p>
        {state === 'unsupported' && (
          <p className="text-sm text-muted-foreground">
            This browser doesn't support Web Push. On iPhone, install LifeFlow
            to the home screen (Share → Add to Home Screen) and enable it from
            the installed app.
          </p>
        )}
        {state === 'unconfigured' && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            This build has no <code className="text-xs">VITE_VAPID_PUBLIC_KEY</code>.
            Generate keys with <code className="text-xs">npx web-push generate-vapid-keys</code>,
            add the public key as an env var in Vercel, and redeploy.
          </p>
        )}
        {state === 'denied' && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Notifications are blocked for LifeFlow. Re-enable them in your
            device's settings for this app/site, then come back here.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

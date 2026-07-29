import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Loader2, Mail } from 'lucide-react'

// Passwordless magic-link sign-in. Access is invite-only: the allowed_emails
// trigger (migration 020) rejects signups for emails that aren't invited, and
// that rejection surfaces here as a send error.
export function Login() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const addr = email.trim()
    if (!addr || status === 'sending') return
    setStatus('sending')
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      setStatus('error')
      setError(error.message)
    } else {
      setStatus('sent')
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm min-w-0 space-y-5">
        <div className="space-y-1 text-center">
          <h1 className="font-display text-3xl font-semibold text-primary">LifeFlow</h1>
          <p className="text-sm text-muted-foreground italic font-display">one day at a time</p>
        </div>

        {status === 'sent' ? (
          <div className="rounded-lg border bg-muted/40 px-4 py-6 text-center space-y-2">
            <Mail className="w-6 h-6 mx-auto text-primary" />
            <p className="text-sm font-medium">Check your email</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We sent a sign-in link to <strong className="break-all">{email.trim()}</strong>.
              Open it on this device to continue.
            </p>
            <button
              className="text-xs text-muted-foreground underline hover:text-foreground"
              onClick={() => { setStatus('idle'); setEmail('') }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={send} className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">
              Sign in with a magic link. LifeFlow is invite-only.
            </p>
            <input
              type="email"
              autoFocus
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full h-11 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            <Button type="submit" className="w-full h-11" disabled={status === 'sending' || !email.trim()}>
              {status === 'sending'
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</>
                : 'Email me a sign-in link'}
            </Button>
            {status === 'error' && (
              <p className="text-xs text-destructive text-center leading-relaxed">
                {error || 'Could not send the link.'} If your email should have access, ask Joe to add it to the invite list.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Loader2, Mail } from 'lucide-react'

// Passwordless sign-in. Access is invite-only: the allowed_emails trigger
// (migration 020) rejects signups for emails that aren't invited, and that
// rejection surfaces here as a send error.
//
// The email carries BOTH a magic link and a 6-digit code. The code is what
// makes the installed PWA work: a magic link opens in the browser, whose
// localStorage the standalone PWA can't see — so the session never reaches
// the app. Typing the code verifies in-place instead (verifyOtp), keeping
// the whole flow inside whichever context the user is actually in.
export function Login() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'verifying' | 'error'>('idle')
  const [error, setError] = useState('')
  const [codeError, setCodeError] = useState('')

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
      setCode('')
      setCodeError('')
    }
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = code.trim()
    if (token.length < 6 || status === 'verifying') return
    setStatus('verifying')
    setCodeError('')
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' })
    if (error) {
      setStatus('sent')
      setCodeError(error.message.includes('expired') ? 'That code has expired — send a fresh one.' : 'Wrong code — check the email and try again.')
    }
    // on success onAuthStateChange fires and App swaps to the planner
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm min-w-0 space-y-5">
        <div className="space-y-1 text-center">
          <h1 className="font-display text-3xl font-semibold text-primary">LifeFlow</h1>
          <p className="text-sm text-muted-foreground italic font-display">one day at a time</p>
        </div>

        {status === 'sent' || status === 'verifying' ? (
          <div className="rounded-lg border bg-muted/40 px-4 py-6 text-center space-y-3">
            <Mail className="w-6 h-6 mx-auto text-primary" />
            <p className="text-sm font-medium">Check your email</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We sent a 6-digit code to <strong className="break-all">{email.trim()}</strong>.
              Type it here to sign in on this device.
            </p>
            <form onSubmit={verify} className="space-y-2">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full h-12 rounded-md border border-input bg-background px-3 text-center text-xl tracking-[0.4em] font-medium shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
              <Button type="submit" className="w-full h-11" disabled={code.trim().length < 6 || status === 'verifying'}>
                {status === 'verifying'
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing in…</>
                  : 'Sign in'}
              </Button>
              {codeError && <p className="text-xs text-destructive leading-relaxed">{codeError}</p>}
            </form>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The email link works too, but only in the browser — inside the installed app, use the code.
            </p>
            <button
              className="text-xs text-muted-foreground underline hover:text-foreground"
              onClick={() => { setStatus('idle'); setEmail(''); setCode('') }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={send} className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">
              We'll email you a sign-in code. LifeFlow is invite-only.
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
                : 'Email me a sign-in code'}
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

'use client';

import { useState, useTransition } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/db/supabaseBrowser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function signInWithPassword() {
    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    window.location.assign('/app');
  }

  async function sendMagicLink() {
    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/app`
      }
    });
    if (signInError) throw signInError;
    setMessage('Check your email for the sign-in link.');
  }

  return (
    <main className="login-screen">
      <form
        className="login-card"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setMessage(null);
          startTransition(async () => {
            try {
              await signInWithPassword();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not start sign in.');
            }
          });
        }}
      >
        <Mail size={32} />
        <p className="eyebrow">Secure access</p>
        <h1>Sign in to LeakProof AI</h1>
        <p>Use your work email to access revenue audit workspaces.</p>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="finance@example.com"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          required
        />
        <button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="spin" size={16} /> : null}
          Sign in
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={isPending || !email}
          onClick={() => {
            setError(null);
            setMessage(null);
            startTransition(async () => {
              try {
                await sendMagicLink();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not send sign-in link.');
              }
            });
          }}
        >
          Send magic link instead
        </button>
        {message ? <p className="success-text">{message}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </form>
    </main>
  );
}

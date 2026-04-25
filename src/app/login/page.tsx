'use client';

import { useState, useTransition } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/db/supabaseBrowser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
              const supabase = createSupabaseBrowserClient();
              const { error: signInError } = await supabase.auth.signInWithOtp({
                email,
                options: {
                  emailRedirectTo: `${window.location.origin}/app`
                }
              });
              if (signInError) throw signInError;
              setMessage('Check your email for the sign-in link.');
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
        <button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="spin" size={16} /> : null}
          Send sign-in link
        </button>
        {message ? <p className="success-text">{message}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </form>
    </main>
  );
}

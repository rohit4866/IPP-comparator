'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Err } from '@/components/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api('/auth/login', { method: 'POST', body: { email, password } });
      localStorage.setItem('token', r.token);
      window.location.href = '/';
    } catch (err: any) { setError(err.message); setBusy(false); }
  }

  return (
    <div className="login">
      <div className="art">
        <h1>Compare green power. Negotiate in rounds. Lock one deal.</h1>
        <p style={{ opacity: .85, maxWidth: 420 }}>Every round is recorded and frozen, so the price history behind a locked deal can always be traced.</p>
      </div>
      <div className="formside">
        <form className="formbox stack" onSubmit={submit}>
          <h2 style={{ fontSize: 22 }}>Sign in</h2>
          <Err msg={error} />
          <div><label htmlFor="e">Email</label><input id="e" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></div>
          <div><label htmlFor="p">Password</label><input id="p" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div>
          <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}

'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import Cookies from 'js-cookie';
import { authApi } from '@/lib/api';
import { setStoredUser } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'credentials' | '2fa'>('credentials');
  const [loading, setLoading] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [form, setForm] = useState({ email: '', password: '', totp: '' });

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await authApi.login(form.email, form.password);
      if (data.requiresTwoFactor) {
        setTempToken(data.tempToken);
        setStep('2fa');
        toast.success('Enter your 2FA code');
      } else {
        // No 2FA — store tokens and redirect
        Cookies.set('admin_token', data.accessToken, { expires: 0.33 });
        if (data.refreshToken) Cookies.set('admin_refresh', data.refreshToken, { expires: 30 });
        setStoredUser(data.user);
        router.push('/dashboard');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify2fa(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await authApi.verify2fa(tempToken, form.totp);
      Cookies.set('admin_token', data.accessToken, { expires: 0.33 });
      if (data.refreshToken) Cookies.set('admin_refresh', data.refreshToken, { expires: 30 });
      setStoredUser(data.user);
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Invalid 2FA code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-pink-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-600 mb-4 shadow-lg">
            <span className="text-white text-2xl">🛍️</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Meesho Commerce OS</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">Admin Dashboard</p>
        </div>

        <div className="card p-8 shadow-xl">
          {step === 'credentials' ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="label">Email address</label>
                <input
                  type="email"
                  className="input"
                  placeholder="admin@yourdomain.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required
                />
              </div>
              <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign In →'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify2fa} className="space-y-5">
              <div className="text-center">
                <div className="text-3xl mb-2">🔐</div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Open your authenticator app and enter the 6-digit code
                </p>
              </div>
              <div>
                <label className="label">2FA Code</label>
                <input
                  type="text"
                  className="input text-center text-2xl tracking-widest font-mono"
                  placeholder="000000"
                  maxLength={6}
                  value={form.totp}
                  onChange={e => setForm(f => ({ ...f, totp: e.target.value.replace(/\D/g, '') }))}
                  required
                  autoFocus
                />
              </div>
              <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
                {loading ? 'Verifying…' : 'Verify Code →'}
              </button>
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => setStep('credentials')}
              >
                ← Back
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Secured with AES-256 encryption · JWT + TOTP 2FA
        </p>
      </div>
    </div>
  );
}

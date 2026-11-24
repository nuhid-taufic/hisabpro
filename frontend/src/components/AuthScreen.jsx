import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, KeyRound, Lock, Mail, Phone, User, XCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export default function AuthScreen({ onAuthenticated, notify }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'reset'
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('demo@hisabpro.app');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [password, setPassword] = useState('Demo@1234');
  const [loading, setLoading] = useState(false);

  // Admin-Approved Password Reset State
  const [resetId, setResetId] = useState('');
  const [resetReason, setResetReason] = useState('');
  const [resetStatus, setResetStatus] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const googleBtnRef = useRef(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || mode === 'reset') return;

    function renderGoogleButton() {
      if (!window.google?.accounts?.id || !googleBtnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          setLoading(true);
          try {
            const res = await apiFetch('/auth/google', {
              method: 'POST',
              body: JSON.stringify({ credential: response.credential }),
            });
            notify(`Signed in with Google as ${res.user.name}`);
            onAuthenticated(res.user);
          } catch (err) {
            notify(err.message, true);
          } finally {
            setLoading(false);
          }
        },
      });
      googleBtnRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'filled_black',
        size: 'large',
        width: 360,
        text: 'continue_with',
        shape: 'rectangular',
      });
    }

    if (window.google?.accounts?.id) {
      renderGoogleButton();
      return;
    }

    const scriptId = 'google-gsi-sdk';
    let script = document.getElementById(scriptId);
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', renderGoogleButton);
    return () => script?.removeEventListener('load', renderGoogleButton);
  }, [mode, notify, onAuthenticated]);

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await apiFetch('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ identifier, password }),
        });
        notify(`Welcome back, ${res.user.name}`);
        onAuthenticated(res.user);
      } else {
        if (!regEmail.trim() && !regPhone.trim()) {
          notify('Please enter a valid Email or Phone number.', true);
          setLoading(false);
          return;
        }
        const res = await apiFetch('/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name,
            email: regEmail.trim() || undefined,
            phone: regPhone.trim() || undefined,
            password,
          }),
        });
        notify(`Account created! Welcome, ${res.user.name}`);
        onAuthenticated(res.user);
      }
    } catch (err) {
      notify(err.message, true);
    } finally {
      setLoading(false);
    }
  }

  async function submitResetRequest(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiFetch('/auth/password-reset/request', {
        method: 'POST',
        body: JSON.stringify({ identifier: resetId, reason: resetReason.trim() || undefined }),
      });
      setResetStatus(res.request);
      notify(res.message);
    } catch (err) {
      notify(err.message, true);
    } finally {
      setLoading(false);
    }
  }

  async function checkResetStatus() {
    if (!resetId.trim()) {
      notify('Enter your email or phone first.', true);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/auth/password-reset/status', {
        method: 'POST',
        body: JSON.stringify({ identifier: resetId }),
      });
      if (!res.request) {
        setResetStatus(null);
        notify('No reset request found for this account yet.', true);
      } else {
        setResetStatus(res.request);
      }
    } catch (err) {
      notify(err.message, true);
    } finally {
      setLoading(false);
    }
  }

  async function completePasswordReset(e) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      notify('Passwords do not match.', true);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/auth/password-reset/complete', {
        method: 'POST',
        body: JSON.stringify({ identifier: resetId, newPassword }),
      });
      notify(res.message);
      setIdentifier(resetId);
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setResetStatus(null);
      setMode('login');
    } catch (err) {
      notify(err.message, true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0A0B] p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#26262B] bg-[#141417] p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3B82F6] text-lg font-bold text-white">
            H
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#FAFAFA]">HisabPro v2.2</h1>
            <p className="text-xs text-[#A1A1AA]">Personal Ledger, Store POS &amp; User CRM</p>
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="mb-5 grid grid-cols-3 rounded-xl border border-[#26262B] bg-[#0A0A0B] p-1">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`rounded-lg py-2 text-xs font-semibold ${
              mode === 'login' ? 'bg-[#1C1C21] text-white' : 'text-[#A1A1AA]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setPassword('');
            }}
            className={`rounded-lg py-2 text-xs font-semibold ${
              mode === 'register' ? 'bg-[#1C1C21] text-white' : 'text-[#A1A1AA]'
            }`}
          >
            Create Account
          </button>
          <button
            type="button"
            onClick={() => setMode('reset')}
            className={`rounded-lg py-2 text-xs font-semibold ${
              mode === 'reset' ? 'bg-[#1C1C21] text-white' : 'text-[#A1A1AA]'
            }`}
          >
            Reset Pass
          </button>
        </div>

        {mode !== 'reset' ? (
          <>
            <div className="mb-4">
              {GOOGLE_CLIENT_ID ? (
                <div ref={googleBtnRef} className="flex justify-center overflow-hidden rounded-xl" />
              ) : (
                <div className="rounded-xl border border-dashed border-[#26262B] bg-[#0A0A0B] p-2.5 text-center text-[11px] text-[#A1A1AA]">
                  Google Sign-In ready — add <span className="font-mono text-white">VITE_GOOGLE_CLIENT_ID</span> &amp;{' '}
                  <span className="font-mono text-white">GOOGLE_CLIENT_ID</span> in <span className="font-mono text-white">.env</span>.
                </div>
              )}
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-3.5">
              {mode === 'register' ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs text-[#A1A1AA]">Full Name *</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3 h-4 w-4 text-zinc-500" />
                      <input
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your full name"
                        className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] py-2.5 pl-10 pr-3 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-[#A1A1AA]">
                      Valid Email (Optional if Phone given)
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-3 h-4 w-4 text-zinc-500" />
                      <input
                        type="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] py-2.5 pl-10 pr-3 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-[#A1A1AA]">
                      Valid Phone (BD 017... / +8801... — Optional if Email given)
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-3 h-4 w-4 text-zinc-500" />
                      <input
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value)}
                        placeholder="01711889900"
                        className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] py-2.5 pl-10 pr-3 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="mb-1 block text-xs text-[#A1A1AA]">Email or Phone Number</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 h-4 w-4 text-zinc-500" />
                    <input
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="name@example.com or 01711889900"
                      className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] py-2.5 pl-10 pr-3 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs text-[#A1A1AA]">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 h-4 w-4 text-zinc-500" />
                  <input
                    type="password"
                    required
                    minLength={mode === 'register' ? 6 : 1}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] py-2.5 pl-10 pr-3 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-[#3B82F6] py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Workspace'}
              </button>
            </form>

            {mode === 'login' && (
              <div className="mt-4 flex items-center justify-between rounded-xl border border-[#26262B] bg-[#0A0A0B] p-3 text-xs text-[#A1A1AA]">
                <div>
                  Admin Demo: <span className="font-medium text-white">demo@hisabpro.app</span> /{' '}
                  <span className="font-medium text-white">Demo@1234</span>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Admin-Approved Password Reset Flow */
          <div className="space-y-4">
            <div className="rounded-xl border border-[#1E3A6E] bg-[#0F1E3A] p-3 text-xs text-blue-200">
              <div className="flex items-center gap-1.5 font-semibold text-white">
                <KeyRound className="h-4 w-4 text-[#3B82F6]" />
                Admin-Approved Password Reset
              </div>
              <p className="mt-1 text-[11px] text-blue-200/80">
                Submit a request with your registered Email or Phone. Once Admin approves it in the CRM, you can immediately set a new password here.
              </p>
            </div>

            <form onSubmit={submitResetRequest} className="space-y-3 text-xs">
              <div>
                <label className="mb-1 block text-[#A1A1AA]">Registered Email or Phone *</label>
                <input
                  required
                  value={resetId}
                  onChange={(e) => setResetId(e.target.value)}
                  placeholder="name@example.com or 01711889900"
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3.5 py-2.5 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-[#A1A1AA]">Note for Admin (Optional)</label>
                <input
                  value={resetReason}
                  onChange={(e) => setResetReason(e.target.value)}
                  placeholder="e.g. Forgot password after changing phone"
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3.5 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-xl bg-[#3B82F6] py-2.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  Request Approval
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={checkResetStatus}
                  className="rounded-xl border border-[#26262B] bg-[#0A0A0B] py-2.5 font-semibold text-zinc-200 hover:border-[#3B82F6]"
                >
                  Check Status
                </button>
              </div>
            </form>

            {resetStatus && (
              <div className="space-y-3 rounded-xl border border-[#26262B] bg-[#0A0A0B] p-4">
                {resetStatus.status === 'PENDING' && (
                  <div className="flex items-start gap-2.5 text-xs text-amber-300">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]" />
                    <div>
                      <div className="font-bold">Waiting for Admin Approval</div>
                      <p className="mt-0.5 text-amber-200/80">
                        Your request is in the Admin queue. Tap &ldquo;Check Status&rdquo; once approved.
                      </p>
                    </div>
                  </div>
                )}

                {(resetStatus.status === 'REJECTED' || resetStatus.status === 'EXPIRED') && (
                  <div className="flex items-start gap-2.5 text-xs text-rose-300">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#F43F5E]" />
                    <div>
                      <div className="font-bold">Request {resetStatus.status}</div>
                      {resetStatus.adminNote && (
                        <p className="mt-0.5 text-rose-200/80">Admin note: {resetStatus.adminNote}</p>
                      )}
                    </div>
                  </div>
                )}

                {resetStatus.status === 'COMPLETED' && (
                  <div className="flex items-center gap-2 text-xs text-[#10B981]">
                    <CheckCircle2 className="h-4 w-4" />
                    Last password reset was completed. Submit a new request if needed.
                  </div>
                )}

                {resetStatus.status === 'APPROVED' && (
                  <form onSubmit={completePasswordReset} className="space-y-3 text-xs">
                    <div className="flex items-center gap-2 font-bold text-[#10B981]">
                      <CheckCircle2 className="h-4 w-4" />
                      Approved by Admin! Set your new password below.
                    </div>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New Password (min 6 chars)"
                      className="w-full rounded-xl border border-[#26262B] bg-[#141417] px-3 py-2.5 text-white"
                    />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm New Password"
                      className="w-full rounded-xl border border-[#26262B] bg-[#141417] px-3 py-2.5 text-white"
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-xl bg-[#10B981] py-2.5 text-sm font-bold text-[#062B20]"
                    >
                      Save New Password
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

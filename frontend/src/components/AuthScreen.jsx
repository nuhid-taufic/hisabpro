import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, KeyRound, Lock, Mail, Phone, User, XCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useI18n } from '../context/I18nContext';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export default function AuthScreen({ onAuthenticated, notify }) {
  const { lang, setLanguage, t } = useI18n();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [resetId, setResetId] = useState('');
  const [resetReason, setResetReason] = useState('');
  const [resetStatus, setResetStatus] = useState(null);
  const [approvalCode, setApprovalCode] = useState('');
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
            notify(`Signed in as ${res.user.name}`);
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
        notify(lang === 'bn' ? `স্বাগতম, ${res.user.name}` : `Welcome back, ${res.user.name}`);
        onAuthenticated(res.user);
      } else {
        if (!regEmail.trim() && !regPhone.trim()) {
          notify(
            lang === 'bn'
              ? 'অন্তত একটি সঠিক ইমেইল বা ফোন নম্বর দিন।'
              : 'Please enter a valid Email or Phone number.',
            true
          );
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
            preferredLanguage: lang,
          }),
        });
        notify(lang === 'bn' ? `অ্যাকাউন্ট তৈরি হয়েছে, ${res.user.name}` : `Welcome, ${res.user.name}`);
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
        body: JSON.stringify({ identifier: resetId, approvalCode, newPassword }),
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
        <div className="mb-5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3B82F6] text-lg font-bold text-white">
              H
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#FAFAFA]">HisabPro</h1>
              <p className="text-xs text-[#A1A1AA]">{t('appTagline')}</p>
            </div>
          </div>

          <div className="flex rounded-lg border border-[#26262B] bg-[#0A0A0B] p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setLanguage('en', false)}
              className={`rounded-md px-2 py-1 font-semibold ${
                lang === 'en' ? 'bg-[#3B82F6] text-white' : 'text-[#A1A1AA]'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLanguage('bn', false)}
              className={`rounded-md px-2 py-1 font-semibold ${
                lang === 'bn' ? 'bg-[#10B981] text-[#062B20]' : 'text-[#A1A1AA]'
              }`}
            >
              বাংলা
            </button>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-3 rounded-xl border border-[#26262B] bg-[#0A0A0B] p-1">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`rounded-lg py-2 text-xs font-semibold ${
              mode === 'login' ? 'bg-[#1C1C21] text-white' : 'text-[#A1A1AA]'
            }`}
          >
            {t('signIn')}
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
            {t('createAccount')}
          </button>
          <button
            type="button"
            onClick={() => setMode('reset')}
            className={`rounded-lg py-2 text-xs font-semibold ${
              mode === 'reset' ? 'bg-[#1C1C21] text-white' : 'text-[#A1A1AA]'
            }`}
          >
            {t('resetPass')}
          </button>
        </div>

        {mode !== 'reset' ? (
          <>
            {GOOGLE_CLIENT_ID && (
              <div className="mb-4">
                <div ref={googleBtnRef} className="flex justify-center overflow-hidden rounded-xl" />
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-3.5">
              {mode === 'register' ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs text-[#A1A1AA]">{t('fullName')} *</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3 h-4 w-4 text-zinc-500" />
                      <input
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t('fullName')}
                        className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] py-2.5 pl-10 pr-3 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-[#A1A1AA]">{t('validEmailOpt')}</label>
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
                    <label className="mb-1 block text-xs text-[#A1A1AA]">{t('validPhoneOpt')}</label>
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
                  <label className="mb-1 block text-xs text-[#A1A1AA]">{t('emailOrPhone')}</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 h-4 w-4 text-zinc-500" />
                    <input
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="name@example.com / 01711889900"
                      className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] py-2.5 pl-10 pr-3 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs text-[#A1A1AA]">{t('password')}</label>
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
                {loading ? t('pleaseWait') : mode === 'login' ? t('signIn') : t('createWorkspace')}
              </button>
            </form>
          </>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#1E3A6E] bg-[#0F1E3A] p-3 text-xs text-blue-200">
              <div className="flex items-center gap-1.5 font-semibold text-white">
                <KeyRound className="h-4 w-4 text-[#3B82F6]" />
                {t('adminResetTitle')}
              </div>
              <p className="mt-1 text-[11px] text-blue-200/80">{t('adminResetDesc')}</p>
            </div>

            <form onSubmit={submitResetRequest} className="space-y-3 text-xs">
              <div>
                <label className="mb-1 block text-[#A1A1AA]">{t('emailOrPhone')} *</label>
                <input
                  required
                  value={resetId}
                  onChange={(e) => setResetId(e.target.value)}
                  placeholder="name@example.com / 01711889900"
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3.5 py-2.5 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
                />
              </div>
              <input
                value={resetReason}
                onChange={(e) => setResetReason(e.target.value)}
                placeholder={lang === 'bn' ? 'অ্যাডমিনের জন্য নোট (ঐচ্ছিক)' : 'Note for Admin (optional)'}
                className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3.5 py-2 text-white"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-xl bg-[#3B82F6] py-2.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {t('requestApproval')}
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={checkResetStatus}
                  className="rounded-xl border border-[#26262B] bg-[#0A0A0B] py-2.5 font-semibold text-zinc-200 hover:border-[#3B82F6]"
                >
                  {t('checkStatus')}
                </button>
              </div>
            </form>

            {resetStatus && (
              <div className="space-y-3 rounded-xl border border-[#26262B] bg-[#0A0A0B] p-4">
                {resetStatus.status === 'PENDING' && (
                  <div className="flex items-start gap-2.5 text-xs text-amber-300">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]" />
                    <div className="font-bold">{t('pendingApproval')}</div>
                  </div>
                )}

                {(resetStatus.status === 'REJECTED' || resetStatus.status === 'EXPIRED') && (
                  <div className="flex items-start gap-2.5 text-xs text-rose-300">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#F43F5E]" />
                    <div>
                      <div className="font-bold">{resetStatus.status}</div>
                      {resetStatus.adminNote && <p className="mt-0.5">{resetStatus.adminNote}</p>}
                    </div>
                  </div>
                )}

                {resetStatus.status === 'APPROVED' && (
                  <form onSubmit={completePasswordReset} className="space-y-3 text-xs">
                    <div className="flex items-center gap-2 font-bold text-[#10B981]">
                      <CheckCircle2 className="h-4 w-4" />
                      {t('approvedSetNew')}
                    </div>
                    <input
                      required
                      value={approvalCode}
                      onChange={(e) => setApprovalCode(e.target.value.toUpperCase())}
                      placeholder="6-Digit Admin Approval Code (e.g. A1B2C3)"
                      className="w-full rounded-xl border border-[#10B981]/50 bg-[#141417] px-3 py-2.5 font-mono uppercase tracking-widest text-white"
                    />
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={t('newPassword')}
                      className="w-full rounded-xl border border-[#26262B] bg-[#141417] px-3 py-2.5 text-white"
                    />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t('confirmNewPassword')}
                      className="w-full rounded-xl border border-[#26262B] bg-[#141417] px-3 py-2.5 text-white"
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-xl bg-[#10B981] py-2.5 text-sm font-bold text-[#062B20]"
                    >
                      {t('completeReset')}
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

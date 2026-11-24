import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, Globe, KeyRound, Save, ShieldCheck, User } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useI18n } from '../context/I18nContext';

export default function SettingsView({ user, onUserUpdated, notify }) {
  const { lang, setLanguage, t } = useI18n();
  const [name, setName] = useState(user?.name || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [secTab, setSecTab] = useState('change');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [approvalCode, setApprovalCode] = useState('');
  const [reason, setReason] = useState('');
  const [resetStatus, setResetStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const userIdentifier = user?.email || user?.phone || '';

  const checkResetStatus = useCallback(async () => {
    if (!userIdentifier) return;
    try {
      const res = await apiFetch('/auth/password-reset/status', {
        method: 'POST',
        body: JSON.stringify({ identifier: userIdentifier }),
      });
      setResetStatus(res.request || null);
    } catch {
      // ignore
    }
  }, [userIdentifier]);

  useEffect(() => {
    setName(user?.name || '');
    checkResetStatus();
  }, [user, checkResetStatus]);

  async function handleLanguageSelect(nextLang) {
    await setLanguage(nextLang, true);
    onUserUpdated?.({ ...user, preferredLanguage: nextLang });
    notify(nextLang === 'bn' ? 'ভাষা বাংলায় পরিবর্তন হয়েছে।' : 'Language switched to English.');
  }

  async function handleProfileSave(e) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await apiFetch('/auth/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim() }),
      });
      onUserUpdated?.(res.user);
      notify(lang === 'bn' ? 'প্রোফাইল আপডেট হয়েছে।' : 'Profile updated.');
    } catch (err) {
      notify(err.message, true);
    } finally {
      setSavingProfile(false);
    }
  }

  async function submitDirectChange(e) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      notify(lang === 'bn' ? 'পাসওয়ার্ড দুটি মেলেনি।' : 'Passwords do not match.', true);
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: user.hasPassword ? currentPassword : undefined,
          newPassword,
        }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      notify(res.message);
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function submitAdminResetRequest(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiFetch('/auth/password-reset/request', {
        method: 'POST',
        body: JSON.stringify({
          identifier: userIdentifier,
          reason: reason.trim() || 'Requested password reset from personal settings',
        }),
      });
      setResetStatus(res.request);
      setReason('');
      notify(res.message);
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function submitApprovedReset(e) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      notify(lang === 'bn' ? 'পাসওয়ার্ড দুটি মেলেনি।' : 'Passwords do not match.', true);
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch('/auth/password-reset/complete', {
        method: 'POST',
        body: JSON.stringify({ identifier: userIdentifier, approvalCode, newPassword }),
      });
      setNewPassword('');
      setConfirmPassword('');
      await checkResetStatus();
      notify(res.message);
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">{t('settingsTitle')}</h1>
        <p className="text-xs text-[#A1A1AA]">{t('settingsSub')}</p>
      </div>

      {/* Language Switcher Card */}
      <section className="rounded-2xl border border-[#26262B] bg-[#141417] p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0F1E3A] text-[#3B82F6]">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">{t('languageSection')}</h2>
            <p className="text-xs text-[#A1A1AA]">{t('languageSub')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => handleLanguageSelect('en')}
            className={`flex items-center justify-between rounded-xl border p-4 text-left transition ${
              lang === 'en'
                ? 'border-[#3B82F6] bg-[#0F1E3A] text-white'
                : 'border-[#26262B] bg-[#0A0A0B] text-zinc-300 hover:border-zinc-700'
            }`}
          >
            <div>
              <div className="text-sm font-bold">English</div>
              <div className="text-xs text-[#A1A1AA]">Default International English UI</div>
            </div>
            {lang === 'en' && <CheckCircle2 className="h-5 w-5 text-[#3B82F6]" />}
          </button>

          <button
            type="button"
            onClick={() => handleLanguageSelect('bn')}
            className={`flex items-center justify-between rounded-xl border p-4 text-left transition ${
              lang === 'bn'
                ? 'border-[#10B981] bg-[#062B20] text-white'
                : 'border-[#26262B] bg-[#0A0A0B] text-zinc-300 hover:border-zinc-700'
            }`}
          >
            <div>
              <div className="text-sm font-bold">বাংলা (Bangla)</div>
              <div className="text-xs text-[#A1A1AA]">সম্পূর্ণ বাংলা ইন্টারফেস</div>
            </div>
            {lang === 'bn' && <CheckCircle2 className="h-5 w-5 text-[#10B981]" />}
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Profile Info */}
        <form
          onSubmit={handleProfileSave}
          className="h-fit space-y-4 rounded-2xl border border-[#26262B] bg-[#141417] p-5 text-xs"
        >
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <User className="h-4 w-4 text-[#3B82F6]" />
            {t('profileSection')}
          </h2>
          <div>
            <label className="mb-1 block text-[#A1A1AA]">{t('fullName')}</label>
            <input
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2.5 text-sm text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[#26262B] bg-[#0A0A0B] p-3">
              <div className="text-[10px] uppercase text-zinc-500">Email</div>
              <div className="mt-0.5 truncate font-semibold text-white">{user?.email || '—'}</div>
            </div>
            <div className="rounded-xl border border-[#26262B] bg-[#0A0A0B] p-3">
              <div className="text-[10px] uppercase text-zinc-500">Phone</div>
              <div className="mt-0.5 truncate font-semibold text-white">{user?.phone || '—'}</div>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2.5">
            <span className="text-[#A1A1AA]">Plan / Role</span>
            <span className="font-bold text-[#3B82F6]">
              {user?.plan || 'FREE'} • {user?.role}
            </span>
          </div>
          <button
            type="submit"
            disabled={savingProfile}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#3B82F6] py-2.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {t('saveProfile')}
          </button>
        </form>

        {/* Password & Admin-Approved Reset */}
        <div className="space-y-4 rounded-2xl border border-[#26262B] bg-[#141417] p-5 text-xs">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <ShieldCheck className="h-4 w-4 text-[#10B981]" />
            {t('passwordSecurity')}
          </h2>

          <div className="grid grid-cols-2 rounded-xl border border-[#26262B] bg-[#0A0A0B] p-1">
            <button
              type="button"
              onClick={() => setSecTab('change')}
              className={`rounded-lg py-2 font-semibold ${
                secTab === 'change' ? 'bg-[#1C1C21] text-white' : 'text-[#A1A1AA]'
              }`}
            >
              {t('changePasswordTab')}
            </button>
            <button
              type="button"
              onClick={() => setSecTab('request')}
              className={`rounded-lg py-2 font-semibold ${
                secTab === 'request' ? 'bg-[#1C1C21] text-white' : 'text-[#A1A1AA]'
              }`}
            >
              {t('adminResetTab')}
            </button>
          </div>

          {secTab === 'change' ? (
            <form onSubmit={submitDirectChange} className="space-y-3">
              {user?.hasPassword && (
                <div>
                  <label className="mb-1 block text-[#A1A1AA]">{t('currentPassword')} *</label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2.5 text-white"
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-[#A1A1AA]">{t('newPassword')} *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2.5 text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[#A1A1AA]">{t('confirmNewPassword')} *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2.5 text-white"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-[#3B82F6] py-2.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {t('updatePassword')}
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              {resetStatus?.status === 'APPROVED' ? (
                <form
                  onSubmit={submitApprovedReset}
                  className="space-y-3 rounded-xl border border-[#0D4D39] bg-[#062B20]/40 p-3.5"
                >
                  <div className="flex items-center gap-1.5 font-bold text-[#10B981]">
                    <CheckCircle2 className="h-4 w-4" />
                    {t('approvedSetNew')}
                  </div>
                  <input
                    required
                    value={approvalCode}
                    onChange={(e) => setApprovalCode(e.target.value.toUpperCase())}
                    placeholder="6-Digit Admin Approval Code"
                    className="w-full rounded-xl border border-[#10B981]/50 bg-[#0A0A0B] px-3 py-2 font-mono uppercase tracking-widest text-white"
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('newPassword')}
                    className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('confirmNewPassword')}
                    className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-xl bg-[#10B981] py-2.5 font-bold text-[#062B20]"
                  >
                    {t('completeReset')}
                  </button>
                </form>
              ) : resetStatus?.status === 'PENDING' ? (
                <div className="rounded-xl border border-[#573C0C] bg-[#2B1E06] p-3.5 text-amber-200">
                  <div className="flex items-center gap-1.5 font-bold text-[#F59E0B]">
                    <Clock className="h-4 w-4" />
                    {t('pendingApproval')}
                  </div>
                  <button
                    type="button"
                    onClick={checkResetStatus}
                    className="mt-2 rounded-lg border border-[#F59E0B]/40 px-3 py-1 text-[11px] font-semibold"
                  >
                    {t('checkStatus')}
                  </button>
                </div>
              ) : (
                <form onSubmit={submitAdminResetRequest} className="space-y-3">
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={lang === 'bn' ? 'রিসেট করার কারণ (ঐচ্ছিক)' : 'Reason for reset (optional)'}
                    className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2.5 text-white"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#3B82F6] py-2.5 font-semibold text-white"
                  >
                    <KeyRound className="h-4 w-4" />
                    {t('sendResetToAdmin')}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

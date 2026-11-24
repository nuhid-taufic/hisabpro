import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, KeyRound, ShieldCheck, X } from 'lucide-react';
import { apiFetch } from '../lib/api';

export default function AccountSecurityModal({ open, onClose, user, notify }) {
  const [subTab, setSubTab] = useState('change');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [reason, setReason] = useState('');
  const [resetStatus, setResetStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const userIdentifier = user?.email || user?.phone || '';

  const checkStatus = useCallback(async () => {
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
    if (open) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      checkStatus();
    }
  }, [open, checkStatus]);

  if (!open || !user) return null;

  async function submitDirectChange(e) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      notify('New passwords do not match.', true);
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
      notify(res.message);
      onClose();
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
          reason: reason.trim() || 'Requested password reset from personal account',
        }),
      });
      setResetStatus(res.request);
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
      notify('New passwords do not match.', true);
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch('/auth/password-reset/complete', {
        method: 'POST',
        body: JSON.stringify({ identifier: userIdentifier, newPassword }),
      });
      notify(res.message);
      onClose();
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#26262B] bg-[#141417] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#3B82F6]" />
            <div>
              <h3 className="text-sm font-bold text-white">Account Security &amp; Password</h3>
              <p className="text-[11px] text-[#A1A1AA]">{user.email || user.phone}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 rounded-xl border border-[#26262B] bg-[#0A0A0B] p-1 text-xs">
          <button
            onClick={() => setSubTab('change')}
            className={`rounded-lg py-2 font-semibold ${
              subTab === 'change' ? 'bg-[#1C1C21] text-white' : 'text-[#A1A1AA]'
            }`}
          >
            Change Password
          </button>
          <button
            onClick={() => setSubTab('request')}
            className={`rounded-lg py-2 font-semibold ${
              subTab === 'request' ? 'bg-[#1C1C21] text-white' : 'text-[#A1A1AA]'
            }`}
          >
            Admin Reset Request
          </button>
        </div>

        {subTab === 'change' ? (
          <form onSubmit={submitDirectChange} className="space-y-3 text-xs">
            {user.hasPassword && (
              <div>
                <label className="mb-1 block text-[#A1A1AA]">Current Password *</label>
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
              <label className="mb-1 block text-[#A1A1AA]">New Password (min 6 chars) *</label>
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
              <label className="mb-1 block text-[#A1A1AA]">Confirm New Password *</label>
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
              className="w-full rounded-xl bg-[#3B82F6] py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {busy ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        ) : (
          <div className="space-y-3 text-xs">
            <p className="text-[#A1A1AA]">
              Forgot your current password? Send a reset request to Admin. Once Admin approves, you can set a new password right here.
            </p>

            {resetStatus?.status === 'APPROVED' ? (
              <form
                onSubmit={submitApprovedReset}
                className="space-y-3 rounded-xl border border-[#0D4D39] bg-[#062B20]/40 p-3.5"
              >
                <div className="flex items-center gap-1.5 font-bold text-[#10B981]">
                  <CheckCircle2 className="h-4 w-4" />
                  Approved by Admin! Enter your new password:
                </div>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New Password"
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm New Password"
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-[#10B981] py-2.5 font-bold text-[#062B20]"
                >
                  Complete Password Reset
                </button>
              </form>
            ) : resetStatus?.status === 'PENDING' ? (
              <div className="rounded-xl border border-[#573C0C] bg-[#2B1E06] p-3.5 text-amber-200">
                <div className="flex items-center gap-1.5 font-bold text-[#F59E0B]">
                  <Clock className="h-4 w-4" />
                  Request Pending Admin Approval
                </div>
                <button
                  type="button"
                  onClick={checkStatus}
                  className="mt-2 rounded-lg border border-[#F59E0B]/40 px-3 py-1 text-[11px] font-semibold text-amber-200"
                >
                  Refresh Status
                </button>
              </div>
            ) : (
              <form onSubmit={submitAdminResetRequest} className="space-y-3">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for password reset (optional)"
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2.5 text-white"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#3B82F6] py-2.5 font-semibold text-white"
                >
                  <KeyRound className="h-4 w-4" />
                  Send Password Reset Request to Admin
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

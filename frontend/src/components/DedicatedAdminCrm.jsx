import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Ban,
  CheckCircle2,
  Download,
  Globe,
  KeyRound,
  LayoutDashboard,
  LogIn,
  LogOut,
  Megaphone,
  Save,
  Search,
  Settings,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { API_BASE, apiFetch, fmtDate, fmtTk, getInitials } from '../lib/api';
import { useI18n } from '../context/I18nContext';
import SettingsView from './SettingsView';

const STAGES = ['LEAD', 'ONBOARDING', 'ACTIVE_USER', 'VIP', 'CHURNED'];
const PLANS = ['FREE', 'PRO', 'BUSINESS'];

export default function DedicatedAdminCrm({
  currentUser,
  onUserUpdated,
  onImpersonate,
  onLogout,
  notify,
}) {
  const { lang, setLanguage, t } = useI18n();
  const [section, setSection] = useState('overview'); // 'overview' | 'users' | 'resets' | 'broadcasts' | 'audit' | 'settings'
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [resetRequests, setResetRequests] = useState([]);
  const [announcements, setAnnouncements] = useState([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [planFilter, setPlanFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);

  const [editForm, setEditForm] = useState({
    role: 'USER',
    status: 'ACTIVE',
    plan: 'FREE',
    crmStage: 'ACTIVE_USER',
    preferredLanguage: 'en',
    crmNotes: '',
  });
  const [saving, setSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'USER',
    plan: 'FREE',
    crmStage: 'ONBOARDING',
    preferredLanguage: 'en',
    crmNotes: '',
  });

  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const [annForm, setAnnForm] = useState({
    title: '',
    message: '',
    type: 'INFO',
    targetPlan: 'ALL',
    expiresInHours: '48',
  });

  const loadAllAdmin = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (planFilter !== 'ALL') params.set('plan', planFilter);
      if (roleFilter !== 'ALL') params.set('role', roleFilter);

      const [ovRes, uRes, rrRes, anRes] = await Promise.all([
        apiFetch('/admin/overview'),
        apiFetch(`/admin/users?${params.toString()}`),
        apiFetch('/admin/reset-requests'),
        apiFetch('/admin/announcements'),
      ]);
      setOverview(ovRes);
      const list = uRes.users || [];
      setUsers(list);
      setResetRequests(rrRes.requests || []);
      setAnnouncements(anRes.announcements || []);
      setSelectedId((prev) => {
        if (prev && list.some((u) => u.id === prev)) return prev;
        return list[0]?.id || null;
      });
    } catch (err) {
      notify(err.message, true);
    }
  }, [search, statusFilter, planFilter, roleFilter, notify]);

  const loadUserDetail = useCallback(
    async (id) => {
      if (!id) {
        setDetail(null);
        return;
      }
      try {
        const res = await apiFetch(`/admin/users/${id}`);
        setDetail(res);
        setEditForm({
          role: res.user.role,
          status: res.user.status,
          plan: res.user.plan,
          crmStage: res.user.crmStage,
          preferredLanguage: res.user.preferredLanguage || 'en',
          crmNotes: res.user.crmNotes || '',
        });
      } catch (err) {
        notify(err.message, true);
      }
    },
    [notify]
  );

  useEffect(() => {
    loadAllAdmin();
  }, [loadAllAdmin]);

  useEffect(() => {
    loadUserDetail(selectedId);
  }, [selectedId, loadUserDetail]);

  async function saveControlChanges(e) {
    e.preventDefault();
    if (!detail?.user) return;
    setSaving(true);
    try {
      await apiFetch(`/admin/users/${detail.user.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      notify(`Updated ${detail.user.name}`);
      await Promise.all([loadAllAdmin(), loadUserDetail(detail.user.id)]);
    } catch (err) {
      notify(err.message, true);
    } finally {
      setSaving(false);
    }
  }

  async function quickStatusChange(status) {
    if (!detail?.user) return;
    try {
      await apiFetch(`/admin/users/${detail.user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      notify(`${detail.user.name} -> ${status}`);
      await Promise.all([loadAllAdmin(), loadUserDetail(detail.user.id)]);
    } catch (err) {
      notify(err.message, true);
    }
  }

  async function handleImpersonate() {
    if (!detail?.user) return;
    try {
      const res = await apiFetch(`/admin/users/${detail.user.id}/impersonate`, { method: 'POST' });
      notify(`Viewing workspace as ${res.user.name}`);
      await onImpersonate(res.user, res.impersonation);
    } catch (err) {
      notify(err.message, true);
    }
  }

  async function forceLogout() {
    if (!detail?.user) return;
    try {
      const res = await apiFetch(`/admin/users/${detail.user.id}/force-logout`, { method: 'POST' });
      notify(res.message);
      loadAllAdmin();
    } catch (err) {
      notify(err.message, true);
    }
  }

  async function submitResetPassword(e) {
    e.preventDefault();
    if (!detail?.user) return;
    try {
      const res = await apiFetch(`/admin/users/${detail.user.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
      });
      notify(res.message);
      setNewPassword('');
      setResetOpen(false);
      loadAllAdmin();
    } catch (err) {
      notify(err.message, true);
    }
  }

  async function deleteUser() {
    if (!detail?.user) return;
    if (!window.confirm(`Permanently delete ${detail.user.name} and ALL their data?`)) return;
    try {
      const res = await apiFetch(`/admin/users/${detail.user.id}`, { method: 'DELETE' });
      notify(res.message);
      setSelectedId(null);
      loadAllAdmin();
    } catch (err) {
      notify(err.message, true);
    }
  }

  async function submitCreateUser(e) {
    e.preventDefault();
    try {
      const res = await apiFetch('/admin/users', {
        method: 'POST',
        body: JSON.stringify(newUser),
      });
      notify(`Created user ${res.user.name}`);
      setNewUser({
        name: '',
        email: '',
        phone: '',
        password: '',
        role: 'USER',
        plan: 'FREE',
        crmStage: 'ONBOARDING',
        preferredLanguage: 'en',
        crmNotes: '',
      });
      setCreateOpen(false);
      await loadAllAdmin();
      setSelectedId(res.user.id);
      setSection('users');
    } catch (err) {
      notify(err.message, true);
    }
  }

  async function exportUsersCsv() {
    try {
      const res = await fetch(`${API_BASE}/admin/users/export`, { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hisabpro-crm-users-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify('Exported CRM Users CSV.');
    } catch (err) {
      notify(err.message, true);
    }
  }

  async function handleReviewReset(reqId, action) {
    const adminNote =
      action === 'reject' ? window.prompt('Optional rejection note:') || undefined : undefined;
    try {
      await apiFetch(`/admin/reset-requests/${reqId}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ adminNote }),
      });
      notify(`Password reset request ${action === 'approve' ? 'APPROVED' : 'REJECTED'}.`);
      loadAllAdmin();
    } catch (err) {
      notify(err.message, true);
    }
  }

  async function submitAnnouncement(e) {
    e.preventDefault();
    try {
      await apiFetch('/admin/announcements', {
        method: 'POST',
        body: JSON.stringify({ ...annForm, expiresInHours: Number(annForm.expiresInHours) || 0 }),
      });
      notify('Broadcast published!');
      setAnnForm({ title: '', message: '', type: 'INFO', targetPlan: 'ALL', expiresInHours: '48' });
      loadAllAdmin();
    } catch (err) {
      notify(err.message, true);
    }
  }

  async function toggleAnnouncement(id, isActive) {
    await apiFetch(`/admin/announcements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !isActive }),
    });
    loadAllAdmin();
  }

  async function deleteAnnouncement(id) {
    await apiFetch(`/admin/announcements/${id}`, { method: 'DELETE' });
    notify('Announcement deleted.');
    loadAllAdmin();
  }

  const stats = overview?.stats;
  const crmNav = [
    { id: 'overview', label: t('crmNavOverview'), icon: LayoutDashboard },
    { id: 'users', label: t('crmNavUsers'), icon: Users, badge: stats?.totalUsers },
    { id: 'resets', label: t('crmNavResets'), icon: KeyRound, alertBadge: stats?.pendingResetCount },
    { id: 'broadcasts', label: t('crmNavBroadcasts'), icon: Megaphone, badge: stats?.activeAnnouncementsCount },
    { id: 'audit', label: t('crmNavAudit'), icon: Activity },
    { id: 'settings', label: t('crmNavSettings'), icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#FAFAFA] flex flex-col md:flex-row">
      {/* Dedicated CRM Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-[#26262B] bg-[#141417] p-4 sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#3B82F6] text-white">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">{t('crmTitle')}</div>
            <div className="text-[11px] text-[#10B981] font-semibold">{currentUser.role}</div>
          </div>
        </div>

        {/* Quick Language Switch Pill */}
        <div className="mt-4 grid grid-cols-2 rounded-xl border border-[#26262B] bg-[#0A0A0B] p-1 text-xs">
          <button
            onClick={() => setLanguage('en', true)}
            className={`rounded-lg py-1.5 font-semibold ${
              lang === 'en' ? 'bg-[#3B82F6] text-white' : 'text-[#A1A1AA]'
            }`}
          >
            English
          </button>
          <button
            onClick={() => setLanguage('bn', true)}
            className={`rounded-lg py-1.5 font-semibold ${
              lang === 'bn' ? 'bg-[#10B981] text-[#062B20]' : 'text-[#A1A1AA]'
            }`}
          >
            বাংলা
          </button>
        </div>

        <nav className="mt-5 flex-1 space-y-1">
          {crmNav.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'border border-[#26262B] bg-[#1C1C21] text-white'
                    : 'text-[#A1A1AA] hover:bg-[#1C1C21]/50 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className={`h-4 w-4 ${active ? 'text-[#3B82F6]' : ''}`} />
                  {item.label}
                </span>
                {item.alertBadge > 0 ? (
                  <span className="rounded-full bg-[#F59E0B] px-2 py-0.5 text-[10px] font-bold text-black">
                    {item.alertBadge}
                  </span>
                ) : item.badge !== undefined ? (
                  <span className="text-[11px] text-zinc-500 tabular-nums">{item.badge}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center justify-between border-t border-[#26262B] px-2 pt-3">
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-white">{currentUser.name}</div>
            <div className="truncate text-[11px] text-zinc-500">{currentUser.email}</div>
          </div>
          <button
            onClick={onLogout}
            title={t('signOut')}
            className="rounded-lg p-2 text-zinc-400 hover:bg-[#1C1C21] hover:text-[#F43F5E]"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Main Dedicated CRM Area */}
      <div className="flex-1 min-w-0 pb-20 md:pb-8">
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between border-b border-[#26262B] bg-[#141417] px-4 py-3">
          <div className="flex items-center gap-2 font-bold text-sm text-white">
            <Shield className="h-4 w-4 text-[#3B82F6]" />
            {t('crmTitle')}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLanguage(lang === 'en' ? 'bn' : 'en', true)}
              className="inline-flex items-center gap-1 rounded-lg border border-[#26262B] bg-[#0A0A0B] px-2.5 py-1 text-xs font-semibold text-white"
            >
              <Globe className="h-3.5 w-3.5 text-[#3B82F6]" />
              {lang === 'en' ? 'বাংলা' : 'EN'}
            </button>
            <button onClick={onLogout} className="text-xs text-[#F43F5E] font-semibold">
              {t('signOut')}
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
          {/* SECTION 1: CRM OVERVIEW */}
          {section === 'overview' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-white">{t('crmTitle')}</h1>
                  <p className="text-xs text-[#A1A1AA]">{t('crmTagline')}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={exportUsersCsv}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#26262B] bg-[#141417] px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:border-[#3B82F6]"
                  >
                    <Download className="h-4 w-4" />
                    {t('crmExportCsv')}
                  </button>
                  <button
                    onClick={() => setCreateOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#3B82F6] px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                  >
                    <UserPlus className="h-4 w-4" />
                    {t('crmAddUser')}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-[#26262B] bg-[#141417] p-4">
                  <div className="text-[10px] font-bold uppercase text-[#A1A1AA]">{t('crmTotalUsers')}</div>
                  <div className="mt-1 text-2xl font-bold text-white tabular-nums">{stats?.totalUsers ?? 0}</div>
                </div>
                <div className="rounded-xl border border-[#0D4D39] bg-[#062B20]/40 p-4">
                  <div className="text-[10px] font-bold uppercase text-[#10B981]">{t('crmActiveUsers')}</div>
                  <div className="mt-1 text-2xl font-bold text-white tabular-nums">{stats?.activeUsers ?? 0}</div>
                </div>
                <div className="rounded-xl border border-[#5A1627] bg-[#310B15]/40 p-4">
                  <div className="text-[10px] font-bold uppercase text-[#F43F5E]">{t('crmRestricted')}</div>
                  <div className="mt-1 text-2xl font-bold text-white tabular-nums">
                    {(stats?.suspendedUsers ?? 0) + (stats?.bannedUsers ?? 0)}
                  </div>
                </div>
                <button
                  onClick={() => setSection('resets')}
                  className="rounded-xl border border-[#573C0C] bg-[#2B1E06]/40 p-4 text-left hover:border-[#F59E0B]"
                >
                  <div className="text-[10px] font-bold uppercase text-[#F59E0B]">{t('crmPendingResets')}</div>
                  <div className="mt-1 text-2xl font-bold text-white tabular-nums">
                    {stats?.pendingResetCount ?? 0}
                  </div>
                </button>
                <div className="rounded-xl border border-[#26262B] bg-[#141417] p-4">
                  <div className="text-[10px] font-bold uppercase text-[#A1A1AA]">{t('crmGooglePaid')}</div>
                  <div className="mt-1 text-xl font-bold text-[#3B82F6] tabular-nums">
                    {stats?.googleUsers ?? 0} / {stats?.paidUsers ?? 0}
                  </div>
                </div>
                <div className="rounded-xl border border-[#26262B] bg-[#141417] p-4">
                  <div className="text-[10px] font-bold uppercase text-[#A1A1AA]">{t('crmTotalTx')}</div>
                  <div className="mt-1 text-xl font-bold text-white tabular-nums">
                    {stats?.totalTransactions ?? 0}
                  </div>
                </div>
                <div className="rounded-xl border border-[#26262B] bg-[#141417] p-4">
                  <div className="text-[10px] font-bold uppercase text-[#A1A1AA]">{t('crmStoreOrders')}</div>
                  <div className="mt-1 text-xl font-bold text-white tabular-nums">
                    {stats?.totalStoreOrders ?? 0}
                  </div>
                </div>
                <button
                  onClick={() => setSection('broadcasts')}
                  className="rounded-xl border border-[#1E3A6E] bg-[#0F1E3A]/60 p-4 text-left hover:border-[#3B82F6]"
                >
                  <div className="text-[10px] font-bold uppercase text-[#3B82F6]">{t('crmLiveBroadcasts')}</div>
                  <div className="mt-1 text-xl font-bold text-white tabular-nums">
                    {stats?.activeAnnouncementsCount ?? 0}
                  </div>
                </button>
              </div>

              <div className="rounded-2xl border border-[#26262B] bg-[#141417] p-5 space-y-2.5">
                <h2 className="text-sm font-bold text-white">{t('crmAuditTrail')}</h2>
                {!overview?.recentLogs?.length ? (
                  <p className="text-xs text-zinc-500">No admin activity recorded yet.</p>
                ) : (
                  overview.recentLogs.slice(0, 8).map((log) => (
                    <div
                      key={log.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#0A0A0B] px-3.5 py-2.5 text-xs"
                    >
                      <div>
                        <span className="rounded bg-[#0F1E3A] px-2 py-0.5 text-[10px] font-bold text-[#3B82F6]">
                          {log.action}
                        </span>
                        <span className="ml-2 font-semibold text-white">{log.targetEmail || 'Platform'}</span>
                        <span className="ml-2 text-[#A1A1AA]">{log.details}</span>
                      </div>
                      <span className="text-[11px] text-zinc-500">{fmtDate(log.createdAt)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* SECTION 2: FULL USER CONTROL */}
          {section === 'users' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-xl font-bold text-white">{t('crmNavUsers')}</h1>
                <div className="flex gap-2">
                  <button
                    onClick={exportUsersCsv}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#26262B] bg-[#141417] px-3 py-2 text-xs font-semibold text-zinc-200"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t('crmExportCsv')}
                  </button>
                  <button
                    onClick={() => setCreateOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#3B82F6] px-3.5 py-2 text-xs font-semibold text-white"
                  >
                    <UserPlus className="h-4 w-4" />
                    {t('crmAddUser')}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                <div className="space-y-3 lg:col-span-5">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t('crmSearchUsers')}
                      className="w-full rounded-xl border border-[#26262B] bg-[#141417] py-2 pl-9 pr-3 text-xs text-white focus:border-[#3B82F6] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="rounded-xl border border-[#26262B] bg-[#141417] px-2.5 py-2 text-white"
                    >
                      <option value="ALL">Status: All</option>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="SUSPENDED">SUSPENDED</option>
                      <option value="BANNED">BANNED</option>
                    </select>
                    <select
                      value={planFilter}
                      onChange={(e) => setPlanFilter(e.target.value)}
                      className="rounded-xl border border-[#26262B] bg-[#141417] px-2.5 py-2 text-white"
                    >
                      <option value="ALL">Plan: All</option>
                      {PLANS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <select
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value)}
                      className="rounded-xl border border-[#26262B] bg-[#141417] px-2.5 py-2 text-white"
                    >
                      <option value="ALL">Role: All</option>
                      <option value="USER">USER</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                    </select>
                  </div>

                  <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
                    {users.map((u) => {
                      const active = u.id === selectedId;
                      return (
                        <button
                          key={u.id}
                          onClick={() => setSelectedId(u.id)}
                          className={`flex w-full items-center justify-between rounded-xl border p-3.5 text-left transition ${
                            active
                              ? 'border-[#3B82F6] bg-[#1C1C21]'
                              : 'border-[#26262B] bg-[#141417] hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#26262B] bg-[#0A0A0B] text-xs font-bold text-white">
                              {getInitials(u.name)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-sm font-semibold text-white">{u.name}</span>
                                {u.role !== 'USER' && (
                                  <span className="rounded bg-[#0F1E3A] px-1.5 py-0.5 text-[9px] font-bold text-[#3B82F6]">
                                    {u.role}
                                  </span>
                                )}
                              </div>
                              <div className="truncate text-[11px] text-[#A1A1AA]">
                                {u.email || u.phone}
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                u.status === 'ACTIVE'
                                  ? 'bg-[#062B20] text-[#10B981]'
                                  : u.status === 'SUSPENDED'
                                    ? 'bg-[#2B1E06] text-[#F59E0B]'
                                    : 'bg-[#310B15] text-[#F43F5E]'
                              }`}
                            >
                              {u.status}
                            </span>
                            <div className="mt-1 text-[10px] text-zinc-500">
                              {u.plan} • {(u.preferredLanguage || 'en').toUpperCase()}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="lg:col-span-7">
                  {detail?.user ? (
                    <div className="space-y-5 rounded-2xl border border-[#26262B] bg-[#141417] p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-white">{detail.user.name}</h2>
                            <span className="rounded bg-[#0A0A0B] px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
                              {detail.user.authProvider}
                            </span>
                          </div>
                          <p className="text-xs text-[#A1A1AA]">
                            {detail.user.email || 'No email'} {detail.user.phone ? `• ${detail.user.phone}` : ''}
                          </p>
                          <p className="mt-1 text-[11px] text-zinc-500">
                            Joined {fmtDate(detail.user.createdAt)} • Last Login: {fmtDate(detail.user.lastLoginAt)}
                          </p>
                        </div>

                        {detail.user.id !== currentUser.id && (
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              onClick={handleImpersonate}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#3B82F6] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
                            >
                              <LogIn className="h-3.5 w-3.5" />
                              {t('crmLoginAsUser')}
                            </button>
                            {detail.user.status === 'ACTIVE' ? (
                              <>
                                <button
                                  onClick={() => quickStatusChange('SUSPENDED')}
                                  className="inline-flex items-center gap-1 rounded-lg border border-[#573C0C] bg-[#2B1E06] px-2.5 py-1.5 text-xs font-semibold text-[#F59E0B]"
                                >
                                  <Ban className="h-3.5 w-3.5" />
                                  {t('crmSuspend')}
                                </button>
                                <button
                                  onClick={() => quickStatusChange('BANNED')}
                                  className="inline-flex items-center gap-1 rounded-lg border border-[#5A1627] bg-[#310B15] px-2.5 py-1.5 text-xs font-semibold text-[#F43F5E]"
                                >
                                  {t('crmBan')}
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => quickStatusChange('ACTIVE')}
                                className="inline-flex items-center gap-1 rounded-lg border border-[#0D4D39] bg-[#062B20] px-2.5 py-1.5 text-xs font-semibold text-[#10B981]"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {t('crmActivate')}
                              </button>
                            )}
                            <button
                              onClick={forceLogout}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#26262B] bg-[#0A0A0B] px-2.5 py-1.5 text-xs font-semibold text-zinc-200"
                            >
                              <LogOut className="h-3.5 w-3.5" />
                              {t('crmForceLogout')}
                            </button>
                            <button
                              onClick={() => setResetOpen(true)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#26262B] bg-[#0A0A0B] px-2.5 py-1.5 text-xs font-semibold text-zinc-200"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              {t('crmSetPass')}
                            </button>
                            <button
                              onClick={deleteUser}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#5A1627] bg-[#310B15] px-2.5 py-1.5 text-xs font-semibold text-[#F43F5E]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {t('crmDeleteUser')}
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-4 gap-2.5 text-center">
                        <div className="rounded-xl bg-[#0A0A0B] p-3">
                          <div className="text-[10px] uppercase text-zinc-500">Wallets</div>
                          <div className="mt-0.5 text-base font-bold text-white tabular-nums">
                            {detail.user.wallets?.length ?? 0}
                          </div>
                        </div>
                        <div className="rounded-xl bg-[#0A0A0B] p-3">
                          <div className="text-[10px] uppercase text-zinc-500">Contacts</div>
                          <div className="mt-0.5 text-base font-bold text-white tabular-nums">
                            {detail.user._count?.contacts ?? 0}
                          </div>
                        </div>
                        <div className="rounded-xl bg-[#0A0A0B] p-3">
                          <div className="text-[10px] uppercase text-zinc-500">Entries</div>
                          <div className="mt-0.5 text-base font-bold text-white tabular-nums">
                            {detail.user._count?.transactions ?? 0}
                          </div>
                        </div>
                        <div className="rounded-xl bg-[#0A0A0B] p-3">
                          <div className="text-[10px] uppercase text-zinc-500">Orders</div>
                          <div className="mt-0.5 text-base font-bold text-white tabular-nums">
                            {detail.user._count?.stockOrders ?? 0}
                          </div>
                        </div>
                      </div>

                      <form
                        onSubmit={saveControlChanges}
                        className="space-y-3 rounded-xl border border-[#26262B] bg-[#0A0A0B] p-4 text-xs"
                      >
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                          <div>
                            <label className="mb-1 block text-zinc-500">Role</label>
                            <select
                              value={editForm.role}
                              onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                              className="w-full rounded-lg border border-[#26262B] bg-[#141417] px-2 py-2 text-white"
                            >
                              <option value="USER">USER</option>
                              <option value="ADMIN">ADMIN</option>
                              {currentUser.role === 'SUPER_ADMIN' && (
                                <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                              )}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-zinc-500">Status</label>
                            <select
                              value={editForm.status}
                              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                              className="w-full rounded-lg border border-[#26262B] bg-[#141417] px-2 py-2 text-white"
                            >
                              <option value="ACTIVE">ACTIVE</option>
                              <option value="SUSPENDED">SUSPENDED</option>
                              <option value="BANNED">BANNED</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-zinc-500">Plan</label>
                            <select
                              value={editForm.plan}
                              onChange={(e) => setEditForm({ ...editForm, plan: e.target.value })}
                              className="w-full rounded-lg border border-[#26262B] bg-[#141417] px-2 py-2 text-white"
                            >
                              {PLANS.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-zinc-500">CRM Stage</label>
                            <select
                              value={editForm.crmStage}
                              onChange={(e) => setEditForm({ ...editForm, crmStage: e.target.value })}
                              className="w-full rounded-lg border border-[#26262B] bg-[#141417] px-2 py-2 text-white"
                            >
                              {STAGES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-zinc-500">Language</label>
                            <select
                              value={editForm.preferredLanguage}
                              onChange={(e) =>
                                setEditForm({ ...editForm, preferredLanguage: e.target.value })
                              }
                              className="w-full rounded-lg border border-[#26262B] bg-[#141417] px-2 py-2 text-white"
                            >
                              <option value="en">English</option>
                              <option value="bn">বাংলা</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="mb-1 block text-zinc-500">Internal CRM Notes</label>
                          <textarea
                            rows={2}
                            value={editForm.crmNotes}
                            onChange={(e) => setEditForm({ ...editForm, crmNotes: e.target.value })}
                            placeholder="Follow-up notes, billing info, support history..."
                            className="w-full rounded-lg border border-[#26262B] bg-[#141417] px-3 py-2 text-white"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={saving}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#3B82F6] px-4 py-2 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                        >
                          <Save className="h-3.5 w-3.5" />
                          {t('crmSaveControls')}
                        </button>
                      </form>

                      {detail.user.wallets?.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {detail.user.wallets.map((w) => (
                            <div key={w.id} className="rounded-lg bg-[#0A0A0B] px-3 py-2 text-xs tabular-nums">
                              <div className="text-zinc-400">{w.name}</div>
                              <div className="font-bold text-white">{fmtTk(w.balancePaisa, false)}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-[#26262B] bg-[#141417] p-10 text-center text-xs text-zinc-500">
                      Select a user from the list to manage.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: PASSWORD RESET APPROVAL QUEUE */}
          {section === 'resets' && (
            <div className="space-y-3 rounded-2xl border border-[#26262B] bg-[#141417] p-5">
              <h1 className="text-lg font-bold text-white">{t('crmNavResets')}</h1>
              {resetRequests.length === 0 ? (
                <p className="text-xs text-zinc-500">No password reset requests yet.</p>
              ) : (
                resetRequests.map((reqItem) => (
                  <div
                    key={reqItem.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#26262B] bg-[#0A0A0B] p-4 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{reqItem.user?.name}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            reqItem.status === 'PENDING'
                              ? 'bg-[#2B1E06] text-[#F59E0B]'
                              : reqItem.status === 'APPROVED'
                                ? 'bg-[#0F1E3A] text-[#3B82F6]'
                                : reqItem.status === 'COMPLETED'
                                  ? 'bg-[#062B20] text-[#10B981]'
                                  : 'bg-[#310B15] text-[#F43F5E]'
                          }`}
                        >
                          {reqItem.status}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[#A1A1AA]">
                        {reqItem.identifier} • {fmtDate(reqItem.createdAt)}
                      </div>
                      {reqItem.reason && <div className="mt-1 text-zinc-400">{reqItem.reason}</div>}
                    </div>

                    {reqItem.status === 'PENDING' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReviewReset(reqItem.id, 'approve')}
                          className="inline-flex items-center gap-1 rounded-xl bg-[#10B981] px-3.5 py-2 font-bold text-[#062B20]"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {t('crmApproveReset')}
                        </button>
                        <button
                          onClick={() => handleReviewReset(reqItem.id, 'reject')}
                          className="inline-flex items-center gap-1 rounded-xl border border-[#5A1627] bg-[#310B15] px-3 py-2 font-semibold text-[#F43F5E]"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          {t('crmRejectReset')}
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* SECTION 4: BROADCAST ANNOUNCEMENTS */}
          {section === 'broadcasts' && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <form
                onSubmit={submitAnnouncement}
                className="h-fit space-y-3 rounded-2xl border border-[#26262B] bg-[#141417] p-5 text-xs lg:col-span-5"
              >
                <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                  <Megaphone className="h-4 w-4 text-[#3B82F6]" />
                  {t('crmPublishBroadcast')}
                </h2>
                <input
                  required
                  value={annForm.title}
                  onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
                  placeholder="Title *"
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2.5 text-sm text-white"
                />
                <textarea
                  required
                  rows={3}
                  value={annForm.message}
                  onChange={(e) => setAnnForm({ ...annForm, message: e.target.value })}
                  placeholder="Broadcast message..."
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2 text-white"
                />
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={annForm.type}
                    onChange={(e) => setAnnForm({ ...annForm, type: e.target.value })}
                    className="rounded-xl border border-[#26262B] bg-[#0A0A0B] px-2 py-2 text-white"
                  >
                    <option value="INFO">INFO</option>
                    <option value="WARNING">WARNING</option>
                    <option value="PROMO">PROMO</option>
                    <option value="MAINTENANCE">MAINTENANCE</option>
                  </select>
                  <select
                    value={annForm.targetPlan}
                    onChange={(e) => setAnnForm({ ...annForm, targetPlan: e.target.value })}
                    className="rounded-xl border border-[#26262B] bg-[#0A0A0B] px-2 py-2 text-white"
                  >
                    <option value="ALL">ALL USERS</option>
                    <option value="FREE">FREE</option>
                    <option value="PRO">PRO</option>
                    <option value="BUSINESS">BUSINESS</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    value={annForm.expiresInHours}
                    onChange={(e) => setAnnForm({ ...annForm, expiresInHours: e.target.value })}
                    placeholder="Hours"
                    className="rounded-xl border border-[#26262B] bg-[#0A0A0B] px-2 py-2 text-white"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-xl bg-[#3B82F6] py-2.5 font-semibold text-white"
                >
                  {t('crmBroadcastNow')}
                </button>
              </form>

              <div className="space-y-2.5 lg:col-span-7">
                {announcements.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-[#26262B] bg-[#141417] p-4 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-[#0F1E3A] px-2 py-0.5 text-[10px] font-bold text-[#3B82F6]">
                          {a.type}
                        </span>
                        <span className="text-zinc-400">Target: {a.targetPlan}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            a.isActive ? 'bg-[#062B20] text-[#10B981]' : 'bg-zinc-800 text-zinc-500'
                          }`}
                        >
                          {a.isActive ? 'LIVE' : 'PAUSED'}
                        </span>
                      </div>
                      <div className="mt-1.5 text-sm font-bold text-white">{a.title}</div>
                      <p className="mt-0.5 text-[#A1A1AA]">{a.message}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => toggleAnnouncement(a.id, a.isActive)}
                        className="rounded-lg border border-[#26262B] bg-[#0A0A0B] px-2.5 py-1.5 font-semibold text-zinc-200"
                      >
                        {a.isActive ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        onClick={() => deleteAnnouncement(a.id)}
                        className="rounded-lg border border-[#5A1627] bg-[#310B15] p-1.5 text-[#F43F5E]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 5: AUDIT LOGS */}
          {section === 'audit' && (
            <div className="space-y-2 rounded-2xl border border-[#26262B] bg-[#141417] p-5">
              <h1 className="mb-3 text-lg font-bold text-white">{t('crmAuditTrail')}</h1>
              {overview?.recentLogs?.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#0A0A0B] px-3.5 py-2.5 text-xs"
                >
                  <div>
                    <span className="rounded bg-[#0F1E3A] px-2 py-0.5 text-[10px] font-bold text-[#3B82F6]">
                      {log.action}
                    </span>
                    <span className="ml-2 font-semibold text-white">{log.targetEmail || 'Platform'}</span>
                    <span className="ml-2 text-[#A1A1AA]">by {log.admin?.name}</span>
                    {log.details && <div className="mt-1 text-[11px] text-zinc-500">{log.details}</div>}
                  </div>
                  <span className="text-[11px] text-zinc-500">{fmtDate(log.createdAt)}</span>
                </div>
              ))}
            </div>
          )}

          {/* SECTION 6: CRM SETTINGS */}
          {section === 'settings' && (
            <SettingsView user={currentUser} onUserUpdated={onUserUpdated} notify={notify} />
          )}
        </main>
      </div>

      {/* Mobile Bottom Nav for Dedicated CRM */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-[#26262B] bg-[#141417] py-2">
        {crmNav.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`flex flex-col items-center gap-1 py-1 text-[10px] font-medium ${
                section === item.id ? 'text-[#3B82F6]' : 'text-zinc-500'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Create User Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#26262B] bg-[#141417] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">{t('crmAddUser')}</h3>
              <button onClick={() => setCreateOpen(false)} className="text-zinc-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitCreateUser} className="space-y-3 text-xs">
              <input
                required
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                placeholder="Full Name *"
                className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2.5 text-white"
              />
              <input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="Valid Email (optional if phone given)"
                className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2.5 text-white"
              />
              <input
                value={newUser.phone}
                onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                placeholder="Valid Phone e.g. 01711889900"
                className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2.5 text-white"
              />
              <input
                type="password"
                required
                minLength={6}
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Temporary Password (min 6 chars) *"
                className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2.5 text-white"
              />
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="rounded-xl border border-[#26262B] bg-[#0A0A0B] px-2 py-2 text-white"
                >
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
                <select
                  value={newUser.plan}
                  onChange={(e) => setNewUser({ ...newUser, plan: e.target.value })}
                  className="rounded-xl border border-[#26262B] bg-[#0A0A0B] px-2 py-2 text-white"
                >
                  {PLANS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <select
                  value={newUser.preferredLanguage}
                  onChange={(e) => setNewUser({ ...newUser, preferredLanguage: e.target.value })}
                  className="rounded-xl border border-[#26262B] bg-[#0A0A0B] px-2 py-2 text-white"
                >
                  <option value="en">English</option>
                  <option value="bn">বাংলা</option>
                </select>
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-[#3B82F6] py-3 font-semibold text-white hover:bg-blue-500"
              >
                {t('createWorkspace')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Set Password Modal */}
      {resetOpen && detail?.user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#26262B] bg-[#141417] p-5">
            <h3 className="text-sm font-bold text-white">
              {t('crmSetPass')}: {detail.user.name}
            </h3>
            <form onSubmit={submitResetPassword} className="mt-4 space-y-3 text-xs">
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('newPassword')}
                className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] px-3 py-2.5 text-white"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setResetOpen(false)}
                  className="flex-1 rounded-xl border border-[#26262B] py-2 text-zinc-300"
                >
                  {t('cancel')}
                </button>
                <button type="submit" className="flex-1 rounded-xl bg-[#3B82F6] py-2 font-semibold text-white">
                  {t('crmSetPass')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

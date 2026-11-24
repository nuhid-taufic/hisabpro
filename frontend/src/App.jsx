import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Home,
  LogOut,
  Megaphone,
  Settings,
  Sparkles,
  Store,
  Users,
  X,
} from 'lucide-react';
import { apiFetch } from './lib/api';
import { I18nProvider, useI18n } from './context/I18nContext';
import AuthScreen from './components/AuthScreen';
import DashboardView from './components/DashboardView';
import MagicBarModal from './components/MagicBarModal';
import ContactsView from './components/ContactsView';
import StoreView from './components/StoreView';
import ReportsView from './components/ReportsView';
import SettingsView from './components/SettingsView';
import DedicatedAdminCrm from './components/DedicatedAdminCrm';
import PublicTrustView from './components/PublicTrustView';

export default function App() {
  const trustToken = new URLSearchParams(window.location.search).get('trust');
  if (trustToken) {
    return (
      <I18nProvider>
        <PublicTrustView token={trustToken} />
      </I18nProvider>
    );
  }
  return (
    <I18nProvider>
      <RootRouter />
    </I18nProvider>
  );
}

function RootRouter() {
  const { syncLanguageFromUser, t } = useI18n();
  const [user, setUser] = useState(null);
  const [impersonation, setImpersonation] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [tab, setTab] = useState('home');
  const [books, setBooks] = useState([]);
  const [activeBookId, setActiveBookId] = useState('ALL');
  const [wallets, setWallets] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [dismissedIds, setDismissedIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('hp_dismissed_ann') || '[]');
    } catch {
      return [];
    }
  });
  const [magicOpen, setMagicOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [toast, setToast] = useState(null);

  const notify = useCallback((message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast((prev) => (prev?.message === message ? null : prev)), 3500);
  }, []);

  const refreshUserWorkspace = useCallback(async () => {
    const [bRes, wRes, cRes, catRes, anRes] = await Promise.all([
      apiFetch('/books'),
      apiFetch('/wallets'),
      apiFetch('/contacts'),
      apiFetch('/categories'),
      apiFetch('/announcements/active').catch(() => ({ announcements: [] })),
    ]);
    setBooks(bRes.books || []);
    setWallets(wRes.wallets || []);
    setContacts(cRes.contacts || []);
    setCategories(catRes.categories || []);
    setAnnouncements(anRes.announcements || []);
    setRefreshTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let mounted = true;
    apiFetch('/auth/me')
      .then(async (res) => {
        if (!mounted) return;
        setUser(res.user);
        setImpersonation(res.impersonation || null);
        syncLanguageFromUser(res.user?.preferredLanguage);
        const isPureAdmin =
          ['ADMIN', 'SUPER_ADMIN'].includes(res.user?.role) && !res.impersonation?.active;
        if (!isPureAdmin) {
          await refreshUserWorkspace();
        }
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        if (mounted) setLoadingAuth(false);
      });
    return () => {
      mounted = false;
    };
  }, [refreshUserWorkspace, syncLanguageFromUser]);

  const isDedicatedCrm =
    Boolean(user) && ['ADMIN', 'SUPER_ADMIN'].includes(user.role) && !impersonation?.active;

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (user && !isDedicatedCrm) {
          e.preventDefault();
          setMagicOpen(true);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [user, isDedicatedCrm]);

  async function handleLogout() {
    await apiFetch('/auth/logout', { method: 'POST' });
    setUser(null);
    setImpersonation(null);
    setTab('home');
    setBooks([]);
    setWallets([]);
    setContacts([]);
    setCategories([]);
    setAnnouncements([]);
    notify('Signed out.');
  }

  async function handleStopImpersonation() {
    try {
      const res = await apiFetch('/auth/stop-impersonation', { method: 'POST' });
      setUser(res.user);
      setImpersonation(null);
      syncLanguageFromUser(res.user?.preferredLanguage);
      notify(`Returned to Dedicated CRM (${res.user.name})`);
    } catch (err) {
      notify(err.message, true);
    }
  }

  function dismissAnnouncement(id) {
    const next = [...new Set([...dismissedIds, id])];
    setDismissedIds(next);
    localStorage.setItem('hp_dismissed_ann', JSON.stringify(next));
  }

  const toastEl = toast ? (
    <div
      className={`fixed bottom-20 md:bottom-5 right-5 z-50 rounded-xl border px-4 py-3 text-xs font-semibold print:hidden ${
        toast.isError
          ? 'border-rose-500/40 bg-rose-950 text-rose-100'
          : 'border-emerald-500/40 bg-emerald-950 text-emerald-100'
      }`}
    >
      {toast.message}
    </div>
  ) : null;

  if (loadingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0B] text-sm text-[#A1A1AA]">
        {t('loadingWorkspace')}
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <AuthScreen
          notify={notify}
          onAuthenticated={async (u) => {
            setUser(u);
            setImpersonation(null);
            syncLanguageFromUser(u.preferredLanguage);
            if (!['ADMIN', 'SUPER_ADMIN'].includes(u.role)) {
              setActiveBookId('ALL');
              setTab('home');
              await refreshUserWorkspace();
            }
          }}
        />
        {toastEl}
      </>
    );
  }

  // DEDICATED STANDALONE ADMIN CRM MODE (No Personal/Store App Mixed In)
  if (isDedicatedCrm) {
    return (
      <>
        <DedicatedAdminCrm
          currentUser={user}
          onUserUpdated={setUser}
          onLogout={handleLogout}
          notify={notify}
          onImpersonate={async (targetUser, impMeta) => {
            setUser(targetUser);
            setImpersonation(impMeta);
            syncLanguageFromUser(targetUser.preferredLanguage);
            setActiveBookId('ALL');
            setTab('home');
            await refreshUserWorkspace();
          }}
        />
        {toastEl}
      </>
    );
  }

  // REGULAR USER WORKSPACE (OR IMPERSONATION MODE)
  const visibleAnnouncements = announcements.filter((a) => !dismissedIds.includes(a.id));
  const navItems = [
    { id: 'home', label: t('navDashboard'), icon: Home },
    { id: 'contacts', label: t('navContacts'), icon: Users },
    { id: 'store', label: t('navStore'), icon: Store },
    { id: 'reports', label: t('navReports'), icon: BarChart3 },
    { id: 'settings', label: t('navSettings'), icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#FAFAFA] flex flex-col">
      {impersonation?.active && (
        <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 border-b border-[#573C0C] bg-[#2B1E06] px-4 py-2 text-xs text-amber-200 print:hidden">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 text-[#F59E0B]" />
            {t('crmImpersonating')}: <span className="text-white">{user.name}</span> (
            {user.email || user.phone})
          </div>
          <button
            onClick={handleStopImpersonation}
            className="rounded-lg bg-[#F59E0B] px-3 py-1 text-xs font-bold text-black hover:bg-amber-400"
          >
            {t('crmReturnAdmin')}
          </button>
        </div>
      )}

      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="hidden md:flex md:w-64 md:flex-col border-r border-[#26262B] bg-[#141417] p-4 sticky top-0 h-screen print:hidden">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3B82F6] font-bold text-white">
              H
            </div>
            <div>
              <div className="text-sm font-bold text-white">HisabPro</div>
              <div className="text-[11px] text-[#A1A1AA]">{user.plan || 'FREE'}</div>
            </div>
          </div>

          <div className="mt-5">
            <label className="px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              {t('activeLedgerBook')}
            </label>
            <div className="relative mt-1.5">
              <BookOpen className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#10B981]" />
              <select
                value={activeBookId}
                onChange={(e) => setActiveBookId(e.target.value)}
                className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] py-2 pl-9 pr-3 text-xs font-medium text-white focus:border-[#3B82F6] focus:outline-none"
              >
                <option value="ALL">{t('allBooksCombined')}</option>
                {books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.bookType})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={() => setMagicOpen(true)}
            className="mt-4 flex items-center justify-between rounded-xl border border-[#1E3A6E] bg-[#0F1E3A] px-3 py-2.5 text-xs font-semibold text-blue-300 hover:border-[#3B82F6]"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#3B82F6]" />
              {t('magicCommand')}
            </span>
            <kbd className="rounded bg-[#0A0A0B] px-1.5 py-0.5 text-[10px] text-zinc-400">⌘K</kbd>
          </button>

          <nav className="mt-6 flex-1 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? 'border border-[#26262B] bg-[#1C1C21] text-white'
                      : 'text-[#A1A1AA] hover:bg-[#1C1C21]/50 hover:text-white'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? 'text-[#3B82F6]' : ''}`} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center justify-between gap-1 border-t border-[#26262B] px-1 pt-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-white">{user.name}</div>
              <div className="truncate text-[11px] text-zinc-500">{user.email || user.phone}</div>
            </div>
            <button
              onClick={handleLogout}
              title={t('signOut')}
              className="rounded-lg p-2 text-zinc-400 hover:bg-[#1C1C21] hover:text-[#F43F5E]"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </aside>

        <div className="flex-1 min-w-0 pb-20 md:pb-8">
          <header className="md:hidden sticky top-0 z-30 flex items-center justify-between border-b border-[#26262B] bg-[#0A0A0B] px-4 py-3 print:hidden">
            <select
              value={activeBookId}
              onChange={(e) => setActiveBookId(e.target.value)}
              className="rounded-full border border-[#26262B] bg-[#141417] px-3 py-1.5 text-xs font-semibold text-white"
            >
              <option value="ALL">{t('allBooksCombined')}</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <span className="text-sm font-bold text-white">HisabPro</span>
            <button
              onClick={() => setMagicOpen(true)}
              className="inline-flex items-center gap-1 rounded-full border border-[#1E3A6E] bg-[#0F1E3A] px-2.5 py-1 text-xs font-semibold text-blue-300"
            >
              <Sparkles className="h-3.5 w-3.5" />
              SMS
            </button>
          </header>

          <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
            {visibleAnnouncements.length > 0 && (
              <div className="space-y-2 print:hidden">
                {visibleAnnouncements.map((a) => {
                  const tone =
                    a.type === 'WARNING' || a.type === 'MAINTENANCE'
                      ? 'border-[#573C0C] bg-[#2B1E06] text-amber-100'
                      : a.type === 'PROMO'
                        ? 'border-[#0D4D39] bg-[#062B20] text-emerald-100'
                        : 'border-[#1E3A6E] bg-[#0F1E3A] text-blue-100';
                  return (
                    <div
                      key={a.id}
                      className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-xs ${tone}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <Megaphone className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          <div className="font-bold text-white">{a.title}</div>
                          <p className="mt-0.5 opacity-90">{a.message}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => dismissAnnouncement(a.id)}
                        className="rounded p-1 opacity-70 hover:opacity-100"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'home' && (
              <>
                <button
                  onClick={() => setMagicOpen(true)}
                  className="flex w-full items-center justify-between rounded-2xl border border-[#1E3A6E] bg-[#0F1E3A] px-4 py-3.5 text-left transition hover:border-[#3B82F6]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#3B82F6]/20 text-[#3B82F6]">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">{t('magicBarTitle')}</div>
                      <div className="text-xs text-[#A1A1AA]">{t('magicBarSub')}</div>
                    </div>
                  </div>
                  <kbd className="hidden sm:inline-block rounded-lg border border-[#1E3A6E] bg-[#0A0A0B] px-2 py-1 text-xs font-semibold text-[#3B82F6]">
                    ⌘K
                  </kbd>
                </button>

                <DashboardView
                  key={refreshTick}
                  books={books}
                  activeBookId={activeBookId}
                  wallets={wallets}
                  contacts={contacts}
                  categories={categories}
                  refreshBase={refreshUserWorkspace}
                  notify={notify}
                />
              </>
            )}

            {tab === 'contacts' && (
              <ContactsView
                books={books}
                activeBookId={activeBookId}
                wallets={wallets}
                refreshBase={refreshUserWorkspace}
                notify={notify}
              />
            )}

            {tab === 'store' && (
              <StoreView
                books={books}
                activeBookId={activeBookId}
                wallets={wallets}
                contacts={contacts}
                refreshBase={refreshUserWorkspace}
                notify={notify}
              />
            )}

            {tab === 'reports' && <ReportsView activeBookId={activeBookId} notify={notify} />}

            {tab === 'settings' && (
              <SettingsView user={user} onUserUpdated={setUser} notify={notify} />
            )}
          </main>
        </div>

        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-[#26262B] bg-[#141417] py-2 print:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex flex-col items-center gap-1 py-1 text-[10px] font-medium ${
                  tab === item.id ? 'text-[#3B82F6]' : 'text-zinc-500'
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      <MagicBarModal
        open={magicOpen}
        onClose={() => setMagicOpen(false)}
        books={books}
        activeBookId={activeBookId}
        wallets={wallets}
        contacts={contacts}
        onSaved={refreshUserWorkspace}
        notify={notify}
      />

      {toastEl}
    </div>
  );
}

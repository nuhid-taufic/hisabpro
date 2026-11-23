import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, BookOpen, Home, LogOut, Sparkles, Store, Users } from 'lucide-react';
import { apiFetch } from './lib/api';
import AuthScreen from './components/AuthScreen';
import DashboardView from './components/DashboardView';
import MagicBarModal from './components/MagicBarModal';
import ContactsView from './components/ContactsView';
import PublicTrustView from './components/PublicTrustView';

export default function App() {
  const trustToken = new URLSearchParams(window.location.search).get('trust');
  if (trustToken) {
    return <PublicTrustView token={trustToken} />;
  }
  return <WorkspaceApp />;
}

function WorkspaceApp() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [tab, setTab] = useState('home');
  const [books, setBooks] = useState([]);
  const [activeBookId, setActiveBookId] = useState('ALL');
  const [wallets, setWallets] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [magicOpen, setMagicOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [toast, setToast] = useState(null);

  const notify = useCallback((message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast((prev) => (prev?.message === message ? null : prev)), 3200);
  }, []);

  const refreshBase = useCallback(async () => {
    const [bRes, wRes, cRes, catRes] = await Promise.all([
      apiFetch('/books'),
      apiFetch('/wallets'),
      apiFetch('/contacts'),
      apiFetch('/categories'),
    ]);
    setBooks(bRes.books || []);
    setWallets(wRes.wallets || []);
    setContacts(cRes.contacts || []);
    setCategories(catRes.categories || []);
    setRefreshTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let mounted = true;
    apiFetch('/auth/me')
      .then(async (res) => {
        if (!mounted) return;
        setUser(res.user);
        await refreshBase();
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
  }, [refreshBase]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (user) setMagicOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [user]);

  async function handleLogout() {
    await apiFetch('/auth/logout', { method: 'POST' });
    setUser(null);
    setBooks([]);
    setWallets([]);
    setContacts([]);
    setCategories([]);
    notify('Signed out.');
  }

  if (loadingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0B] text-sm text-[#A1A1AA]">
        Loading HisabPro workspace...
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
            await refreshBase();
          }}
        />
        {toast && (
          <div
            className={`fixed bottom-5 right-5 z-50 rounded-xl border px-4 py-3 text-xs font-semibold ${
              toast.isError
                ? 'border-rose-500/40 bg-rose-950 text-rose-100'
                : 'border-emerald-500/40 bg-emerald-950 text-emerald-100'
            }`}
          >
            {toast.message}
          </div>
        )}
      </>
    );
  }

  const navItems = [
    { id: 'home', label: 'Dashboard', icon: Home },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'store', label: 'Store POS', icon: Store },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#FAFAFA] flex flex-col md:flex-row">
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-[#26262B] bg-[#141417] p-4 sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3B82F6] font-bold text-white">
            H
          </div>
          <div>
            <div className="text-sm font-bold text-white">HisabPro</div>
            <div className="text-[11px] text-[#A1A1AA]">v2.0 • Sprint 2</div>
          </div>
        </div>

        <div className="mt-5">
          <label className="px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Active Ledger Book
          </label>
          <div className="relative mt-1.5">
            <BookOpen className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#10B981]" />
            <select
              value={activeBookId}
              onChange={(e) => setActiveBookId(e.target.value)}
              className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] py-2 pl-9 pr-3 text-xs font-medium text-white focus:border-[#3B82F6] focus:outline-none"
            >
              <option value="ALL">All Books Combined</option>
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
            Magic SMS / Command
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

        <div className="flex items-center justify-between border-t border-[#26262B] px-2 pt-3">
          <div className="truncate">
            <div className="truncate text-xs font-semibold text-white">{user.name}</div>
            <div className="truncate text-[11px] text-zinc-500">{user.email}</div>
          </div>
          <button
            onClick={handleLogout}
            title="Sign Out"
            className="rounded-lg p-2 text-zinc-400 hover:bg-[#1C1C21] hover:text-[#F43F5E]"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 pb-20 md:pb-8">
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between border-b border-[#26262B] bg-[#0A0A0B] px-4 py-3">
          <select
            value={activeBookId}
            onChange={(e) => setActiveBookId(e.target.value)}
            className="rounded-full border border-[#26262B] bg-[#141417] px-3 py-1.5 text-xs font-semibold text-white"
          >
            <option value="ALL">All Books</option>
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
                    <div className="text-sm font-semibold text-white">
                      Paste bKash / Nagad SMS or type Banglish command...
                    </div>
                    <div className="text-xs text-[#A1A1AA]">
                      Auto-detects Transfer/Fee, blocks Duplicate TrxID &amp; alerts Balance Mismatch
                    </div>
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
                refreshBase={refreshBase}
                notify={notify}
              />
            </>
          )}

          {tab === 'contacts' && (
            <ContactsView
              books={books}
              activeBookId={activeBookId}
              wallets={wallets}
              refreshBase={refreshBase}
              notify={notify}
            />
          )}

          {tab === 'store' && (
            <div className="rounded-2xl border border-[#26262B] bg-[#141417] p-8 text-center">
              <div className="text-sm font-bold text-white">Store POS, Manual MRP Override &amp; Daily Cash Closing</div>
              <p className="mt-1 text-xs text-[#A1A1AA]">
                Next up in Sprint 3 — database tables &amp; demo products are already live.
              </p>
            </div>
          )}

          {tab === 'reports' && (
            <div className="rounded-2xl border border-[#26262B] bg-[#141417] p-8 text-center">
              <div className="text-sm font-bold text-white">Reports, Category/Tag Breakdown &amp; CSV/JSON/PDF Export</div>
              <p className="mt-1 text-xs text-[#A1A1AA]">Next up in Sprint 3.</p>
            </div>
          )}
        </main>
      </div>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 border-t border-[#26262B] bg-[#141417] py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex flex-col items-center gap-1 py-1 text-[11px] font-medium ${
                tab === item.id ? 'text-[#3B82F6]' : 'text-zinc-500'
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <MagicBarModal
        open={magicOpen}
        onClose={() => setMagicOpen(false)}
        books={books}
        activeBookId={activeBookId}
        wallets={wallets}
        contacts={contacts}
        onSaved={refreshBase}
        notify={notify}
      />

      {toast && (
        <div
          className={`fixed bottom-20 md:bottom-5 right-5 z-50 rounded-xl border px-4 py-3 text-xs font-semibold ${
            toast.isError
              ? 'border-rose-500/40 bg-rose-950 text-rose-100'
              : 'border-emerald-500/40 bg-emerald-950 text-emerald-100'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

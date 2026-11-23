import React, { useState } from 'react';
import { Lock, Mail, User } from 'lucide-react';
import { apiFetch } from '../lib/api';

export default function AuthScreen({ onAuthenticated, notify }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('demo@hisabpro.app');
  const [password, setPassword] = useState('Demo@1234');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload = mode === 'login' ? { email, password } : { name, email, password };
      const res = await apiFetch(path, { method: 'POST', body: JSON.stringify(payload) });
      notify(`Welcome${mode === 'login' ? ' back' : ''}, ${res.user.name}`);
      onAuthenticated(res.user);
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
            <h1 className="text-lg font-bold text-[#FAFAFA]">HisabPro v2.0</h1>
            <p className="text-xs text-[#A1A1AA]">Personal Ledger &amp; Store POS</p>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 rounded-xl border border-[#26262B] bg-[#0A0A0B] p-1">
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
              setEmail('');
              setPassword('');
            }}
            className={`rounded-lg py-2 text-xs font-semibold ${
              mode === 'register' ? 'bg-[#1C1C21] text-white' : 'text-[#A1A1AA]'
            }`}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="mb-1 block text-xs text-[#A1A1AA]">Full Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 h-4 w-4 text-zinc-500" />
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] py-2.5 pl-10 pr-3 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs text-[#A1A1AA]">Email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 h-4 w-4 text-zinc-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] py-2.5 pl-10 pr-3 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[#A1A1AA]">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-zinc-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-[#26262B] bg-[#0A0A0B] py-2.5 pl-10 pr-3 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#3B82F6] py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : mode === 'login' ? 'Sign In' : 'Create Workspace'}
          </button>
        </form>

        {mode === 'login' && (
          <div className="mt-4 rounded-xl border border-[#26262B] bg-[#0A0A0B] p-3 text-xs text-[#A1A1AA]">
            Demo Login: <span className="text-white font-medium">demo@hisabpro.app</span> /{' '}
            <span className="text-white font-medium">Demo@1234</span>
          </div>
        )}
      </div>
    </div>
  );
}

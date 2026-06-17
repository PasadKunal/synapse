import { useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

type Tab = "login" | "register";

export function AuthPage() {
  const { login } = useAuth();
  const [tab, setTab] = useState<Tab>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await api.login(loginEmail, loginPassword);
      login(res.access_token, res.username);
    } catch (err) {
      setError(err instanceof Error ? extractMessage(err.message) : "Login failed");
    } finally { setLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (regPassword !== regConfirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    try {
      const res = await api.register(regUsername, regEmail, regPassword);
      login(res.access_token, res.username);
    } catch (err) {
      setError(err instanceof Error ? extractMessage(err.message) : "Registration failed");
    } finally { setLoading(false); }
  };

  const handleDemo = async () => {
    setError(""); setLoading(true);
    try {
      const res = await api.demoLogin();
      login(res.access_token, res.username);
    } catch (err) {
      setError(err instanceof Error ? extractMessage(err.message) : "Demo login failed");
    } finally { setLoading(false); }
  };

  const inputCls = "w-full bg-white/[0.04] border border-white/[0.09] rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-violet-500/60 focus:bg-white/[0.06] focus:ring-1 focus:ring-violet-500/20 transition-all";

  return (
    <div className="min-h-screen bg-[#07070e] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-violet-950/30 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] bg-indigo-950/20 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative w-full max-w-[400px]">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-violet-600 shadow-xl shadow-violet-900/50 mb-4">
            <span className="text-xl font-bold text-white">S</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Synapse</h1>
          <p className="text-slate-500 text-sm mt-1.5">Autonomous multi-agent AI platform</p>
        </div>

        {/* Card */}
        <div className="bg-[#0f0f1e] border border-white/[0.07] rounded-2xl shadow-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-white/[0.06]">
            {(["login", "register"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(""); }}
                className={`flex-1 py-3.5 text-xs font-semibold uppercase tracking-wider transition-all ${
                  tab === t
                    ? "text-violet-400 bg-violet-500/[0.07] border-b-2 border-violet-500"
                    : "text-slate-600 hover:text-slate-400"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="p-6">
            {tab === "login" ? (
              <form onSubmit={handleLogin} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
                  <input type="email" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                    className={inputCls} placeholder="you@example.com" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Password</label>
                  <input type="password" required value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                    className={inputCls} placeholder="••••••••" />
                </div>
                {error && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    <span className="text-red-400 text-xs">{error}</span>
                  </div>
                )}
                <button type="submit" disabled={loading}
                  className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg py-2.5 text-sm font-semibold transition-colors mt-1 shadow-lg shadow-violet-900/30">
                  {loading ? <span className="flex items-center justify-center gap-2"><Spinner />Signing in…</span> : "Sign In"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Username</label>
                  <input type="text" required value={regUsername} onChange={e => setRegUsername(e.target.value)}
                    className={inputCls} placeholder="your_username" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
                  <input type="email" required value={regEmail} onChange={e => setRegEmail(e.target.value)}
                    className={inputCls} placeholder="you@example.com" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Password</label>
                    <input type="password" required value={regPassword} onChange={e => setRegPassword(e.target.value)}
                      className={inputCls} placeholder="••••••••" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Confirm</label>
                    <input type="password" required value={regConfirm} onChange={e => setRegConfirm(e.target.value)}
                      className={inputCls} placeholder="••••••••" />
                  </div>
                </div>
                {error && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    <span className="text-red-400 text-xs">{error}</span>
                  </div>
                )}
                <button type="submit" disabled={loading}
                  className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg py-2.5 text-sm font-semibold transition-colors mt-1 shadow-lg shadow-violet-900/30">
                  {loading ? <span className="flex items-center justify-center gap-2"><Spinner />Creating account…</span> : "Create Account"}
                </button>
              </form>
            )}

            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-white/[0.06]" />
              <span className="text-[11px] text-slate-600 font-medium">or continue with</span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>

            <button onClick={handleDemo} disabled={loading}
              className="w-full bg-white/[0.04] hover:bg-white/[0.07] disabled:opacity-40 border border-white/[0.08] hover:border-white/[0.12] text-slate-300 hover:text-white rounded-lg py-2.5 text-sm font-medium transition-all flex items-center justify-center gap-2">
              {loading ? <Spinner /> : <span className="text-violet-400 font-bold">⚡</span>}
              Try Demo — no signup needed
            </button>
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-700 mt-6 tracking-wide">
          LangGraph · Groq · pgvector · FastAPI · React
        </p>
      </div>
    </div>
  );
}

function Spinner() {
  return <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin inline-block" />;
}

function extractMessage(raw: string): string {
  try {
    const match = raw.match(/\d+: (.+)/);
    if (!match) return raw;
    const parsed = JSON.parse(match[1]);
    return parsed.detail || raw;
  } catch { return raw; }
}

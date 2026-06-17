import { useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

type Tab = "login" | "register";

export function AuthPage() {
  const { login } = useAuth();
  const [tab, setTab] = useState<Tab>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register fields
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.login(loginEmail, loginPassword);
      login(res.access_token, res.username);
    } catch (err) {
      setError(err instanceof Error ? extractMessage(err.message) : "Login failed");
    } finally {
      setLoading(false);
    }
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
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await api.demoLogin();
      login(res.access_token, res.username);
    } catch (err) {
      setError(err instanceof Error ? extractMessage(err.message) : "Demo login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-purple-900/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="text-4xl">⚡</span>
            <h1 className="text-4xl font-bold text-white">Synapse</h1>
          </div>
          <p className="text-gray-400 text-sm">Autonomous multi-agent AI platform</p>
        </div>

        {/* Card */}
        <div className="bg-gray-900/80 backdrop-blur border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-800">
            {(["login", "register"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(""); }}
                className={`flex-1 py-4 text-sm font-medium capitalize transition-colors ${
                  tab === t
                    ? "text-purple-400 border-b-2 border-purple-500 bg-gray-900"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="p-6">
            {tab === "login" ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Email</label>
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Password</label>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition"
                    placeholder="••••••••"
                  />
                </div>
                {error && <p className="text-red-400 text-xs">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg py-3 text-sm font-semibold transition-colors"
                >
                  {loading ? "Signing in..." : "Sign In"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Username</label>
                  <input
                    type="text"
                    required
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition"
                    placeholder="your_username"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Email</label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition"
                    placeholder="you@example.com"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Password</label>
                    <input
                      type="password"
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition"
                      placeholder="••••••••"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Confirm</label>
                    <input
                      type="password"
                      required
                      value={regConfirm}
                      onChange={(e) => setRegConfirm(e.target.value)}
                      className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                {error && <p className="text-red-400 text-xs">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg py-3 text-sm font-semibold transition-colors"
                >
                  {loading ? "Creating account..." : "Create Account"}
                </button>
              </form>
            )}

            {/* Divider */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-gray-800" />
              <span className="text-xs text-gray-600">or</span>
              <div className="flex-1 h-px bg-gray-800" />
            </div>

            {/* Demo button */}
            <button
              onClick={handleDemo}
              disabled={loading}
              className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 hover:text-white border border-gray-700 rounded-lg py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <span>⚡</span>
              Try Demo — no signup needed
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          Built with LangGraph · Groq · pgvector · FastAPI · React
        </p>
      </div>
    </div>
  );
}

function extractMessage(raw: string): string {
  try {
    const match = raw.match(/\d+: (.+)/);
    if (!match) return raw;
    const parsed = JSON.parse(match[1]);
    return parsed.detail || raw;
  } catch {
    return raw;
  }
}

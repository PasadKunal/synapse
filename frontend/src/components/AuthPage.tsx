import { useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

type Tab = "login" | "register";

const FEATURES = [
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
      </svg>
    ),
    title: "Multi-Agent Routing",
    desc: "Supervisor automatically dispatches tasks to the right specialist — Researcher, Coder, Analyst, or Writer.",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
    title: "Live Execution Traces",
    desc: "Watch every agent step in real time — token usage, latency, and decisions streamed as they happen.",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
      </svg>
    ),
    title: "Semantic Memory",
    desc: "pgvector-powered retrieval recalls relevant context across sessions, so answers get smarter over time.",
  },
];

export function AuthPage() {
  const { login } = useAuth();
  const [tab, setTab] = useState<Tab>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register state
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");

  const go = async (fn: () => Promise<{ access_token: string; username: string }>) => {
    setError(""); setLoading(true);
    try { const r = await fn(); login(r.access_token, r.username); }
    catch (e) { setError(extractMsg(e instanceof Error ? e.message : String(e))); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#08080f" }}>

      {/* ── Left Brand Panel ── */}
      <div style={{
        flex: "0 0 52%", display: "flex", flexDirection: "column", justifyContent: "space-between",
        padding: "48px 56px", position: "relative", overflow: "hidden",
        background: "linear-gradient(160deg, #0d0d1f 0%, #0a0a18 60%, #0d0820 100%)",
        borderRight: "1px solid rgba(255,255,255,0.05)",
      }}>
        {/* Background glow orbs */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div style={{ position: "absolute", top: "-10%", left: "-5%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(109,40,217,0.18) 0%, transparent 65%)" }} />
          <div style={{ position: "absolute", bottom: "5%", right: "-10%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(79,70,229,0.12) 0%, transparent 65%)" }} />
        </div>
        {/* Dot grid */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.35, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)", backgroundSize: "28px 28px", pointerEvents: "none" }} />

        {/* Logo */}
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
              background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
              boxShadow: "0 4px 24px rgba(124,58,237,0.4), inset 0 1px 0 rgba(255,255,255,0.15)",
            }}>
              <span style={{ color: "white", fontSize: 16, fontWeight: 900, letterSpacing: "-0.5px" }}>S</span>
            </div>
            <span style={{ fontSize: 20, fontWeight: 700, color: "#f0f0ff", letterSpacing: "-0.3px" }}>Synapse</span>
          </div>
        </div>

        {/* Main copy */}
        <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingTop: 40, paddingBottom: 40 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20, width: "fit-content" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 8px #34d399" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "#34d399", letterSpacing: "0.08em", textTransform: "uppercase" }}>Now in beta</span>
          </div>

          <h1 style={{ fontSize: 42, fontWeight: 800, color: "#f4f4ff", lineHeight: 1.1, marginBottom: 16, letterSpacing: "-1px" }}>
            AI that thinks<br />
            <span style={{ background: "linear-gradient(90deg, #a78bfa, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              in parallel
            </span>
          </h1>
          <p style={{ fontSize: 16, color: "#6b6b8a", lineHeight: 1.65, maxWidth: 380, marginBottom: 48 }}>
            Synapse routes your requests to specialised AI agents that research, code, analyse, and write — with full transparency.
          </p>

          {/* Feature list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(124,106,245,0.1)", border: "1px solid rgba(124,106,245,0.2)",
                  color: "#a78bfa",
                }}>
                  {f.icon}
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#d4d4ec", marginBottom: 2 }}>{f.title}</p>
                  <p style={{ fontSize: 13, color: "#4a4a68", lineHeight: 1.5 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom tech stack */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {["LangGraph", "Groq", "pgvector", "FastAPI", "React"].map(t => (
            <span key={t} style={{ fontSize: 11, color: "#3a3a58", padding: "3px 10px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.05)" }}>
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* ── Right Form Panel ── */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "48px 40px", background: "#080812",
      }}>
        <div style={{ width: "100%", maxWidth: 400 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#f0f0ff", marginBottom: 6, letterSpacing: "-0.3px" }}>
            {tab === "login" ? "Welcome back" : "Create account"}
          </h2>
          <p style={{ fontSize: 14, color: "#4a4a68", marginBottom: 28 }}>
            {tab === "login" ? "Sign in to continue to Synapse" : "Start using Synapse for free"}
          </p>

          {/* Tab switcher */}
          <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 4, marginBottom: 24, border: "1px solid rgba(255,255,255,0.06)" }}>
            {(["login", "register"] as Tab[]).map(t => (
              <button key={t} onClick={() => { setTab(t); setError(""); }}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 7, fontSize: 13, fontWeight: 600,
                  cursor: "pointer", border: "none", transition: "all 0.2s",
                  background: tab === t ? "rgba(124,106,245,0.15)" : "transparent",
                  color: tab === t ? "#a78bfa" : "#4a4a68",
                  boxShadow: tab === t ? "0 0 0 1px rgba(124,106,245,0.3)" : "none",
                }}>
                {t === "login" ? "Sign In" : "Register"}
              </button>
            ))}
          </div>

          {/* Form */}
          {tab === "login" ? (
            <form onSubmit={e => { e.preventDefault(); go(() => api.login(loginEmail, loginPassword)); }}>
              <Field label="Email" type="email" value={loginEmail} onChange={setLoginEmail} placeholder="you@example.com" />
              <Field label="Password" type="password" value={loginPassword} onChange={setLoginPassword} placeholder="Your password" />
              {error && <ErrBox msg={error} />}
              <SubmitBtn loading={loading} label="Sign In" loadingLabel="Signing in…" />
            </form>
          ) : (
            <form onSubmit={e => {
              e.preventDefault();
              if (regPassword !== regConfirm) { setError("Passwords don't match"); return; }
              go(() => api.register(regUsername, regEmail, regPassword));
            }}>
              <Field label="Username" type="text" value={regUsername} onChange={setRegUsername} placeholder="your_username" />
              <Field label="Email" type="email" value={regEmail} onChange={setRegEmail} placeholder="you@example.com" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Password" type="password" value={regPassword} onChange={setRegPassword} placeholder="••••••••" />
                <Field label="Confirm" type="password" value={regConfirm} onChange={setRegConfirm} placeholder="••••••••" />
              </div>
              {error && <ErrBox msg={error} />}
              <SubmitBtn loading={loading} label="Create Account" loadingLabel="Creating…" />
            </form>
          )}

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
            <span style={{ fontSize: 12, color: "#2e2e4a" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
          </div>

          {/* Demo */}
          <button onClick={() => go(() => api.demoLogin())} disabled={loading}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              padding: "13px 0", borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: "pointer",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#7070a0",
              transition: "all 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "#c4c4e0"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "#7070a0"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}>
            {loading ? <Spin /> : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            )}
            Continue with Demo — no signup needed
          </button>

          <p style={{ fontSize: 11, color: "#252538", textAlign: "center", marginTop: 24 }}>
            By continuing, you agree to our Terms of Service
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function Field({ label, type, value, onChange, placeholder }: {
  label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3a3a5a", marginBottom: 6, letterSpacing: "0.04em" }}>
        {label.toUpperCase()}
      </label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required
        style={{
          width: "100%", padding: "11px 14px", borderRadius: 9, fontSize: 14,
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
          color: "#e0e0f8", outline: "none", boxSizing: "border-box",
          transition: "border-color 0.2s, background 0.2s",
        }}
        onFocus={e => { e.currentTarget.style.borderColor = "rgba(124,106,245,0.6)"; e.currentTarget.style.background = "rgba(124,106,245,0.05)"; }}
        onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
      />
    </div>
  );
}

function SubmitBtn({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel: string }) {
  return (
    <button type="submit" disabled={loading}
      style={{
        width: "100%", padding: "13px 0", borderRadius: 10, fontSize: 14, fontWeight: 600,
        color: "white", border: "none", cursor: loading ? "not-allowed" : "pointer",
        background: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)",
        boxShadow: "0 4px 24px rgba(124,58,237,0.35)",
        opacity: loading ? 0.7 : 1, transition: "all 0.2s", marginTop: 4,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}
      onMouseEnter={e => { if (!loading) e.currentTarget.style.background = "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)"; }}>
      {loading ? <><Spin />{loadingLabel}</> : label}
    </button>
  );
}

function ErrBox({ msg }: { msg: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px",
      borderRadius: 8, marginBottom: 12, fontSize: 13,
      background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5",
    }}>
      {msg}
    </div>
  );
}

function Spin() {
  return (
    <span style={{
      display: "inline-block", width: 14, height: 14, border: "2px solid currentColor",
      borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite", opacity: 0.7,
    }} />
  );
}

function extractMsg(raw: string): string {
  try {
    const m = raw.match(/\d+: (.+)/);
    if (!m) return raw;
    return JSON.parse(m[1]).detail || raw;
  } catch { return raw; }
}

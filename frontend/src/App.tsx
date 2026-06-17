import { AuthProvider, useAuth } from "./context/AuthContext";
import { AuthPage } from "./components/AuthPage";
import { TaskDashboard } from "./components/TaskDashboard";

function Shell() {
  const { token, username, logout } = useAuth();
  if (!token) return <AuthPage />;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#08080f", color: "#e2e2f0" }}>
      {/* Header */}
      <header style={{
        height: 60, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 28px", flexShrink: 0, position: "sticky", top: 0, zIndex: 30,
        background: "rgba(8,8,15,0.92)", backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        {/* logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
            boxShadow: "0 2px 16px rgba(124,58,237,0.4)",
          }}>
            <span style={{ color: "white", fontSize: 15, fontWeight: 900, letterSpacing: "-0.5px" }}>S</span>
          </div>
          <span style={{ fontSize: 17, fontWeight: 700, color: "#f0f0ff", letterSpacing: "-0.3px" }}>Synapse</span>
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", padding: "2px 7px", borderRadius: 4,
            color: "#7c6af5", background: "rgba(124,106,245,0.12)", border: "1px solid rgba(124,106,245,0.22)",
            textTransform: "uppercase",
          }}>BETA</span>
        </div>

        {/* user controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
              fontSize: 12, fontWeight: 700, color: "white",
              boxShadow: "0 2px 10px rgba(124,58,237,0.3)",
            }}>
              {username?.[0]?.toUpperCase() ?? "U"}
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#b0b0cc" }}>{username}</span>
          </div>
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }} />
          <button onClick={logout}
            style={{ fontSize: 13, color: "#4a4a6a", background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 6, transition: "color 0.15s" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#c0c0e0")}
            onMouseLeave={e => (e.currentTarget.style.color = "#4a4a6a")}>
            Sign out
          </button>
        </div>
      </header>

      <main style={{ flex: 1, overflow: "hidden" }}>
        <TaskDashboard />
      </main>
    </div>
  );
}

export default function App() {
  return <AuthProvider><Shell /></AuthProvider>;
}

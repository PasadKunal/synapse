import { AuthProvider, useAuth } from "./context/AuthContext";
import { AuthPage } from "./components/AuthPage";
import { TaskDashboard } from "./components/TaskDashboard";

function Shell() {
  const { token, username, logout } = useAuth();

  if (!token) return <AuthPage />;

  return (
    <div className="min-h-screen bg-[#07070e] text-slate-100 flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-white/[0.06] px-5 flex items-center justify-between flex-shrink-0 bg-[#07070e]/95 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-900/40">
            <span className="text-sm font-bold text-white">S</span>
          </div>
          <span className="text-sm font-semibold tracking-tight text-white">Synapse</span>
          <span className="text-[10px] font-medium text-violet-400/70 bg-violet-500/10 border border-violet-500/20 rounded px-1.5 py-0.5 ml-0.5">BETA</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2.5 bg-white/[0.04] border border-white/[0.07] rounded-lg px-3 py-1.5">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-[10px] font-bold text-white">
              {username?.[0]?.toUpperCase() ?? "U"}
            </div>
            <span className="text-xs text-slate-300 font-medium">{username}</span>
          </div>
          <button
            onClick={logout}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/[0.05] font-medium"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <TaskDashboard />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

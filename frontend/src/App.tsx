import { AuthProvider, useAuth } from "./context/AuthContext";
import { AuthPage } from "./components/AuthPage";
import { TaskDashboard } from "./components/TaskDashboard";

function Shell() {
  const { token, username, logout } = useAuth();

  if (!token) return <AuthPage />;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800/60 px-6 py-3 flex items-center justify-between flex-shrink-0 bg-gray-950/95 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="text-xl">⚡</span>
          <span className="text-lg font-bold bg-gradient-to-r from-purple-400 to-violet-300 bg-clip-text text-transparent">
            Synapse
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-800/60 rounded-lg px-3 py-1.5">
            <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold text-white">
              {username?.[0]?.toUpperCase() ?? "U"}
            </div>
            <span className="text-sm text-gray-300">{username}</span>
          </div>
          <button
            onClick={logout}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1.5 rounded hover:bg-gray-800"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main */}
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

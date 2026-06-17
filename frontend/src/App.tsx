import { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { TaskDashboard } from "./components/TaskDashboard";
import { DevLogin } from "./components/DevLogin";

type Tab = "tasks";

function Shell() {
  const { token } = useAuth();
  const [tab] = useState<Tab>("tasks");

  if (!token) return <DevLogin />;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Top nav */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-6">
        <span className="text-xl font-bold text-purple-400">⚡ Synapse</span>
        <nav className="flex gap-4 text-sm">
          <button className="text-purple-400 border-b border-purple-400 pb-1">
            Tasks
          </button>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {tab === "tasks" && <TaskDashboard />}
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

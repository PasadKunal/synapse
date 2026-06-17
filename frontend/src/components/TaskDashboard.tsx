import { useEffect, useRef, useState } from "react";
import { api, type Task } from "../api/client";
import { TraceViewer } from "./TraceViewer";

export function TaskDashboard() {
  const [input, setInput] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load task history on mount
  useEffect(() => {
    api.listTasks().then(setTasks).catch(() => {});
  }, []);

  // Poll the active task until done or failed
  useEffect(() => {
    if (!activeTaskId) return;
    pollRef.current = setInterval(async () => {
      try {
        const task = await api.getTask(activeTaskId);
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? task : t))
        );
        if (task.status === "done" || task.status === "failed") {
          clearInterval(pollRef.current!);
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(pollRef.current!);
  }, [activeTaskId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const task = await api.createTask(input.trim());
      setTasks((prev) => [task, ...prev]);
      setActiveTaskId(task.id);
      setInput("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFeedback = async (taskId: string, thumbsUp: boolean) => {
    try {
      await api.submitFeedback(taskId, thumbsUp);
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6">
      {/* Input */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-100 mb-4">New Task</h2>
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-100 focus:outline-none focus:border-purple-500 placeholder-gray-500"
            placeholder="Ask anything — research, code, analysis, writing..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={submitting}
          />
          <button
            type="submit"
            disabled={submitting || !input.trim()}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {submitting ? "Sending..." : "Run"}
          </button>
        </form>
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      </div>

      {/* Active task trace */}
      {activeTaskId && (
        <TraceViewer
          taskId={activeTaskId}
          onClose={() => setActiveTaskId(null)}
        />
      )}

      {/* Task history */}
      {tasks.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-100 mb-4">History</h2>
          <div className="space-y-3">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onSelect={() => setActiveTaskId(task.id)}
                onFeedback={handleFeedback}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  onSelect,
  onFeedback,
}: {
  task: Task;
  onSelect: () => void;
  onFeedback: (id: string, up: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const statusColor = {
    pending: "text-yellow-400",
    running: "text-blue-400 animate-pulse",
    done: "text-green-400",
    failed: "text-red-400",
  }[task.status];

  const statusDot = {
    pending: "bg-yellow-400",
    running: "bg-blue-400",
    done: "bg-green-400",
    failed: "bg-red-400",
  }[task.status];

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-800/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot}`} />
        <p className="flex-1 text-sm text-gray-200 truncate">{task.input}</p>
        <span className={`text-xs font-mono ${statusColor}`}>{task.status}</span>
        {task.token_cost > 0 && (
          <span className="text-xs text-gray-500">{task.token_cost} tokens</span>
        )}
        <button
          className="text-xs text-gray-600 hover:text-purple-400 ml-1"
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
          trace →
        </button>
      </div>

      {/* Expanded answer */}
      {expanded && task.result?.answer && (
        <div className="px-4 pb-4 border-t border-gray-800">
          <p className="text-sm text-gray-300 mt-3 whitespace-pre-wrap leading-relaxed">
            {task.result.answer}
          </p>
          {task.status === "done" && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => onFeedback(task.id, true)}
                className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-green-900 text-gray-400 hover:text-green-400 transition-colors"
              >
                👍 Good
              </button>
              <button
                onClick={() => onFeedback(task.id, false)}
                className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-red-900 text-gray-400 hover:text-red-400 transition-colors"
              >
                👎 Bad
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { api, type Task } from "../api/client";
import { TraceViewer } from "./TraceViewer";

const EXAMPLE_PROMPTS = [
  "Write a binary search function in Python",
  "Explain how transformers work in machine learning",
  "Compare REST vs GraphQL APIs",
  "Write a script to find duplicate files in a folder",
];

export function TaskDashboard() {
  const [input, setInput] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.listTasks().then(setTasks).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeTaskId) return;
    pollRef.current = setInterval(async () => {
      try {
        const task = await api.getTask(activeTaskId);
        setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
        if (task.status === "done" || task.status === "failed") {
          clearInterval(pollRef.current!);
          setSelectedTaskId(task.id);
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(pollRef.current!);
  }, [activeTaskId]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    setSelectedTaskId(null);
    try {
      const task = await api.createTask(input.trim());
      setTasks((prev) => [task, ...prev]);
      setActiveTaskId(task.id);
      setSelectedTaskId(task.id);
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
  };

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  return (
    <div className="flex h-[calc(100vh-57px)] overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="w-72 flex-shrink-0 border-r border-gray-800/60 flex flex-col bg-gray-950">
        <div className="p-4 border-b border-gray-800/60">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Task History</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {tasks.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-600 mt-8">
              <p>No tasks yet.</p>
              <p className="mt-1">Run your first task →</p>
            </div>
          ) : (
            <div className="py-2">
              {tasks.map((task) => (
                <SidebarItem
                  key={task.id}
                  task={task}
                  isSelected={task.id === selectedTaskId}
                  onClick={() => {
                    setSelectedTaskId(task.id);
                    if (task.status === "running" || task.status === "pending") {
                      setActiveTaskId(task.id);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Input area */}
        <div className="p-5 border-b border-gray-800/60 flex-shrink-0">
          <form onSubmit={handleSubmit}>
            <div className="relative">
              <textarea
                ref={textareaRef}
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={submitting}
                placeholder="Ask anything — research, code, analysis, writing..."
                className="w-full bg-gray-900 border border-gray-700/80 rounded-xl px-4 py-3 pr-24 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-purple-500/70 focus:ring-1 focus:ring-purple-500/20 resize-none transition"
              />
              <button
                type="submit"
                disabled={submitting || !input.trim()}
                className="absolute right-3 bottom-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
              >
                {submitting ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Running
                  </span>
                ) : (
                  <>Run <span className="opacity-50 text-[10px]">⌘↵</span></>
                )}
              </button>
            </div>
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
          </form>

          {/* Example prompts */}
          {tasks.length === 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {EXAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => { setInput(p); textareaRef.current?.focus(); }}
                  className="text-xs text-gray-500 hover:text-purple-400 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-purple-500/30 rounded-lg px-3 py-1.5 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Live trace for active task */}
          {activeTaskId && (
            <TraceViewer
              taskId={activeTaskId}
              onClose={() => setActiveTaskId(null)}
            />
          )}

          {/* Selected task answer */}
          {selectedTask && selectedTask.result && (
            <TaskAnswer task={selectedTask} />
          )}

          {/* Empty state */}
          {!selectedTask && !activeTaskId && tasks.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <div className="text-5xl mb-4">⚡</div>
              <h2 className="text-xl font-semibold text-gray-300 mb-2">Ready to run</h2>
              <p className="text-sm text-gray-500 max-w-xs">
                Type a task above or pick an example. The AI will research, code, analyse, or write — and stream each step live.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SidebarItem({
  task, isSelected, onClick,
}: {
  task: Task;
  isSelected: boolean;
  onClick: () => void;
}) {
  const dot = {
    pending: "bg-yellow-500",
    running: "bg-blue-500 animate-pulse",
    done: "bg-green-500",
    failed: "bg-red-500",
  }[task.status];

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors border-l-2 ${
        isSelected
          ? "bg-purple-950/40 border-purple-500 text-gray-100"
          : "border-transparent hover:bg-gray-800/40 text-gray-400 hover:text-gray-200"
      }`}
    >
      <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${dot}`} />
      <div className="min-w-0">
        <p className="text-xs truncate leading-relaxed">{task.input}</p>
        {task.token_cost > 0 && (
          <p className="text-[10px] text-gray-600 mt-0.5">{task.token_cost.toLocaleString()} tokens</p>
        )}
      </div>
    </button>
  );
}

function TaskAnswer({ task }: { task: Task }) {
  const [feedbackSent, setFeedbackSent] = useState<"up" | "down" | null>(null);

  const handleFeedback = async (up: boolean) => {
    try {
      await api.submitFeedback(task.id, up);
      setFeedbackSent(up ? "up" : "down");
    } catch { /* ignore */ }
  };

  const answer = task.result?.answer ?? task.result?.error ?? "";

  return (
    <div className="bg-gray-900/60 border border-gray-800/60 rounded-xl overflow-hidden">
      {/* Task header */}
      <div className="px-5 py-3 border-b border-gray-800/60 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
            task.status === "done" ? "bg-green-500" : "bg-red-500"
          }`} />
          <p className="text-sm text-gray-300 truncate">{task.input}</p>
        </div>
        <span className="text-xs text-gray-600 flex-shrink-0 ml-3">
          {task.token_cost.toLocaleString()} tokens
        </span>
      </div>

      {/* Answer */}
      <div className="px-5 py-4">
        {task.status === "failed" ? (
          <p className="text-red-400 text-sm">{answer}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed">
            <ReactMarkdown
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const isBlock = match || String(children).includes("\n");
                  return isBlock ? (
                    <SyntaxHighlighter
                      style={oneDark}
                      language={match ? match[1] : "python"}
                      PreTag="div"
                      customStyle={{ borderRadius: "0.5rem", fontSize: "0.8rem" }}
                    >
                      {String(children).replace(/\n$/, "")}
                    </SyntaxHighlighter>
                  ) : (
                    <code className="bg-gray-800 px-1.5 py-0.5 rounded text-purple-300 text-xs font-mono" {...props}>
                      {children}
                    </code>
                  );
                },
                h1: ({ children }) => <h1 className="text-lg font-bold text-gray-100 mt-4 mb-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-semibold text-gray-200 mt-3 mb-1.5">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-200 mt-2 mb-1">{children}</h3>,
                strong: ({ children }) => <strong className="font-semibold text-gray-200">{children}</strong>,
                a: ({ children, href }) => <a href={href} className="text-purple-400 hover:underline" target="_blank" rel="noreferrer">{children}</a>,
                hr: () => <hr className="border-gray-700 my-4" />,
              }}
            >
              {answer}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {/* Feedback */}
      {task.status === "done" && (
        <div className="px-5 pb-4 flex items-center gap-2">
          <span className="text-xs text-gray-600">Was this helpful?</span>
          <button
            onClick={() => handleFeedback(true)}
            disabled={!!feedbackSent}
            className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
              feedbackSent === "up"
                ? "bg-green-900/50 border-green-700 text-green-400"
                : "bg-gray-800 border-gray-700 text-gray-400 hover:border-green-600 hover:text-green-400"
            }`}
          >
            👍 Yes
          </button>
          <button
            onClick={() => handleFeedback(false)}
            disabled={!!feedbackSent}
            className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
              feedbackSent === "down"
                ? "bg-red-900/50 border-red-700 text-red-400"
                : "bg-gray-800 border-gray-700 text-gray-400 hover:border-red-600 hover:text-red-400"
            }`}
          >
            👎 No
          </button>
          {feedbackSent && (
            <span className="text-xs text-gray-500">Thanks for the feedback!</span>
          )}
        </div>
      )}
    </div>
  );
}

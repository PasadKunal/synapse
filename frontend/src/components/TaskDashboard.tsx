import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { api, type Task } from "../api/client";
import { TraceViewer } from "./TraceViewer";

const EXAMPLES = [
  "Write a binary search in Python",
  "Explain how neural networks work",
  "Compare REST vs GraphQL",
  "Analyse time complexity of quicksort",
];

export function TaskDashboard() {
  const [input, setInput] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api.listTasks().then(setTasks).catch(() => {}); }, []);

  useEffect(() => {
    if (!activeTaskId) return;
    pollRef.current = setInterval(async () => {
      try {
        const task = await api.getTask(activeTaskId);
        setTasks(prev => prev.map(t => t.id === task.id ? task : t));
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
    setSubmitting(true); setError(""); setSelectedTaskId(null);
    try {
      const task = await api.createTask(input.trim());
      setTasks(prev => [task, ...prev]);
      setActiveTaskId(task.id);
      setSelectedTaskId(task.id);
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally { setSubmitting(false); }
  };

  const selectedTask = tasks.find(t => t.id === selectedTaskId) ?? null;

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className="w-64 flex-shrink-0 border-r border-white/[0.05] flex flex-col bg-[#0a0a15]">
        <div className="px-4 py-3 border-b border-white/[0.05]">
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Task History</p>
        </div>
        <div className="flex-1 overflow-y-auto py-1 scrollbar-thin">
          {tasks.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-slate-600">No tasks yet</p>
            </div>
          ) : (
            tasks.map(task => (
              <SidebarItem
                key={task.id}
                task={task}
                isSelected={task.id === selectedTaskId}
                onClick={() => {
                  setSelectedTaskId(task.id);
                  if (task.status === "running" || task.status === "pending") setActiveTaskId(task.id);
                }}
              />
            ))
          )}
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#07070e]">

        {/* Input bar */}
        <div className="px-6 py-4 border-b border-white/[0.05] flex-shrink-0">
          <form onSubmit={handleSubmit} className="flex items-center gap-3">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                disabled={submitting}
                placeholder="Ask anything — research, code, analysis, writing…"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500/50 focus:bg-white/[0.05] focus:ring-1 focus:ring-violet-500/15 transition-all"
                onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !input.trim()}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-3 rounded-xl transition-colors shadow-lg shadow-violet-900/30 flex-shrink-0"
            >
              {submitting ? (
                <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Running</>
              ) : "Run →"}
            </button>
          </form>

          {error && <p className="text-red-400 text-xs mt-2 ml-1">{error}</p>}

          {/* Example chips — only when no tasks */}
          {tasks.length === 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {EXAMPLES.map(p => (
                <button key={p} onClick={() => { setInput(p); inputRef.current?.focus(); }}
                  className="text-xs text-slate-500 hover:text-slate-300 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] hover:border-violet-500/30 rounded-lg px-3 py-1.5 transition-all">
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {activeTaskId && (
            <TraceViewer taskId={activeTaskId} onClose={() => setActiveTaskId(null)} />
          )}

          {selectedTask?.result && (
            <TaskAnswer task={selectedTask} />
          )}

          {!selectedTask && !activeTaskId && tasks.length === 0 && (
            <EmptyState onExample={(p) => { setInput(p); inputRef.current?.focus(); }} />
          )}
        </div>
      </div>
    </div>
  );
}

function SidebarItem({ task, isSelected, onClick }: { task: Task; isSelected: boolean; onClick: () => void }) {
  const statusDot: Record<string, string> = {
    pending: "bg-amber-500",
    running: "bg-blue-400 animate-pulse",
    done: "bg-emerald-500",
    failed: "bg-red-500",
  };
  return (
    <button onClick={onClick}
      className={`w-full text-left px-4 py-2.5 flex items-start gap-2.5 transition-all group border-l-2 ${
        isSelected
          ? "border-violet-500 bg-violet-500/[0.08] text-slate-200"
          : "border-transparent hover:bg-white/[0.03] text-slate-500 hover:text-slate-300"
      }`}>
      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${statusDot[task.status]}`} />
      <div className="min-w-0 flex-1">
        <p className="text-xs truncate leading-relaxed">{task.input}</p>
        {task.token_cost > 0 && (
          <p className={`text-[10px] mt-0.5 ${isSelected ? "text-slate-500" : "text-slate-700 group-hover:text-slate-600"}`}>
            {task.token_cost.toLocaleString()} tokens
          </p>
        )}
      </div>
    </button>
  );
}

function TaskAnswer({ task }: { task: Task }) {
  const [feedbackSent, setFeedbackSent] = useState<"up" | "down" | null>(null);
  const answer = task.result?.answer ?? task.result?.error ?? "";

  return (
    <div className="bg-[#0e0e1c] border border-white/[0.07] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-white/[0.05] flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${task.status === "done" ? "bg-emerald-500" : "bg-red-500"}`} />
          <p className="text-sm text-slate-300 font-medium truncate">{task.input}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[11px] text-slate-600 font-mono">{task.token_cost.toLocaleString()} tok</span>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
            task.status === "done"
              ? "text-emerald-400 bg-emerald-500/10"
              : "text-red-400 bg-red-500/10"
          }`}>{task.status}</span>
        </div>
      </div>

      {/* Answer body */}
      <div className="px-5 py-5">
        {task.status === "failed" ? (
          <p className="text-red-400 text-sm">{answer}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none text-slate-300 leading-relaxed">
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
                      customStyle={{ borderRadius: "0.75rem", fontSize: "0.78rem", background: "#0d0d1a", border: "1px solid rgba(255,255,255,0.07)" }}
                    >
                      {String(children).replace(/\n$/, "")}
                    </SyntaxHighlighter>
                  ) : (
                    <code className="bg-white/[0.07] text-violet-300 text-xs font-mono px-1.5 py-0.5 rounded" {...props}>{children}</code>
                  );
                },
                h1: ({ children }) => <h1 className="text-base font-bold text-slate-100 mt-5 mb-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-sm font-semibold text-slate-200 mt-4 mb-1.5">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-semibold text-slate-300 mt-3 mb-1">{children}</h3>,
                strong: ({ children }) => <strong className="font-semibold text-slate-200">{children}</strong>,
                p: ({ children }) => <p className="text-slate-400 leading-relaxed mb-3">{children}</p>,
                li: ({ children }) => <li className="text-slate-400">{children}</li>,
                a: ({ href, children }) => <a href={href} className="text-violet-400 hover:text-violet-300 hover:underline" target="_blank" rel="noreferrer">{children}</a>,
                hr: () => <hr className="border-white/[0.07] my-4" />,
                blockquote: ({ children }) => <blockquote className="border-l-2 border-violet-500/40 pl-4 text-slate-500 italic">{children}</blockquote>,
              }}
            >
              {answer}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {/* Feedback */}
      {task.status === "done" && (
        <div className="px-5 pb-4 flex items-center gap-2.5 border-t border-white/[0.04] pt-3.5">
          <span className="text-[11px] text-slate-600 font-medium">Helpful?</span>
          <button onClick={async () => { await api.submitFeedback(task.id, true); setFeedbackSent("up"); }}
            disabled={!!feedbackSent}
            className={`text-xs px-3 py-1 rounded-lg border font-medium transition-all ${
              feedbackSent === "up"
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                : "bg-white/[0.03] border-white/[0.08] text-slate-500 hover:text-emerald-400 hover:border-emerald-500/30"
            }`}>
            👍 Yes
          </button>
          <button onClick={async () => { await api.submitFeedback(task.id, false); setFeedbackSent("down"); }}
            disabled={!!feedbackSent}
            className={`text-xs px-3 py-1 rounded-lg border font-medium transition-all ${
              feedbackSent === "down"
                ? "bg-red-500/15 border-red-500/30 text-red-400"
                : "bg-white/[0.03] border-white/[0.08] text-slate-500 hover:text-red-400 hover:border-red-500/30"
            }`}>
            👎 No
          </button>
          {feedbackSent && <span className="text-[11px] text-slate-600">Thanks!</span>}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onExample }: { onExample: (p: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-24 text-center">
      <div className="w-14 h-14 rounded-2xl bg-violet-600/15 border border-violet-500/20 flex items-center justify-center mb-5">
        <span className="text-2xl">⚡</span>
      </div>
      <h2 className="text-lg font-semibold text-slate-200 mb-2">What can I help with?</h2>
      <p className="text-sm text-slate-600 max-w-sm mb-8 leading-relaxed">
        I can research the web, write and execute code, analyse data, or produce long-form content — streaming every agent step live.
      </p>
      <div className="grid grid-cols-2 gap-2 max-w-sm w-full">
        {EXAMPLES.map(p => (
          <button key={p} onClick={() => onExample(p)}
            className="text-xs text-slate-500 hover:text-slate-200 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] hover:border-violet-500/30 rounded-xl px-4 py-3 text-left transition-all leading-relaxed">
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

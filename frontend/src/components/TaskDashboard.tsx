import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { api, type Task, type Span } from "../api/client";
import { TraceViewer } from "./TraceViewer";

const EXAMPLES = [
  { category: "Code",     color: "#fbbf24", bg: "rgba(251,191,36,0.1)",  prompts: ["Write a binary search in Python", "Implement a rate limiter in TypeScript"] },
  { category: "Research", color: "#38bdf8", bg: "rgba(56,189,248,0.1)",  prompts: ["Explain how transformers work", "What is retrieval-augmented generation?"] },
  { category: "Analysis", color: "#f97316", bg: "rgba(249,115,22,0.1)",  prompts: ["Compare REST vs GraphQL APIs", "Analyse quicksort vs mergesort"] },
  { category: "Writing",  color: "#34d399", bg: "rgba(52,211,153,0.1)",  prompts: ["Write a README for a FastAPI project", "Draft a technical design doc"] },
];

export function TaskDashboard() {
  const [input, setInput] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showTrace, setShowTrace] = useState(false);
  const [taskSpans, setTaskSpans] = useState<Record<string, Span[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.listTasks().then(loaded => {
      setTasks(loaded);
      // Resume any in-progress task automatically, but don't auto-open completed ones
      const inProgress = loaded.find(t => t.status === "running" || t.status === "pending");
      if (inProgress) {
        setSelectedTaskId(inProgress.id);
        setActiveTaskId(inProgress.id);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeTaskId) return;
    pollRef.current = setInterval(async () => {
      try {
        const task = await api.getTask(activeTaskId);
        setTasks(prev => prev.map(t => t.id === task.id ? task : t));
        if (task.status === "done" || task.status === "failed") {
          clearInterval(pollRef.current!);
          setSelectedTaskId(task.id);
          // Auto-collapse trace 2s after task finishes
          setTimeout(() => { setActiveTaskId(null); setShowTrace(false); }, 2000);
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(pollRef.current!);
  }, [activeTaskId]);

  const handleSubmit = async (prompt?: string) => {
    const text = (prompt ?? input).trim();
    if (!text || submitting) return;
    setSubmitting(true); setError(""); setSelectedTaskId(null); setShowTrace(true);
    try {
      const task = await api.createTask(text);
      setTasks(prev => [task, ...prev]);
      setActiveTaskId(task.id);
      setSelectedTaskId(task.id);
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally { setSubmitting(false); }
  };

  // For completed tasks with no cached spans, fetch from the API so the trace can replay
  useEffect(() => {
    if (!selectedTaskId) return;
    const task = tasks.find(t => t.id === selectedTaskId);
    if (!task || task.status !== "done") return;
    if (taskSpans[selectedTaskId]?.length) return;
    api.getTaskSpans(selectedTaskId).then(spans => {
      if (spans.length) setTaskSpans(prev => ({ ...prev, [selectedTaskId]: spans }));
    }).catch(() => {});
  }, [selectedTaskId]);

  const selectedTask = tasks.find(t => t.id === selectedTaskId) ?? null;
  const showEmpty = !selectedTask && !activeTaskId && !submitting;

  return (
    <div style={{ display: "flex", height: "calc(100vh - 60px)", overflow: "hidden" }}>

      {/* Sidebar */}
      <aside style={{
        width: 264, flexShrink: 0, display: "flex", flexDirection: "column",
        background: "#0b0b16", borderRight: "1px solid rgba(255,255,255,0.06)",
      }}>
        {/* New task button */}
        <div style={{ padding: "16px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <button
            onClick={() => { setSelectedTaskId(null); setActiveTaskId(null); inputRef.current?.focus(); }}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: "rgba(124,106,245,0.1)", border: "1px solid rgba(124,106,245,0.2)", color: "#a78bfa",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(124,106,245,0.16)"; e.currentTarget.style.borderColor = "rgba(124,106,245,0.35)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(124,106,245,0.1)"; e.currentTarget.style.borderColor = "rgba(124,106,245,0.2)"; }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Task
          </button>
        </div>

        {/* History label */}
        <div style={{ padding: "14px 16px 8px" }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#2e2e48", textTransform: "uppercase" }}>
            Recent
          </p>
        </div>

        {/* Task list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {tasks.length === 0 ? (
            <p style={{ fontSize: 12, color: "#252540", textAlign: "center", padding: "32px 16px" }}>No tasks yet</p>
          ) : tasks.map(task => (
            <SidebarItem key={task.id} task={task} selected={task.id === selectedTaskId}
              onClick={() => {
                setSelectedTaskId(task.id);
                setShowTrace(false);
                if (task.status === "running" || task.status === "pending") setActiveTaskId(task.id);
                else setActiveTaskId(null);
              }} />
          ))}
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#08080f" }}>

        {/* Input bar */}
        <div style={{ padding: "20px 28px", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <input
              ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              disabled={submitting}
              placeholder="Ask anything: research, code, analysis, writing..."
              style={{
                flex: 1, padding: "13px 18px", borderRadius: 12, fontSize: 14,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                color: "#e2e2f0", outline: "none", transition: "all 0.2s",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "rgba(124,106,245,0.5)"; e.currentTarget.style.background = "rgba(124,106,245,0.04)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
            />
            <button
              onClick={() => handleSubmit()}
              disabled={submitting || !input.trim()}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "13px 22px",
                borderRadius: 12, fontSize: 14, fontWeight: 600, color: "white", cursor: "pointer",
                background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
                boxShadow: "0 4px 20px rgba(124,58,237,0.3)",
                border: "none", flexShrink: 0, transition: "all 0.2s",
                opacity: submitting || !input.trim() ? 0.4 : 1,
              }}
              onMouseEnter={e => { if (!submitting && input.trim()) e.currentTarget.style.background = "linear-gradient(135deg, #8b5cf6, #6d28d9)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "linear-gradient(135deg, #7c3aed, #5b21b6)"; }}>
              {submitting ? (
                <><span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />Running</>
              ) : (
                <>Run <span style={{ fontSize: 16, lineHeight: 1 }}>→</span></>
              )}
            </button>
          </div>
          {error && <p style={{ fontSize: 12, color: "#f87171", marginTop: 8 }}>{error}</p>}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px" }}>
          {showEmpty ? (
            <EmptyState onExample={handleSubmit} />
          ) : (
            <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
              {showTrace && selectedTask && (
                <TraceViewer
                  key={selectedTask.id}
                  taskId={selectedTask.id}
                  onClose={() => { setActiveTaskId(null); setShowTrace(false); }}
                  preloadedSpans={
                    activeTaskId === selectedTask.id
                      ? undefined
                      : taskSpans[selectedTask.id] ?? []
                  }
                  onSpan={span => setTaskSpans(prev => ({
                    ...prev,
                    [selectedTask.id]: [...(prev[selectedTask.id] ?? []), span],
                  }))}
                />
              )}
              {selectedTask ? (
                <TaskAnswer
                  task={selectedTask}
                  showTrace={showTrace}
                  onToggleTrace={() => setShowTrace(v => !v)}
                />
              ) : submitting ? (
                <CreatingTaskCard input={input} />
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* Sidebar Item */
function SidebarItem({ task, selected, onClick }: { task: Task; selected: boolean; onClick: () => void }) {
  const dotColor: Record<string, string> = {
    pending: "#f59e0b", running: "#60a5fa", done: "#34d399", failed: "#f87171",
  };

  return (
    <button onClick={onClick}
      style={{
        width: "100%", textAlign: "left", padding: "10px 16px 10px 14px",
        display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
        background: selected ? "rgba(124,106,245,0.09)" : "transparent",
        borderLeft: `2px solid ${selected ? "#7c6af5" : "transparent"}`,
        border: "none", transition: "all 0.15s",
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "transparent"; }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%", marginTop: 5, flexShrink: 0,
        background: dotColor[task.status],
        boxShadow: task.status === "running" ? `0 0 6px ${dotColor[task.status]}` : "none",
      }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{
          fontSize: 13, color: selected ? "#d0d0ea" : "#6a6a88",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          lineHeight: 1.4,
        }}>
          {task.input}
        </p>
        {task.token_cost > 0 && (
          <p style={{ fontSize: 10, color: "#2a2a44", fontFamily: "monospace", marginTop: 2 }}>
            {task.token_cost.toLocaleString()} tokens
          </p>
        )}
      </div>
    </button>
  );
}

/* Task Answer Card */
function TaskAnswer({ task, showTrace, onToggleTrace }: { task: Task; showTrace: boolean; onToggleTrace: () => void }) {
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const answer = task.result?.answer ?? task.result?.error ?? "";

  return (
    <div style={{
      borderRadius: 16, overflow: "hidden",
      background: "#0e0e1c", border: "1px solid rgba(255,255,255,0.07)",
    }}>
      {/* Card header */}
      <div style={{
        padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid rgba(255,255,255,0.06)", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
            background: task.status === "done" ? "#34d399" : task.status === "running" || task.status === "pending" ? "#60a5fa" : "#f87171",
            boxShadow: (task.status === "running" || task.status === "pending") ? "0 0 8px #60a5fa" : "none",
          }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: "#d4d4ec", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {task.input}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {task.token_cost > 0 && (
            <span style={{ fontSize: 12, fontFamily: "monospace", color: "#3a3a58" }}>
              {task.token_cost.toLocaleString()} tok
            </span>
          )}
          {/* Trace toggle */}
          <button onClick={onToggleTrace}
              style={{
                display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20,
                fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid", transition: "all 0.15s",
                ...(showTrace
                  ? { color: "#a78bfa", background: "rgba(124,106,245,0.12)", borderColor: "rgba(124,106,245,0.3)" }
                  : { color: "#3a3a58", background: "transparent", borderColor: "rgba(255,255,255,0.08)" }),
              }}
              onMouseEnter={e => { if (!showTrace) { e.currentTarget.style.color = "#7070a0"; e.currentTarget.style.borderColor = "rgba(124,106,245,0.2)"; } }}
              onMouseLeave={e => { if (!showTrace) { e.currentTarget.style.color = "#3a3a58"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; } }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
              Trace
          </button>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", padding: "3px 9px", borderRadius: 20,
            ...(task.status === "done"
              ? { color: "#34d399", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)" }
              : task.status === "running" || task.status === "pending"
              ? { color: "#60a5fa", background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)" }
              : { color: "#f87171", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)" }),
          }}>
            {task.status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Answer body */}
      <div style={{ padding: "28px 28px 20px" }}>
        {task.status === "failed"
          ? <FailureBox raw={answer} />
          : task.status === "running" || task.status === "pending"
          ? <RunningPlaceholder />
          : <MarkdownContent content={answer} />
        }
      </div>

      {/* Feedback */}
      {task.status === "done" && (
        <div style={{ padding: "12px 24px 16px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: "#3a3a58" }}>Was this helpful?</span>
          {[
            { key: "up" as const, label: "Yes", active: { color: "#34d399", bg: "rgba(52,211,153,0.1)", border: "rgba(52,211,153,0.25)" } },
            { key: "down" as const, label: "No", active: { color: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.25)" } },
          ].map(btn => (
            <button key={btn.key}
              onClick={async () => { await api.submitFeedback(task.id, btn.key === "up"); setFeedback(btn.key); }}
              disabled={!!feedback}
              style={{
                fontSize: 12, padding: "4px 12px", borderRadius: 8, cursor: feedback ? "default" : "pointer",
                background: feedback === btn.key ? btn.active.bg : "rgba(255,255,255,0.04)",
                border: `1px solid ${feedback === btn.key ? btn.active.border : "rgba(255,255,255,0.08)"}`,
                color: feedback === btn.key ? btn.active.color : "#4a4a68",
                transition: "all 0.15s",
              }}>
              {btn.label}
            </button>
          ))}
          {feedback && <span style={{ fontSize: 12, color: "#3a3a58" }}>Thanks!</span>}
        </div>
      )}
    </div>
  );
}

function CreatingTaskCard({ input }: { input: string }) {
  return (
    <div style={{ borderRadius: 16, overflow: "hidden", background: "#0e0e1c", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div style={{ padding: "16px 24px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#60a5fa", boxShadow: "0 0 8px #60a5fa", flexShrink: 0 }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: "#d4d4ec", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {input}
        </p>
        <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", padding: "3px 9px", borderRadius: 20, color: "#60a5fa", background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)", flexShrink: 0 }}>
          CREATING
        </span>
      </div>
      <div style={{ padding: "28px 28px 20px" }}>
        <RunningPlaceholder />
      </div>
    </div>
  );
}

/* Markdown renderer, no Tailwind prose wrapper to avoid CSS conflicts */
function RunningPlaceholder() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" }}>
      {[100, 85, 92].map((w, i) => (
        <div key={i} style={{ height: 12, borderRadius: 6, background: "rgba(255,255,255,0.04)", width: `${w}%`, animation: "pulse 1.8s ease-in-out infinite", animationDelay: `${i * 0.2}s` }} />
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7c6af5", animation: "pulse 1s ease-in-out infinite" }} />
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7c6af5", animation: "pulse 1s ease-in-out infinite", animationDelay: "0.2s" }} />
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7c6af5", animation: "pulse 1s ease-in-out infinite", animationDelay: "0.4s" }} />
      </div>
    </div>
  );
}

function FailureBox({ raw }: { raw: string }) {
  // Extract the human-readable message from Groq error format:
  // "Error code: 413 - {'error': {'message': '...', ...}}"
  const clean = (() => {
    const m = raw.match(/'message':\s*'([^']+)'/);
    if (m) return m[1];
    const m2 = raw.match(/"message":\s*"([^"]+)"/);
    if (m2) return m2[1];
    // Strip "Error code: NNN - " prefix if present
    return raw.replace(/^Error code:\s*\d+\s*-\s*/, "").slice(0, 300);
  })();

  const isRateLimit = raw.includes("rate_limit") || raw.includes("TPM") || raw.includes("too large");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px", borderRadius: 10, background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.18)" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p style={{ fontSize: 13, color: "#fca5a5", lineHeight: 1.6, margin: 0 }}>{clean}</p>
      </div>
      {isRateLimit && (
        <p style={{ fontSize: 12, color: "#3a3a5a", lineHeight: 1.5 }}>
          This is a Groq free-tier token limit. Try a shorter or simpler query, or wait a moment before retrying.
        </p>
      )}
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div style={{ fontSize: 14, lineHeight: 1.75, color: "#a8a8c8" }}>
      <ReactMarkdown
        components={{
          code({ className, children }) {
            const lang = /language-(\w+)/.exec(className || "")?.[1];
            const code = String(children).replace(/\n$/, "");
            if (!lang && !code.includes("\n")) {
              return (
                <code style={{
                  fontFamily: "monospace", fontSize: 13, padding: "2px 7px", borderRadius: 5,
                  background: "rgba(124,106,245,0.12)", color: "#a78bfa",
                }}>
                  {children}
                </code>
              );
            }
            return (
              <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", margin: "16px 0" }}>
                <div style={{
                  background: "#13131f", padding: "9px 16px", display: "flex", alignItems: "center", gap: 6,
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}>
                  {[["#ff5f57","#fe3b30"],["#febc2e","#f8a800"],["#28c840","#14ae32"]].map(([bg, shadow], i) => (
                    <span key={i} style={{ width: 11, height: 11, borderRadius: "50%", background: bg, boxShadow: `0 0 4px ${shadow}40` }} />
                  ))}
                  <span style={{ marginLeft: 8, fontSize: 11, color: "#3a3a58", fontFamily: "monospace" }}>
                    {lang ?? "code"}
                  </span>
                </div>
                <SyntaxHighlighter
                  style={vscDarkPlus}
                  language={lang ?? "text"}
                  PreTag="div"
                  customStyle={{ margin: 0, borderRadius: 0, fontSize: 13, background: "#0b0b18", padding: "18px 20px" }}
                  codeTagProps={{ style: { background: "transparent", fontFamily: "monospace" } }}
                >
                  {code}
                </SyntaxHighlighter>
              </div>
            );
          },
          h1: ({ children }) => <h1 style={{ fontSize: 20, fontWeight: 700, color: "#eaeaf8", margin: "24px 0 10px", letterSpacing: "-0.3px" }}>{children}</h1>,
          h2: ({ children }) => <h2 style={{ fontSize: 17, fontWeight: 700, color: "#d8d8ec", margin: "20px 0 8px", letterSpacing: "-0.2px" }}>{children}</h2>,
          h3: ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 600, color: "#c4c4dc", margin: "16px 0 6px" }}>{children}</h3>,
          p: ({ children }) => <p style={{ color: "#9090b0", marginBottom: 12, lineHeight: 1.75 }}>{children}</p>,
          strong: ({ children }) => <strong style={{ fontWeight: 700, color: "#d0d0e8" }}>{children}</strong>,
          em: ({ children }) => <em style={{ color: "#a0a0c0", fontStyle: "italic" }}>{children}</em>,
          ul: ({ children }) => <ul style={{ paddingLeft: 22, marginBottom: 14, listStyleType: "disc" }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ paddingLeft: 22, marginBottom: 14 }}>{children}</ol>,
          li: ({ children }) => <li style={{ color: "#9090b0", marginBottom: 4, lineHeight: 1.7 }}>{children}</li>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" style={{ color: "#7c6af5", textDecoration: "underline", textUnderlineOffset: 3 }}>{children}</a>,
          blockquote: ({ children }) => (
            <blockquote style={{ borderLeft: "3px solid rgba(124,106,245,0.4)", paddingLeft: 16, margin: "12px 0", color: "#6060808", fontStyle: "italic" }}>
              {children}
            </blockquote>
          ),
          hr: () => <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.07)", margin: "20px 0" }} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/* Empty state */
function EmptyState({ onExample }: { onExample: (p: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 160px)", padding: "40px 24px" }}>
      {/* Heading */}
      <h2 style={{ fontSize: 28, fontWeight: 700, color: "#d0d0ea", marginBottom: 10, letterSpacing: "-0.5px", textAlign: "center" }}>
        What would you like to work on?
      </h2>
      <p style={{ fontSize: 15, color: "#3a3a5a", maxWidth: 420, lineHeight: 1.65, marginBottom: 48, textAlign: "center" }}>
        Pick a category below or type anything in the bar above. Synapse routes your request to the right specialist automatically.
      </p>

      {/* Category grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, maxWidth: 660, width: "100%" }}>
        {EXAMPLES.map(({ category, color, bg, prompts }) => (
          <div key={category} style={{
            borderRadius: 14, overflow: "hidden",
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
          }}>
            {/* Category header */}
            <div style={{ padding: "12px 16px 10px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, boxShadow: `0 0 8px ${color}` }} />
              <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: "0.08em", textTransform: "uppercase" }}>{category}</span>
            </div>
            {/* Prompts */}
            {prompts.map(p => (
              <button key={p} onClick={() => onExample(p)}
                style={{
                  width: "100%", textAlign: "left", padding: "11px 16px", fontSize: 13,
                  color: "#4a4a68", background: "transparent", border: "none", cursor: "pointer",
                  borderBottom: "1px solid rgba(255,255,255,0.03)", display: "block",
                  transition: "all 0.12s", lineHeight: 1.45,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = bg; e.currentTarget.style.color = color; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#4a4a68"; }}>
                {p}
              </button>
            ))}
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: "#22223a", marginTop: 40 }}>
        Powered by LangGraph · Groq · pgvector
      </p>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { openSpanSocket, type Span } from "../api/client";

const AGENTS: Record<string, { label: string; color: string; dot: string; bg: string }> = {
  supervisor: { label: "Supervisor", color: "#a78bfa", dot: "#7c6af5", bg: "rgba(124,106,245,0.1)" },
  researcher:  { label: "Researcher", color: "#7dd3fc", dot: "#38bdf8", bg: "rgba(56,189,248,0.1)" },
  coder:       { label: "Coder",      color: "#fcd34d", dot: "#fbbf24", bg: "rgba(251,191,36,0.1)" },
  analyst:     { label: "Analyst",    color: "#fdba74", dot: "#f97316", bg: "rgba(249,115,22,0.1)" },
  writer:      { label: "Writer",     color: "#6ee7b7", dot: "#34d399", bg: "rgba(52,211,153,0.1)" },
  FINISH:      { label: "Done",       color: "#6b7280", dot: "#4b5563", bg: "rgba(75,85,99,0.1)" },
};

const DEFAULT_AGENT = { label: "Agent", color: "#94a3b8", dot: "#64748b", bg: "rgba(100,116,139,0.1)" };

export function TraceViewer({
  taskId, onClose, preloadedSpans, onSpan,
}: {
  taskId: string;
  onClose: () => void;
  preloadedSpans?: Span[];   // replay mode — no WebSocket opened
  onSpan?: (span: Span) => void; // bubble spans up for storage
}) {
  const [spans, setSpans] = useState<Span[]>(preloadedSpans ?? []);
  const [connected, setConnected] = useState(false);
  const [done, setDone] = useState(!!preloadedSpans);
  const wsRef = useRef<WebSocket | null>(null);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Replay mode: spans already known, nothing to stream
    if (preloadedSpans) return;

    setSpans([]); setDone(false); setConnected(false);
    const ws = openSpanSocket(
      taskId,
      (span) => {
        setSpans(prev => [...prev, span]);
        onSpan?.(span);
        if (span.agent_name === "FINISH") {
          setDone(true);
          autoCloseRef.current = setTimeout(onClose, 2000);
        }
      },
      () => { setConnected(false); setDone(true); },
    );
    ws.onopen = () => setConnected(true);
    wsRef.current = ws;
    return () => { ws.close(); if (autoCloseRef.current) clearTimeout(autoCloseRef.current); };
  }, [taskId]);

  const totalTokens = spans.reduce((s, sp) => s + (sp.tokens_used || 0), 0);
  // Aggregate tokens per agent label so duplicate spans don't create duplicate bars
  const chartData = Object.values(
    spans.filter(s => s.tokens_used > 0).reduce<Record<string, { name: string; tokens: number }>>((acc, s) => {
      const name = (AGENTS[s.agent_name] ?? DEFAULT_AGENT).label;
      acc[name] = { name, tokens: (acc[name]?.tokens ?? 0) + s.tokens_used };
      return acc;
    }, {})
  );

  const status = done
    ? { label: "Completed", color: "#34d399", bg: "rgba(52,211,153,0.08)", border: "rgba(52,211,153,0.2)" }
    : connected
    ? { label: "Live", color: "#60a5fa", bg: "rgba(96,165,250,0.08)", border: "rgba(96,165,250,0.2)" }
    : { label: "Connecting", color: "#6b7280", bg: "rgba(107,114,128,0.08)", border: "rgba(107,114,128,0.2)" };

  return (
    <div style={{ background: "#0e0e1c", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: done ? "#28c840" : connected ? "#febc2e" : "#4a4a62", display: "inline-block",
              boxShadow: !done && connected ? "0 0 6px #febc2e" : "none", transition: "all 0.3s" }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#c8c8de" }}>{preloadedSpans ? "Agent Trace" : "Live Trace"}</span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", padding: "2px 8px", borderRadius: 999,
            color: status.color, background: status.bg, border: `1px solid ${status.border}`,
            animation: !done && connected ? "pulse 2s infinite" : "none" }}>
            {status.label}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {totalTokens > 0 && (
            <span style={{ fontSize: 11, fontFamily: "monospace", color: "#3e3e58" }}>
              {totalTokens.toLocaleString()} tokens
            </span>
          )}
          <button onClick={onClose}
            style={{ width: 24, height: 24, borderRadius: 8, background: "transparent", border: "none", cursor: "pointer", color: "#4a4a62", fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#c8c8de"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#4a4a62"; }}>
            ×
          </button>
        </div>
      </div>

      <div style={{ padding: "16px 20px" }}>
        {/* Spans */}
        {spans.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#2a2a42", animation: preloadedSpans ? "none" : "pulse 1.5s infinite" }} />
            <span style={{ fontSize: 12, color: "#3e3e58", fontStyle: "italic" }}>
              {preloadedSpans ? "No trace data recorded for this task." : "Waiting for agent activity…"}
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {spans.map((span, i) => {
              const ag = AGENTS[span.agent_name] ?? DEFAULT_AGENT;
              const isLast = i === spans.length - 1;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* Timeline */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 16, flexShrink: 0 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: ag.dot, display: "inline-block", flexShrink: 0 }} />
                    {!isLast && <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.05)", marginTop: 2 }} />}
                  </div>
                  {/* Badge + meta */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                      color: ag.color, background: ag.bg, border: `1px solid ${ag.dot}30`, whiteSpace: "nowrap" }}>
                      {ag.label}
                    </span>
                    {span.tokens_used > 0 && (
                      <span style={{ fontSize: 11, fontFamily: "monospace", color: "#3e3e5a" }}>
                        {span.tokens_used.toLocaleString()} tok
                      </span>
                    )}
                    {span.latency_ms > 0 && (
                      <span style={{ fontSize: 11, fontFamily: "monospace", color: "#2e2e4a" }}>
                        {span.latency_ms}ms
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 10, fontFamily: "monospace", color: "#2e2e44", width: 18, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Chart */}
        {chartData.length > 1 && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", marginTop: 16, paddingTop: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#2e2e44", textTransform: "uppercase", marginBottom: 12 }}>
              Token usage per agent
            </p>
            <ResponsiveContainer width="100%" height={110}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#3e3e58", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#3e3e58", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#0e0e1c", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, fontSize: 12 }}
                  labelStyle={{ color: "#e2e2f0", fontWeight: 600 }}
                  itemStyle={{ color: "#a78bfa" }}
                  cursor={{ fill: "rgba(255,255,255,0.02)" }}
                />
                <Bar dataKey="tokens" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

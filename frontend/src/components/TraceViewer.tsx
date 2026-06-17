import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { openSpanSocket, type Span } from "../api/client";

const AGENT_STYLES: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  supervisor: { label: "Supervisor", color: "text-violet-300", bg: "bg-violet-500/10 border-violet-500/20", dot: "bg-violet-500" },
  researcher:  { label: "Researcher", color: "text-sky-300",    bg: "bg-sky-500/10 border-sky-500/20",       dot: "bg-sky-400" },
  coder:       { label: "Coder",      color: "text-amber-300",  bg: "bg-amber-500/10 border-amber-500/20",   dot: "bg-amber-400" },
  analyst:     { label: "Analyst",    color: "text-orange-300", bg: "bg-orange-500/10 border-orange-500/20", dot: "bg-orange-400" },
  writer:      { label: "Writer",     color: "text-emerald-300",bg: "bg-emerald-500/10 border-emerald-500/20",dot: "bg-emerald-400" },
  FINISH:      { label: "Done",       color: "text-slate-400",  bg: "bg-white/[0.04] border-white/10",       dot: "bg-slate-500" },
};

const DEFAULT_STYLE = { label: "Agent", color: "text-slate-400", bg: "bg-white/[0.04] border-white/10", dot: "bg-slate-500" };

export function TraceViewer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const [spans, setSpans] = useState<Span[]>([]);
  const [connected, setConnected] = useState(false);
  const [done, setDone] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    setSpans([]); setDone(false); setConnected(false);
    const ws = openSpanSocket(
      taskId,
      (span) => { setSpans(prev => [...prev, span]); if (span.agent_name === "FINISH") setDone(true); },
      () => { setConnected(false); setDone(true); }
    );
    ws.onopen = () => setConnected(true);
    wsRef.current = ws;
    return () => ws.close();
  }, [taskId]);

  const totalTokens = spans.reduce((s, sp) => s + (sp.tokens_used || 0), 0);
  const chartData = spans.filter(s => s.tokens_used > 0).map(s => ({
    name: AGENT_STYLES[s.agent_name]?.label ?? s.agent_name,
    tokens: s.tokens_used,
  }));

  const statusConfig = done
    ? { label: "Completed", cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" }
    : connected
    ? { label: "Live", cls: "text-sky-400 bg-sky-500/10 border-sky-500/20 animate-pulse" }
    : { label: "Connecting", cls: "text-slate-500 bg-white/[0.04] border-white/10" };

  return (
    <div className="bg-[#0e0e1c] border border-white/[0.07] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-white/[0.05] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-200">Live Trace</h2>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusConfig.cls}`}>
            {statusConfig.label}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {totalTokens > 0 && (
            <span className="text-xs text-slate-600 font-mono">{totalTokens.toLocaleString()} tokens</span>
          )}
          <button onClick={onClose} className="w-6 h-6 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-slate-600 hover:text-slate-300 transition-all text-base leading-none">×</button>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Spans timeline */}
        {spans.length === 0 ? (
          <div className="flex items-center gap-3 py-2">
            <div className="w-3 h-3 rounded-full bg-slate-700 animate-pulse" />
            <p className="text-xs text-slate-600 italic">Waiting for agent spans…</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {spans.map((span, i) => {
              const style = AGENT_STYLES[span.agent_name] ?? DEFAULT_STYLE;
              const isLast = i === spans.length - 1;
              return (
                <div key={i} className="flex items-center gap-3">
                  {/* Timeline connector */}
                  <div className="flex flex-col items-center w-5 flex-shrink-0">
                    <div className={`w-2 h-2 rounded-full ${style.dot}`} />
                    {!isLast && <div className="w-px h-4 bg-white/[0.06] mt-0.5" />}
                  </div>

                  <div className="flex items-center gap-2.5 flex-1">
                    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-md border ${style.color} ${style.bg}`}>
                      {style.label}
                    </span>
                    {span.tokens_used > 0 && (
                      <span className="text-[11px] text-slate-600 font-mono">{span.tokens_used.toLocaleString()} tok</span>
                    )}
                    {span.latency_ms > 0 && (
                      <span className="text-[11px] text-slate-700 font-mono">{span.latency_ms}ms</span>
                    )}
                  </div>

                  <span className="text-[10px] text-slate-700 font-mono w-5 text-right">{i + 1}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Chart */}
        {chartData.length > 1 && (
          <div className="border-t border-white/[0.05] pt-4">
            <p className="text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-3">Tokens per agent</p>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#0e0e1c", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, fontSize: 12 }}
                  labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                  itemStyle={{ color: "#a78bfa" }}
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
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

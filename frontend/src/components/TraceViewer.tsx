import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { openSpanSocket, type Span } from "../api/client";

interface Props {
  taskId: string;
  onClose: () => void;
}

export function TraceViewer({ taskId, onClose }: Props) {
  const [spans, setSpans] = useState<Span[]>([]);
  const [connected, setConnected] = useState(false);
  const [done, setDone] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    setSpans([]);
    setDone(false);
    setConnected(false);
    const ws = openSpanSocket(
      taskId,
      (span) => {
        setSpans((prev) => [...prev, span]);
        if (span.agent_name === "FINISH") setDone(true);
      },
      () => { setConnected(false); setDone(true); }
    );
    ws.onopen = () => setConnected(true);
    wsRef.current = ws;
    return () => ws.close();
  }, [taskId]);

  const totalTokens = spans.reduce((s, sp) => s + (sp.tokens_used || 0), 0);
  const chartData = spans
    .filter((s) => s.tokens_used > 0)
    .map((s) => ({ name: s.agent_name, tokens: s.tokens_used }));

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-100">Live Trace</h2>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              done
                ? "bg-green-900 text-green-400"
                : connected
                ? "bg-blue-900 text-blue-400 animate-pulse"
                : "bg-gray-800 text-gray-500"
            }`}
          >
            {done ? "done" : connected ? "live" : "connecting..."}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500">{totalTokens} tokens</span>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-300 text-lg leading-none"
          >
            ×
          </button>
        </div>
      </div>

      {/* Span timeline */}
      {spans.length === 0 ? (
        <p className="text-sm text-gray-500 italic">
          Waiting for agent spans...
        </p>
      ) : (
        <div className="space-y-2">
          {spans.map((span, i) => (
            <SpanRow key={i} span={span} index={i} />
          ))}
        </div>
      )}

      {/* Token chart */}
      {chartData.length > 1 && (
        <div className="mt-4">
          <p className="text-xs text-gray-500 mb-2">Tokens per agent</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                labelStyle={{ color: "#e5e7eb" }}
                itemStyle={{ color: "#a78bfa" }}
              />
              <Bar dataKey="tokens" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function SpanRow({ span, index }: { span: Span; index: number }) {
  const agentColors: Record<string, string> = {
    supervisor: "text-purple-400 bg-purple-950",
    researcher: "text-blue-400 bg-blue-950",
    coder: "text-yellow-400 bg-yellow-950",
    analyst: "text-orange-400 bg-orange-950",
    writer: "text-green-400 bg-green-950",
    FINISH: "text-gray-400 bg-gray-800",
  };
  const color = agentColors[span.agent_name] ?? "text-gray-400 bg-gray-800";

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-gray-600 font-mono w-5 text-right">{index + 1}</span>
      <span className={`text-xs font-mono px-2 py-0.5 rounded ${color}`}>
        {span.agent_name}
      </span>
      {span.tokens_used > 0 && (
        <span className="text-gray-500 text-xs">{span.tokens_used} tok</span>
      )}
      {span.latency_ms > 0 && (
        <span className="text-gray-600 text-xs">{span.latency_ms}ms</span>
      )}
    </div>
  );
}

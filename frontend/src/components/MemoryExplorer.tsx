import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { api, type MemoryChunk } from "../api/client";

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function SimilarityBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.85 ? "#34d399" : score >= 0.7 ? "#fbbf24" : "#9090b0";
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, fontFamily: "monospace",
      padding: "2px 8px", borderRadius: 20,
      color, background: `${color}18`, border: `1px solid ${color}30`,
    }}>
      {pct}% match
    </span>
  );
}

function ChunkCard({ chunk }: { chunk: MemoryChunk }) {
  const [expanded, setExpanded] = useState(false);
  const PREVIEW_LEN = 220;
  const needsTruncation = chunk.content.length > PREVIEW_LEN;
  const displayText = expanded || !needsTruncation
    ? chunk.content
    : chunk.content.slice(0, PREVIEW_LEN) + "…";

  return (
    <div style={{
      borderRadius: 12, background: "#0e0e1c",
      border: "1px solid rgba(255,255,255,0.06)",
      padding: "16px 20px",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ fontSize: 13, color: "#9090b0", lineHeight: 1.7 }}>
        <ReactMarkdown components={{
          p: ({ children }) => <p style={{ margin: "0 0 6px" }}>{children}</p>,
          strong: ({ children }) => <strong style={{ color: "#d0d0e8", fontWeight: 600 }}>{children}</strong>,
          li: ({ children }) => <li style={{ marginBottom: 3 }}>{children}</li>,
          ul: ({ children }) => <ul style={{ paddingLeft: 18, margin: "4px 0" }}>{children}</ul>,
        }}>
          {displayText}
        </ReactMarkdown>
      </div>
      {needsTruncation && (
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            alignSelf: "flex-start", fontSize: 11, fontWeight: 600,
            color: "#7c6af5", background: "none", border: "none", cursor: "pointer", padding: 0,
          }}>
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "#2e2e48", fontFamily: "monospace" }}>
          {timeAgo(chunk.created_at)}
        </span>
        {chunk.task_input && (
          <span style={{
            fontSize: 11, color: "#3a3a58", fontStyle: "italic",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280,
          }}>
            {chunk.task_input}
          </span>
        )}
        {chunk.similarity !== null && <SimilarityBadge score={chunk.similarity} />}
      </div>
    </div>
  );
}

export function MemoryExplorer() {
  const [chunks, setChunks] = useState<MemoryChunk[]>([]);
  const [query, setQuery] = useState("");
  const [pendingQuery, setPendingQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Load all chunks on mount
  useEffect(() => {
    api.listMemory().then(setChunks).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(pendingQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [pendingQuery]);

  useEffect(() => {
    setLoading(true);
    const q = query.trim() || undefined;
    api.listMemory(q).then(setChunks).catch(() => {}).finally(() => setLoading(false));
  }, [query]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 60px)", background: "#08080f", overflow: "hidden" }}>

      {/* Search bar */}
      <div style={{ padding: "20px 28px", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <input
            value={pendingQuery}
            onChange={e => setPendingQuery(e.target.value)}
            placeholder="Search memory by semantic similarity..."
            style={{
              width: "100%", padding: "13px 18px", borderRadius: 12, fontSize: 14,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              color: "#e2e2f0", outline: "none", boxSizing: "border-box",
              transition: "all 0.2s",
            }}
            onFocus={e => { e.currentTarget.style.borderColor = "rgba(124,106,245,0.5)"; e.currentTarget.style.background = "rgba(124,106,245,0.04)"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          />
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>

          {/* Header row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: "#2e2e48", textTransform: "uppercase" }}>
              {query.trim() ? "Search results" : "Recent memories"}
            </p>
            {!loading && (
              <span style={{ fontSize: 11, color: "#2e2e48", fontFamily: "monospace" }}>
                {chunks.length} {chunks.length === 1 ? "chunk" : "chunks"}
              </span>
            )}
          </div>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[100, 85, 92].map((w, i) => (
                <div key={i} style={{
                  height: 80, borderRadius: 12, background: "rgba(255,255,255,0.03)",
                  width: `${w}%`, animation: "pulse 1.8s ease-in-out infinite",
                  animationDelay: `${i * 0.15}s`,
                }} />
              ))}
            </div>
          ) : chunks.length === 0 ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              minHeight: 280, gap: 12,
            }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" strokeLinecap="round">
                <ellipse cx="12" cy="5" rx="9" ry="3"/>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
              </svg>
              <p style={{ fontSize: 14, color: "#2e2e48", textAlign: "center" }}>
                {query.trim() ? "No memories matched your search." : "No memories stored yet. Run a few tasks to build up memory."}
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {chunks.map(chunk => (
                <ChunkCard key={chunk.id} chunk={chunk} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export interface Task {
  id: string;
  status: "pending" | "running" | "done" | "failed";
  input: string;
  result: { answer?: string; error?: string } | null;
  token_cost: number;
}

export interface Span {
  agent_name: string;
  tokens_used: number;
  latency_ms: number;
  input?: object;
  output?: object;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  username: string;
}

const BASE = "";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("synapse_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...init.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  health: () => request<{ status: string }>("/health"),

  register: (username: string, email: string, password: string) =>
    request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password }),
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  demoLogin: () =>
    request<AuthResponse>("/auth/demo", { method: "POST" }),

  createTask: (input: string, token_budget = 50000) =>
    request<Task>("/tasks/", {
      method: "POST",
      body: JSON.stringify({ input, token_budget }),
    }),

  getTask: (id: string) => request<Task>(`/tasks/${id}`),

  listTasks: () => request<Task[]>("/tasks/"),

  submitFeedback: (taskId: string, thumbsUp: boolean) =>
    request(`/feedback/tasks/${taskId}/feedback`, {
      method: "POST",
      body: JSON.stringify({ thumbs_up: thumbsUp }),
    }),
};

export function openSpanSocket(
  taskId: string,
  onSpan: (span: Span) => void,
  onClose?: () => void
): WebSocket {
  const ws = new WebSocket(`ws://localhost:8000/ws/${taskId}`);
  ws.onmessage = (e) => {
    try { onSpan(JSON.parse(e.data)); } catch { /* ignore malformed */ }
  };
  ws.onclose = () => onClose?.();
  return ws;
}

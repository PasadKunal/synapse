# Synapse Frontend

React + TypeScript + Vite frontend for the Synapse multi-agent platform.

## Development

```bash
npm install
npm run dev
```

Opens at [http://localhost:5173](http://localhost:5173). Requires the FastAPI backend running on port 8000.

## Stack

- **React + TypeScript** via Vite
- **Tailwind CSS** for utility classes
- **Recharts** for the token-per-agent bar chart in TraceViewer
- **react-markdown + react-syntax-highlighter** for syntax-highlighted code blocks

## Key Components

| Component | File | What it does |
|---|---|---|
| `TaskDashboard` | `src/components/TaskDashboard.tsx` | Sidebar, input bar, task history, markdown answer rendering |
| `TraceViewer` | `src/components/TraceViewer.tsx` | Live WebSocket span stream and token usage chart |
| `AuthPage` | `src/components/AuthPage.tsx` | Login/Register split-layout, demo login |

## Notes

All markdown rendering uses inline styles rather than Tailwind prose classes, to avoid CSS conflicts with react-syntax-highlighter's built-in theme.

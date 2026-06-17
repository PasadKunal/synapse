import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export function DevLogin() {
  const { devLogin } = useAuth();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError("Paste a JWT token to continue");
      return;
    }
    devLogin(token.trim());
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-purple-400 mb-2">⚡ Synapse</h1>
        <p className="text-gray-400 text-sm mb-6">
          Autonomous multi-agent platform
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              JWT Token (dev mode)
            </label>
            <textarea
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 font-mono focus:outline-none focus:border-purple-500 resize-none"
              rows={3}
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            className="w-full bg-purple-600 hover:bg-purple-500 text-white rounded-lg py-2 text-sm font-medium transition-colors"
          >
            Sign in
          </button>
        </form>

        <p className="text-xs text-gray-600 mt-4">
          Generate a token: <code className="text-gray-500">python tests/test_agent.py</code> prints one,
          or run <code className="text-gray-500">python -c "from tests.test_agent import make_test_token; print(make_test_token())"</code>
        </p>
      </div>
    </div>
  );
}

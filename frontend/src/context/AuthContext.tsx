import { createContext, useContext, useState } from "react";

interface AuthCtx {
  token: string | null;
  username: string | null;
  login: (token: string, username: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx>({
  token: null,
  username: null,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("synapse_token")
  );
  const [username, setUsername] = useState<string | null>(
    () => localStorage.getItem("synapse_username")
  );

  const login = (t: string, u: string) => {
    localStorage.setItem("synapse_token", t);
    localStorage.setItem("synapse_username", u);
    setToken(t);
    setUsername(u);
  };

  const logout = () => {
    localStorage.removeItem("synapse_token");
    localStorage.removeItem("synapse_username");
    setToken(null);
    setUsername(null);
  };

  return (
    <AuthContext.Provider value={{ token, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

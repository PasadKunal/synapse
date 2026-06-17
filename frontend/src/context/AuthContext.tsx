import { createContext, useContext, useState } from "react";

interface AuthCtx {
  token: string | null;
  devLogin: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx>({
  token: null,
  devLogin: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("synapse_token")
  );

  const devLogin = (t: string) => {
    localStorage.setItem("synapse_token", t);
    setToken(t);
  };

  const logout = () => {
    localStorage.removeItem("synapse_token");
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, devLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

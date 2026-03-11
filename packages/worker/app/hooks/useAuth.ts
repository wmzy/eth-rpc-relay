import { useState, useCallback, useMemo } from "react";

const STORAGE_KEY = "eth-relay-admin-token";

export const useAuth = () => {
  const [token, setTokenState] = useState(() => localStorage.getItem(STORAGE_KEY) ?? "");
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const setToken = useCallback((t: string) => {
    setTokenState(t);
    if (t) localStorage.setItem(STORAGE_KEY, t);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  const verify = useCallback(async (t: string) => {
    setChecking(true);
    setError("");
    try {
      const resp = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${t}` },
      });
      if (resp.ok) {
        setToken(t);
        setVerified(true);
      } else {
        setError("Invalid admin token");
        setVerified(false);
      }
    } catch {
      setError("Network error");
    } finally {
      setChecking(false);
    }
  }, [setToken]);

  const logout = useCallback(() => {
    setToken("");
    setVerified(false);
  }, [setToken]);

  const authHeaders = useMemo((): Record<string, string> =>
    token ? { Authorization: `Bearer ${token}` } : {},
  [token]);

  const authFetch = useCallback(async (url: string, init?: RequestInit): Promise<Response> => {
    const headers = { ...authHeaders, ...init?.headers };
    const resp = await fetch(url, { ...init, headers });
    if (resp.status === 401) {
      setVerified(false);
    }
    return resp;
  }, [authHeaders]);

  return { token, verified, checking, error, verify, logout, authHeaders, authFetch };
};

'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api';

export type User = { id: string; email: string; name: string; role: 'admin' | 'procurement' | 'reviewer' | 'viewer' | 'ges'; ges_id: string | null };
const Ctx = createContext<{ user: User | null; loading: boolean; logout: () => void }>({ user: null, loading: true, logout: () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!localStorage.getItem('token')) { setLoading(false); return; }
    api('/auth/me').then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);
  const logout = useCallback(() => { localStorage.removeItem('token'); window.location.href = '/login'; }, []);
  return <Ctx.Provider value={{ user, loading, logout }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);

export const canWrite = (u: User | null) => !!u && (u.role === 'admin' || u.role === 'procurement');
export const canMarkFeasible = (u: User | null) => !!u && ['admin', 'procurement', 'reviewer'].includes(u.role);
export const isInternal = (u: User | null) => !!u && u.role !== 'ges';

/** Small data-loading hook. */
export function useLoad<T>(fn: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    fn().then((d) => { if (live) { setData(d); setError(null); } })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}

import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Profile, ProfileSchema, restoreSession, sessionExpired, setSession, Tokens } from './api';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 15000 } } });
const AuthContext = createContext<{ user: Profile | null; ready: boolean; signedIn: boolean; finish: (data: Tokens) => Promise<void>; reload: () => Promise<void>; logout: (all?: boolean) => Promise<void> } | null>(null);
function SessionProvider({ children }: { children: ReactNode }) {
 const [signedIn, setSignedIn] = useState(false);
 const [ready, setReady] = useState(false);
 const client = useQueryClient();
 const profile = useQuery({ queryKey: ['profile'], queryFn: async ({ signal }) => ProfileSchema.parse(await api('/users/me', { signal })), enabled: signedIn });
 useEffect(() => {
  let active = true;
  const off = sessionExpired(() => { setSignedIn(false); client.clear(); });
  restoreSession().then(restored => { if (active) { setSignedIn(restored); setReady(true); } }).catch(() => { if (active) setReady(true); });
  return () => { active = false; off(); };
 }, [client]);
 async function finish(data: Tokens) {
  await client.cancelQueries(); client.clear();
  await setSession(data);
  try { const user = ProfileSchema.parse(await api('/users/me')); client.setQueryData(['profile'], user); setSignedIn(true); }
  catch (error) { await setSession(null); setSignedIn(false); throw error; }
 }
 async function reload() { await client.invalidateQueries({ queryKey: ['profile'] }); }
 async function logout(all = false) {
  await api(all ? '/auth/logout-all' : '/auth/logout', { body: {} });
  await client.cancelQueries(); await setSession(null); setSignedIn(false); client.clear();
 }
 return <AuthContext.Provider value={{ user: profile.data || null, ready: ready && (!signedIn || !profile.isPending), signedIn, finish, reload, logout }}>{children}</AuthContext.Provider>;
}
export function AppSession({ children }: { children: ReactNode }) { return <QueryClientProvider client={queryClient}><SessionProvider>{children}</SessionProvider></QueryClientProvider>; }
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('AuthProvider is required'); return value; }

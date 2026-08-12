import { createContext, useContext } from 'react';

export interface AuthContextValue {
  email: string | null;
  accessToken: string | null;
  /** Throws on failure — callers show their own error message. Returns the fresh access token
   *  directly, since it's not safely readable from context state until the next render. */
  signIn: () => Promise<string>;
  signOut: () => void;
  /** Attempts a silent (no popup) token refresh right now, outside AuthGate's own scheduled/
   *  visibility-triggered checks — for callers (e.g. ATSContext's Drive backup/restore) that just
   *  hit a 401 and want a chance to self-heal immediately rather than wait for the next scheduled
   *  refresh, which could be minutes away. Never throws; resolves once the attempt (success or
   *  failure) is done, since callers only care that it was tried, not the outcome directly — the
   *  usual accessToken context value reflects the result either way. */
  refreshNow: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthGate');
  return ctx;
};

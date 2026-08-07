import { createContext, useContext } from 'react';

export interface AuthContextValue {
  email: string | null;
  accessToken: string | null;
  /** Throws on failure — callers show their own error message. Returns the fresh access token
   *  directly, since it's not safely readable from context state until the next render. */
  signIn: () => Promise<string>;
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthGate');
  return ctx;
};

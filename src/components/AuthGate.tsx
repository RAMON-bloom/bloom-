import React, { useEffect, useState } from 'react';
import {
  signIn as googleSignIn,
  signOut as googleSignOut,
  getCurrentSession,
  getLastKnownEmail,
  getSessionExpiresAt,
  refreshTokenSilently,
  GoogleIdentity,
} from '../lib/googleAuth';
import { AuthContext, AuthContextValue } from '../context/AuthContext';

const ALLOWED_DOMAIN = 'bloom-firm.com';
// Refresh this many ms before the access token actually expires, so an open tab never hits a
// gap where Drive calls fail mid-session while waiting for the next scheduled refresh.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [identity, setIdentity] = useState<GoogleIdentity | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = getCurrentSession();
    if (session) {
      setIdentity(session.identity);
      setAccessToken(session.accessToken);
    }
    setChecking(false);
  }, []);

  // Keep the Drive-scoped token alive for as long as the tab stays open, instead of letting it
  // expire ~1h in and silently breaking backup/restore until the user manually re-logs in.
  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      const expiresAt = getSessionExpiresAt();
      const delay = expiresAt ? Math.max(expiresAt - Date.now() - REFRESH_MARGIN_MS, 10_000) : 30 * 60 * 1000;
      timerId = setTimeout(runRefresh, delay);
    };

    const runRefresh = async () => {
      try {
        const result = await refreshTokenSilently();
        if (cancelled) return;
        setIdentity(result.identity);
        setAccessToken(result.accessToken);
        scheduleNext();
      } catch {
        // Browser's own Google session likely ended — leave the current token in place (it may
        // still be valid a while longer) and retry shortly rather than force a logout.
        if (!cancelled) timerId = setTimeout(runRefresh, 5 * 60 * 1000);
      }
    };

    scheduleNext();
    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [identity]);

  /** Throws on failure — used both by the login screen's own button and by other in-app callers
   *  (e.g. re-auth when a Drive call hits an expired token) that want to handle errors themselves. */
  const performSignIn = async () => {
    const result = await googleSignIn();
    setIdentity(result.identity);
    setAccessToken(result.accessToken);
    return result.accessToken;
  };

  const handleSignInClick = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await performSignIn();
    } catch (err: any) {
      setError(err?.message || 'ログインに失敗しました。もう一度お試しください。');
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = () => {
    googleSignOut();
    setIdentity(null);
    setAccessToken(null);
  };

  if (checking) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  if (!identity || !accessToken) {
    const lastEmail = getLastKnownEmail();
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <h1 className="text-lg font-semibold text-slate-900 mb-1">bloom採用管理</h1>
          <p className="text-sm text-slate-500 mb-6">社内アカウント（{ALLOWED_DOMAIN}）でログインしてください</p>
          <button
            onClick={handleSignInClick}
            disabled={signingIn}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z" />
              <path fill="#FBBC05" d="M3.97 10.71A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.33z" />
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
            </svg>
            {signingIn ? 'ログイン中...' : lastEmail ? `${lastEmail} で続ける` : 'Googleでログイン'}
          </button>
          {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
        </div>
      </div>
    );
  }

  const contextValue: AuthContextValue = {
    email: identity.email,
    accessToken,
    signIn: performSignIn,
    signOut: handleSignOut,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

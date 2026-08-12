import React, { useEffect, useRef, useState } from 'react';
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
    (async () => {
      const session = getCurrentSession();
      if (session) {
        setIdentity(session.identity);
        setAccessToken(session.accessToken);
        setChecking(false);
        return;
      }
      // No cached token, or it's expired — but this browser has signed in before (lastEmail is
      // set on every successful sign-in and only cleared on explicit sign-out). Try resuming
      // silently before ever showing the blocking login screen: this is what makes closing the
      // tab/browser between interviews (or the OS reclaiming a backgrounded tab, or the access
      // token's own ~1h lifetime simply elapsing) self-heal on its own, instead of requiring a
      // manual re-login click every time. refreshTokenSilently only ever does the silent
      // (prompt: '') request — never signIn()'s fallback to an interactive consent popup, which
      // browsers would block anyway outside a real click and would be a surprising thing to pop
      // open unprompted on page load.
      const lastEmail = getLastKnownEmail();
      if (lastEmail) {
        try {
          const result = await refreshTokenSilently();
          setIdentity(result.identity);
          setAccessToken(result.accessToken);
        } catch (err) {
          // No active Google browser session to resume (or consent has lapsed) — the login
          // screen below will ask for an explicit click, which is required anyway once a real
          // interactive prompt is needed. Logged (not shown to the user) so a "why did I get
          // logged out" report can be traced back to a cause from the browser console.
          console.warn('Silent Drive re-auth on load failed:', err);
        }
      }
      setChecking(false);
    })();
  }, []);

  // Keep the Drive-scoped token alive for as long as the tab stays open, instead of letting it
  // expire ~1h in and silently breaking backup/restore until the user manually re-logs in.
  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      if (timerId) clearTimeout(timerId);
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
      } catch (err) {
        // Browser's own Google session likely ended — leave the current token in place (it may
        // still be valid a while longer) and retry shortly rather than force a logout. Logged so
        // a "Drive disconnected while the tab was open" report can be traced to a cause.
        console.warn('Scheduled silent Drive re-auth failed, will retry in 5min:', err);
        if (!cancelled) timerId = setTimeout(runRefresh, 5 * 60 * 1000);
      }
    };

    // setTimeout doesn't run while the OS suspends the tab (laptop lid closed between
    // interviews) — the scheduled refresh above can end up hours late by the time anyone's
    // actually looking at the screen again. Re-check the moment the tab regains focus/visibility
    // instead of waiting for that stale timer, so a token that quietly expired during the gap
    // gets refreshed right away rather than only on the next Drive call's failure.
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const expiresAt = getSessionExpiresAt();
      if (!expiresAt || expiresAt - Date.now() <= REFRESH_MARGIN_MS) {
        runRefresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    scheduleNext();
    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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

  // Coalesces concurrent callers (e.g. a backup retry and a poll both hitting a 401 around the
  // same moment) into a single in-flight silent-refresh attempt rather than firing off several.
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const refreshNow = (): Promise<void> => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    const attempt = (async () => {
      try {
        const result = await refreshTokenSilently();
        setIdentity(result.identity);
        setAccessToken(result.accessToken);
      } catch {
        // Nothing more to do here — the caller that triggered this (e.g. a failed Drive call)
        // shows its own message; this was only a best-effort attempt to self-heal before that.
      } finally {
        refreshInFlightRef.current = null;
      }
    })();
    refreshInFlightRef.current = attempt;
    return attempt;
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
            className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
          >
            <span className="bg-white rounded-full p-1 flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z" />
                <path fill="#FBBC05" d="M3.97 10.71A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.33z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
              </svg>
            </span>
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
    refreshNow,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

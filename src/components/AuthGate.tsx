import React, { useEffect, useState } from 'react';
import { signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

const ALLOWED_DOMAIN = 'bloom-firm.com';

const isAllowed = (user: User | null) =>
  !!user?.email && user.email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);

export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return auth.onAuthStateChanged((u) => {
      if (u && !isAllowed(u)) {
        setError(`${ALLOWED_DOMAIN} のアカウントでログインしてください`);
        signOut(auth);
        setUser(null);
      } else {
        setUser(u);
      }
      setChecking(false);
    });
  }, []);

  const handleSignIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setError('ログインに失敗しました。もう一度お試しください。');
      }
    } finally {
      setSigningIn(false);
    }
  };

  if (checking) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  if (!user || !isAllowed(user)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <h1 className="text-lg font-semibold text-slate-900 mb-1">bloom採用管理</h1>
          <p className="text-sm text-slate-500 mb-6">社内アカウント（{ALLOWED_DOMAIN}）でログインしてください</p>
          <button
            onClick={handleSignIn}
            disabled={signingIn}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z" />
              <path fill="#FBBC05" d="M3.97 10.71A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.33z" />
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
            </svg>
            {signingIn ? 'ログイン中...' : 'Googleでログイン'}
          </button>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

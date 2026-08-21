export interface GoogleIdentity {
  email: string;
  name: string;
  picture?: string;
}

interface SignInResult {
  identity: GoogleIdentity;
  accessToken: string;
  expiresAt: number;
}

interface StoredSession {
  accessToken: string;
  expiresAt: number; // epoch ms
  identity: GoogleIdentity;
}

const SESSION_KEY = 'atsGoogleSession';
const LAST_EMAIL_KEY = 'atsLastSignedInEmail';
const ALLOWED_DOMAIN = 'bloom-firm.com';
// calendar.readonly, gmail.send and gmail.readonly are all best-effort (not scope-gated like Drive
// below): they only power the "採用MTG" calendar/Gmail-linked import and the「適性検査メールを送信」
// button respectively, and denying/skipping any of them shouldn't block sign-in or any of the
// Drive-dependent features the rest of the app actually needs to function. Note: an already-signed-in
// user's stored token won't pick up a newly-added scope until they sign out and back in (silent/
// background token refresh can't grant a scope that hasn't been interactively consented to) — see
// CandidateDetailModal's 403/401 handling on the send button, and RecruitmentMeetingView's Gmail
// import button, for the fallback messages shown when that happens.
const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly';

declare global {
  interface Window {
    google?: any;
  }
}

let gisReadyPromise: Promise<void> | null = null;

function waitForGis(): Promise<void> {
  if (gisReadyPromise) return gisReadyPromise;
  gisReadyPromise = new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (window.google?.accounts?.oauth2) {
        resolve();
      } else if (Date.now() - start > 10000) {
        reject(new Error('Google Identity Servicesの読み込みに失敗しました。ネットワーク接続を確認してください。'));
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
  return gisReadyPromise;
}

// localStorage, not sessionStorage — the access token still has its own real ~1h expiresAt (still
// checked below), so this only widens *where the cached value survives*, not how long it's valid.
// With sessionStorage, simply closing the tab/browser between interviews (or the OS reclaiming a
// background tab) threw away a token that might still have had 50 minutes left on it, forcing a
// full re-login the next time the app was opened even though nothing had actually gone wrong.
function getStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session: StoredSession = JSON.parse(raw);
    if (!session.expiresAt || session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function storeSession(session: StoredSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function getLastKnownEmail(): string | null {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY);
  } catch {
    return null;
  }
}

function setLastKnownEmail(email: string) {
  try {
    localStorage.setItem(LAST_EMAIL_KEY, email);
  } catch {
    // ignore storage failures (e.g. private browsing) — just means silent restore won't work later
  }
}

function clearLastKnownEmail() {
  try {
    localStorage.removeItem(LAST_EMAIL_KEY);
  } catch {
    // ignore
  }
}

async function fetchIdentity(accessToken: string): Promise<GoogleIdentity> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('ユーザー情報の取得に失敗しました。');
  const data = await res.json();
  return { email: data.email, name: data.name, picture: data.picture };
}

function assertAllowedDomain(identity: GoogleIdentity) {
  if (!identity.email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)) {
    throw new Error(`${ALLOWED_DOMAIN} のGoogleアカウントでログインしてください。`);
  }
}

function requestToken(prompt: '' | 'consent', hint?: string): Promise<SignInResult> {
  const clientId = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    return Promise.reject(new Error('VITE_GOOGLE_CLIENT_IDが設定されていません。'));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      fn();
    };
    // initTokenClient's callback is never invoked if the popup fails to open (e.g. blocked by
    // the browser), so without this the UI would be stuck showing "signing in" forever. A silent
    // (prompt: '') restore attempt should fail fast rather than wait the full 30s.
    const timeoutMs = prompt === '' ? 8000 : 30000;
    const timeoutId = setTimeout(() => {
      finish(() => reject(new Error('ログイン用のポップアップを開けませんでした。ポップアップブロッカーを解除してもう一度お試しください。')));
    }, timeoutMs);

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      hd: ALLOWED_DOMAIN,
      hint,
      callback: async (response: any) => {
        if (response.error) {
          finish(() => reject(new Error('Googleログインが完了しませんでした。もう一度お試しください。')));
          return;
        }
        // A silent (prompt: '') refresh reuses whatever scopes were granted at the user's very
        // first-ever consent for this app+account — if that happened before the Drive scope was
        // added, every later silent refresh keeps re-issuing a token missing it, with no error
        // anywhere, and every Drive API call then fails with a confusing 404/403. Only the
        // interactive consent screen can add a missing scope, so surface this as a distinct,
        // catchable failure rather than handing back an insufficient token as if it were fine.
        const grantedScopes = (response.scope || '').split(' ');
        if (!grantedScopes.includes('https://www.googleapis.com/auth/drive')) {
          finish(() => reject(new Error('MISSING_DRIVE_SCOPE')));
          return;
        }
        try {
          const identity = await fetchIdentity(response.access_token);
          assertAllowedDomain(identity);
          const expiresAt = Date.now() + ((response.expires_in ?? 3600) * 1000);
          storeSession({ accessToken: response.access_token, expiresAt, identity });
          setLastKnownEmail(identity.email);
          finish(() => resolve({ identity, accessToken: response.access_token, expiresAt }));
        } catch (err) {
          clearSession();
          finish(() => reject(err instanceof Error ? err : new Error(String(err))));
        }
      },
      error_callback: (error: any) => {
        const message = error?.type === 'popup_failed_to_open'
          ? 'ログイン用のポップアップを開けませんでした。ポップアップブロッカーを解除してもう一度お試しください。'
          : error?.type === 'popup_closed'
          ? 'ログインがキャンセルされました。'
          : 'Googleログインでエラーが発生しました。';
        finish(() => reject(new Error(message)));
      },
    } as any);
    client.requestAccessToken({ prompt, hint } as any);
  });
}

/** Returns the currently signed-in identity/token from this browser session, if any and not expired. */
export function getCurrentSession(): { accessToken: string; identity: GoogleIdentity } | null {
  const session = getStoredSession();
  if (!session) return null;
  return { accessToken: session.accessToken, identity: session.identity };
}

/** Epoch ms at which the stored access token expires, without the expiry gate getCurrentSession applies. */
export function getSessionExpiresAt(): number | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session: StoredSession = JSON.parse(raw);
    return typeof session.expiresAt === 'number' ? session.expiresAt : null;
  } catch {
    return null;
  }
}

/**
 * Signs the user in. Called from a click handler, so — unlike an automatic page-load attempt —
 * the browser allows the popup this opens. Tries silently first (skips the account-chooser if
 * this browser already has an active Google session and previously granted consent, using the
 * last-known email as a hint), and only falls back to the full interactive consent prompt if
 * that doesn't work (e.g. first-ever sign-in, or the browser session/consent has since expired).
 */
export async function signIn(): Promise<SignInResult> {
  await waitForGis();
  const lastEmail = getLastKnownEmail() ?? undefined;
  if (lastEmail) {
    try {
      return await requestToken('', lastEmail);
    } catch {
      // Fall through to the interactive flow — e.g. the browser session/consent expired.
    }
  }
  return requestToken('consent', lastEmail);
}

/** Silently re-requests an access token using the existing browser session (no prompt shown). */
export async function refreshTokenSilently(): Promise<SignInResult> {
  await waitForGis();
  const lastEmail = getLastKnownEmail() ?? undefined;
  return requestToken('', lastEmail);
}

export function signOut() {
  const session = getStoredSession();
  clearSession();
  clearLastKnownEmail();
  if (session?.accessToken && window.google?.accounts?.oauth2?.revoke) {
    window.google.accounts.oauth2.revoke(session.accessToken, () => {});
  }
}

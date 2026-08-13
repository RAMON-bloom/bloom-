// Server-side counterpart to AuthGate's client-only `bloom-firm.com` domain check. The frontend's
// OAuth `hd` param and post-login `assertAllowedDomain` are just UI gating — nothing stopped a
// direct POST to these serverless endpoints from skipping them entirely. This verifies the bearer
// token itself actually belongs to a `bloom-firm.com` account before any handler does real work.
const ALLOWED_DOMAIN = 'bloom-firm.com';

// 5s cap so a slow/unresponsive tokeninfo call can never hang a request indefinitely — this
// endpoint is only used for the two categories of endpoint below that have no other authority
// (Drive/Calendar API calls) to naturally reject a bad token, so failing fast here is safe.
const TOKENINFO_TIMEOUT_MS = 5000;

export async function isBloomFirmAccessToken(accessToken: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOKENINFO_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
      { signal: controller.signal }
    );
    if (!res.ok) return false;
    const info = await res.json();
    const email = String(info.email || '').toLowerCase();
    return email.endsWith(`@${ALLOWED_DOMAIN}`);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// isBloomFirmAccessTokenと同じ検証に加えて、トークン本人のメールアドレスも返す。Gmail送信の
// `From`ヘッダーは送信者本人のアカウントに固定する必要があるため、
// api/notify/send-aptitude-test-email.tsだけがこちらを使う。既存の呼び出し元には影響しない。
export async function verifyBloomFirmAccessToken(accessToken: string): Promise<{ email: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOKENINFO_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
      { signal: controller.signal }
    );
    if (!res.ok) return null;
    const info = await res.json();
    const email = String(info.email || '');
    if (!email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)) return null;
    return { email };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

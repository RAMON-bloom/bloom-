// Server-side counterpart to AuthGate's client-only `bloom-firm.com` domain check. The frontend's
// OAuth `hd` param and post-login `assertAllowedDomain` are just UI gating — nothing stopped a
// direct POST to these serverless endpoints from skipping them entirely. This verifies the bearer
// token itself actually belongs to a `bloom-firm.com` account before any handler does real work.
const ALLOWED_DOMAIN = 'bloom-firm.com';

export async function isBloomFirmAccessToken(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
    if (!res.ok) return false;
    const info = await res.json();
    const email = String(info.email || '').toLowerCase();
    return email.endsWith(`@${ALLOWED_DOMAIN}`);
  } catch {
    return false;
  }
}

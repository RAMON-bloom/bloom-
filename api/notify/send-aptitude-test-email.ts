import { sendGmailMessage } from '../_lib/gmail.js';
import { verifyBloomFirmAccessToken } from '../_lib/auth.js';

// Manual "適性検査メールを送信" button in CandidateDetailModal. Sends from the clicking staff
// member's own bloom-firm.com Gmail account (gmail.send scope) — there's no service account, so
// the From address is always that account, never freely configurable (see api/_lib/gmail.ts).
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, to, subject, bodyText, replyTo, senderDisplayName } = req.body || {};
    if (!accessToken) {
      return res.status(401).json({ error: 'OAuthアクセストークンが必要です。Googleでログインしてください。' });
    }
    const verified = await verifyBloomFirmAccessToken(accessToken);
    if (!verified) {
      return res.status(403).json({ error: 'bloom-firm.comアカウントでのログインが必要です。' });
    }
    if (!to || !subject || !bodyText) {
      return res.status(400).json({ error: '送信先・件名・本文が必要です。' });
    }

    await sendGmailMessage(accessToken, {
      fromEmail: verified.email,
      fromDisplayName: senderDisplayName || undefined,
      to,
      replyTo: replyTo || undefined,
      subject,
      bodyText
    });

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Send aptitude test email error:', err);
    if (err.status === 403) {
      return res.status(403).json({
        error:
          'Gmail送信の権限が不足している可能性があります。ヘッダー右上の「Drive連携」から一度ログアウトし、再度ログインしてください。'
      });
    }
    if (err.status === 401) {
      return res.status(401).json({ error: 'Googleアカウントの認証が切れています。再度ログインしてください。' });
    }
    return res.status(500).json({ error: 'メール送信中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

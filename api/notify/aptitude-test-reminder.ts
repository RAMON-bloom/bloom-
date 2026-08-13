import { sendGoogleChatMessage, formatMention } from '../_lib/googleChat.js';
import { isBloomFirmAccessToken } from '../_lib/auth.js';

// Fired from ATSContext's periodic Drive-poll check when a candidate's aptitudeTestReminderAt has
// come due. Chat-only (no Gmail involved) — just nudges the assigned staff to go press the manual
// "適性検査メールを送信" button themselves. Same shape as api/notify/candidate-registered.ts.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, webhookUrl, staffName, staffMentionId, candidateName, candidateId, deadline, appUrl } =
      req.body || {};
    if (!accessToken) {
      return res.status(401).json({ error: 'OAuthアクセストークンが必要です。Googleでログインしてください。' });
    }
    if (!(await isBloomFirmAccessToken(accessToken))) {
      return res.status(403).json({ error: 'bloom-firm.comアカウントでのログインが必要です。' });
    }
    if (!webhookUrl) {
      return res.status(400).json({ error: 'webhookUrlが必要です。' });
    }
    if (!candidateName || !candidateId) {
      return res.status(400).json({ error: '候補者情報（名前・ID）が必要です。' });
    }

    const link = appUrl || 'https://bloom-saiyou.vercel.app';
    const mention = formatMention(staffName, staffMentionId);
    const deadlineText = deadline ? `\n実施期限: ${deadline}` : '';
    const text =
      (mention ? `⏰ ${mention} さん、適性検査の送信予定日です\n` : `⏰ 適性検査の送信予定日です\n`) +
      `候補者: ${candidateName} 様 (${candidateId})${deadlineText}\n` +
      `アプリで確認する: ${link}`;

    await sendGoogleChatMessage(webhookUrl, text);

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Aptitude-test-reminder notify error:', err);
    return res.status(500).json({ error: '通知の送信中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

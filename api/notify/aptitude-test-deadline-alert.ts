import { sendGoogleChatMessage, formatMention } from '../_lib/googleChat.js';
import { isBloomFirmAccessToken } from '../_lib/auth.js';

// Fired from ATSContext's periodic Drive-poll check (checkAptitudeTestDeadlineAlerts) when a
// candidate's aptitudeTestDeadline's "day before, 10:00" threshold has come due and
// aptitudeTestCompletedAt is still unset. Same shape/targeting as aptitude-test-reminder.ts
// (staffName/mention for the assignee, since this is meant to prompt them to follow up).
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
      (mention ? `⚠️ ${mention} さん、適性検査の実施期限が明日です（未実施）\n` : `⚠️ 適性検査の実施期限が明日です（未実施）\n`) +
      `候補者: ${candidateName} 様 (${candidateId})${deadlineText}\n` +
      `アプリで確認する: ${link}`;

    await sendGoogleChatMessage(webhookUrl, text);

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Aptitude-test-deadline-alert notify error:', err);
    return res.status(500).json({ error: '通知の送信中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

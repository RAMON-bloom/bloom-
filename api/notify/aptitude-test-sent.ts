import { sendGoogleChatMessage } from '../_lib/googleChat.js';
import { isBloomFirmAccessToken } from '../_lib/auth.js';

// Fired from ATSContext's markAptitudeTestSent right after an適性検査 email actually sends
// successfully. Broadcast-style (no staff targeting/mention), same as evaluation-result.ts and
// document-screening-thread.ts — goes to whichever staff/group webhooks opted into the
// APTITUDE_TEST_SENT kind, not just the candidate's assignee.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, webhookUrl, candidateName, candidateId, deadline, appUrl } = req.body || {};
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
    const deadlineText = deadline ? `\n実施期限: ${deadline}` : '\n実施期限: 未設定';
    const text =
      `📩 適性検査を送付しました\n` +
      `候補者: ${candidateName} 様 (${candidateId})${deadlineText}\n` +
      `アプリで確認する: ${link}`;

    await sendGoogleChatMessage(webhookUrl, text);

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Aptitude-test-sent notify error:', err);
    return res.status(500).json({ error: '通知の送信中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

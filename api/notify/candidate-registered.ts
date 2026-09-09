import { sendGoogleChatMessage, formatMention } from '../_lib/googleChat.js';
import { isBloomFirmAccessToken } from '../_lib/auth.js';

// Fired from ATSContext's addCandidate right after a new document-screening candidate is
// created, when the assigned staff member has a Google Chat webhook on file. Best-effort: the
// caller doesn't block candidate registration on this succeeding.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, webhookUrl, staffName, staffMentionId, candidateName, candidateId, appUrl } = req.body || {};
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
    // 2026-08-10時点でここだけstaffMentionIdを受け取りながら使わず常に太字メンションにしていた
    // (「実メンションは通知されない既知の制約がある」という当時のコメント・根拠のHANDOFFは現存せず、
    // 2026-09-09に裏取りできなかったため撤回。formatMention()の他の呼び出し箇所と同様、
    // IDがあれば本物のメンションを試す)。
    const mention = formatMention(staffName, staffMentionId);
    const text =
      (mention ? `📋 ${mention} さん、書類選考の担当になりました\n` : `📋 書類選考の担当になりました\n`) +
      `候補者: ${candidateName} 様 (${candidateId})\n` +
      `アプリで確認する: ${link}`;

    await sendGoogleChatMessage(webhookUrl, text);

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Candidate-registered notify error:', err);
    return res.status(500).json({ error: '通知の送信中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

import { sendGoogleChatMessage } from '../_lib/googleChat.js';

// Fired from ATSContext's addCandidate right after a new document-screening candidate is
// created, when the assigned staff member has a Google Chat webhook on file. Best-effort: the
// caller doesn't block candidate registration on this succeeding.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { webhookUrl, staffName, candidateName, candidateId, appUrl } = req.body || {};
    if (!webhookUrl) {
      return res.status(400).json({ error: 'webhookUrlが必要です。' });
    }
    if (!candidateName || !candidateId) {
      return res.status(400).json({ error: '候補者情報（名前・ID）が必要です。' });
    }

    const link = appUrl || 'https://bloom-saiyou.vercel.app';
    const text =
      `📋 書類選考の担当になりました\n` +
      `候補者: ${candidateName} 様 (${candidateId})\n` +
      (staffName ? `担当: ${staffName} 様\n` : '') +
      `アプリで確認する: ${link}`;

    await sendGoogleChatMessage(webhookUrl, text);

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Candidate-registered notify error:', err);
    return res.status(500).json({ error: '通知の送信中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

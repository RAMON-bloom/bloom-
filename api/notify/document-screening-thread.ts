import { sendGoogleChatMessage } from '../_lib/googleChat.js';
import { isBloomFirmAccessToken } from '../_lib/auth.js';

// Fired from ATSContext's addEvaluationNote when a 書類選考 evaluation is saved as 合格, to every
// staff Chat webhook that has the DOCUMENT_SCREENING_THREAD kind enabled. Starts a new
// Google Chat thread (keyed by candidateId, so it stays stable if this ever fires more than once —
// e.g. a re-save — and is ready to be reused as a home for that candidate's later updates).
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, webhookUrl, candidateName, candidateId, agencyName, appUrl } = req.body || {};

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
    const text = `${candidateName} 様（${agencyName || '推薦元不明'}）\nアプリで確認する: ${link}`;

    await sendGoogleChatMessage(webhookUrl, text, `cand-${candidateId}`);

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Document-screening-thread notify error:', err);
    return res.status(500).json({ error: '通知の送信中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

import { sendGoogleChatMessage } from '../_lib/googleChat.js';

// Fired from ATSContext's addEvaluationNote when a 書類選考 evaluation is saved as 合格, to every
// 採用アシスタント whose Chat webhook has the DOCUMENT_SCREENING_THREAD kind enabled. Starts a new
// Google Chat thread (keyed by candidateId, so it stays stable if this ever fires more than once —
// e.g. a re-save — and is ready to be reused as a home for that candidate's later updates) whose
// opening message identifies the candidate by name + agency. Best-effort: the caller doesn't block
// saving the evaluation note on this succeeding.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { webhookUrl, candidateName, candidateId, agencyName, appUrl } = req.body || {};

    if (!webhookUrl) {
      return res.status(400).json({ error: 'webhookUrlが必要です。' });
    }
    if (!candidateName || !candidateId) {
      return res.status(400).json({ error: '候補者情報（名前・ID）が必要です。' });
    }

    const link = appUrl || 'https://bloom-saiyou.vercel.app';
    const text =
      `🧵 *${candidateName} 様*（${agencyName || '推薦元不明'}）の選考スレッドを作成しました\n` +
      `書類選考を通過しました。以降のこの候補者に関する連絡はこのスレッドでご確認ください。\n` +
      `候補者ID: ${candidateId}\n` +
      `アプリで確認する: ${link}`;

    await sendGoogleChatMessage(webhookUrl, text, `cand-${candidateId}`);

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Document-screening-thread notify error:', err);
    return res.status(500).json({ error: '通知の送信中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

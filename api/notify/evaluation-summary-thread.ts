import { sendGoogleChatMessage } from '../_lib/googleChat.js';

const LCM_LABELS: Record<string, string> = { L: 'L評価(ルックス)', C: 'C評価(コミュニケーション)', M: 'M評価(マインド)' };

// Fired from ATSContext's addEvaluationNote whenever a note is saved with a final result
// (合格/不採用、書類選考含む), to every staff Chat webhook that has the EVALUATION_SUMMARY_THREAD
// kind enabled. Unlike evaluation-result (a standalone broadcast message), this writes into the
// SAME Google Chat thread that document-screening-thread started for this candidate — threadKey
// is fixed to the candidate id, exactly like document-screening-thread — so every phase's
// pass/fail, its LCM評価 summary, and the next-interviewer assignment all land in one place.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      webhookUrl,
      candidateName,
      candidateId,
      phaseLabel,
      resultStatus,
      interviewRating,
      lRating,
      cRating,
      mRating,
      lNote,
      cNote,
      mNote,
      goodPoints,
      concerns,
      failReason,
      nextPhaseLabel,
      nextInterviewerNames
    } = req.body || {};

    if (!webhookUrl) {
      return res.status(400).json({ error: 'webhookUrlが必要です。' });
    }
    if (!candidateName || !candidateId) {
      return res.status(400).json({ error: '候補者情報（名前・ID）が必要です。' });
    }
    if (resultStatus !== 'PASS' && resultStatus !== 'FAIL') {
      return res.status(400).json({ error: 'resultStatusはPASSまたはFAILを指定してください。' });
    }

    const resultLabel = resultStatus === 'PASS' ? '✅ 合格' : '❌ 不採用';
    const lines = [`📋 *${candidateName}* 様「${phaseLabel || '-'}」の評価が確定しました`, `判定: ${resultLabel}`];

    if (interviewRating) lines.push(`面接評価: ${interviewRating}`);

    ([['L', lRating, lNote], ['C', cRating, cNote], ['M', mRating, mNote]] as [string, string, string][]).forEach(
      ([key, rating, note]) => {
        if (rating) lines.push(`${LCM_LABELS[key]}: ${rating}${note ? `（${note}）` : ''}`);
      }
    );

    if (goodPoints) lines.push(`評価ポイント: ${goodPoints}`);
    if (concerns) lines.push(`懸念点: ${concerns}`);
    if (resultStatus === 'FAIL' && failReason) lines.push(`見送り理由: ${failReason}`);

    if (resultStatus === 'PASS' && nextPhaseLabel) {
      const assignee = Array.isArray(nextInterviewerNames) && nextInterviewerNames.length > 0
        ? nextInterviewerNames.join('、')
        : '未定';
      lines.push(`次回: ${nextPhaseLabel}　担当面接官: ${assignee}`);
    }

    await sendGoogleChatMessage(webhookUrl, lines.join('\n'), `cand-${candidateId}`);

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Evaluation-summary-thread notify error:', err);
    return res.status(500).json({ error: '通知の送信中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

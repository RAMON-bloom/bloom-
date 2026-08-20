import { sendGoogleChatMessage, formatMention } from '../_lib/googleChat.js';
import { isBloomFirmAccessToken } from '../_lib/auth.js';

const LCM_LABELS: Record<string, string> = { L: 'L評価(ルックス)', C: 'C評価(コミュニケーション)', M: 'M評価(マインド)' };

// Fired from ATSContext's addEvaluationNote whenever a note is saved with a final result
// (合格/不採用、書類選考含む), to every staff Chat webhook that has the EVALUATION_SUMMARY_THREAD
// kind enabled. Unlike evaluation-result (a standalone broadcast message), this writes into the
// SAME Google Chat thread that document-screening-thread started for this candidate — threadKey
// is fixed to the candidate id, exactly like document-screening-thread — so every phase's
// pass/fail, its LCM評価 summary, and the next-interviewer assignment all land in one place.
// The caller should pass threadName (Candidate.chatThreadNames[webhookUrl], if already known)
// alongside threadKey — see sendGoogleChatMessage's doc comment for why relying on threadKey alone
// stops reliably threading a candidate whose evaluations span many weeks (書類選考→1次面接 lands
// fine, but by 2次面接/3次面接 Chat can silently start a brand-new thread instead).
// mentionedStaff (picked in the eval save form, separate from next-interviewer) adds a trailing
// "共有:" line mentioning each of them — a real @mention when they've registered their
// chatMentionId, a plain bold-text fallback otherwise (see formatMention).
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      accessToken,
      webhookUrl,
      candidateName,
      candidateId,
      positionLabel,
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
      otherNotes,
      overallComment,
      failReason,
      nextPhaseLabel,
      nextInterviewerNames,
      interviewFormatLabel,
      mentionedStaff,
      threadName
    } = req.body || {};

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
    if (resultStatus !== 'PASS' && resultStatus !== 'FAIL') {
      return res.status(400).json({ error: 'resultStatusはPASSまたはFAILを指定してください。' });
    }

    const resultLabel = resultStatus === 'PASS' ? '✅ 合格' : '❌ 不採用';
    const lines = [
      `📋 *${candidateName}* 様「${phaseLabel || '-'}」の評価が確定しました`,
      `選考ポジション: ${positionLabel || '未設定'}`,
      `判定: ${resultLabel}`
    ];

    if (interviewRating) lines.push(`面接評価: ${interviewRating}`);

    ([['L', lRating, lNote], ['C', cRating, cNote], ['M', mRating, mNote]] as [string, string, string][]).forEach(
      ([key, rating, note]) => {
        if (rating) lines.push(`${LCM_LABELS[key]}: ${rating}${note ? `（${note}）` : ''}`);
      }
    );

    if (goodPoints) lines.push(`評価ポイント: ${goodPoints}`);
    if (concerns) lines.push(`懸念点: ${concerns}`);
    if (otherNotes) lines.push(`その他メモ: ${otherNotes}`);
    if (overallComment) lines.push(`総合所感: ${overallComment}`);
    if (resultStatus === 'FAIL' && failReason) lines.push(`見送り理由: ${failReason}`);

    if (resultStatus === 'PASS' && nextPhaseLabel) {
      const assignee = Array.isArray(nextInterviewerNames) && nextInterviewerNames.length > 0
        ? nextInterviewerNames.join('、')
        : '未定';
      lines.push(`次回: ${nextPhaseLabel}　担当面接官: ${assignee}　面接方式: ${interviewFormatLabel || '未定'}`);
    }

    if (Array.isArray(mentionedStaff) && mentionedStaff.length > 0) {
      const mentions = mentionedStaff
        .map((m: { name?: string; mentionId?: string }) => formatMention(m.name, m.mentionId))
        .filter(Boolean);
      if (mentions.length > 0) lines.push(`共有: ${mentions.join(' ')}`);
    }

    const result = await sendGoogleChatMessage(webhookUrl, lines.join('\n'), `cand-${candidateId}`, threadName);

    return res.json({ success: true, threadName: result.threadName });
  } catch (err: any) {
    console.error('Evaluation-summary-thread notify error:', err);
    return res.status(500).json({ error: '通知の送信中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

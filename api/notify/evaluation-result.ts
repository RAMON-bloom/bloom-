import { sendGoogleChatMessage, formatMention } from '../_lib/googleChat.js';
import { isBloomFirmAccessToken } from '../_lib/auth.js';

// Fired from ATSContext's addEvaluationNote whenever a note is saved with a final result
// (合格/不採用, 書類選考含む — PENDING doesn't fire this), to every staff Chat webhook that has
// the EVALUATION_RESULT kind enabled. Best-effort: the caller doesn't block saving the evaluation
// note on this succeeding.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      accessToken,
      webhookUrl,
      staffName,
      staffMentionId,
      candidateName,
      candidateId,
      phaseLabel,
      resultStatus,
      goodPoints,
      concerns,
      failReason,
      appUrl
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

    const link = appUrl || 'https://bloom-saiyou.vercel.app';
    const resultLabel = resultStatus === 'PASS' ? '✅ 合格' : '❌ 不採用';
    const mention = formatMention(staffName, staffMentionId);

    const lines = [
      mention ? `📊 ${mention} さん、選考結果が確定しました` : '📊 選考結果が確定しました',
      `候補者: ${candidateName} 様 (${candidateId})`,
      `フェーズ: ${phaseLabel || '-'}`,
      `結果: ${resultLabel}`,
      `評価ポイント: ${goodPoints || 'なし'}`,
      `懸念点: ${concerns || 'なし'}`
    ];
    if (resultStatus === 'FAIL') {
      lines.push(`見送り理由: ${failReason || '未記入'}`);
    }
    lines.push(`アプリで確認する: ${link}`);

    await sendGoogleChatMessage(webhookUrl, lines.join('\n'));

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Evaluation-result notify error:', err);
    return res.status(500).json({ error: '通知の送信中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

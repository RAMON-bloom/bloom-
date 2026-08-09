import { sendGoogleChatMessage, formatMention } from '../_lib/googleChat.js';

// Fired from ATSContext's daily stalled-candidate check (client-triggered, throttled to once per
// browser per day — there's no server cron/service account in this app, see attentionUtils.ts).
// Two message shapes share one endpoint since both are thin wrappers around the same
// sendGoogleChatMessage call, just with different text:
//   - 'digest': sent to every staff Chat webhook that has the ATTENTION_DIGEST kind enabled,
//     summarizing how many candidates are stalled / how many document-screening cases are overdue.
//   - 'doc_screening_nudge': sent to the specific document-screening assignee of one overdue
//     candidate, mirroring the existing candidate-registered notice's `*@name*` bold-text mention.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { kind, webhookUrl, staffName, staffMentionId, appUrl } = req.body || {};
    if (!webhookUrl) {
      return res.status(400).json({ error: 'webhookUrlが必要です。' });
    }

    const link = appUrl || 'https://bloom-saiyou.vercel.app';
    const mention = formatMention(staffName, staffMentionId);
    let text: string;

    if (kind === 'digest') {
      const { stalledCount, overdueCount } = req.body || {};
      if (typeof stalledCount !== 'number' || typeof overdueCount !== 'number') {
        return res.status(400).json({ error: 'stalledCount/overdueCountが必要です。' });
      }
      text =
        (mention ? `🔔 ${mention} さん、対応が必要な候補者があります\n` : `🔔 対応が必要な候補者があります\n`) +
        `進捗停滞中: ${stalledCount}名\n` +
        `書類選考 対応待ち: ${overdueCount}名\n` +
        `アプリで確認する: ${link}`;
    } else if (kind === 'doc_screening_nudge') {
      const { candidateName, candidateId, daysSinceUpdate } = req.body || {};
      if (!candidateName || !candidateId) {
        return res.status(400).json({ error: '候補者情報（名前・ID）が必要です。' });
      }
      text =
        (mention ? `⏰ ${mention} さん、書類選考の対応が止まっています\n` : `⏰ 書類選考の対応が止まっています\n`) +
        `候補者: ${candidateName} 様 (${candidateId})\n` +
        `最終更新から ${daysSinceUpdate}日 経過しています\n` +
        `アプリで確認する: ${link}`;
    } else {
      return res.status(400).json({ error: 'kindはdigestまたはdoc_screening_nudgeを指定してください。' });
    }

    await sendGoogleChatMessage(webhookUrl, text);

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Attention notify error:', err);
    return res.status(500).json({ error: '通知の送信中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

import { sendGoogleChatMessage, formatMention } from '../_lib/googleChat.js';
import { isBloomFirmAccessToken } from '../_lib/auth.js';

interface RejectionPhaseCounts {
  documentScreening: number;
  casualInterview: number;
  firstInterview: number;
  secondInterview: number;
  finalInterview: number;
}

interface AgencyDigestStat {
  agencyName: string;
  total: number;
  documentPassCount: number;
  firstInterviewPassCount: number;
  offerCount: number;
  acceptCount: number;
  rejectedByPhase: RejectionPhaseCounts;
}

interface PositionDigestGroup {
  positionLabel: string;
  total: number;
  agencyStats: AgencyDigestStat[];
}

// rejectedByPhaseの各キーを、見送り内訳の表示ラベルへ対応付ける（表示順もこの並び）。
const REJECTION_PHASE_LABELS: [keyof RejectionPhaseCounts, string][] = [
  ['documentScreening', '書類選考'],
  ['casualInterview', 'カジュアル面談'],
  ['firstInterview', '1次面接'],
  ['secondInterview', '2次面接'],
  ['finalInterview', '最終面接']
];

function formatRejectionBreakdown(rejectedByPhase: RejectionPhaseCounts): string {
  const parts = REJECTION_PHASE_LABELS
    .filter(([key]) => rejectedByPhase[key] > 0)
    .map(([key, label]) => `${label}${rejectedByPhase[key]}名`);
  return parts.length > 0 ? `見送り(${parts.join(', ')})` : '見送り0名';
}

// Fired manually from the 分析ダッシュボード's two "応募状況を送信" buttons (DAILY_APPLICATIONS_DIGEST /
// PERIOD_APPLICATIONS_DIGEST) — unlike ATTENTION_DIGEST this is never sent automatically, only on
// an explicit click, to every staff/group Chat webhook subscribed to the relevant kind. The
// candidate/agency numbers are computed client-side (same computeYieldMetricsByPosition helper the
// dashboard itself renders from — BCA/AIX/BRE each broken out, everything else lumped into 「その他」)
// and just passed through here for formatting + the actual webhook POST.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, webhookUrl, staffName, staffMentionId, periodLabel, totalCount, positionGroups, appUrl } = req.body || {};
    if (!accessToken) {
      return res.status(401).json({ error: 'OAuthアクセストークンが必要です。Googleでログインしてください。' });
    }
    if (!(await isBloomFirmAccessToken(accessToken))) {
      return res.status(403).json({ error: 'bloom-firm.comアカウントでのログインが必要です。' });
    }
    if (!webhookUrl) {
      return res.status(400).json({ error: 'webhookUrlが必要です。' });
    }
    if (!periodLabel || typeof totalCount !== 'number' || !Array.isArray(positionGroups)) {
      return res.status(400).json({ error: 'periodLabel/totalCount/positionGroupsが必要です。' });
    }

    const link = appUrl || 'https://bloom-saiyou.vercel.app';
    const mention = formatMention(staffName, staffMentionId);

    const positionSections = (positionGroups as PositionDigestGroup[])
      .filter((g) => g.total > 0)
      .map((g) => {
        const agencyLines = g.agencyStats
          .filter((a) => a.total > 0)
          .map(
            (a) =>
              `・${a.agencyName}: 応募${a.total}名 / 書類通過${a.documentPassCount}名 / 1次通過${a.firstInterviewPassCount}名 / 内定${a.offerCount}名 / 承諾${a.acceptCount}名 / ${formatRejectionBreakdown(a.rejectedByPhase)}`
          )
          .join('\n');
        return `■ *${g.positionLabel}*（${g.total}名）\n${agencyLines}`;
      })
      .join('\n\n');

    const text =
      (mention ? `📊 ${mention} さん、応募状況をお知らせします\n` : `📊 応募状況をお知らせします\n`) +
      `対象期間: ${periodLabel}\n` +
      `総応募数: ${totalCount}名\n` +
      (positionSections ? `\n${positionSections}\n\n` : '\n') +
      `アプリで確認する: ${link}`;

    await sendGoogleChatMessage(webhookUrl, text);

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Applications digest notify error:', err);
    return res.status(500).json({ error: '通知の送信中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

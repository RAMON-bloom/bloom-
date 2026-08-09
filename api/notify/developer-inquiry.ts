import { sendGoogleChatMessage } from '../_lib/googleChat.js';
import { isBloomFirmAccessToken } from '../_lib/auth.js';

const CATEGORY_LABELS: Record<string, string> = {
  BUG: '🐞 バグ報告',
  SUGGESTION: '💡 改善提案',
  OTHER: '💬 その他'
};

// Fired from ATSContext's addInquiryMessage when a message is sent from the in-app 「お問い合わせ」
// chat, to every staff Chat webhook that has the DEVELOPER_INQUIRY kind enabled. Threaded by
// inquiryId (thread.threadKey), so follow-up messages in the same inquiry land in the same
// Google Chat thread instead of starting a new one each time.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, webhookUrl, staffName, category, message, inquiryId } = req.body || {};

    if (!accessToken) {
      return res.status(401).json({ error: 'OAuthアクセストークンが必要です。Googleでログインしてください。' });
    }
    if (!(await isBloomFirmAccessToken(accessToken))) {
      return res.status(403).json({ error: 'bloom-firm.comアカウントでのログインが必要です。' });
    }
    if (!webhookUrl) {
      return res.status(400).json({ error: 'webhookUrlが必要です。' });
    }
    if (!message || !inquiryId) {
      return res.status(400).json({ error: 'メッセージ内容とinquiryIdが必要です。' });
    }

    const categoryLabel = CATEGORY_LABELS[category] || CATEGORY_LABELS.OTHER;
    const text = `${categoryLabel} ${staffName ? `*${staffName}* さんより` : 'お問い合わせ'}\n${message}`;

    await sendGoogleChatMessage(webhookUrl, text, `inquiry-${inquiryId}`);

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Developer-inquiry notify error:', err);
    return res.status(500).json({ error: '通知の送信中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

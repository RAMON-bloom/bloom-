import { findMeetingNotesDoc } from '../_lib/calendar.js';
import { isBloomFirmAccessToken } from '../_lib/auth.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, date, titleKeyword } = req.body || {};
    if (!accessToken) {
      return res.status(400).json({ error: 'OAuthアクセストークンが必要です。Googleでログインしてください。' });
    }
    if (!(await isBloomFirmAccessToken(accessToken))) {
      return res.status(403).json({ error: 'bloom-firm.comアカウントでのログインが必要です。' });
    }
    if (!date) {
      return res.status(400).json({ error: '検索対象の日付がありません。' });
    }

    const match = await findMeetingNotesDoc(accessToken, date, titleKeyword || '採用社内MTG');
    if (!match) {
      return res.json({ success: true, found: false });
    }
    return res.json({ success: true, found: true, ...match });
  } catch (err: any) {
    console.error('Calendar find-meeting-notes error:', err);
    return res.status(500).json({ error: 'カレンダーの検索中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

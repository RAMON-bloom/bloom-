import { parseResumeContent } from './_lib/resumeParser.js';
import { isBloomFirmAccessToken } from './_lib/auth.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, textContent, fileName, mimeType, fileBase64 } = req.body || {};

    if (!accessToken) {
      return res.status(401).json({ error: 'OAuthアクセストークンが必要です。Googleでログインしてください。' });
    }
    if (!(await isBloomFirmAccessToken(accessToken))) {
      return res.status(403).json({ error: 'bloom-firm.comアカウントでのログインが必要です。' });
    }
    if (!textContent && !fileBase64) {
      return res.status(400).json({ error: 'ファイルデータまたはテキストが提供されていません。' });
    }

    const data = await parseResumeContent({ textContent, fileBase64, fileName, mimeType });
    return res.json({ success: true, data });
  } catch (err: any) {
    console.error('Resume parsing error:', err);
    return res.status(500).json({ error: 'レジュメ解析中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

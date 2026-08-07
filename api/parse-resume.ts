import { parseResumeContent } from './_lib/resumeParser';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { textContent, fileName, mimeType, fileBase64 } = req.body || {};

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

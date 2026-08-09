import { downloadFileBase64, readFileContent } from '../_lib/drive.js';
import { parseResumeContent } from '../_lib/resumeParser.js';
import { isBloomFirmAccessToken } from '../_lib/auth.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, fileId, fileName, mimeType } = req.body || {};
    if (!accessToken) {
      return res.status(400).json({ error: 'OAuthアクセストークンが必要です。Googleでログインしてください。' });
    }
    if (!(await isBloomFirmAccessToken(accessToken))) {
      return res.status(403).json({ error: 'bloom-firm.comアカウントでのログインが必要です。' });
    }
    if (!fileId) {
      return res.status(400).json({ error: 'インポート対象のDriveファイルIDがありません。' });
    }

    let textContent = '';
    let fileBase64 = '';

    if ((mimeType || '').startsWith('application/pdf')) {
      fileBase64 = await downloadFileBase64(accessToken, fileId);
    } else {
      // Plain text, markdown, and Google Docs export cleanly to text. Other binary formats
      // (e.g. .docx) fall back to this too — best-effort, same limitation the direct file-upload
      // parser already has.
      textContent = await readFileContent(accessToken, { id: fileId, name: fileName, mimeType });
    }

    const data = await parseResumeContent({ textContent, fileBase64, fileName, mimeType });
    return res.json({ success: true, data });
  } catch (err: any) {
    console.error('Drive import-resume error:', err);
    return res.status(500).json({ error: 'Drive上のレジュメ取込中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

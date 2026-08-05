import { listFilesInFolder } from '../_lib/drive';

const RESERVED_SUBFOLDER_NAMES = ['履歴書・応募書類', 'バックアップ'];

const MEETING_LOG_MIME_TYPES = [
  'application/vnd.google-apps.document',
  'text/plain',
  'text/markdown'
];

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, folderId } = req.body || {};
    if (!accessToken) {
      return res.status(400).json({ error: 'OAuthアクセストークンが必要です。Googleでログインしてください。' });
    }
    if (!folderId) {
      return res.status(400).json({ error: 'Drive連携フォルダIDが設定されていません。' });
    }

    const files = await listFilesInFolder(accessToken, folderId, {
      mimeTypes: MEETING_LOG_MIME_TYPES
    });

    const logs = files
      .filter((f) => !RESERVED_SUBFOLDER_NAMES.includes(f.name))
      .map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink
      }));

    return res.json({ success: true, files: logs });
  } catch (err: any) {
    console.error('Drive list-logs error:', err);
    return res.status(500).json({ error: 'Driveファイル一覧の取得中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

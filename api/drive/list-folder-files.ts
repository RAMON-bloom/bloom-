import { listFilesInFolder } from '../_lib/drive.js';

// Lists the files sitting directly inside a single already-known Drive folder — used to refresh
// one candidate's document list on demand (e.g. when opening their detail view) without scanning
// every phase folder the way scan-resumes.ts does for the bulk "Driveと同期" flow.
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
      return res.status(400).json({ error: '対象のDriveフォルダIDがありません。' });
    }

    const files = (await listFilesInFolder(accessToken, folderId)).filter(
      (f) => f.mimeType !== 'application/vnd.google-apps.folder'
    );
    return res.json({ success: true, files });
  } catch (err: any) {
    console.error('Drive list-folder-files error:', err);
    return res.status(500).json({ error: 'Driveフォルダの一覧取得中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

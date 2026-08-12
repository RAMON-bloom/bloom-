import { moveFileToFolder } from '../_lib/drive.js';

// Direct file->folder move, given a folder id the caller already knows (unlike
// move-resume-folder.ts, which re-resolves the target folder from a phase name). Used to fold a
// stray/legacy file into a candidate's existing Drive folder without touching phase folders at
// all — e.g. an old flat resume file uploaded before per-candidate folders existed, adopted into
// resumeDocuments when a new document is dropped on the same candidate later.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, fileId, targetFolderId } = req.body || {};
    if (!accessToken) {
      return res.status(400).json({ error: 'OAuthアクセストークンが必要です。Googleでログインしてください。' });
    }
    if (!fileId) {
      return res.status(400).json({ error: '移動対象のDriveファイルIDがありません。' });
    }
    if (!targetFolderId) {
      return res.status(400).json({ error: '移動先のDriveフォルダIDがありません。' });
    }

    const file = await moveFileToFolder(accessToken, fileId, targetFolderId);
    return res.json({ success: true, file });
  } catch (err: any) {
    console.error('Drive move-file-to-folder error:', err);
    return res.status(500).json({ error: 'Driveのファイル移動中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

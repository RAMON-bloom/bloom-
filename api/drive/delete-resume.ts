import { deleteFileOrFolder } from '../_lib/drive.js';
import { isBloomFirmAccessToken } from '../_lib/auth.js';

// `fileId` here is normally a candidate's own Drive FOLDER id, not a resume file — Drive's API
// treats folders as just another kind of file, so deleting one removes its entire contents
// (resume, CV, anything else dropped in) as a single atomic operation. Legacy candidates
// registered before per-candidate folders existed may still pass their bare resume file id.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, fileId } = req.body || {};
    if (!accessToken) {
      return res.status(400).json({ error: 'OAuthアクセストークンが必要です。Googleでログインしてください。' });
    }
    if (!(await isBloomFirmAccessToken(accessToken))) {
      return res.status(403).json({ error: 'bloom-firm.comアカウントでのログインが必要です。' });
    }
    if (!fileId) {
      return res.status(400).json({ error: '削除対象のDriveファイル/フォルダIDがありません。' });
    }

    try {
      await deleteFileOrFolder(accessToken, fileId);
    } catch (err: any) {
      // Already gone (e.g. deleted directly in Drive, or a retry of a previously successful
      // delete) — the end state the caller wants is already true, so treat it as success.
      if (!String(err.message || '').includes('(404)')) throw err;
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Drive delete-resume error:', err);
    return res.status(500).json({ error: 'Driveからの削除中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

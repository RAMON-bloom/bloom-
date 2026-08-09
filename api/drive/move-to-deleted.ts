import { ensureSubfolder, moveFileToFolder } from '../_lib/drive.js';
import { RESUME_ROOT_SUBFOLDER, DELETED_FOLDER_NAME } from '../_lib/phaseFolders.js';
import { isBloomFirmAccessToken } from '../_lib/auth.js';

// Used by permanentlyDeleteCandidate instead of an actual Drive delete: moves the candidate's
// resume folder/file out of every phase folder into a dedicated 削除済み folder that
// scan-resumes.ts never walks (it only visits the named PHASE_FOLDER_NAMES), so a later
// "Driveと同期" can never rediscover it and re-import it as a "new" unregistered candidate.
// `fileId` is normally a candidate's own Drive FOLDER id — moving one relocates its entire
// contents in one atomic operation, same as move-resume-folder.ts.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, folderId, fileId } = req.body || {};
    if (!accessToken) {
      return res.status(400).json({ error: 'OAuthアクセストークンが必要です。Googleでログインしてください。' });
    }
    if (!(await isBloomFirmAccessToken(accessToken))) {
      return res.status(403).json({ error: 'bloom-firm.comアカウントでのログインが必要です。' });
    }
    if (!folderId) {
      return res.status(400).json({ error: 'Drive連携フォルダIDが設定されていません。' });
    }
    if (!fileId) {
      return res.status(400).json({ error: '移動対象のDriveファイルIDがありません。' });
    }

    try {
      const resumeRootFolderId = await ensureSubfolder(accessToken, folderId, RESUME_ROOT_SUBFOLDER);
      const deletedFolderId = await ensureSubfolder(accessToken, resumeRootFolderId, DELETED_FOLDER_NAME);
      await moveFileToFolder(accessToken, fileId, deletedFolderId);
    } catch (err: any) {
      // Already gone (e.g. deleted directly in Drive, or a retry of a previously successful
      // move) — the end state the caller wants (not sitting in a phase folder anymore) is
      // already true, so treat it as success.
      if (!String(err.message || '').includes('(404)')) throw err;
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Drive move-to-deleted error:', err);
    return res.status(500).json({ error: 'Driveの削除済みフォルダへの移動中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

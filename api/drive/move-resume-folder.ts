import { ensureSubfolder, moveFileToFolder } from '../_lib/drive.js';
import { RESUME_ROOT_SUBFOLDER, resolvePhaseFolderName } from '../_lib/phaseFolders.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, folderId, fileId, phase } = req.body || {};
    if (!accessToken) {
      return res.status(400).json({ error: 'OAuthアクセストークンが必要です。Googleでログインしてください。' });
    }
    if (!folderId) {
      return res.status(400).json({ error: 'Drive連携フォルダIDが設定されていません。' });
    }
    if (!fileId) {
      return res.status(400).json({ error: '移動対象のDriveファイルIDがありません。' });
    }

    const resumeRootFolderId = await ensureSubfolder(accessToken, folderId, RESUME_ROOT_SUBFOLDER);
    const phaseFolderId = await ensureSubfolder(accessToken, resumeRootFolderId, resolvePhaseFolderName(phase));
    const file = await moveFileToFolder(accessToken, fileId, phaseFolderId);

    return res.json({ success: true, file });
  } catch (err: any) {
    console.error('Drive move-resume-folder error:', err);
    return res.status(500).json({ error: 'Driveのフォルダ移動中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

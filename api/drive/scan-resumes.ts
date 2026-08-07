import { DriveFile, findFolderByName, listFilesInFolder } from '../_lib/drive';
import { PHASE_FOLDER_NAMES, RESUME_ROOT_SUBFOLDER } from '../_lib/phaseFolders';

// Scans the Drive-side phase folders as they actually exist right now (does NOT create any
// missing folder — that's only done on upload/move) so the client can detect files that were
// added or moved directly in Drive, bypassing the app.
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

    const resumeRoot = await findFolderByName(accessToken, folderId, RESUME_ROOT_SUBFOLDER);
    if (!resumeRoot) {
      return res.json({ success: true, entries: [] });
    }

    const entries: Array<{ phase: string; file: DriveFile }> = [];
    for (const [phase, folderName] of Object.entries(PHASE_FOLDER_NAMES)) {
      const phaseFolder = await findFolderByName(accessToken, resumeRoot.id, folderName);
      if (!phaseFolder) continue;
      const files = await listFilesInFolder(accessToken, phaseFolder.id);
      for (const file of files) {
        entries.push({ phase, file });
      }
    }

    return res.json({ success: true, entries });
  } catch (err: any) {
    console.error('Drive scan-resumes error:', err);
    return res.status(500).json({ error: 'Driveフォルダのスキャン中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

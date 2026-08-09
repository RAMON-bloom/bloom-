import type { DriveFile } from '../_lib/drive.js';
import { findFolderByName, listFilesInFolder } from '../_lib/drive.js';
import { PHASE_FOLDER_NAMES, RESUME_ROOT_SUBFOLDER } from '../_lib/phaseFolders.js';

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

// Scans the Drive-side phase folders as they actually exist right now (does NOT create any
// missing folder — that's only done on upload/move) so the client can detect files that were
// added or moved directly in Drive, bypassing the app.
//
// Each phase folder normally contains one subfolder per candidate (their resume/CV live inside
// it), but also handles bare files sitting directly in a phase folder — either a manual drop
// bypassing folders entirely, or a candidate registered before per-candidate folders existed.
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

    const entries: Array<{ phase: string; folderId: string | null; folderName: string | null; file: DriveFile }> = [];
    for (const [phase, folderName] of Object.entries(PHASE_FOLDER_NAMES)) {
      const phaseFolder = await findFolderByName(accessToken, resumeRoot.id, folderName);
      if (!phaseFolder) continue;

      const children = await listFilesInFolder(accessToken, phaseFolder.id);
      for (const child of children) {
        if (child.mimeType === FOLDER_MIME_TYPE) {
          const filesInside = await listFilesInFolder(accessToken, child.id);
          for (const file of filesInside) {
            entries.push({ phase, folderId: child.id, folderName: child.name, file });
          }
        } else {
          entries.push({ phase, folderId: null, folderName: null, file: child });
        }
      }
    }

    return res.json({ success: true, entries });
  } catch (err: any) {
    console.error('Drive scan-resumes error:', err);
    return res.status(500).json({ error: 'Driveフォルダのスキャン中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

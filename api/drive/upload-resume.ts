import { ensureSubfolder, createFolder, uploadBase64File } from '../_lib/drive.js';
import { RESUME_ROOT_SUBFOLDER, resolvePhaseFolderName } from '../_lib/phaseFolders.js';
import { isBloomFirmAccessToken } from '../_lib/auth.js';

// Drive folder names can't contain '/' and get unwieldy if left totally unbounded; anything
// else (including Japanese characters) is fine.
function sanitizeFolderNamePart(name: string): string {
  return (name || '').replace(/\//g, '・').trim();
}

function buildCandidateFolderName(candidateName?: string, agencyName?: string): string {
  const name = sanitizeFolderNamePart(candidateName || '') || '名前未設定';
  const agency = sanitizeFolderNamePart(agencyName || '');
  const combined = agency ? `${name}_${agency}` : name;
  return combined.slice(0, 100);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, folderId, fileName, mimeType, fileBase64, candidateName, agencyName, candidateFolderId, phase } = req.body || {};
    if (!accessToken) {
      return res.status(400).json({ error: 'OAuthアクセストークンが必要です。Googleでログインしてください。' });
    }
    if (!(await isBloomFirmAccessToken(accessToken))) {
      return res.status(403).json({ error: 'bloom-firm.comアカウントでのログインが必要です。' });
    }
    if (!folderId) {
      return res.status(400).json({ error: 'Drive連携フォルダIDが設定されていません。' });
    }
    if (!fileBase64 || !fileName) {
      return res.status(400).json({ error: 'アップロード対象のファイルデータがありません。' });
    }

    const base64Data = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;

    // Re-uploading for a candidate that already has a Drive folder (e.g. an updated resume)
    // goes straight into it — no need to re-resolve the phase folder, since a phase change
    // already relocates this folder wherever it needs to be.
    let targetFolderId = candidateFolderId;
    if (!targetFolderId) {
      const resumeRootFolderId = await ensureSubfolder(accessToken, folderId, RESUME_ROOT_SUBFOLDER);
      const phaseFolderId = await ensureSubfolder(accessToken, resumeRootFolderId, resolvePhaseFolderName(phase));
      const candidateFolder = await createFolder(accessToken, phaseFolderId, buildCandidateFolderName(candidateName, agencyName));
      targetFolderId = candidateFolder.id;
    }

    const file = await uploadBase64File(
      accessToken,
      targetFolderId,
      fileName,
      mimeType || 'application/pdf',
      base64Data
    );

    return res.json({ success: true, file, folderId: targetFolderId });
  } catch (err: any) {
    console.error('Drive upload-resume error:', err);
    return res.status(500).json({ error: 'Driveへのレジュメアップロード中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

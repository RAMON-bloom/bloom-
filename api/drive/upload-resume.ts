import { ensureSubfolder, uploadBase64File } from '../_lib/drive.js';
import { RESUME_ROOT_SUBFOLDER, resolvePhaseFolderName } from '../_lib/phaseFolders.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, folderId, fileName, mimeType, fileBase64, candidateId, phase } = req.body || {};
    if (!accessToken) {
      return res.status(400).json({ error: 'OAuthアクセストークンが必要です。Googleでログインしてください。' });
    }
    if (!folderId) {
      return res.status(400).json({ error: 'Drive連携フォルダIDが設定されていません。' });
    }
    if (!fileBase64 || !fileName) {
      return res.status(400).json({ error: 'アップロード対象のファイルデータがありません。' });
    }

    const resumeRootFolderId = await ensureSubfolder(accessToken, folderId, RESUME_ROOT_SUBFOLDER);
    const phaseFolderId = await ensureSubfolder(accessToken, resumeRootFolderId, resolvePhaseFolderName(phase));
    const base64Data = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
    const driveFileName = candidateId ? `${candidateId}_${fileName}` : fileName;

    const file = await uploadBase64File(
      accessToken,
      phaseFolderId,
      driveFileName,
      mimeType || 'application/pdf',
      base64Data
    );

    return res.json({ success: true, file });
  } catch (err: any) {
    console.error('Drive upload-resume error:', err);
    return res.status(500).json({ error: 'Driveへのレジュメアップロード中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

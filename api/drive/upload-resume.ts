import { ensureSubfolder, uploadBase64File } from '../_lib/drive';

const RESUME_SUBFOLDER = '履歴書・応募書類';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, folderId, fileName, mimeType, fileBase64, candidateId } = req.body || {};
    if (!accessToken) {
      return res.status(400).json({ error: 'OAuthアクセストークンが必要です。Googleでログインしてください。' });
    }
    if (!folderId) {
      return res.status(400).json({ error: 'Drive連携フォルダIDが設定されていません。' });
    }
    if (!fileBase64 || !fileName) {
      return res.status(400).json({ error: 'アップロード対象のファイルデータがありません。' });
    }

    const resumeFolderId = await ensureSubfolder(accessToken, folderId, RESUME_SUBFOLDER);
    const base64Data = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
    const driveFileName = candidateId ? `${candidateId}_${fileName}` : fileName;

    const file = await uploadBase64File(
      accessToken,
      resumeFolderId,
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

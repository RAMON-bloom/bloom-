import { findFolderByName, findFileByName, getFileMetadata } from '../_lib/drive.js';

const BACKUP_SUBFOLDER = 'バックアップ';
const BACKUP_FILE_NAME = 'bloom_ats_backup.json';

// Returns only where the shared backup file lives (id + current version) — never its content.
// The content itself is read and written by the browser directly against the Drive API (see
// driveApi.ts restoreFromDrive/backupToDrive), because Vercel functions reject request and
// response bodies over 4.5MB and the backup outgrew that: every write came back 413 while each
// resume upload (a separate, small request) still went through, so new candidates reached the
// Drive folders but never the shared backup the rest of the team reads from.
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

    // Same access canary as restore.ts: an empty folder listing can't tell "not shared with you"
    // apart from "not backed up yet", a direct get on the folder can.
    try {
      await getFileMetadata(accessToken, folderId);
    } catch (accessErr: any) {
      if (accessErr.status === 401) {
        return res.status(401).json({ error: 'Googleアクセストークンの有効期限が切れています。再度ログインしてください。' });
      }
      return res.status(403).json({
        error:
          '採用管理のDriveフォルダへのアクセス権がありません。Google Workspace管理者にこのフォルダへの共有設定をご確認ください。'
      });
    }

    const backupFolder = await findFolderByName(accessToken, folderId, BACKUP_SUBFOLDER);
    if (!backupFolder) {
      return res.status(404).json({ error: 'Drive上にバックアップフォルダが見つかりませんでした。まだバックアップが実行されていない可能性があります。' });
    }
    const backupFile = await findFileByName(accessToken, backupFolder.id, BACKUP_FILE_NAME);
    if (!backupFile) {
      return res.status(404).json({ error: 'Drive上にバックアップファイルが見つかりませんでした。' });
    }
    const meta = await getFileMetadata(accessToken, backupFile.id);
    return res.json({ success: true, fileId: backupFile.id, version: meta.version });
  } catch (err: any) {
    console.error('Drive backup locate error:', err);
    if (err.status === 401) {
      return res.status(401).json({ error: 'Googleアクセストークンの有効期限が切れています。再度ログインしてください。' });
    }
    return res.status(500).json({ error: 'Driveのバックアップファイルの確認中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

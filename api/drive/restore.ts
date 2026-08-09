import { findFolderByName, findFileByName, readFileContent } from '../_lib/drive.js';
import { isBloomFirmAccessToken } from '../_lib/auth.js';

const BACKUP_SUBFOLDER = 'バックアップ';
const BACKUP_FILE_NAME = 'bloom_ats_backup.json';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, folderId } = req.body || {};
    if (!accessToken) {
      return res.status(400).json({ error: 'OAuthアクセストークンが必要です。Googleでログインしてください。' });
    }
    if (!(await isBloomFirmAccessToken(accessToken))) {
      return res.status(403).json({ error: 'bloom-firm.comアカウントでのログインが必要です。' });
    }
    if (!folderId) {
      return res.status(400).json({ error: 'Drive連携フォルダIDが設定されていません。' });
    }

    const backupFolder = await findFolderByName(accessToken, folderId, BACKUP_SUBFOLDER);
    if (!backupFolder) {
      return res.status(404).json({ error: 'Drive上にバックアップフォルダが見つかりませんでした。まだバックアップが実行されていない可能性があります。' });
    }

    const backupFile = await findFileByName(accessToken, backupFolder.id, BACKUP_FILE_NAME);
    if (!backupFile) {
      return res.status(404).json({ error: 'Drive上にバックアップファイルが見つかりませんでした。' });
    }

    const content = await readFileContent(accessToken, backupFile);
    const data = JSON.parse(content);

    return res.json({ success: true, data });
  } catch (err: any) {
    console.error('Drive restore error:', err);
    return res.status(500).json({ error: 'Driveからの復元中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

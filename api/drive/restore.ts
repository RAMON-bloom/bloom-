import { findFolderByName, findFileByName, readFileContent, getFileMetadata } from '../_lib/drive.js';

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
    if (!folderId) {
      return res.status(400).json({ error: 'Drive連携フォルダIDが設定されていません。' });
    }

    // A files.list query scoped to `folderId` as parent (which is what findFolderByName below
    // does) comes back as an empty result — not a 403 — when the caller simply can't see that
    // folder at all, since Drive treats "no visibility into this parent" the same as "this
    // parent has no matching children". That made "you were never granted access to the shared
    // recruitment folder" and "nobody has backed up yet" produce the identical 404 response, so
    // a new teammate whose account was never added to the shared folder's sharing settings saw
    // no error at all (the client's silent-mode auto-restore treats any "見つかりませんでした"
    // 404 as an expected first-login no-op) and was silently left on the app's built-in demo
    // data forever. A direct files.get on the folder id itself doesn't have that ambiguity — it
    // reliably 403/404s when access is actually missing — so it's used here purely as an access
    // canary before trusting an empty list result to mean "not backed up yet".
    try {
      await getFileMetadata(accessToken, folderId);
    } catch (accessErr: any) {
      console.error('Drive restore: root folder access check failed:', accessErr);
      // An expired/invalid token 401s here exactly the same way a genuine "not shared with you"
      // permissions problem 403s — both fail this canary call — but they need very different
      // messages: one just needs a re-login, the other needs a Workspace admin. Without this
      // check, an expired token was misreported as a permissions problem the user couldn't
      // actually fix themselves.
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

    const content = await readFileContent(accessToken, backupFile);
    const data = JSON.parse(content);

    return res.json({ success: true, data });
  } catch (err: any) {
    console.error('Drive restore error:', err);
    if (err.status === 401) {
      return res.status(401).json({ error: 'Googleアクセストークンの有効期限が切れています。再度ログインしてください。' });
    }
    return res.status(500).json({ error: 'Driveからの復元中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

import { ensureSubfolder, upsertTextFile } from '../_lib/drive.js';

const BACKUP_SUBFOLDER = 'バックアップ';
const BACKUP_FILE_NAME = 'bloom_ats_backup.json';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, folderId, data, expectedVersion } = req.body || {};
    if (!accessToken) {
      return res.status(400).json({ error: 'OAuthアクセストークンが必要です。Googleでログインしてください。' });
    }
    if (!folderId) {
      return res.status(400).json({ error: 'Drive連携フォルダIDが設定されていません。' });
    }
    if (!data) {
      return res.status(400).json({ error: 'バックアップ対象データがありません。' });
    }

    const backupFolderId = await ensureSubfolder(accessToken, folderId, BACKUP_SUBFOLDER);

    // Stamped after the spread so a client can never supply (or accidentally carry over from an
    // earlier read) its own backedUpAt — every client compares these server-issued timestamps
    // with each other, so they must all come from one clock, not from each device's own.
    const payload = {
      ...data,
      backedUpAt: new Date().toISOString()
    };

    const file = await upsertTextFile(
      accessToken,
      backupFolderId,
      BACKUP_FILE_NAME,
      'application/json',
      JSON.stringify(payload, null, 2),
      { expectedVersion: expectedVersion ? String(expectedVersion) : undefined }
    );

    return res.json({ success: true, file, backedUpAt: payload.backedUpAt, version: file.version });
  } catch (err: any) {
    console.error('Drive backup error:', err);
    // Propagated as a real 401 (rather than the generic 500 below) so the client can tell "the
    // access token expired mid-session" apart from an actual server/Drive error and react
    // accordingly (prompt reconnect) instead of just retrying the same doomed request forever.
    // Someone else wrote the backup after this client read it — the client re-reads, re-merges
    // and retries (see attemptBackup in ATSContext.tsx). Not an error worth logging loudly.
    if (err.status === 409) {
      return res.status(409).json({ error: 'バックアップが他の端末で更新されていたため、再読込してから保存し直します。' });
    }
    if (err.status === 401) {
      return res.status(401).json({ error: 'Googleアクセストークンの有効期限が切れています。再度ログインしてください。' });
    }
    return res.status(500).json({ error: 'Driveへのバックアップ中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

import { ensureSubfolder, createFolder, upsertTextFile } from '../_lib/drive.js';
import { RESUME_ROOT_SUBFOLDER, resolvePhaseFolderName } from '../_lib/phaseFolders.js';

// Kept in sync with the identical helpers in upload-resume.ts (duplicated rather than shared —
// see phaseFolders.ts's comment on why api/ doesn't import from src/).
function sanitizeFolderNamePart(name: string): string {
  return (name || '').replace(/\//g, '・').trim();
}

function buildCandidateFolderName(candidateName?: string, agencyName?: string): string {
  const name = sanitizeFolderNamePart(candidateName || '') || '名前未設定';
  const agency = sanitizeFolderNamePart(agencyName || '');
  const combined = agency ? `${name}_${agency}` : name;
  return combined.slice(0, 100);
}

const EVALUATION_LOG_FILE_NAME = '面接評価ログ.json';

// Writes a candidate's full evaluationNotes array into their own Drive folder, independent of the
// single shared bloom_ats_backup.json blob — a candidate's interview history shouldn't be at the
// mercy of that one file getting overwritten or a browser's local edit racing another tab's.
// candidates do go through a three-way merge in ATSContext.tsx now, but that merge is still
// record-level (whole-candidate), so a same-candidate conflict since base still falls back to
// "local wins" wholesale — this per-candidate file is what survives that case. Always overwrites
// the file wholesale with the full current notes array (matching upsertTextFile), since the caller
// always sends the complete, authoritative list, not a delta.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, folderId, candidateFolderId, candidateId, candidateName, agencyName, phase, evaluationNotes } = req.body || {};
    if (!accessToken) {
      return res.status(400).json({ error: 'OAuthアクセストークンが必要です。Googleでログインしてください。' });
    }
    if (!folderId) {
      return res.status(400).json({ error: 'Drive連携フォルダIDが設定されていません。' });
    }
    if (!Array.isArray(evaluationNotes)) {
      return res.status(400).json({ error: 'evaluationNotesが不正です。' });
    }

    // Reuses the candidate's existing resume folder when there is one, so the evaluation log sits
    // right alongside the resume/CV — but a candidate registered without ever having a resume file
    // uploaded still gets one created here, since evaluation notes shouldn't require a resume to be
    // durably saved.
    let targetFolderId = candidateFolderId;
    if (!targetFolderId) {
      const resumeRootFolderId = await ensureSubfolder(accessToken, folderId, RESUME_ROOT_SUBFOLDER);
      const phaseFolderId = await ensureSubfolder(accessToken, resumeRootFolderId, resolvePhaseFolderName(phase));
      const candidateFolder = await createFolder(accessToken, phaseFolderId, buildCandidateFolderName(candidateName, agencyName));
      targetFolderId = candidateFolder.id;
    }

    const content = JSON.stringify(
      { candidateId, candidateName, savedAt: new Date().toISOString(), evaluationNotes },
      null,
      2
    );
    const file = await upsertTextFile(accessToken, targetFolderId, EVALUATION_LOG_FILE_NAME, 'application/json', content);

    return res.json({ success: true, file, folderId: targetFolderId });
  } catch (err: any) {
    console.error('Drive save-evaluation-log error:', err);
    if (err.status === 401) {
      return res.status(401).json({ error: 'Googleアクセストークンの有効期限が切れています。再度ログインしてください。' });
    }
    return res.status(500).json({ error: '面接評価ログのDrive保存中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}

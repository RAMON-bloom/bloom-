// Client-side helpers for the /api/drive/* backend endpoints.
// All requests are scoped to the single shared recruitment Drive folder
// (VITE_RECRUITMENT_DRIVE_FOLDER_ID), using the signed-in user's Drive OAuth token.

import type { OfferLedgerRow } from './offerLedger';

export const RECRUITMENT_DRIVE_FOLDER_ID: string =
  (import.meta as any).env?.VITE_RECRUITMENT_DRIVE_FOLDER_ID || '';

export interface DriveMeetingFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface DriveMeetingSummary {
  overview: string;
  keyHighlights: string[];
  interviewFeedback: string;
  candidateQuestions: string;
  nextAction: string;
  summaryMarkdown: string;
}

async function postJson<T>(url: string, body: object): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  // A non-JSON body means the request never reached our handler at all — e.g. the platform
  // (Vercel/Express) rejected an oversized payload before parsing it and returned a plain-text
  // "Request Entity Too Large" page. Reading as text first avoids res.json() throwing a raw
  // SyntaxError ("Unexpected token 'R' ... is not valid JSON") that's meaningless to the user.
  const rawText = await res.text();
  let data: any;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    if (res.status === 413) {
      throw new Error('ファイルサイズが大きすぎます（1ファイルあたり約4MBが上限です）。ファイルを圧縮するか分割してください。');
    }
    throw new Error(`サーバーエラーが発生しました (HTTP ${res.status})`);
  }
  if (!res.ok || data.error) {
    const err: any = new Error(data.error || `${url} でエラーが発生しました`);
    // Lets callers (ATSContext's auto-backup/poll) tell "the Google access token expired" apart
    // from other failures and react by trying an immediate silent re-auth instead of just
    // retrying the same doomed request, or showing a generic "sync failed" toast when what's
    // actually needed is logging back in.
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function summarizeDriveMeetingLog(
  accessToken: string,
  file: DriveMeetingFile
): Promise<{ rawContent: string; summary: DriveMeetingSummary }> {
  return postJson('/api/drive/summarize-log', {
    accessToken,
    fileId: file.id,
    fileName: file.name,
    mimeType: file.mimeType
  });
}

export interface CalendarMeetingNotesMatch {
  found: boolean;
  eventSummary?: string;
  eventStart?: string;
  fileId?: string;
  fileName?: string;
}

// Looks up the calendar event for the recurring "採用MTG" series closest to `dateStr` and
// returns its auto-generated "Gemini によるメモ" attachment, if any. That doc is the per-occurrence
// meeting notes Google Meet's note-taker creates and attaches straight to the calendar event — it
// never lands in the app's own shared Drive folder, so it can't be found by browsing that folder.
export async function findCalendarMeetingNotes(
  accessToken: string,
  dateStr: string,
  titleKeyword = '採用MTG'
): Promise<CalendarMeetingNotesMatch> {
  return postJson('/api/calendar/find-meeting-notes', { accessToken, date: dateStr, titleKeyword });
}

// Same shape/契約 as findCalendarMeetingNotes above, but for meetings whose notes only arrived by
// email — searches Gmail for the Google Meet transcript/notes sharing notification closest to
// `dateStr` and returns its linked Drive document, without ever needing the calendar event itself
// (useful once an old event has rotated out of Calendar, or its attachment was never picked up).
export async function findGmailMeetingNotes(
  accessToken: string,
  dateStr: string,
  titleKeyword = '採用MTG'
): Promise<CalendarMeetingNotesMatch> {
  return postJson('/api/gmail/find-meeting-notes', { accessToken, date: dateStr, titleKeyword });
}

// The shared backup (bloom_ats_backup.json) is read and written by the browser directly against the
// Drive API instead of through /api/drive/backup|restore: Vercel functions reject request/response
// bodies over 4.5MB, and once the backup (photos included) grew past that every write failed with a
// 413 — resumes still uploaded (small separate requests), so new candidates showed up in the Drive
// folders but never in the shared backup the rest of the team reads from. Only the small "where is
// the file" lookup still goes through the server (backup-locate.ts).
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

let backupFileIdCache: string | null = null;

async function driveDirect(accessToken: string, url: string, init?: RequestInit): Promise<Response> {
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}supportsAllDrives=true`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers || {}) }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err: any = new Error(
      res.status === 401
        ? 'Googleアクセストークンの有効期限が切れています。再度ログインしてください。'
        : `Drive APIエラー (HTTP ${res.status}): ${text.slice(0, 200)}`
    );
    err.status = res.status;
    throw err;
  }
  return res;
}

// Current id + version of the backup file, or null when nobody has backed up yet. The id is cached
// for the session; the version is always fetched fresh (it is what the conflict check compares).
async function locateBackupFile(accessToken: string): Promise<{ fileId: string; version?: string } | null> {
  if (backupFileIdCache) {
    try {
      const res = await driveDirect(accessToken, `${DRIVE_API}/files/${backupFileIdCache}?fields=version,trashed`);
      const meta = await res.json();
      if (!meta.trashed) return { fileId: backupFileIdCache, version: meta.version };
    } catch (err: any) {
      if (err.status !== 404) throw err;
    }
    backupFileIdCache = null;
  }
  try {
    const res = await postJson<{ fileId: string; version?: string }>('/api/drive/backup-locate', {
      accessToken,
      folderId: RECRUITMENT_DRIVE_FOLDER_ID
    });
    backupFileIdCache = res.fileId;
    return { fileId: res.fileId, version: res.version };
  } catch (err: any) {
    if (err.status === 404) return null;
    throw err;
  }
}

// Cheap check for the background poll: the backup's current Drive version without downloading it.
export async function getBackupVersion(accessToken: string): Promise<string | undefined> {
  return (await locateBackupFile(accessToken))?.version;
}

// `expectedVersion` is the Drive file version this payload was merged against (from the
// restoreFromDrive read just before). The write is refused with a 409 if anyone else has written
// since, so the caller can re-read and re-merge instead of overwriting their change.
export async function backupToDrive(
  accessToken: string,
  data: object,
  expectedVersion?: string
): Promise<{ backedUpAt?: string; version?: string }> {
  const located = await locateBackupFile(accessToken);
  if (!located) {
    // Very first backup ever: let the server create the folder/file (tiny at that point).
    const res = await postJson<{ backedUpAt?: string; version?: string }>('/api/drive/backup', {
      accessToken,
      folderId: RECRUITMENT_DRIVE_FOLDER_ID,
      data,
      expectedVersion
    });
    return { backedUpAt: res.backedUpAt, version: res.version };
  }
  if (expectedVersion && located.version && located.version !== expectedVersion) {
    const err: any = new Error('バックアップが他の端末で更新されていたため、再読込してから保存し直します。');
    err.status = 409;
    throw err;
  }
  // Only ever compared for equality ("has anyone written since I last read/wrote?"), never for
  // order, so the browser's own clock is fine here.
  const backedUpAt = new Date().toISOString();
  const res = await driveDirect(
    accessToken,
    `${DRIVE_UPLOAD_API}/files/${located.fileId}?uploadType=media&fields=id,version`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ ...data, backedUpAt })
    }
  );
  const file = await res.json();
  return { backedUpAt, version: file.version };
}

// 内定者台帳（Drive上の「内定者台帳」フォルダ）へ内定者の行を追記・更新する。台帳側は削除せず蓄積
// するだけなので、渡す行が一部でも問題ない。csvUrlは閲覧用CSV（スプレッドシートで開ける）のリンク。
export async function saveOfferLedger(
  accessToken: string,
  rows: OfferLedgerRow[]
): Promise<{ changed: boolean; count: number; csvUrl?: string }> {
  return postJson('/api/drive/offer-ledger', { accessToken, folderId: RECRUITMENT_DRIVE_FOLDER_ID, rows });
}

// The backup JSON plus `driveFileVersion` — the Drive version of the file this content came from,
// to hand back to backupToDrive as its expectedVersion.
// Read straight from Drive (see the note above backupToDrive). The version is read *before* the
// content: if a write lands in between, we hold newer content under an older version and the next
// write merely gets a harmless 409 — the reverse order could let a stale write through.
export async function restoreFromDrive<T = any>(accessToken: string): Promise<T & { driveFileVersion?: string }> {
  const located = await locateBackupFile(accessToken);
  if (!located) {
    const err: any = new Error('Drive上にバックアップファイルが見つかりませんでした。');
    err.status = 404;
    throw err;
  }
  const res = await driveDirect(accessToken, `${DRIVE_API}/files/${located.fileId}?alt=media`, { cache: 'no-store' });
  const data = JSON.parse(await res.text());
  return { ...data, driveFileVersion: located.version };
}

export interface DriveResumeFile {
  id: string;
  name: string;
  webViewLink?: string;
}

export interface UploadedResumeResult {
  file: DriveResumeFile;
  folderId: string;
}

// A brand-new candidate (no candidateFolderId yet) gets a fresh Drive folder named after them,
// created inside the current phase's folder; the resume/CV file is uploaded into it. Passing an
// existing candidateFolderId (e.g. re-uploading an updated resume later) uploads straight into
// that folder instead of creating a new one.
export async function uploadResumeToDrive(
  accessToken: string,
  file: { name: string; type: string; base64: string },
  options: { candidateName?: string; agencyName?: string; candidateFolderId?: string; phase?: string } = {}
): Promise<UploadedResumeResult> {
  const data = await postJson<{ success: boolean; file: DriveResumeFile; folderId: string }>('/api/drive/upload-resume', {
    accessToken,
    folderId: RECRUITMENT_DRIVE_FOLDER_ID,
    fileName: file.name,
    mimeType: file.type,
    fileBase64: file.base64,
    candidateName: options.candidateName,
    agencyName: options.agencyName,
    candidateFolderId: options.candidateFolderId,
    phase: options.phase
  });
  return { file: data.file, folderId: data.folderId };
}

export interface SavedEvaluationLogResult {
  file: DriveResumeFile;
  folderId: string;
}

// Writes a candidate's full evaluationNotes array into their own Drive folder (creating it first
// if the candidate has no resume folder yet), as a redundant per-candidate backup independent of
// the single shared bloom_ats_backup.json blob. Always sends the complete current notes array —
// the endpoint overwrites the file wholesale, it doesn't merge.
export async function saveEvaluationLogToDrive(
  accessToken: string,
  candidate: { id: string; name: string; agencyName?: string; phase: string; resumeDriveFolderId?: string },
  evaluationNotes: unknown[]
): Promise<SavedEvaluationLogResult> {
  const data = await postJson<{ success: boolean; file: DriveResumeFile; folderId: string }>('/api/drive/save-evaluation-log', {
    accessToken,
    folderId: RECRUITMENT_DRIVE_FOLDER_ID,
    candidateFolderId: candidate.resumeDriveFolderId,
    candidateId: candidate.id,
    candidateName: candidate.name,
    agencyName: candidate.agencyName,
    phase: candidate.phase,
    evaluationNotes
  });
  return { file: data.file, folderId: data.folderId };
}

// Permanently deletes a candidate's resume file/folder from Drive. Superseded by
// moveResumeToDeletedFolder below for permanentlyDeleteCandidate's own use (an actual Drive
// delete made "Driveと同期" occasionally resurrect a just-deleted candidate — see that function's
// comments) but left in place as a real hard-delete primitive in case it's needed again.
export async function deleteResumeFromDrive(accessToken: string, fileId: string): Promise<void> {
  await postJson('/api/drive/delete-resume', { accessToken, fileId });
}

// Moves a candidate's resume file/folder into a dedicated 削除済み folder that "Driveと同期"'s
// scan never walks, instead of deleting it — used when a candidate is deleted for good from the
// archive (not the soft-delete/archive step, which leaves Drive alone). Keeps the underlying
// files recoverable (and, deliberately, keeps the candidate's personal data on Drive
// indefinitely) in exchange for structurally ruling out sync ever re-importing it.
export async function moveResumeToDeletedFolder(accessToken: string, fileId: string): Promise<void> {
  await postJson('/api/drive/move-to-deleted', { accessToken, folderId: RECRUITMENT_DRIVE_FOLDER_ID, fileId });
}

export async function moveResumeToPhaseFolder(
  accessToken: string,
  fileId: string,
  phase: string
): Promise<DriveResumeFile> {
  const data = await postJson<{ success: boolean; file: DriveResumeFile }>('/api/drive/move-resume-folder', {
    accessToken,
    folderId: RECRUITMENT_DRIVE_FOLDER_ID,
    fileId,
    phase
  });
  return data.file;
}

// Moves a file directly into an already-known folder id, without re-resolving anything from a
// phase name (unlike moveResumeToPhaseFolder). Used to fold a stray file into a candidate's
// existing Drive folder so it stops living outside the folder that phase changes actually move.
export async function moveFileIntoFolder(
  accessToken: string,
  fileId: string,
  targetFolderId: string
): Promise<DriveResumeFile> {
  const data = await postJson<{ success: boolean; file: DriveResumeFile }>('/api/drive/move-file-to-folder', {
    accessToken,
    fileId,
    targetFolderId
  });
  return data.file;
}

// Lists the files inside one already-known candidate folder — used to refresh a single
// candidate's document list on demand (opening their detail view) without the bulk "Driveと同期"
// flow, so a folder that already has more files than the app has recorded (e.g. from before this
// app tracked every file, or a file dropped in by hand) shows up without an extra manual step.
export async function listFolderFiles(accessToken: string, folderId: string): Promise<DriveResumeFile[]> {
  const data = await postJson<{ success: boolean; files: DriveResumeFile[] }>('/api/drive/list-folder-files', {
    accessToken,
    folderId
  });
  return data.files;
}

export interface DrivePhaseFileEntry {
  phase: string;
  folderId: string | null;
  folderName: string | null;
  file: DriveMeetingFile;
}

// Scans the phase subfolders as they actually exist in Drive right now — used to detect resumes
// added or moved directly in Drive, bypassing the app.
export async function scanDriveResumes(accessToken: string): Promise<DrivePhaseFileEntry[]> {
  const data = await postJson<{ success: boolean; entries: DrivePhaseFileEntry[] }>('/api/drive/scan-resumes', {
    accessToken,
    folderId: RECRUITMENT_DRIVE_FOLDER_ID
  });
  return data.entries;
}

export interface ImportedResumeData {
  name: string;
  nameKana: string;
  age: number;
  education: string;
  currentCompany: string;
  companyCount: number;
  email: string;
  phone: string;
  jobTitle: string;
  resumeSummary: string;
  resumeSkills: string[];
  salaryExpectation: string;
  rawResumeContent: string;
}

export async function importDriveResume(
  accessToken: string,
  file: { id: string; name: string; mimeType: string }
): Promise<ImportedResumeData> {
  const data = await postJson<{ success: boolean; data: ImportedResumeData }>('/api/drive/import-resume', {
    accessToken,
    fileId: file.id,
    fileName: file.name,
    mimeType: file.mimeType
  });
  return data.data;
}

export interface PhotoCropBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface DetectedPhotoCrop {
  found: boolean;
  box?: PhotoCropBox;
  page?: number;
  fileBase64: string;
  mimeType: string;
}

// Downloads the resume file from Drive and asks Gemini to locate the photo box on page 1,
// returning both the raw file bytes (for client-side rendering) and a normalized bounding box.
// The server only returns where the photo is; the file itself is downloaded here straight from
// Drive (in parallel), since passing it back through the function hit Vercel's 4.5MB limit.
export async function detectResumePhotoCrop(accessToken: string, fileId: string): Promise<DetectedPhotoCrop> {
  const [detected, fileBase64] = await Promise.all([
    postJson<DetectedPhotoCrop>('/api/drive/detect-photo-crop', { accessToken, fileId, omitFile: true }),
    downloadDriveFileBase64(accessToken, fileId)
  ]);
  return { ...detected, fileBase64 };
}

async function downloadDriveFileBase64(accessToken: string, fileId: string): Promise<string> {
  const res = await driveDirect(accessToken, `${DRIVE_API}/files/${fileId}?alt=media`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error || new Error('ファイルの読み込みに失敗しました'));
    reader.readAsDataURL(blob);
  });
}

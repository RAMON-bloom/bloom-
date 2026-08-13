// Client-side helpers for the /api/drive/* backend endpoints.
// All requests are scoped to the single shared recruitment Drive folder
// (VITE_RECRUITMENT_DRIVE_FOLDER_ID), using the signed-in user's Drive OAuth token.

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

// Looks up the calendar event for the recurring "採用社内MTG" series closest to `dateStr` and
// returns its auto-generated "Gemini によるメモ" attachment, if any. That doc is the per-occurrence
// meeting notes Google Meet's note-taker creates and attaches straight to the calendar event — it
// never lands in the app's own shared Drive folder, so it can't be found by browsing that folder.
export async function findCalendarMeetingNotes(
  accessToken: string,
  dateStr: string,
  titleKeyword = '採用社内MTG'
): Promise<CalendarMeetingNotesMatch> {
  return postJson('/api/calendar/find-meeting-notes', { accessToken, date: dateStr, titleKeyword });
}

export async function backupToDrive(accessToken: string, data: object): Promise<void> {
  await postJson('/api/drive/backup', {
    accessToken,
    folderId: RECRUITMENT_DRIVE_FOLDER_ID,
    data
  });
}

export async function restoreFromDrive<T = any>(accessToken: string): Promise<T> {
  const res = await postJson<{ data: T }>('/api/drive/restore', {
    accessToken,
    folderId: RECRUITMENT_DRIVE_FOLDER_ID
  });
  return res.data;
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
export async function detectResumePhotoCrop(accessToken: string, fileId: string): Promise<DetectedPhotoCrop> {
  return postJson<DetectedPhotoCrop>('/api/drive/detect-photo-crop', {
    accessToken,
    fileId
  });
}

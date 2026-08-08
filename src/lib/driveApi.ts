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
    throw new Error(data.error || `${url} でエラーが発生しました`);
  }
  return data;
}

export async function listDriveMeetingLogs(accessToken: string): Promise<DriveMeetingFile[]> {
  const data = await postJson<{ files: DriveMeetingFile[] }>('/api/drive/list-logs', {
    accessToken,
    folderId: RECRUITMENT_DRIVE_FOLDER_ID
  });
  return data.files;
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

// Permanently deletes a candidate's resume file/folder from Drive — used when a candidate is
// deleted for good from the archive (not the soft-delete/archive step, which leaves Drive alone).
export async function deleteResumeFromDrive(accessToken: string, fileId: string): Promise<void> {
  await postJson('/api/drive/delete-resume', { accessToken, fileId });
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

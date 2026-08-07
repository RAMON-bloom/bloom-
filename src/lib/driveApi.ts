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
  const data = await res.json();
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

export async function uploadResumeToDrive(
  accessToken: string,
  file: { name: string; type: string; base64: string },
  candidateId?: string,
  phase?: string
): Promise<DriveResumeFile> {
  const data = await postJson<{ success: boolean; file: DriveResumeFile }>('/api/drive/upload-resume', {
    accessToken,
    folderId: RECRUITMENT_DRIVE_FOLDER_ID,
    fileName: file.name,
    mimeType: file.type,
    fileBase64: file.base64,
    candidateId,
    phase
  });
  return data.file;
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

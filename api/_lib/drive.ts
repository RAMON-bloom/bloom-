// Minimal Google Drive v3 REST helpers using a user's OAuth access token.
// Deliberately implemented with plain fetch (no googleapis dependency) to match
// the existing style of this codebase's Gmail integration in server.ts.

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
}

// Files living in a Shared Drive (rather than someone's My Drive) are invisible to the Drive API
// unless every call opts in with supportsAllDrives — otherwise a perfectly real, permitted file
// comes back as a plain 404 "File not found", which is indistinguishable from a bad ID or a
// genuine permissions problem. Setting it here once, for every request, is harmless for regular
// My Drive files (the API just ignores it), so there's no reason to reason about it per call site.
function withSupportsAllDrives(url: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}supportsAllDrives=true`;
}

async function driveFetch(accessToken: string, url: string, init?: RequestInit) {
  const res = await fetch(withSupportsAllDrives(url), {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Drive API error (${res.status}): ${text.slice(0, 500)}`);
  }
  return res;
}

export async function listFilesInFolder(
  accessToken: string,
  folderId: string,
  opts: { mimeTypes?: string[]; nameContains?: string } = {}
): Promise<DriveFile[]> {
  const clauses = [`'${folderId}' in parents`, 'trashed = false'];
  if (opts.mimeTypes && opts.mimeTypes.length > 0) {
    clauses.push('(' + opts.mimeTypes.map((m) => `mimeType = '${m}'`).join(' or ') + ')');
  }
  if (opts.nameContains) {
    clauses.push(`name contains '${opts.nameContains.replace(/'/g, "\\'")}'`);
  }
  const q = encodeURIComponent(clauses.join(' and '));
  const fields = encodeURIComponent('files(id,name,mimeType,modifiedTime,webViewLink)');
  const res = await driveFetch(
    accessToken,
    `${DRIVE_API}/files?q=${q}&fields=${fields}&orderBy=modifiedTime desc&pageSize=50&includeItemsFromAllDrives=true&corpora=allDrives`
  );
  const data = await res.json();
  return data.files || [];
}

export async function findFolderByName(
  accessToken: string,
  parentId: string,
  name: string
): Promise<DriveFile | null> {
  const files = await listFilesInFolder(accessToken, parentId, {
    mimeTypes: ['application/vnd.google-apps.folder'],
    nameContains: name
  });
  return files.find((f) => f.name === name) || null;
}

export async function ensureSubfolder(
  accessToken: string,
  parentId: string,
  name: string
): Promise<string> {
  const existing = await findFolderByName(accessToken, parentId, name);
  if (existing) return existing.id;

  const res = await driveFetch(accessToken, `${DRIVE_API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    })
  });
  const created = await res.json();
  return created.id;
}

export async function readFileContent(accessToken: string, file: DriveFile): Promise<string> {
  if (file.mimeType === 'application/vnd.google-apps.document') {
    const res = await driveFetch(
      accessToken,
      `${DRIVE_API}/files/${file.id}/export?mimeType=text/plain`
    );
    return await res.text();
  }
  const res = await driveFetch(accessToken, `${DRIVE_API}/files/${file.id}?alt=media`);
  return await res.text();
}

export async function findFileByName(
  accessToken: string,
  folderId: string,
  name: string
): Promise<DriveFile | null> {
  const files = await listFilesInFolder(accessToken, folderId, { nameContains: name });
  return files.find((f) => f.name === name) || null;
}

function buildMultipartBody(metadata: object, mimeType: string, content: string, boundary: string) {
  return (
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`
  );
}

// Creates the file if it doesn't exist in the folder, otherwise overwrites its content.
export async function upsertTextFile(
  accessToken: string,
  folderId: string,
  name: string,
  mimeType: string,
  content: string
): Promise<DriveFile> {
  const existing = await findFileByName(accessToken, folderId, name);
  const boundary = 'bloom_ats_boundary_' + Math.random().toString(36).slice(2);
  const body = buildMultipartBody(
    existing ? { name } : { name, parents: [folderId] },
    mimeType,
    content,
    boundary
  );

  const url = existing
    ? `${DRIVE_UPLOAD_API}/files/${existing.id}?uploadType=multipart&fields=id,name,mimeType,modifiedTime,webViewLink`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,webViewLink`;

  const res = await driveFetch(accessToken, url, {
    method: existing ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });
  return await res.json();
}

// Downloads a file's raw bytes and returns them base64-encoded (e.g. for feeding a PDF into
// Gemini's inline-data input, which requires base64 rather than a stream).
export async function downloadFileBase64(accessToken: string, fileId: string): Promise<string> {
  const res = await driveFetch(accessToken, `${DRIVE_API}/files/${fileId}?alt=media`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}

export async function getFileParents(accessToken: string, fileId: string): Promise<string[]> {
  const res = await driveFetch(accessToken, `${DRIVE_API}/files/${fileId}?fields=parents`);
  const data = await res.json();
  return data.parents || [];
}

export async function getFileMetadata(accessToken: string, fileId: string): Promise<DriveFile> {
  const res = await driveFetch(
    accessToken,
    `${DRIVE_API}/files/${fileId}?fields=id,name,mimeType,modifiedTime,webViewLink`
  );
  return await res.json();
}

// Moves a file into newFolderId, removing whatever parent folders it currently has
// (a resume should live in exactly one phase folder at a time).
export async function moveFileToFolder(
  accessToken: string,
  fileId: string,
  newFolderId: string
): Promise<DriveFile> {
  const currentParents = await getFileParents(accessToken, fileId);
  const fields = 'id,name,mimeType,modifiedTime,webViewLink';
  if (currentParents.includes(newFolderId)) {
    const res = await driveFetch(accessToken, `${DRIVE_API}/files/${fileId}?fields=${fields}`);
    return await res.json();
  }

  const params = new URLSearchParams({ addParents: newFolderId, fields });
  if (currentParents.length > 0) {
    params.set('removeParents', currentParents.join(','));
  }
  const res = await driveFetch(accessToken, `${DRIVE_API}/files/${fileId}?${params.toString()}`, {
    method: 'PATCH'
  });
  return await res.json();
}

// Uploads a base64-encoded binary file (e.g. resume PDF) as a new file in the folder.
export async function uploadBase64File(
  accessToken: string,
  folderId: string,
  name: string,
  mimeType: string,
  base64Data: string
): Promise<DriveFile> {
  const boundary = 'bloom_ats_boundary_' + Math.random().toString(36).slice(2);
  const metadata = { name, parents: [folderId] };
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    `${base64Data}\r\n` +
    `--${boundary}--`;

  const res = await driveFetch(
    accessToken,
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,webViewLink`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    }
  );
  return await res.json();
}

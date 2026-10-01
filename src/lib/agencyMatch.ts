import type { Agency } from '../types';

// Candidate Drive folders are named "氏名_エージェント名" (api/drive/upload-resume.ts
// buildCandidateFolderName), so the referring agency can be read back from the folder name.
export function agencyNameFromFolderName(folderName: string | null | undefined): string {
  if (!folderName || !folderName.includes('_')) return '';
  return folderName.split('_').slice(1).join('_').trim();
}

// Width, spacing, company-type and bracket differences ("ヤマトヒューマン" vs "株式会社ヤマトヒューマン",
// full-width vs half-width) are not meaningful when matching a folder's agency name to the master.
function normalizeAgencyName(name: string): string {
  return (name || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/株式会社|有限会社|合同会社|\(株\)|㈱/g, '')
    .replace(/[\s・/／]/g, '');
}

// Exact (normalized) match first; otherwise the single agency whose name contains, or is contained
// in, the given name. Ambiguous partial matches return undefined rather than guessing.
export function findAgencyByLooseName<T extends Pick<Agency, 'id' | 'name'>>(agencies: T[], rawName: string): T | undefined {
  const target = normalizeAgencyName(rawName);
  if (target.length < 2) return undefined;
  const exact = agencies.find((a) => normalizeAgencyName(a.name) === target);
  if (exact) return exact;
  const partial = agencies.filter((a) => {
    const n = normalizeAgencyName(a.name);
    return n.length >= 2 && (n.includes(target) || target.includes(n));
  });
  return partial.length === 1 ? partial[0] : undefined;
}

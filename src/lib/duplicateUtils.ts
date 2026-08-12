import { Candidate } from '../types';

// 完全一致(氏名・メール・電話番号)のみを重複候補とみなす — 部分一致や表記ゆれ(旧字体、
// スペースの有無など)まで広げると同姓同名の別人を誤検知しやすく、かえって毎回の登録の
// 手間が増えてしまうため。電話番号はハイフン等の区切り文字だけ正規化して比較する。
// 候補者の新規登録経路すべて(手動登録フォーム・Drive同期での自動取込)で同じ判定を使う。
export const normalizePhone = (phone: string): string => phone.replace(/[^0-9]/g, '');

export const findDuplicateCandidates = (
  candidates: Candidate[],
  form: { name: string; email?: string; phone?: string }
): Candidate[] => {
  const nameNorm = form.name.trim();
  const emailNorm = (form.email || '').trim().toLowerCase();
  const phoneNorm = normalizePhone(form.phone || '');
  if (!nameNorm) return [];

  return candidates.filter((c) => {
    if (c.name.trim() === nameNorm) return true;
    if (emailNorm && c.email && c.email.trim().toLowerCase() === emailNorm) return true;
    if (phoneNorm && c.phone && normalizePhone(c.phone) === phoneNorm) return true;
    return false;
  });
};

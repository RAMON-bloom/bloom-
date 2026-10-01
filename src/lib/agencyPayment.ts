import { Agency, Candidate } from '../types';

// 賞与保証は複数回に分けて支給されることがある（例: 初年度冬・翌年夏の2回）ため、全支給分の
// 合計額を返す。hasBonusGuaranteeがfalseの場合は内訳が残っていても0扱い（一覧・計算どちらからも
// このヘルパー経由で参照し、チェックボックスOFF＝「なし」の一貫性を保つ）。
export function sumBonusGuaranteeAmount(candidate: Candidate): number {
  if (!candidate.hasBonusGuarantee) return 0;
  return (candidate.bonusGuaranteeInstallments || []).reduce((sum, i) => sum + (i.amount || 0), 0);
}

export const DEFAULT_SALARY_MONTHS = 12;

// 年収換算の月数（「×○か月」）。未設定・不正値は12か月。
export function salaryMonthsOf(candidate: Pick<Candidate, 'salaryMonths'>): number {
  const m = candidate.salaryMonths;
  return typeof m === 'number' && Number.isFinite(m) && m > 0 ? m : DEFAULT_SALARY_MONTHS;
}

// 年収換算額 = 基本月給 × 月数。基本月給が未入力なら0。
export function annualBaseSalary(candidate: Pick<Candidate, 'baseMonthlySalary' | 'salaryMonths'>): number {
  if (!candidate.baseMonthlySalary) return 0;
  return Math.round(candidate.baseMonthlySalary * salaryMonthsOf(candidate));
}

// エージェントへの紹介手数料支払額を計算する。基準額は基本月給×月数（年収換算、既定12か月）で、賞与保証・
// サインオンボーナスはエージェント側の設定（commissionAppliesToBonusGuarantee/SignOnBonus）で
// 「対象にする」を選んだ場合のみ基準額に加算する。基本月給が未入力の候補者は計算できないため0円。
export function computeAgencyPaymentAmount(candidate: Candidate, agency: Agency | undefined): number {
  if (!agency || !candidate.baseMonthlySalary) return 0;

  let base = annualBaseSalary(candidate);
  if (agency.commissionAppliesToBonusGuarantee) {
    base += sumBonusGuaranteeAmount(candidate);
  }
  if (agency.commissionAppliesToSignOnBonus && candidate.hasSignOnBonus) {
    base += candidate.signOnBonusAmount || 0;
  }

  return Math.round(base * (agency.commissionRate / 100));
}

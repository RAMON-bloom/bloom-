import { Agency, Candidate } from '../types';
import { isJoiningScheduled } from './onboardingUtils';
import { annualBaseSalary, computeAgencyPaymentAmount, sumBonusGuaranteeAmount } from './agencyPayment';

// Driveの「内定者台帳」に蓄積する1人分の行。api/drive/offer-ledger.ts と同じ形（api/とsrc/は別
// デプロイターゲットなので型は複製している。項目を変える時は両方直すこと）。
export interface OfferLedgerRow {
  candidateId: string;
  name: string;
  age?: number;
  currentCompany?: string;
  jobTitle?: string;
  agencyName?: string;
  phaseLabel: string;
  joiningDate?: string;
  baseMonthlySalary?: number;
  annualSalary?: number; // 基本月給×月数（salaryMonths、既定12）
  bonusGuaranteeAmount?: number;
  signOnBonusAmount?: number;
  commissionRate?: number;
  commissionAmount?: number;
}

const PHASE_LABEL: Record<string, string> = {
  OFFER_ISSUED: '内定提示',
  OFFER_ACCEPTED: '内定承諾',
  REJECTED: '見送り',
  DECLINED: '選考辞退'
};

// 台帳に載せる対象: 入社予定者（内定〜承諾）に加え、内定後に見送り/辞退になった人（年収・入社日が
// 残っている場合）。後者を含めるのは、台帳側の状況欄を「選考辞退」等に更新するため。
export function buildOfferLedgerRows(candidates: Candidate[], agencies: Agency[]): OfferLedgerRow[] {
  return candidates
    .filter((c) => isJoiningScheduled(c) || ((c.phase === 'REJECTED' || c.phase === 'DECLINED') && (c.joiningDate || c.baseMonthlySalary)))
    .map((c) => {
      const agency = agencies.find((a) => a.id === c.agencyId);
      const bonus = sumBonusGuaranteeAmount(c);
      return {
        candidateId: c.id,
        name: c.name,
        age: c.age,
        currentCompany: c.currentCompany,
        jobTitle: c.jobTitle,
        agencyName: c.agencyName,
        phaseLabel: PHASE_LABEL[c.phase] || c.phase,
        joiningDate: c.joiningDate,
        baseMonthlySalary: c.baseMonthlySalary || undefined,
        annualSalary: annualBaseSalary(c) || undefined,
        bonusGuaranteeAmount: bonus || undefined,
        signOnBonusAmount: c.hasSignOnBonus && c.signOnBonusAmount ? c.signOnBonusAmount : undefined,
        commissionRate: agency?.commissionRate,
        commissionAmount: computeAgencyPaymentAmount(c, agency) || undefined
      };
    });
}

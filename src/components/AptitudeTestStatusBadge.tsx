import React from 'react';
import { useATS } from '../context/ATSContext';
import { Candidate } from '../types';
import { ClipboardCheck } from 'lucide-react';
import {
  getAptitudeTestStatus,
  nextAptitudeTestStatus,
  formatAptitudeTestDeadlineShort,
  isAptitudeTestOverdue,
  APTITUDE_TEST_STATUS_META
} from '../lib/aptitudeTestStatus';

// カンバンカード・一覧テーブル・ダッシュボード・候補者詳細モーダルの4箇所で共通利用する、適性検査
// ステータスの表示兼クリック切り替えバッジ。クリックのたびに 未送付→送付済み→実施済み→(未送付に
// 戻る) と循環する。カード自体がクリック可能（候補者詳細を開く）な場所に置かれることが多いため、
// 必ずstopPropagationする。
export const AptitudeTestStatusBadge: React.FC<{ candidate: Candidate; size?: 'xs' | 'sm'; className?: string }> = ({
  candidate,
  size = 'xs',
  className = ''
}) => {
  const { updateAptitudeTestStatus } = useATS();
  const status = getAptitudeTestStatus(candidate);
  const meta = APTITUDE_TEST_STATUS_META[status];
  const deadlineLabel = candidate.aptitudeTestDeadline ? formatAptitudeTestDeadlineShort(candidate.aptitudeTestDeadline) : null;
  const overdue = isAptitudeTestOverdue(candidate);

  const sizeClasses = size === 'sm' ? 'text-[11px] px-2 py-0.5 gap-1' : 'text-[10px] px-1.5 py-0.5 gap-0.5';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        updateAptitudeTestStatus(candidate.id, nextAptitudeTestStatus(status));
      }}
      title="クリックで適性検査ステータスを切り替え（未送付 → 送付済み → 実施済み）"
      className={`inline-flex items-center rounded-full border font-bold cursor-pointer transition-colors hover:brightness-95 ${sizeClasses} ${meta.badgeClass} ${className}`}
    >
      <ClipboardCheck className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
      <span>適性検査: {meta.label}</span>
      {deadlineLabel && (
        <span className={overdue ? 'text-rose-600 font-extrabold' : ''}>
          ({deadlineLabel}{overdue ? '超過' : '締切'})
        </span>
      )}
    </button>
  );
};

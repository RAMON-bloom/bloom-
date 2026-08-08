import React, { useState } from 'react';
import { Bell, Clock, AlertTriangle } from 'lucide-react';
import { useATS } from '../context/ATSContext';
import { SelectionPhase } from '../types';

const PHASE_LABELS: Record<SelectionPhase, string> = {
  DOCUMENT_SCREENING: '書類選考',
  CASUAL_INTERVIEW: 'カジュアル面談',
  FIRST_INTERVIEW: '1次面接',
  SECOND_INTERVIEW: '2次面接',
  FINAL_INTERVIEW: '最終面接',
  OFFER_ISSUED: '内定通知',
  OFFER_ACCEPTED: '内定承諾',
  REJECTED_DECLINED: '辞退 / 不採用'
};

// 抜け防止: 進捗停滞中の候補者・書類選考の対応漏れをヘッダーから一覧できるベルアイコン+ドロップダウン。
// クリックした行はCandidateDetailModal（App.tsxにグローバルマウント済み）をそのまま開く。
export const AttentionPanel: React.FC = () => {
  const { stalledCandidates, overdueDocScreening, setSelectedCandidateId } = useATS();
  const [isOpen, setIsOpen] = useState(false);

  const totalCount = stalledCandidates.length + overdueDocScreening.length;

  const handleSelect = (candidateId: string) => {
    setSelectedCandidateId(candidateId);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((v) => !v)}
        title="対応が必要な候補者"
        className="relative p-1.5 text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
      >
        <Bell className="w-4 h-4" />
        {totalCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-bold">
            {totalCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-40 overflow-hidden">
          <div className="px-3 py-2 text-xs font-bold text-slate-700 border-b border-slate-100">
            対応が必要な候補者
          </div>

          {totalCount === 0 ? (
            <div className="px-3 py-4 text-xs text-slate-400 text-center">
              現在、停滞している候補者はありません
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {overdueDocScreening.length > 0 && (
                <div>
                  <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold text-amber-700 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    書類選考 対応待ち（{overdueDocScreening.length}件）
                  </div>
                  {overdueDocScreening.map(({ candidate, assigneeName, daysSinceUpdate }) => (
                    <button
                      key={candidate.id}
                      onClick={() => handleSelect(candidate.id)}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-b-0"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-800">{candidate.name}</span>
                        <span className="text-[10px] text-amber-700 font-mono">{daysSinceUpdate}日経過</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">担当: {assigneeName}</div>
                    </button>
                  ))}
                </div>
              )}

              {stalledCandidates.length > 0 && (
                <div>
                  <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold text-rose-700 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    進捗停滞中の候補者（{stalledCandidates.length}件）
                  </div>
                  {stalledCandidates.map(({ candidate, daysSinceUpdate }) => (
                    <button
                      key={candidate.id}
                      onClick={() => handleSelect(candidate.id)}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-b-0"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-800">{candidate.name}</span>
                        <span className="text-[10px] text-rose-700 font-mono">{daysSinceUpdate}日経過</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{PHASE_LABELS[candidate.phase]}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

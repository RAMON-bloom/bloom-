import React, { useState } from 'react';
import { useATS } from '../context/ATSContext';
import { SelectionPhase, ScheduleStatus } from '../types';
import { FilterBar } from './FilterBar';
import { InterviewScheduleCalendar } from './InterviewScheduleCalendar';
import { renderGradeBadge } from './CandidateDetailModal';
import { AptitudeTestStatusBadge } from './AptitudeTestStatusBadge';
import { isAptitudeTestRelevantPhase } from '../lib/aptitudeTestStatus';
import { RejectionReasonModal } from './RejectionReasonModal';
import { 
  FileText, 
  UserCheck, 
  Award, 
  CheckCircle2, 
  XCircle, 
  Calendar, 
  Clock, 
  Star, 
  Sparkles,
  Building2,
  User,
  Users,
  GripVertical,
  GraduationCap,
  Briefcase,
  HeartHandshake,
  Coffee,
  Trash2
} from 'lucide-react';

// Color is reserved for real outcomes (accepted / rejected). Every in-progress phase shares one
// neutral slate treatment so the board reads by label, not by a rainbow of column colors.
const COLUMNS: { phase: SelectionPhase; label: string; icon: React.FC<{ className?: string }>; color: string; headerBg: string }[] = [
  {
    phase: 'DOCUMENT_SCREENING',
    label: '書類選考',
    icon: FileText,
    color: 'text-slate-500',
    headerBg: 'bg-slate-50 border-slate-200 text-slate-800'
  },
  {
    phase: 'CASUAL_INTERVIEW',
    label: 'カジュアル面談',
    icon: Coffee,
    color: 'text-slate-500',
    headerBg: 'bg-slate-50 border-slate-200 text-slate-800'
  },
  {
    phase: 'FIRST_INTERVIEW',
    label: '1次面接',
    icon: UserCheck,
    color: 'text-slate-500',
    headerBg: 'bg-slate-50 border-slate-200 text-slate-800'
  },
  {
    phase: 'SECOND_INTERVIEW',
    label: '2次面接',
    icon: UserCheck,
    color: 'text-slate-500',
    headerBg: 'bg-slate-50 border-slate-200 text-slate-800'
  },
  {
    phase: 'FINAL_INTERVIEW',
    label: '最終面接',
    icon: Award,
    color: 'text-slate-500',
    headerBg: 'bg-slate-50 border-slate-200 text-slate-800'
  },
  {
    phase: 'OFFER_ISSUED',
    label: '内定',
    icon: Award,
    color: 'text-indigo-600',
    headerBg: 'bg-indigo-50 border-indigo-200 text-indigo-900'
  },
  {
    phase: 'OFFER_ACCEPTED',
    label: '承諾',
    icon: CheckCircle2,
    color: 'text-emerald-600',
    headerBg: 'bg-emerald-50 border-emerald-200 text-emerald-900'
  },
  {
    phase: 'REJECTED',
    label: '見送り',
    icon: XCircle,
    color: 'text-rose-600',
    headerBg: 'bg-rose-50 border-rose-200 text-rose-900'
  },
  {
    phase: 'DECLINED',
    label: '選考辞退',
    icon: XCircle,
    color: 'text-orange-600',
    headerBg: 'bg-orange-50 border-orange-200 text-orange-900'
  }
];

export const isFirstInterviewOrAbove = (phase: SelectionPhase) => {
  return ['FIRST_INTERVIEW', 'SECOND_INTERVIEW', 'FINAL_INTERVIEW', 'OFFER_ISSUED', 'OFFER_ACCEPTED'].includes(phase);
};

// One uniform badge style for every position — they're distinguished by their label, not by hue.
export const getPositionBadge = (pos: string, bcaDept?: 'F+' | 'AC' | 'BOTH') => {
  if (pos === 'BCA') {
    return (
      <span className="inline-flex items-center gap-1 bg-indigo-600 text-white font-black text-xs px-2 py-0.5 rounded shadow-2xs tracking-wider">
        <span>BCA</span>
        {bcaDept && (
          <span className="bg-indigo-800 text-indigo-100 text-[10px] font-bold px-1 rounded">
            {bcaDept === 'BOTH' ? 'F+/AC' : bcaDept}
          </span>
        )}
      </span>
    );
  }
  return <span className="bg-indigo-600 text-white font-black text-xs px-2 py-0.5 rounded shadow-2xs tracking-wider">{pos}</span>;
};

export const KanbanView: React.FC = () => {
  const { filteredCandidates, updateCandidatePhase, setSelectedCandidateId, deleteCandidate, userRole } = useATS();
  const [draggedCandidateId, setDraggedCandidateId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<SelectionPhase | null>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ id: string; name: string } | null>(null);
  const [pendingRejection, setPendingRejection] = useState<{ candidateId: string; phase: 'REJECTED' | 'DECLINED' } | null>(null);

  const handleDragStart = (e: React.DragEvent, candidateId: string) => {
    e.dataTransfer.setData('text/plain', candidateId);
    setDraggedCandidateId(candidateId);
  };

  const handleDragOver = (e: React.DragEvent, phase: SelectionPhase) => {
    e.preventDefault();
    setDragOverColumn(phase);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, targetPhase: SelectionPhase) => {
    e.preventDefault();
    setDragOverColumn(null);
    const candidateId = e.dataTransfer.getData('text/plain') || draggedCandidateId;
    if (candidateId) {
      if (targetPhase === 'REJECTED' || targetPhase === 'DECLINED') {
        setPendingRejection({ candidateId, phase: targetPhase });
      } else {
        updateCandidatePhase(candidateId, targetPhase);
      }
      setDraggedCandidateId(null);
    }
  };

  const getScheduleBadge = (status: ScheduleStatus, nextDate?: string) => {
    switch (status) {
      case 'SCHEDULE_CONFIRMED':
        return (
          <div className="flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] px-2 py-0.5 rounded-full font-medium">
            <Calendar className="w-3 h-3 text-emerald-600 shrink-0" />
            <span className="truncate">確定: {nextDate ? new Date(nextDate).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '日程調整済'}</span>
          </div>
        );
      case 'PROPOSING_DATES':
        return (
          <div className="flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] px-2 py-0.5 rounded-full font-medium">
            <Clock className="w-3 h-3 text-indigo-600 animate-pulse shrink-0" />
            <span>候補日提示中</span>
          </div>
        );
      case 'WAITING_RESULT':
        return (
          <div className="flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 text-[11px] px-2 py-0.5 rounded-full font-medium">
            <Clock className="w-3 h-3 text-amber-600 shrink-0" />
            <span>結果待ち</span>
          </div>
        );
      case 'UNARRANGED':
      default:
        return (
          <div className="flex items-center gap-1 bg-slate-100 text-slate-500 border border-slate-200 text-[11px] px-2 py-0.5 rounded-full font-medium">
            <span>未手配</span>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Filter Bar */}
      <FilterBar />

      {/* Foldable Interview Schedule Calendar */}
      <div className="px-1">
        <InterviewScheduleCalendar defaultCollapsed={true} />
      </div>

      {/* Pipeline Board Container */}
      <div className="flex-1 overflow-x-auto pb-6">
        <div className="flex gap-3.5 min-w-[1520px] h-full items-start">
          
          {COLUMNS.map((col) => {
            const columnCandidates = filteredCandidates.filter((c) => c.phase === col.phase);
            const Icon = col.icon;
            const isTarget = dragOverColumn === col.phase;

            return (
              <div
                key={col.phase}
                onDragOver={(e) => handleDragOver(e, col.phase)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.phase)}
                className={`w-[230px] sm:w-[250px] shrink-0 flex flex-col rounded-xl bg-slate-100/70 border transition-all duration-200 min-h-[620px] ${
                  isTarget ? 'border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-500/20' : 'border-slate-200'
                }`}
              >
                {/* Column Header */}
                <div className={`p-3 rounded-t-xl border-b ${col.headerBg} flex items-center justify-between shadow-xs`}>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-xs sm:text-sm tracking-wide">{col.label}</h3>
                  </div>
                  <span className="bg-white/80 text-slate-800 border border-slate-200 text-xs font-mono font-bold px-2 py-0.5 rounded-full shadow-2xs">
                    {columnCandidates.length}
                  </span>
                </div>

                {/* Column Cards Area */}
                <div className="p-2.5 space-y-2.5 flex-1 overflow-y-auto max-h-[calc(100vh-280px)]">
                  {columnCandidates.length === 0 ? (
                    <div className="h-28 border border-dashed border-slate-300 rounded-xl flex items-center justify-center text-slate-400 text-xs font-medium">
                      候補者なし
                    </div>
                  ) : (
                    columnCandidates.map((candidate) => {
                      const latestRating = candidate.evaluationNotes.length > 0 ? candidate.evaluationNotes[0].rating : null;

                      return (
                        <div
                          key={candidate.id}
                          draggable={userRole !== 'INTERVIEWER'}
                          onDragStart={(e) => handleDragStart(e, candidate.id)}
                          onClick={() => setSelectedCandidateId(candidate.id)}
                          className={`bg-white hover:bg-slate-50/90 border border-slate-200 hover:border-indigo-300 rounded-xl p-3.5 cursor-pointer shadow-xs hover:shadow-md transition-all duration-150 transform hover:-translate-y-0.5 group relative ${
                            draggedCandidateId === candidate.id ? 'opacity-40 border-dashed border-indigo-400' : ''
                          }`}
                        >
                          {/* Drag Handle Indicator */}
                          {userRole !== 'INTERVIEWER' && (
                            <div className="absolute top-3 right-2.5 opacity-0 group-hover:opacity-60 transition-opacity text-slate-400">
                              <GripVertical className="w-3.5 h-3.5" />
                            </div>
                          )}

                          {/* Quick Delete (mistakenly-registered candidates) */}
                          {userRole === 'ADMIN' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmTarget({ id: candidate.id, name: candidate.name });
                              }}
                              className="absolute top-2.5 right-7 p-1 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all cursor-pointer"
                              title="この候補者を削除（アーカイブ）"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Position Badge & Agency */}
                          <div className="flex items-center justify-between gap-1 mb-2 pr-4">
                            <div>
                              {getPositionBadge(candidate.jobTitle, candidate.bcaDesiredDepartment)}
                            </div>
                            <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded truncate max-w-[120px] font-medium">
                              {candidate.agencyName.split(' ')[0]}
                            </span>
                          </div>

                          {/* Candidate Name & Age */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {candidate.avatarUrl && (
                                <img
                                  src={candidate.avatarUrl}
                                  alt={candidate.name}
                                  className="w-7 h-7 rounded-lg object-cover border border-indigo-200 shrink-0 shadow-2xs"
                                  referrerPolicy="no-referrer"
                                />
                              )}
                              <h4 className="font-bold text-slate-900 text-sm tracking-tight group-hover:text-indigo-600 transition-colors truncate">
                                {candidate.name}
                              </h4>
                            </div>
                            {candidate.age && (
                              <span className="text-xs font-medium text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded shrink-0">
                                {candidate.age}歳
                              </span>
                            )}
                          </div>

                          {/* Demographics Block (学歴、年齢、在籍企業、経験社数) */}
                          <div className="mt-2.5 pt-2 border-t border-slate-100 space-y-1 text-[11px] text-slate-600">
                            {/* 在籍企業名 */}
                            <div className="flex items-center gap-1.5 text-slate-700 truncate" title={candidate.currentCompany || '記載なし'}>
                              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-medium truncate">{candidate.currentCompany || '在籍企業未記載'}</span>
                            </div>

                            {/* 学歴 */}
                            <div className="flex items-center gap-1.5 text-slate-600 truncate" title={candidate.education || '記載なし'}>
                              <GraduationCap className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                              <span className="truncate">{candidate.education || '学歴未記載'}</span>
                            </div>

                            {/* 経験社数 */}
                            <div className="flex items-center gap-1.5 text-slate-600">
                              <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>経験社数: <strong className="text-slate-800 font-semibold">{candidate.companyCount ? `${candidate.companyCount}社目` : '未記載'}</strong></span>
                            </div>
                          </div>

                          {/* 適性検査ステータス（1次面接合格以降のみ表示） */}
                          {isAptitudeTestRelevantPhase(candidate) && (
                            <div className="mt-2">
                              <AptitudeTestStatusBadge candidate={candidate} />
                            </div>
                          )}

                          {/* Schedule & Interviewer Details (1次面接以上は面接官・調整状況を特別表示) */}
                          {isFirstInterviewOrAbove(candidate.phase) ? (
                            <div className="mt-2.5 pt-2 border-t border-indigo-100 bg-indigo-50/60 rounded-lg p-2 space-y-1.5">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-indigo-950 font-bold text-[10px] flex items-center gap-1 shrink-0">
                                  <Calendar className="w-3 h-3 text-indigo-600" />
                                  次回調整:
                                </span>
                                {getScheduleBadge(candidate.scheduleStatus, candidate.nextScheduleDate)}
                              </div>

                              {/* 次回面接官 */}
                              <div className="flex items-start gap-1 text-[11px] pt-0.5 border-t border-indigo-100/60">
                                <Users className="w-3 h-3 text-indigo-500 shrink-0 mt-0.5" />
                                <span className="text-[10px] text-slate-500 font-medium shrink-0">面接官:</span>
                                <div className="flex flex-wrap gap-1">
                                  {candidate.nextInterviewers && candidate.nextInterviewers.length > 0 ? (
                                    candidate.nextInterviewers.map((interviewer, idx) => (
                                      <span key={idx} className="bg-white text-indigo-900 font-bold text-[10px] px-1.5 py-0.2 rounded border border-indigo-200 shadow-2xs">
                                        {interviewer}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-[10px] text-slate-400 italic bg-white/70 px-1 rounded border border-slate-200">未設定</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2.5">
                              {getScheduleBadge(candidate.scheduleStatus, candidate.nextScheduleDate)}
                            </div>
                          )}

                          {/* Onboarding Info Mini Block */}
                          {(candidate.joiningDate || candidate.preJoinDinnerStatus || candidate.resignationNegotiationStatus) && (
                            <div className="mt-2.5 pt-2 border-t border-amber-200/80 bg-amber-50/60 rounded-lg p-2 space-y-1">
                              {candidate.joiningDate && (
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="text-amber-900 font-bold flex items-center gap-1">
                                    入社予定:
                                  </span>
                                  <span className="font-bold text-amber-950 font-mono">
                                    {candidate.joiningDate}
                                  </span>
                                </div>
                              )}
                              <div className="flex items-center justify-between text-[10px] text-slate-600 gap-1 flex-wrap">
                                {candidate.resignationNegotiationStatus && candidate.resignationNegotiationStatus !== 'NOT_STARTED' && (
                                  <span>
                                    退職: <strong className="text-slate-800">{
                                      candidate.resignationNegotiationStatus === 'COMPLETED' ? '完了' :
                                      candidate.resignationNegotiationStatus === 'NOTICE_SUBMITTED' ? '提出済' :
                                      candidate.resignationNegotiationStatus === 'IN_PROGRESS' ? '交渉中' :
                                      candidate.resignationNegotiationStatus === 'DIFFICULT' ? '難航' : '未'
                                    }</strong>
                                  </span>
                                )}
                                {candidate.preJoinDinnerStatus && candidate.preJoinDinnerStatus !== 'UNPLANNED' && candidate.preJoinDinnerStatus !== 'NOT_REQUIRED' && (
                                  <span>
                                    会食: <strong className="text-slate-800">{
                                      candidate.preJoinDinnerStatus === 'COMPLETED' ? '済' :
                                      candidate.preJoinDinnerStatus === 'SCHEDULED' ? '予定' : '未'
                                    }</strong>
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Rating Grade Badges */}
                          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-1 flex-wrap text-[11px]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {renderGradeBadge('面接', candidate.interviewRating || (latestRating ? (latestRating >= 5 ? 'A+' : latestRating >= 4 ? 'A-' : latestRating >= 3 ? 'B+' : 'C') : null))}
                            </div>

                            <div
                              className="flex items-center gap-1 text-[10px] text-slate-500 truncate max-w-[120px]"
                              title={candidate.assignees.length > 0 ? candidate.assignees.join('、') : undefined}
                            >
                              <User className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate font-medium">
                                {candidate.assignees.length > 0 ? candidate.assignees.join('、') : '未割当'}
                              </span>
                            </div>
                          </div>

                        </div>
                      );
                    })
                  )}
                </div>

              </div>
            );
          })}

        </div>
      </div>

      {/* DELETE CANDIDATE CONFIRMATION MODAL */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">候補者の削除</h3>
                <p className="text-xs text-slate-500 mt-0.5">過去候補者一覧へ移動します（後から復元できます）</p>
              </div>
            </div>

            <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200 font-medium">
              対象: <span className="font-bold text-slate-900">{deleteConfirmTarget.name}</span>
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg cursor-pointer font-medium"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteCandidate(deleteConfirmTarget.id);
                  setDeleteConfirmTarget(null);
                }}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-2xs cursor-pointer"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      <RejectionReasonModal
        open={pendingRejection !== null}
        targetLabel={pendingRejection?.phase === 'DECLINED' ? '選考辞退' : '見送り'}
        onConfirm={(reason) => {
          if (pendingRejection) updateCandidatePhase(pendingRejection.candidateId, pendingRejection.phase, reason);
          setPendingRejection(null);
        }}
        onCancel={() => setPendingRejection(null)}
      />
    </div>
  );
};

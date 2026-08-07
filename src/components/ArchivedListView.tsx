import React, { useState } from 'react';
import {
  Archive,
  RotateCcw,
  Eye,
  Building2,
  Calendar,
  Briefcase,
  UserX,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  GraduationCap,
  Trash2
} from 'lucide-react';
import { useATS } from '../context/ATSContext';
import { SelectionPhase } from '../types';

const PHASE_LABELS: Record<SelectionPhase, { label: string; color: string }> = {
  DOCUMENT_SCREENING: { label: '書類選考', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  CASUAL_INTERVIEW: { label: 'カジュアル面談', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  FIRST_INTERVIEW: { label: '1次面接', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  SECOND_INTERVIEW: { label: '2次面接', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  FINAL_INTERVIEW: { label: '最終面接', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  OFFER_ISSUED: { label: '内定通知済', color: 'bg-amber-50 text-amber-800 border-amber-200' },
  OFFER_ACCEPTED: { label: '内定承諾', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  REJECTED_DECLINED: { label: '不採用 / 辞退', color: 'bg-rose-50 text-rose-800 border-rose-200' }
};

export const ArchivedListView: React.FC = () => {
  const {
    archivedCandidates,
    setSelectedCandidateId,
    restoreCandidate,
    permanentlyDeleteCandidate,
    userRole,
    filters,
    setFilters
  } = useATS();

  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 text-slate-900 rounded-2xl p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <Archive className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">過去候補者・アーカイブデータベース</h2>
            <span className="bg-slate-100 text-slate-700 text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border border-slate-200">
              {archivedCandidates.length}名
            </span>
          </div>
          <p className="text-xs text-slate-500">
            削除または選考終了として移動された過去の候補者データ一覧です。データは分析ダッシュボードの統計・通過率にも自動反映されています。
          </p>
        </div>

        {/* Quick Help */}
        <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-600 shrink-0">
          <AlertCircle className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>誤って削除された場合も「選考に復元」で現行リストに戻せます</span>
        </div>
      </div>

      {/* Filter / Search Bar for Archived */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="過去候補者名・職種・学歴で検索..."
            value={filters.searchQuery}
            onChange={(e) => setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 text-slate-800 placeholder-slate-400 text-xs sm:text-sm rounded-lg border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>

        <div className="text-xs text-slate-500 font-medium">
          該当データ: <span className="font-bold text-slate-900 font-mono text-sm">{archivedCandidates.length}</span> 件
        </div>
      </div>

      {/* Candidates List / Table */}
      {archivedCandidates.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-2xs">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
            <UserX className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800 mb-1">過去候補者データはありません</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            削除された候補者やアーカイブされた過去データはここに安全に保持・蓄積され、必要に応じていつでも確認・復元が可能です。
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3.5 px-4">ID / 候補者名</th>
                  <th className="py-3.5 px-4">職種 / 学歴 / 現職</th>
                  <th className="py-3.5 px-4">推薦エージェント</th>
                  <th className="py-3.5 px-4">応募年月</th>
                  <th className="py-3.5 px-4">最終選考段階</th>
                  <th className="py-3.5 px-4">削除・過去登録日時</th>
                  <th className="py-3.5 px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs sm:text-sm">
                {archivedCandidates.map((candidate) => {
                  const phaseInfo = PHASE_LABELS[candidate.phase] || { label: candidate.phase, color: 'bg-slate-100 text-slate-700' };

                  return (
                    <tr 
                      key={candidate.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* Name */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                          {candidate.name}
                        </div>
                        {candidate.age && (
                          <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                            {candidate.age}歳
                          </div>
                        )}
                      </td>

                      {/* Job / Education / Current Company */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800 flex items-center gap-1.5">
                          <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{candidate.jobTitle}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                          {candidate.education && (
                            <span className="flex items-center gap-1 text-slate-600">
                              <GraduationCap className="w-3 h-3 text-slate-400" />
                              {candidate.education}
                            </span>
                          )}
                          {candidate.currentCompany && (
                            <span className="text-slate-400 truncate max-w-[150px]">
                              {candidate.currentCompany}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Agency */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          {candidate.agencyName}
                        </span>
                      </td>

                      {/* Applied Date */}
                      <td className="py-3.5 px-4 text-slate-600 font-mono text-xs">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{candidate.appliedDate}</span>
                        </div>
                      </td>

                      {/* Last Phase */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border ${phaseInfo.color}`}>
                          {phaseInfo.label}
                        </span>
                      </td>

                      {/* Deleted Date */}
                      <td className="py-3.5 px-4 text-slate-500 font-mono text-xs">
                        <div className="flex items-center gap-1 text-slate-500">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{candidate.deletedAt || '過去登録'}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {/* View Detail */}
                          <button
                            onClick={() => setSelectedCandidateId(candidate.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                            title="候補者詳細プロファイル確認"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>詳細</span>
                          </button>

                          {/* Restore */}
                          <button
                            onClick={() => restoreCandidate(candidate.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                            title="現行の選考パイプラインに戻す"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>選考に復元</span>
                          </button>

                          {/* Permanent Delete */}
                          {userRole === 'ADMIN' && (
                            <button
                              onClick={() => setDeleteConfirmTarget({ id: candidate.id, name: candidate.name })}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                              title="データベースから完全に削除（復元不可）"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>完全削除</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PERMANENT DELETE CONFIRMATION MODAL */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">候補者データの完全削除</h3>
                <p className="text-xs text-slate-500 mt-0.5">この操作は取り消せません。復元はできなくなります。</p>
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
                  permanentlyDeleteCandidate(deleteConfirmTarget.id);
                  setDeleteConfirmTarget(null);
                }}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-2xs cursor-pointer"
              >
                完全に削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

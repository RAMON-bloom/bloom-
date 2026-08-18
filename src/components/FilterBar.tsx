import React from 'react';
import { useATS } from '../context/ATSContext';
import { Filter, X, Briefcase, CheckSquare, Check, User, Users, Building2, Calendar, Clock, Layers } from 'lucide-react';

interface FilterBarProps {
  showPhaseFilter?: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = ({ showPhaseFilter = false }) => {
  const { filters, setFilters, agencies, staffList, candidates, positionOptions } = useATS();

  // Only staff actually linked to at least one agency make sense as a "社内担当者" filter option
  // here (same rule 採用MTG's recruiter picker uses) — falls back to the full staff list if no
  // agency has an assignee yet, so the picker never ends up empty.
  const agencyAssignedStaffList = staffList.filter((st) =>
    agencies.some((ag) => ag.assignedStaffNames?.includes(st.name))
  );
  const filterableStaffList = agencyAssignedStaffList.length > 0 ? agencyAssignedStaffList : staffList;

  // Extract unique months from candidates
  const availableMonths = Array.from(new Set<string>(candidates.map((c) => c.appliedMonth))).sort().reverse();

  // Active candidate counts per staff member (non-archived)
  const nonArchivedCandidates = candidates.filter((c) => !c.isArchived);
  
  const getStaffCandidateCount = (staffName: string) => {
    return nonArchivedCandidates.filter((c) => c.assignees.includes(staffName)).length;
  };

  const handleResetFilters = () => {
    setFilters({
      searchQuery: '',
      agencyId: 'ALL',
      assigneeName: 'ALL',
      scheduleStatus: 'ALL',
      phase: 'ALL',
      appliedMonth: 'ALL',
      positions: []
    });
  };

  const isFiltered = 
    filters.agencyId !== 'ALL' || 
    filters.assigneeName !== 'ALL' || 
    filters.scheduleStatus !== 'ALL' || 
    filters.phase !== 'ALL' || 
    filters.appliedMonth !== 'ALL' || 
    filters.searchQuery !== '' ||
    filters.positions.length > 0;

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 mb-5 shadow-xs text-xs text-slate-700 space-y-4">
      
      {/* ========================================================
          1. PRIMARY FEATURED SECTION: 社内担当者 タブ (一番よく使う絞り込み)
         ======================================================== */}
      <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-slate-800 font-extrabold text-xs">
            <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-2xs">
              <User className="w-3.5 h-3.5" />
            </div>
            <span>社内担当者絞り込み (メイン選択)</span>
            <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 hidden sm:inline">
              ワンクリック切替
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isFiltered && (
              <button
                onClick={handleResetFilters}
                className="flex items-center gap-1 text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-300 px-2.5 py-1 rounded-lg transition-colors cursor-pointer font-bold text-[11px]"
              >
                <X className="w-3.5 h-3.5" />
                <span>全条件リセット</span>
              </button>
            )}
          </div>
        </div>

        {/* Staff Segmented Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
          {/* ALL Staff Tab */}
          <button
            type="button"
            onClick={() => setFilters((prev) => ({ ...prev, assigneeName: 'ALL' }))}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              filters.assigneeName === 'ALL'
                ? 'bg-slate-900 text-white shadow-xs ring-2 ring-slate-400/50'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>全ての担当者</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
              filters.assigneeName === 'ALL' ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-600'
            }`}>
              {nonArchivedCandidates.length}
            </span>
          </button>

          {/* Individual Staff Tabs */}
          {filterableStaffList.map((st) => {
            const isSelected = filters.assigneeName === st.name;
            const count = getStaffCandidateCount(st.name);

            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, assigneeName: st.name }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-300'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80'
                }`}
              >
                <User className="w-3.5 h-3.5 opacity-80" />
                <span>{st.name}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                  isSelected ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================
          2. SECONDARY FILTER GRID: その他の条件 (整理されたドロップダウングリッド)
         ======================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
        
        {/* Agency Select Box */}
        <div className="bg-slate-50/60 border border-slate-200 rounded-xl p-2 flex flex-col justify-between space-y-1">
          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <Building2 className="w-3 h-3 text-slate-400" />
            <span>エージェント</span>
          </label>
          <select
            value={filters.agencyId}
            onChange={(e) => setFilters((prev) => ({ ...prev, agencyId: e.target.value }))}
            className="w-full bg-white text-slate-800 font-bold border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer text-xs"
          >
            <option value="ALL">全てのエージェント ({agencies.length}社)</option>
            {agencies.map((ag) => (
              <option key={ag.id} value={ag.id}>
                {ag.name}
              </option>
            ))}
          </select>
        </div>

        {/* Schedule Status Select Box */}
        <div className="bg-slate-50/60 border border-slate-200 rounded-xl p-2 flex flex-col justify-between space-y-1">
          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>次回調整状況</span>
          </label>
          <select
            value={filters.scheduleStatus}
            onChange={(e) => setFilters((prev) => ({ ...prev, scheduleStatus: e.target.value }))}
            className="w-full bg-white text-slate-800 font-bold border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer text-xs"
          >
            <option value="ALL">全ての調整状況</option>
            <option value="UNARRANGED">未手配</option>
            <option value="PROPOSING_DATES">候補日提示中</option>
            <option value="SCHEDULE_CONFIRMED">日程確定</option>
            <option value="WAITING_RESULT">結果待ち</option>
          </select>
        </div>

        {/* Applied Month Select Box */}
        <div className="bg-slate-50/60 border border-slate-200 rounded-xl p-2 flex flex-col justify-between space-y-1">
          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <Calendar className="w-3 h-3 text-slate-400" />
            <span>応募月</span>
          </label>
          <select
            value={filters.appliedMonth}
            onChange={(e) => setFilters((prev) => ({ ...prev, appliedMonth: e.target.value }))}
            className="w-full bg-white text-slate-800 font-bold border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer text-xs"
          >
            <option value="ALL">全期間（累積）</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {m.replace('-', '年')}月
              </option>
            ))}
          </select>
        </div>

        {/* Optional Selection Phase Select Box */}
        {showPhaseFilter && (
          <div className="bg-slate-50/60 border border-slate-200 rounded-xl p-2 flex flex-col justify-between space-y-1">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Layers className="w-3 h-3 text-slate-400" />
              <span>選考フェーズ</span>
            </label>
            <select
              value={filters.phase}
              onChange={(e) => setFilters((prev) => ({ ...prev, phase: e.target.value }))}
              className="w-full bg-white text-slate-800 font-bold border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer text-xs"
            >
              <option value="ALL">全てのフェーズ</option>
              <option value="DOCUMENT_SCREENING">書類選考</option>
              <option value="CASUAL_INTERVIEW">カジュアル面談</option>
              <option value="FIRST_INTERVIEW">1次面接</option>
              <option value="SECOND_INTERVIEW">2次面接</option>
              <option value="FINAL_INTERVIEW">最終面接</option>
              <option value="OFFER_ISSUED">内定</option>
              <option value="OFFER_ACCEPTED">承諾</option>
              <option value="REJECTED_DECLINED">辞退 / 不採用</option>
            </select>
          </div>
        )}
      </div>

      {/* ========================================================
          3. POSITION MULTI-SELECT PILLS: 選考ポジション (職種)
         ======================================================== */}
      <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center gap-2 w-full">
        <div className="flex items-center gap-1 text-slate-700 font-bold text-xs shrink-0">
          <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
          <span>選考ポジション:</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 flex-1">
          {/* All Positions button */}
          <button
            type="button"
            onClick={() => setFilters((prev) => ({ ...prev, positions: [] }))}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filters.positions.length === 0
                ? 'bg-slate-800 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            全ポジション
          </button>

          {/* BCA (EC + BP 一括) Special button */}
          <button
            type="button"
            onClick={() => {
              setFilters((prev) => {
                const hasEC = prev.positions.includes('EC');
                const hasBP = prev.positions.includes('BP');
                if (hasEC && hasBP) {
                  return {
                    ...prev,
                    positions: prev.positions.filter((p) => p !== 'EC' && p !== 'BP')
                  };
                } else {
                  const nextPos = Array.from(new Set([...prev.positions, 'EC', 'BP']));
                  return {
                    ...prev,
                    positions: nextPos
                  };
                }
              });
            }}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filters.positions.includes('EC') && filters.positions.includes('BP')
                ? 'bg-slate-800 text-white shadow-2xs ring-2 ring-slate-400/50'
                : 'bg-slate-50 text-slate-700 border border-slate-300 hover:bg-slate-100'
            }`}
            title="ECとBPを同時一括選択/解除"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>BCA</span>
            <span className="text-[10px] font-mono font-normal opacity-80">(EC + BP一括)</span>
          </button>

          <div className="h-4 w-px bg-slate-200 mx-0.5 hidden sm:block" />

          {/* Individual Standard Positions: EC, BP, AIX, BRE, etc. */}
          {positionOptions.map((pos) => {
            const isSelected = filters.positions.includes(pos);
            return (
              <button
                key={pos}
                type="button"
                onClick={() => {
                  setFilters((prev) => {
                    if (prev.positions.includes(pos)) {
                      return {
                        ...prev,
                        positions: prev.positions.filter((p) => p !== pos)
                      };
                    } else {
                      return {
                        ...prev,
                        positions: [...prev.positions, pos]
                      };
                    }
                  });
                }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>{pos}</span>
                {isSelected && <Check className="w-3 h-3" />}
              </button>
            );
          })}

          {/* Active filter badge summary */}
          {filters.positions.length > 0 && (
            <span className="ml-auto text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full font-mono font-medium">
              選択中: <strong className="font-bold">{filters.positions.join(', ')}</strong> ({filters.positions.length}ポジション)
            </span>
          )}
        </div>
      </div>
    </div>
  );
};


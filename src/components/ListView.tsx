import React, { useState } from 'react';
import { useATS } from '../context/ATSContext';
import { SelectionPhase, ScheduleStatus, EvaluationGrade } from '../types';
import { FilterBar } from './FilterBar';
import { InterviewScheduleCalendar } from './InterviewScheduleCalendar';
import { renderGradeBadge } from './CandidateDetailModal';
import { 
  Eye, 
  Trash2, 
  Calendar, 
  Clock, 
  Star, 
  ArrowUpDown, 
  Users, 
  FileText, 
  UserCheck, 
  Award, 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  BarChart3,
  Filter,
  HeartHandshake,
  Edit2,
  Coffee,
  User,
  ChevronUp,
  ChevronDown
} from 'lucide-react';

const InlineTextCell: React.FC<{
  value?: string;
  placeholder: string;
  onSave: (val: string) => void;
  className?: string;
}> = ({ value, placeholder, onSave, className = '' }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(value || '');

  if (isEditing) {
    return (
      <input
        type="text"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onSave(text);
            setIsEditing(false);
          } else if (e.key === 'Escape') {
            setIsEditing(false);
          }
        }}
        onBlur={() => {
          onSave(text);
          setIsEditing(false);
        }}
        className="bg-white border border-indigo-400 text-slate-900 rounded px-1.5 py-0.5 text-xs focus:outline-none shadow-2xs w-full min-w-[100px]"
      />
    );
  }

  return (
    <button
      onClick={() => {
        setText(value || '');
        setIsEditing(true);
      }}
      className={`group/cell inline-flex items-center gap-1 text-left cursor-pointer hover:bg-slate-100/80 px-1 py-0.5 rounded transition-colors ${className}`}
      title="クリックして編集"
    >
      <span className={value ? 'text-slate-800' : 'text-slate-400 border-b border-dashed border-slate-300'}>
        {value || placeholder}
      </span>
      <Edit2 className="w-2.5 h-2.5 text-slate-400 opacity-0 group-hover/cell:opacity-100 transition-opacity shrink-0" />
    </button>
  );
};

const InlineNumberCell: React.FC<{
  value?: number;
  placeholder: string;
  unit?: string;
  onSave: (val: number | undefined) => void;
  className?: string;
}> = ({ value, placeholder, unit = '', onSave, className = '' }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [num, setNum] = useState<string>(value !== undefined ? String(value) : '');

  if (isEditing) {
    return (
      <input
        type="number"
        autoFocus
        value={num}
        onChange={(e) => setNum(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onSave(num !== '' ? Number(num) : undefined);
            setIsEditing(false);
          } else if (e.key === 'Escape') {
            setIsEditing(false);
          }
        }}
        onBlur={() => {
          onSave(num !== '' ? Number(num) : undefined);
          setIsEditing(false);
        }}
        className="bg-white border border-indigo-400 text-slate-900 rounded px-1 py-0.5 text-xs focus:outline-none shadow-2xs w-16"
      />
    );
  }

  return (
    <button
      onClick={() => {
        setNum(value !== undefined ? String(value) : '');
        setIsEditing(true);
      }}
      className={`group/cell inline-flex items-center gap-0.5 cursor-pointer hover:bg-slate-100/80 px-1 py-0.5 rounded transition-colors ${className}`}
      title="クリックして編集"
    >
      <span className={value !== undefined ? 'text-slate-700 font-medium' : 'text-slate-400 border-b border-dashed border-slate-300'}>
        {value !== undefined ? `(${value}${unit})` : placeholder}
      </span>
      <Edit2 className="w-2.5 h-2.5 text-slate-400 opacity-0 group-hover/cell:opacity-100 transition-opacity shrink-0" />
    </button>
  );
};

export type ListViewSortField = 'phase' | 'appliedDate' | 'name' | 'id' | 'interviewRating';

const PHASE_ORDER: Record<SelectionPhase, number> = {
  DOCUMENT_SCREENING: 1,
  CASUAL_INTERVIEW: 2,
  FIRST_INTERVIEW: 3,
  SECOND_INTERVIEW: 4,
  FINAL_INTERVIEW: 5,
  OFFER_ISSUED: 6,
  OFFER_ACCEPTED: 7,
  REJECTED_DECLINED: 8,
};

const GRADE_ORDER: Record<string, number> = {
  'A+': 1,
  'A-': 2,
  'B+': 3,
  'B': 4,
  'B-': 5,
  'C': 6,
};

export const ListView: React.FC = () => {
  const { 
    candidates,
    filteredCandidates, 
    filters,
    setFilters,
    agencies,
    staffList,
    updateCandidatePhase, 
    updateCandidateSchedule,
    updateCandidate,
    setSelectedCandidateId, 
    deleteCandidate,
    userRole 
  } = useATS();

  // Default sort: Phase ascending (フェーズが進んでいない順)
  const [sortField, setSortField] = useState<ListViewSortField>('phase');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: ListViewSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      // Default directions depending on field
      if (field === 'appliedDate') {
        setSortDirection('desc');
      } else {
        setSortDirection('asc');
      }
    }
  };

  // Base candidates filtered by all criteria EXCEPT phase filter
  const baseFilteredCandidates = candidates.filter((c) => {
    if (c.isArchived) return false;

    if (userRole === 'AGENCY' && c.agencyId !== 'ag-1') return false;

    if (filters.searchQuery.trim() !== '') {
      const q = filters.searchQuery.toLowerCase();
      const matchName = c.name.toLowerCase().includes(q) || (c.nameKana && c.nameKana.toLowerCase().includes(q));
      const matchJob = c.jobTitle.toLowerCase().includes(q);
      const matchAgency = c.agencyName.toLowerCase().includes(q);
      const matchNotes = (c.notes && c.notes.toLowerCase().includes(q)) || (c.resumeSummary && c.resumeSummary.toLowerCase().includes(q));
      const matchId = c.id.toLowerCase().includes(q);
      if (!matchName && !matchJob && !matchAgency && !matchNotes && !matchId) return false;
    }

    if (filters.agencyId !== 'ALL' && c.agencyId !== filters.agencyId) return false;
    if (filters.assigneeName !== 'ALL' && !c.assignees.includes(filters.assigneeName)) return false;
    if (filters.scheduleStatus !== 'ALL' && c.scheduleStatus !== filters.scheduleStatus) return false;
    if (filters.appliedMonth !== 'ALL' && c.appliedMonth !== filters.appliedMonth) return false;
    if (filters.positions && filters.positions.length > 0) {
      if (!filters.positions.includes(c.jobTitle)) return false;
    }

    return true;
  });

  // Calculate phase counts from baseFilteredCandidates
  const totalBaseCount = baseFilteredCandidates.length;

  const phaseCounts: Record<SelectionPhase, number> = {
    CASUAL_INTERVIEW: 0,
    DOCUMENT_SCREENING: 0,
    FIRST_INTERVIEW: 0,
    SECOND_INTERVIEW: 0,
    FINAL_INTERVIEW: 0,
    OFFER_ISSUED: 0,
    OFFER_ACCEPTED: 0,
    REJECTED_DECLINED: 0,
  };

  baseFilteredCandidates.forEach((c) => {
    if (phaseCounts[c.phase] !== undefined) {
      phaseCounts[c.phase]++;
    }
  });

  // Active filter label description
  const activeFilterLabels: string[] = [];
  if (filters.agencyId !== 'ALL') {
    const ag = agencies.find((a) => a.id === filters.agencyId);
    if (ag) activeFilterLabels.push(`エージェント: ${ag.name}`);
  }
  if (filters.assigneeName !== 'ALL') {
    activeFilterLabels.push(`担当: ${filters.assigneeName}`);
  }
  if (filters.scheduleStatus !== 'ALL') {
    const schedMap: Record<string, string> = {
      UNARRANGED: '未手配',
      PROPOSING_DATES: '候補日提示中',
      SCHEDULE_CONFIRMED: '日程確定',
      WAITING_RESULT: '結果待ち'
    };
    activeFilterLabels.push(`状況: ${schedMap[filters.scheduleStatus] || filters.scheduleStatus}`);
  }
  if (filters.appliedMonth !== 'ALL') {
    activeFilterLabels.push(`応募月: ${filters.appliedMonth.replace('-', '年')}月`);
  }
  if (filters.searchQuery.trim() !== '') {
    activeFilterLabels.push(`検索: "${filters.searchQuery}"`);
  }

  const joiningScheduledCount = baseFilteredCandidates.filter(
    (c) => c.joiningDate || c.phase === 'OFFER_ACCEPTED' || c.phase === 'OFFER_ISSUED'
  ).length;

  const phaseCardsConfig: {
    key: SelectionPhase | 'ALL' | 'JOINING_SCHEDULED';
    label: string;
    count: number;
    bg: string;
    borderColor: string;
    activeBorderColor: string;
    textColor: string;
    badgeBg: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: 'ALL',
      label: '全フェーズ',
      count: totalBaseCount,
      bg: 'bg-slate-50/80 hover:bg-slate-100/80',
      borderColor: 'border-slate-200',
      activeBorderColor: 'ring-2 ring-indigo-600 border-indigo-600 bg-indigo-50/50',
      textColor: 'text-slate-900',
      badgeBg: 'bg-slate-200 text-slate-800',
      icon: <Users className="w-3.5 h-3.5 text-slate-700" />,
    },
    {
      key: 'DOCUMENT_SCREENING',
      label: '書類選考',
      count: phaseCounts.DOCUMENT_SCREENING,
      bg: 'bg-blue-50/50 hover:bg-blue-100/50',
      borderColor: 'border-blue-200',
      activeBorderColor: 'ring-2 ring-blue-600 border-blue-600 bg-blue-100/60',
      textColor: 'text-blue-900',
      badgeBg: 'bg-blue-100 text-blue-800',
      icon: <FileText className="w-3.5 h-3.5 text-blue-600" />,
    },
    {
      key: 'CASUAL_INTERVIEW',
      label: 'カジュアル面談',
      count: phaseCounts.CASUAL_INTERVIEW,
      bg: 'bg-teal-50/50 hover:bg-teal-100/50',
      borderColor: 'border-teal-200',
      activeBorderColor: 'ring-2 ring-teal-600 border-teal-600 bg-teal-100/60',
      textColor: 'text-teal-900',
      badgeBg: 'bg-teal-100 text-teal-800',
      icon: <Coffee className="w-3.5 h-3.5 text-teal-600" />,
    },
    {
      key: 'FIRST_INTERVIEW',
      label: '1次面接',
      count: phaseCounts.FIRST_INTERVIEW,
      bg: 'bg-indigo-50/50 hover:bg-indigo-100/50',
      borderColor: 'border-indigo-200',
      activeBorderColor: 'ring-2 ring-indigo-600 border-indigo-600 bg-indigo-100/60',
      textColor: 'text-indigo-900',
      badgeBg: 'bg-indigo-100 text-indigo-800',
      icon: <UserCheck className="w-3.5 h-3.5 text-indigo-600" />,
    },
    {
      key: 'SECOND_INTERVIEW',
      label: '2次面接',
      count: phaseCounts.SECOND_INTERVIEW,
      bg: 'bg-cyan-50/50 hover:bg-cyan-100/50',
      borderColor: 'border-cyan-200',
      activeBorderColor: 'ring-2 ring-cyan-600 border-cyan-600 bg-cyan-100/60',
      textColor: 'text-cyan-900',
      badgeBg: 'bg-cyan-100 text-cyan-800',
      icon: <Clock className="w-3.5 h-3.5 text-cyan-600" />,
    },
    {
      key: 'FINAL_INTERVIEW',
      label: '最終面接',
      count: phaseCounts.FINAL_INTERVIEW,
      bg: 'bg-purple-50/50 hover:bg-purple-100/50',
      borderColor: 'border-purple-200',
      activeBorderColor: 'ring-2 ring-purple-600 border-purple-600 bg-purple-100/60',
      textColor: 'text-purple-900',
      badgeBg: 'bg-purple-100 text-purple-800',
      icon: <Award className="w-3.5 h-3.5 text-purple-600" />,
    },
    {
      key: 'OFFER_ISSUED',
      label: '内定通知',
      count: phaseCounts.OFFER_ISSUED,
      bg: 'bg-amber-50/50 hover:bg-amber-100/50',
      borderColor: 'border-amber-200',
      activeBorderColor: 'ring-2 ring-amber-600 border-amber-600 bg-amber-100/60',
      textColor: 'text-amber-900',
      badgeBg: 'bg-amber-100 text-amber-800',
      icon: <UserCheck className="w-3.5 h-3.5 text-amber-600" />,
    },
    {
      key: 'OFFER_ACCEPTED',
      label: '内定承諾',
      count: phaseCounts.OFFER_ACCEPTED,
      bg: 'bg-emerald-50/50 hover:bg-emerald-100/50',
      borderColor: 'border-emerald-200',
      activeBorderColor: 'ring-2 ring-emerald-600 border-emerald-600 bg-emerald-100/60',
      textColor: 'text-emerald-900',
      badgeBg: 'bg-emerald-100 text-emerald-800',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
    },
    {
      key: 'JOINING_SCHEDULED',
      label: '入社予定者',
      count: joiningScheduledCount,
      bg: 'bg-amber-50/80 hover:bg-amber-100/80',
      borderColor: 'border-amber-300',
      activeBorderColor: 'ring-2 ring-amber-500 border-amber-500 bg-amber-100/90',
      textColor: 'text-amber-950 font-bold',
      badgeBg: 'bg-amber-200 text-amber-900',
      icon: <Calendar className="w-3.5 h-3.5 text-amber-700" />,
    },
    {
      key: 'REJECTED_DECLINED',
      label: '辞退/不採用',
      count: phaseCounts.REJECTED_DECLINED,
      bg: 'bg-rose-50/50 hover:bg-rose-100/50',
      borderColor: 'border-rose-200',
      activeBorderColor: 'ring-2 ring-rose-600 border-rose-600 bg-rose-100/60',
      textColor: 'text-rose-900',
      badgeBg: 'bg-rose-100 text-rose-800',
      icon: <XCircle className="w-3.5 h-3.5 text-rose-600" />,
    },
  ];

  const sortedCandidates = [...filteredCandidates].sort((a, b) => {
    let result = 0;

    if (sortField === 'phase') {
      const orderA = PHASE_ORDER[a.phase] || 99;
      const orderB = PHASE_ORDER[b.phase] || 99;
      result = orderA - orderB;
    } else if (sortField === 'appliedDate') {
      result = (a.appliedDate || '').localeCompare(b.appliedDate || '');
    } else if (sortField === 'name') {
      const nameA = a.nameKana || a.name || '';
      const nameB = b.nameKana || b.name || '';
      result = nameA.localeCompare(nameB, 'ja');
    } else if (sortField === 'id') {
      result = (a.id || '').localeCompare(b.id || '');
    } else if (sortField === 'interviewRating') {
      const orderA = a.interviewRating ? (GRADE_ORDER[a.interviewRating] || 99) : 999;
      const orderB = b.interviewRating ? (GRADE_ORDER[b.interviewRating] || 99) : 999;
      result = orderA - orderB;
    }

    if (result !== 0) {
      return sortDirection === 'asc' ? result : -result;
    }

    // Secondary fallback sort: latest applied date first
    return (b.appliedDate || '').localeCompare(a.appliedDate || '');
  });

  const getPhaseBadge = (phase: SelectionPhase) => {
    const config: Record<SelectionPhase, { label: string; bg: string; text: string }> = {
      CASUAL_INTERVIEW: { label: 'カジュアル面談', bg: 'bg-teal-50 border-teal-200', text: 'text-teal-700' },
      DOCUMENT_SCREENING: { label: '書類選考', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
      FIRST_INTERVIEW: { label: '1次面接', bg: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-700' },
      SECOND_INTERVIEW: { label: '2次面接', bg: 'bg-cyan-50 border-cyan-200', text: 'text-cyan-700' },
      FINAL_INTERVIEW: { label: '最終面接', bg: 'bg-purple-50 border-purple-200', text: 'text-purple-700' },
      OFFER_ISSUED: { label: '内定通知', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
      OFFER_ACCEPTED: { label: '内定承諾', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
      REJECTED_DECLINED: { label: '辞退 / 不採用', bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700' }
    };

    const cfg = config[phase];
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text}`}>
        {cfg.label}
      </span>
    );
  };

  const renderSortHeader = (label: string, field: ListViewSortField, alignLeft = true) => {
    const isActive = sortField === field;
    return (
      <th 
        className={`py-2.5 px-2.5 cursor-pointer hover:text-indigo-600 transition-colors select-none ${alignLeft ? 'text-left' : 'text-center'}`}
        onClick={() => handleSort(field)}
      >
        <div className={`flex items-center gap-1 ${alignLeft ? '' : 'justify-center'} ${isActive ? 'text-indigo-600 font-bold' : ''}`}>
          <span>{label}</span>
          <ArrowUpDown className={`w-3 h-3 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
          {isActive && (
            <span className="text-indigo-600">
              {sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
          )}
        </div>
      </th>
    );
  };

  const getScheduleBadge = (status: ScheduleStatus, nextDate?: string) => {
    switch (status) {
      case 'SCHEDULE_CONFIRMED':
        return (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            <Calendar className="w-3.5 h-3.5 text-emerald-600" />
            {nextDate ? new Date(nextDate).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '日程確定'}
          </span>
        );
      case 'PROPOSING_DATES':
        return (
          <span className="inline-flex items-center gap-1 text-xs text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
            <Clock className="w-3.5 h-3.5 text-blue-600" /> 候補日提示中
          </span>
        );
      case 'WAITING_RESULT':
        return (
          <span className="inline-flex items-center gap-1 text-xs text-purple-700 font-medium bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
            <Clock className="w-3.5 h-3.5 text-purple-600" /> 結果待ち
          </span>
        );
      case 'UNARRANGED':
      default:
        return <span className="text-xs text-slate-400">未手配</span>;
    }
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Filter Bar */}
      <FilterBar showPhaseFilter={true} />

      {/* Foldable Interview Schedule Calendar */}
      <div className="px-1">
        <InterviewScheduleCalendar defaultCollapsed={true} />
      </div>

      {/* Phase Summary Dashboard Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-600">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                フェーズ別人数ダッシュボード
                <span className="text-xs text-slate-500 font-normal">
                  （カードをクリックでフェーズの絞り込み切り替え）
                </span>
              </h3>
            </div>
          </div>

          {activeFilterLabels.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50/80 border border-indigo-200/80 px-2.5 py-1 rounded-full font-medium">
              <Filter className="w-3 h-3 text-indigo-600" />
              <span>{activeFilterLabels.join(' | ')}</span>
            </div>
          )}
        </div>

        {/* Phase Breakdown Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
          {phaseCardsConfig.map((card) => {
            const isSelected = filters.phase === card.key || (card.key === 'ALL' && filters.phase === 'ALL');
            const percent = totalBaseCount > 0 ? Math.round((card.count / totalBaseCount) * 100) : 0;

            return (
              <button
                key={card.key}
                onClick={() => setFilters((prev) => ({ ...prev, phase: prev.phase === card.key ? 'ALL' : card.key }))}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected ? card.activeBorderColor : `${card.bg} ${card.borderColor}`
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-slate-700 truncate">
                    <span className="truncate">{card.label}</span>
                  </span>
                  {card.key !== 'ALL' && (
                    <span className="text-[10px] font-mono font-medium text-slate-500 bg-white/80 px-1 py-0.2 rounded border border-slate-200/60">
                      {percent}%
                    </span>
                  )}
                </div>

                <div className="flex items-baseline justify-between mt-0.5">
                  <span className={`text-xl font-bold font-mono ${card.textColor}`}>
                    {card.count}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">名</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Candidates Table Container */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs flex-1 flex flex-col">
        {/* Table Controls & Sort Selector Bar */}
        <div className="p-3 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-700 font-medium">
            <span>該当候補者: <strong className="text-slate-900 font-mono text-sm">{sortedCandidates.length}</strong> 名</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">表示順:</span>
            <select
              value={`${sortField}_${sortDirection}`}
              onChange={(e) => {
                const [f, d] = e.target.value.split('_') as [ListViewSortField, 'asc' | 'desc'];
                setSortField(f);
                setSortDirection(d);
              }}
              className="bg-white border border-slate-300 text-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 font-medium shadow-2xs cursor-pointer"
            >
              <option value="phase_asc">フェーズが進んでいない順 (デフォルト)</option>
              <option value="phase_desc">フェーズが進んでいる順</option>
              <option value="appliedDate_desc">応募日 (新しい順)</option>
              <option value="appliedDate_asc">応募日 (古い順)</option>
              <option value="interviewRating_asc">面接評価順 (高 → 低)</option>
              <option value="name_asc">候補者名 (五十音順)</option>
              <option value="id_asc">ID順</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-xs font-semibold tracking-wider border-b border-slate-200">
                {renderSortHeader('候補者名 / 年齢', 'name')}
                <th className="py-2.5 px-2.5">選考ポジション / 学歴</th>
                <th className="py-2.5 px-2.5">在籍企業名 / 経験社数</th>
                {renderSortHeader('応募日', 'appliedDate')}
                <th className="py-2.5 px-2.5">担当エージェント</th>
                {renderSortHeader('選考フェーズ', 'phase')}
                <th className="py-2.5 px-2.5">次回調整状況</th>
                <th className="py-2.5 px-2.5">社内担当者</th>
                {renderSortHeader('面接評価', 'interviewRating', false)}
                <th className="py-2.5 px-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {sortedCandidates.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400">
                    条件に一致する候補者が見つかりませんでした。
                  </td>
                </tr>
              ) : (
                sortedCandidates.map((c) => {
                  const latestNote = c.evaluationNotes[0];

                  return (
                    <tr 
                      key={c.id} 
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* Candidate Name & Face Photo & Age */}
                      <td className="py-2 px-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {/* Face Photo Avatar */}
                          <div className="relative shrink-0">
                            {c.avatarUrl ? (
                              <img
                                src={c.avatarUrl}
                                alt={c.name}
                                className="w-8 h-8 rounded-full object-cover border border-slate-200/90 shadow-2xs group-hover:border-indigo-400 transition-colors cursor-pointer"
                                title={`${c.name}の顔写真`}
                                referrerPolicy="no-referrer"
                                onClick={() => setSelectedCandidateId(c.id)}
                              />
                            ) : (
                              <div 
                                onClick={() => setSelectedCandidateId(c.id)}
                                className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-slate-200 text-indigo-700 font-extrabold text-xs flex items-center justify-center border border-slate-200 shrink-0 shadow-2xs cursor-pointer"
                                title={`${c.name}のイニシャルアイコン`}
                              >
                                {c.name.slice(0, 1)}
                              </div>
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setSelectedCandidateId(c.id)}
                                className="font-bold text-slate-900 hover:text-indigo-600 transition-colors text-sm text-left cursor-pointer"
                              >
                                {c.name}
                              </button>
                              <InlineNumberCell
                                value={c.age}
                                placeholder="+年齢"
                                unit="歳"
                                onSave={(newAge) => updateCandidate({ ...c, age: newAge })}
                                className="text-xs"
                              />
                            </div>
                          </div>
                        </div>
                        {(c.joiningDate || c.preJoinDinnerStatus || c.resignationNegotiationStatus) && (
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            {c.joiningDate && (
                              <span className="inline-flex items-center gap-0.5 bg-amber-50 text-amber-900 border border-amber-200 text-[10px] px-1.5 py-0.2 rounded font-bold">
                                入社: {c.joiningDate}
                              </span>
                            )}
                            {c.resignationNegotiationStatus && c.resignationNegotiationStatus !== 'NOT_STARTED' && (
                              <span className={`inline-flex items-center text-[10px] px-1.5 py-0.2 rounded font-medium border ${
                                c.resignationNegotiationStatus === 'COMPLETED' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                c.resignationNegotiationStatus === 'DIFFICULT' ? 'bg-rose-50 text-rose-800 border-rose-200' :
                                'bg-slate-100 text-slate-700 border-slate-200'
                              }`}>
                                退職: {
                                  c.resignationNegotiationStatus === 'COMPLETED' ? '完了' :
                                  c.resignationNegotiationStatus === 'NOTICE_SUBMITTED' ? '提出済' :
                                  c.resignationNegotiationStatus === 'IN_PROGRESS' ? '交渉中' :
                                  c.resignationNegotiationStatus === 'DIFFICULT' ? '難航' : '未着手'
                                }
                              </span>
                            )}
                            {c.preJoinDinnerStatus && c.preJoinDinnerStatus !== 'NOT_SET' && c.preJoinDinnerStatus !== 'NOT_REQUIRED' && (
                              <span className={`inline-flex items-center text-[10px] px-1.5 py-0.2 rounded font-medium border ${
                                c.preJoinDinnerStatus === 'COMPLETED' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                'bg-indigo-50 text-indigo-800 border-indigo-200'
                              }`}>
                                会食: {
                                  c.preJoinDinnerStatus === 'COMPLETED' ? '済' :
                                  c.preJoinDinnerStatus === 'SCHEDULED' ? '予定' : '未'
                                }
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Job Title / Selection Position & Education */}
                      <td className="py-2 px-2.5 max-w-[180px]">
                        <div className="flex items-center gap-1 flex-wrap mb-0.5">
                          <span className="inline-block bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded text-xs border border-indigo-100">
                            {c.jobTitle}
                          </span>
                          {c.jobTitle.toUpperCase().includes('BCA') && c.bcaDesiredDepartment && (
                            <span className="inline-block bg-purple-50 text-purple-800 font-extrabold px-1.5 py-0.5 rounded text-[10px] border border-purple-200">
                              {c.bcaDesiredDepartment === 'BOTH' ? 'F+/AC' : c.bcaDesiredDepartment}
                            </span>
                          )}
                        </div>
                        <div>
                          <InlineTextCell
                            value={c.education}
                            placeholder="+ 学歴を入力"
                            onSave={(newEdu) => updateCandidate({ ...c, education: newEdu })}
                            className="text-xs text-slate-500 truncate"
                          />
                        </div>
                      </td>

                      {/* Current Company & Company Count */}
                      <td className="py-2 px-2.5 max-w-[180px]">
                        <div>
                          <InlineTextCell
                            value={c.currentCompany}
                            placeholder="+ 企業名を入力"
                            onSave={(newComp) => updateCandidate({ ...c, currentCompany: newComp })}
                            className="font-medium text-slate-800 truncate"
                          />
                        </div>
                        <div className="flex items-center gap-1 text-slate-500 text-xs mt-0.5">
                          <span className="text-slate-400">経験:</span>
                          <InlineNumberCell
                            value={c.companyCount}
                            placeholder="+社数"
                            unit="社"
                            onSave={(newCnt) => updateCandidate({ ...c, companyCount: newCnt })}
                          />
                        </div>
                      </td>

                      {/* Applied Date */}
                      <td className="py-2 px-2.5 whitespace-nowrap text-slate-500">
                        {c.appliedDate}
                      </td>

                      {/* Agency */}
                      <td className="py-2 px-2.5 whitespace-nowrap font-medium text-slate-800">
                        {c.agencyName}
                      </td>

                      {/* Phase Dropdown / Badge */}
                      <td className="py-2 px-2.5 whitespace-nowrap">
                        {userRole !== 'INTERVIEWER' ? (
                          <select
                            value={c.phase}
                            onChange={(e) => updateCandidatePhase(c.id, e.target.value as SelectionPhase)}
                            className="bg-slate-50 border border-slate-200 text-slate-800 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer font-medium"
                          >
                            <option value="DOCUMENT_SCREENING">書類選考</option>
                            <option value="CASUAL_INTERVIEW">カジュアル面談</option>
                            <option value="FIRST_INTERVIEW">1次面接</option>
                            <option value="SECOND_INTERVIEW">2次面接</option>
                            <option value="FINAL_INTERVIEW">最終面接</option>
                            <option value="OFFER_ISSUED">内定</option>
                            <option value="OFFER_ACCEPTED">承諾</option>
                            <option value="REJECTED_DECLINED">辞退/不採用</option>
                          </select>
                        ) : (
                          getPhaseBadge(c.phase)
                        )}
                      </td>

                      {/* Next Schedule & Interviewer */}
                      <td className="py-2 px-2.5 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <select
                            value={c.scheduleStatus}
                            onChange={(e) => updateCandidateSchedule(c.id, e.target.value as ScheduleStatus, c.nextScheduleDate, c.nextInterviewers)}
                            className={`text-xs rounded px-2 py-0.5 border transition-colors cursor-pointer focus:outline-none font-medium ${
                              c.scheduleStatus === 'SCHEDULE_CONFIRMED' ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold' :
                              c.scheduleStatus === 'PROPOSING_DATES' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                              c.scheduleStatus === 'WAITING_RESULT' ? 'bg-indigo-50 border-indigo-200 text-indigo-800' :
                              'bg-slate-50 border-slate-200 text-slate-600'
                            }`}
                          >
                            <option value="UNARRANGED">未手配</option>
                            <option value="PROPOSING_DATES">候補日提示中</option>
                            <option value="SCHEDULE_CONFIRMED">日程確定</option>
                            <option value="WAITING_RESULT">結果待ち</option>
                          </select>
                          {(c.scheduleStatus === 'SCHEDULE_CONFIRMED' || c.scheduleStatus === 'PROPOSING_DATES') && (
                            <input
                              type="datetime-local"
                              value={c.nextScheduleDate ? new Date(c.nextScheduleDate).toISOString().slice(0, 16) : ''}
                              onChange={(e) => {
                                const d = e.target.value ? new Date(e.target.value).toISOString() : undefined;
                                updateCandidateSchedule(c.id, c.scheduleStatus, d, c.nextInterviewers);
                              }}
                              className="text-[10px] bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-600 focus:outline-none focus:border-indigo-400"
                            />
                          )}
                          {c.nextInterviewers && c.nextInterviewers.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {c.nextInterviewers.map((interviewer, idx) => (
                                <span key={idx} className="bg-indigo-50 text-indigo-800 text-[9px] font-bold px-1.5 py-0.2 rounded border border-indigo-100 flex items-center gap-1">
                                  <User className="w-2.5 h-2.5 text-indigo-500" />
                                  <span>{interviewer}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Assignees (社内担当者 - クッキリ表示・マルチバッジ＋編集) */}
                      <td className="py-2 px-2.5 whitespace-nowrap min-w-[130px]">
                        <div className="flex items-center gap-1 flex-wrap">
                          {c.assignees && c.assignees.length > 0 ? (
                            c.assignees.map((staffName, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-950 font-extrabold text-xs px-2 py-0.5 rounded border border-indigo-200/90 shadow-2xs"
                              >
                                <User className="w-3 h-3 text-indigo-600 shrink-0" />
                                <span>{staffName}</span>
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400 text-xs italic">未割当</span>
                          )}

                          <select
                            value=""
                            onChange={(e) => {
                              const val = e.target.value;
                              if (!val) return;
                              if (val === '__CLEAR__') {
                                updateCandidate({ ...c, assignees: [] });
                              } else {
                                const exists = c.assignees.includes(val);
                                const newAssignees = exists
                                  ? c.assignees.filter((a) => a !== val)
                                  : [...c.assignees, val];
                                updateCandidate({ ...c, assignees: newAssignees });
                              }
                            }}
                            className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-[11px] rounded px-1.5 py-0.5 font-semibold cursor-pointer focus:outline-none shadow-2xs"
                            title="社内担当者を編集・切り替え"
                          >
                            <option value="">+ 編集</option>
                            <option value="__CLEAR__">（担当者を未割当にする）</option>
                            {staffList.map((s) => {
                              const isAssigned = c.assignees.includes(s.name);
                              return (
                                <option key={s.id} value={s.name}>
                                  {isAssigned ? `✓ ${s.name} (解除)` : s.name}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </td>

                      {/* Interview Rating Grade */}
                      <td className="py-2 px-2.5 text-center whitespace-nowrap">
                        <select
                          value={c.interviewRating || ''}
                          onChange={(e) => updateCandidate({ ...c, interviewRating: (e.target.value as EvaluationGrade) || undefined })}
                          className={`text-xs font-mono font-bold rounded px-2 py-1 border transition-all cursor-pointer focus:outline-none ${
                            c.interviewRating === 'A+' ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
                            c.interviewRating === 'A-' ? 'bg-teal-100 text-teal-900 border-teal-300' :
                            c.interviewRating === 'B+' ? 'bg-indigo-100 text-indigo-900 border-indigo-300' :
                            c.interviewRating === 'B' ? 'bg-blue-100 text-blue-900 border-blue-300' :
                            c.interviewRating === 'B-' ? 'bg-amber-100 text-amber-900 border-amber-300' :
                            c.interviewRating === 'C' ? 'bg-rose-100 text-rose-900 border-rose-300' :
                            'bg-slate-50 text-slate-400 border-dashed border-slate-300 hover:border-indigo-400'
                          }`}
                        >
                          <option value="" className="bg-white text-slate-400 font-sans font-normal">評価未設定</option>
                          <option value="A+" className="bg-white text-emerald-900 font-mono font-bold">A+</option>
                          <option value="A-" className="bg-white text-teal-900 font-mono font-bold">A-</option>
                          <option value="B+" className="bg-white text-indigo-900 font-mono font-bold">B+</option>
                          <option value="B" className="bg-white text-blue-900 font-mono font-bold">B</option>
                          <option value="B-" className="bg-white text-amber-900 font-mono font-bold">B-</option>
                          <option value="C" className="bg-white text-rose-900 font-mono font-bold">C</option>
                        </select>
                        {(c.lRating || c.cRating || c.mRating) && (
                          <div className="mt-1 flex items-center justify-center gap-0.5 text-[10px] font-mono">
                            <span className={`px-1 rounded font-bold ${
                              c.lRating === '〇' ? 'bg-emerald-100 text-emerald-800' :
                              c.lRating === '△' ? 'bg-amber-100 text-amber-800' :
                              c.lRating === '✕' ? 'bg-rose-100 text-rose-800' : 'text-slate-400'
                            }`}>L:{c.lRating || '-'}</span>
                            <span className={`px-1 rounded font-bold ${
                              c.cRating === '〇' ? 'bg-emerald-100 text-emerald-800' :
                              c.cRating === '△' ? 'bg-amber-100 text-amber-800' :
                              c.cRating === '✕' ? 'bg-rose-100 text-rose-800' : 'text-slate-400'
                            }`}>C:{c.cRating || '-'}</span>
                            <span className={`px-1 rounded font-bold ${
                              c.mRating === '〇' ? 'bg-emerald-100 text-emerald-800' :
                              c.mRating === '△' ? 'bg-amber-100 text-amber-800' :
                              c.mRating === '✕' ? 'bg-rose-100 text-rose-800' : 'text-slate-400'
                            }`}>M:{c.mRating || '-'}</span>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedCandidateId(c.id)}
                            className="p-1.5 text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
                            title="詳細画面を開く"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {userRole === 'ADMIN' && (
                            <button
                              onClick={() => {
                                deleteCandidate(c.id);
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                              title="過去候補者一覧へ移動・保存（アーカイブ）"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};


import React, { useState, useMemo } from 'react';
import { useATS } from '../context/ATSContext';
import { Candidate, SelectionPhase } from '../types';
import { isJoiningScheduled } from '../lib/onboardingUtils';
import { 
  Sparkles, 
  Calendar as CalendarIcon, 
  Briefcase, 
  Users, 
  CheckCircle2, 
  Search, 
  UserCheck, 
  ChevronRight, 
  MessageSquare,
  ChevronLeft,
  LayoutGrid,
  Clock,
  User,
  Filter,
  Check,
  ArrowUpRight
} from 'lucide-react';

const PHASE_LABELS: Record<SelectionPhase, { label: string; bg: string; text: string; border: string }> = {
  CASUAL_INTERVIEW: { label: '面談', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  DOCUMENT_SCREENING: { label: '書類', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  FIRST_INTERVIEW: { label: '1次面接', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  SECOND_INTERVIEW: { label: '2次面接', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  FINAL_INTERVIEW: { label: '最終面接', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  OFFER_ISSUED: { label: '内定提示', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  OFFER_ACCEPTED: { label: '承諾済', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  REJECTED_DECLINED: { label: '辞退/不採用', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' }
};

interface CalendarEvent {
  id: string;
  candidate: Candidate;
  type: 'JOINING' | 'DINNER' | 'SCHEDULE';
  title: string;
  time?: string;
  dateStr: string;
}

export const OnboardingView: React.FC = () => {
  const { candidates, setSelectedCandidateId } = useATS();

  // View Mode: 'cards' | 'calendar'
  const [viewMode, setViewMode] = useState<'cards' | 'calendar'>('cards');

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [resignationFilter, setResignationFilter] = useState<string>('ALL');
  const [dinnerFilter, setDinnerFilter] = useState<string>('ALL');

  // Calendar Date State (Default: August 2026 where mock data exists)
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date(2026, 7, 1));
  const [selectedDay, setSelectedDay] = useState<string | null>('2026-08-03');

  // Event Type Filter Toggles
  const [showJoiningEvents, setShowJoiningEvents] = useState(true);
  const [showDinnerEvents, setShowDinnerEvents] = useState(true);
  const [showScheduleEvents, setShowScheduleEvents] = useState(true);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  // Format YYYY-MM-DD
  const formatDateKey = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Filter onboarding candidates (joining date set or OFFER_ACCEPTED / OFFER_ISSUED; excludes
  // REJECTED_DECLINED even if joiningDate was set before they declined)
  const allJoiningCandidates = useMemo(() => {
    return candidates.filter(isJoiningScheduled);
  }, [candidates]);

  // Filtered Onboarding Candidates list according to filters
  const filteredJoiningCandidates = useMemo(() => {
    return allJoiningCandidates.filter((c) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = c.name.toLowerCase().includes(q);
        const matchJob = c.jobTitle.toLowerCase().includes(q);
        const matchAgency = c.agencyName.toLowerCase().includes(q);
        if (!matchName && !matchJob && !matchAgency) return false;
      }

      if (resignationFilter !== 'ALL' && c.resignationNegotiationStatus !== resignationFilter) {
        return false;
      }

      if (dinnerFilter !== 'ALL' && c.preJoinDinnerStatus !== dinnerFilter) {
        return false;
      }

      return true;
    });
  }, [allJoiningCandidates, searchQuery, resignationFilter, dinnerFilter]);

  // Map events by date (YYYY-MM-DD)
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};

    const addEvent = (dateStr: string, ev: CalendarEvent) => {
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(ev);
    };

    // 1. Onboarding & Joining Events
    filteredJoiningCandidates.forEach((c) => {
      if (showJoiningEvents && c.joiningDate) {
        addEvent(c.joiningDate, {
          id: `join-${c.id}`,
          candidate: c,
          type: 'JOINING',
          title: `入社: ${c.name}`,
          dateStr: c.joiningDate
        });
      }

      if (showDinnerEvents && c.preJoinDinnerDate) {
        addEvent(c.preJoinDinnerDate, {
          id: `dinner-${c.id}`,
          candidate: c,
          type: 'DINNER',
          title: `会食: ${c.name}`,
          dateStr: c.preJoinDinnerDate
        });
      }
    });

    // 2. Selection & Interview Schedule Events (from ALL candidates or filtered onboarding ones)
    if (showScheduleEvents) {
      candidates.forEach((c) => {
        if (c.nextScheduleDate) {
          const datePart = c.nextScheduleDate.split('T')[0];
          const timePart = c.nextScheduleDate.includes('T') ? c.nextScheduleDate.split('T')[1] : undefined;
          
          // Match search query if any
          if (searchQuery) {
            const q = searchQuery.toLowerCase();
            if (!c.name.toLowerCase().includes(q) && !c.jobTitle.toLowerCase().includes(q)) return;
          }

          const phaseObj = PHASE_LABELS[c.phase];
          addEvent(datePart, {
            id: `sched-${c.id}`,
            candidate: c,
            type: 'SCHEDULE',
            title: `${phaseObj?.label || '選考'}: ${c.name}`,
            time: timePart,
            dateStr: datePart
          });
        }
      });
    }

    return map;
  }, [filteredJoiningCandidates, candidates, showJoiningEvents, showDinnerEvents, showScheduleEvents, searchQuery]);

  // Calendar Days Matrix (identical specification to Selection Schedule Calendar)
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDayOfMonth.getDay(); // 0=Sun
    const daysInMonth = lastDayOfMonth.getDate();

    const matrix: Array<{
      date: Date;
      dateKey: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      events: CalendarEvent[];
    }> = [];

    // Previous month padding
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      const key = formatDateKey(d);
      matrix.push({
        date: d,
        dateKey: key,
        isCurrentMonth: false,
        isToday: false,
        events: eventsByDate[key] || []
      });
    }

    // Current month days
    const todayKey = formatDateKey(new Date());
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const key = formatDateKey(d);
      matrix.push({
        date: d,
        dateKey: key,
        isCurrentMonth: true,
        isToday: key === todayKey || key === '2026-08-01',
        events: eventsByDate[key] || []
      });
    }

    // Next month padding
    const remaining = (7 - (matrix.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      const key = formatDateKey(d);
      matrix.push({
        date: d,
        dateKey: key,
        isCurrentMonth: false,
        isToday: false,
        events: eventsByDate[key] || []
      });
    }

    return matrix;
  }, [year, month, eventsByDate]);

  // KPIs
  const totalCount = allJoiningCandidates.length;
  const acceptedCount = allJoiningCandidates.filter((c) => c.phase === 'OFFER_ACCEPTED').length;
  const resignationDoneCount = allJoiningCandidates.filter(
    (c) => c.resignationNegotiationStatus === 'COMPLETED'
  ).length;
  const dinnerCompletedCount = allJoiningCandidates.filter(
    (c) => c.preJoinDinnerStatus === 'COMPLETED'
  ).length;
  const dinnerScheduledCount = allJoiningCandidates.filter(
    (c) => c.preJoinDinnerStatus === 'SCHEDULED'
  ).length;

  // Navigation handlers
  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date(2026, 7, 1));
    setSelectedDay('2026-08-03');
  };

  // Events for selected day
  const selectedDayEvents = selectedDay ? eventsByDate[selectedDay] || [] : [];

  return (
    <div className="space-y-6">
      {/* Top Simple Light Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600 border border-indigo-100">
              <UserCheck className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              入社予定・オンボーディング管理
            </h2>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            内定承諾者の入社予定日、退職交渉進捗、入社前会食スケジュールをカレンダーおよびカードで一元管理します。
          </p>
        </div>

        {/* View Switcher Controls */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start md:self-auto shrink-0">
          <button
            onClick={() => setViewMode('cards')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'cards'
                ? 'bg-white text-indigo-700 shadow-2xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            状況一覧（カード表示）
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'calendar'
                ? 'bg-white text-indigo-700 shadow-2xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            カレンダー表示
          </button>
        </div>
      </div>

      {/* KPI Stats Bar - Clean & Modern White Theme */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">管理対象 入社予定者</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{totalCount} <span className="text-xs text-slate-500 font-normal">名</span></p>
            <p className="text-[11px] text-indigo-600 mt-1 font-medium flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5" /> 内定提示・承諾者含む
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-700">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">現職の退職交渉 完了</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">
              {resignationDoneCount} <span className="text-xs text-slate-500 font-normal">/ {totalCount} 名</span>
            </p>
            <p className="text-[11px] text-emerald-600 mt-1 font-semibold">
              完了率: {totalCount > 0 ? Math.round((resignationDoneCount / totalCount) * 100) : 0}%
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">入社前会食 実施・予定</p>
            <p className="text-2xl font-bold text-indigo-600 mt-1">
              {dinnerCompletedCount + dinnerScheduledCount} <span className="text-xs text-slate-500 font-normal">名</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              実施: <span className="font-bold text-slate-800">{dinnerCompletedCount}名</span> / 予定: <span className="font-bold text-slate-800">{dinnerScheduledCount}名</span>
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">直近の入社予定日</p>
            <p className="text-base font-extrabold text-slate-900 mt-1 font-mono">
              {allJoiningCandidates.find((c) => c.joiningDate)?.joiningDate || '日付未確定'}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              順次オンボーディング進行中
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-700">
            <CalendarIcon className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="氏名、職種、エージェント名で検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 text-slate-800 text-xs rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:border-indigo-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs bg-slate-200 px-1.5 py-0.5 rounded cursor-pointer"
              >
                クリア
              </button>
            )}
          </div>

          {/* Select Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <Briefcase className="w-3.5 h-3.5 text-slate-500" />
              <span>退職交渉:</span>
              <select
                value={resignationFilter}
                onChange={(e) => setResignationFilter(e.target.value)}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">すべて</option>
                <option value="NOT_STARTED">未着手</option>
                <option value="IN_PROGRESS">交渉中</option>
                <option value="NOTICE_SUBMITTED">退職願提出済</option>
                <option value="COMPLETED">交渉完了</option>
                <option value="DIFFICULT">難航・調整中</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>入社前会食:</span>
              <select
                value={dinnerFilter}
                onChange={(e) => setDinnerFilter(e.target.value)}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">すべて</option>
                <option value="UNPLANNED">未定</option>
                <option value="SCHEDULED">予定あり</option>
                <option value="COMPLETED">実施済み</option>
                <option value="NOT_REQUIRED">不要</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* CALENDAR VIEW - Conforming exactly to Interview Schedule Calendar Specification */}
      {viewMode === 'calendar' && (
        <div className="space-y-4">
          
          {/* Calendar Header Bar & Event Type Toggles */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              
              {/* Month Navigation */}
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1">
                  <button
                    onClick={handlePrevMonth}
                    className="p-1.5 hover:bg-white text-slate-600 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
                    title="前月"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-3 font-extrabold text-sm sm:text-base text-slate-800 font-mono min-w-[110px] text-center">
                    {year}年{month + 1}月
                  </span>
                  <button
                    onClick={handleNextMonth}
                    className="p-1.5 hover:bg-white text-slate-600 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
                    title="翌月"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <button
                  onClick={handleToday}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-colors cursor-pointer"
                >
                  当月へ
                </button>
              </div>

              {/* Event Type Filter Checkboxes */}
              <div className="flex flex-wrap items-center gap-2.5 text-xs">
                <span className="text-slate-400 font-medium text-[11px]">表示項目:</span>

                <label className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors select-none">
                  <input
                    type="checkbox"
                    checked={showJoiningEvents}
                    onChange={(e) => setShowJoiningEvents(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600"
                  />
                  <span className="text-slate-700 font-bold">入社予定日</span>
                </label>

                <label className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors select-none">
                  <input
                    type="checkbox"
                    checked={showDinnerEvents}
                    onChange={(e) => setShowDinnerEvents(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
                  />
                  <span className="text-slate-700 font-bold">入社前会食</span>
                </label>

                <label className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors select-none">
                  <input
                    type="checkbox"
                    checked={showScheduleEvents}
                    onChange={(e) => setShowScheduleEvents(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600"
                  />
                  <span className="text-slate-700 font-bold">選考・フォロー日程</span>
                </label>
              </div>
            </div>
          </div>

          {/* Calendar Grid Container (Clean White Scheme) */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            
            {/* Day of Week Header */}
            <div className="grid grid-cols-7 bg-slate-100/80 border-b border-slate-200 text-center text-xs font-bold py-2 text-slate-600">
              <span className="text-rose-600">日</span>
              <span>月</span>
              <span>火</span>
              <span>水</span>
              <span>木</span>
              <span>金</span>
              <span className="text-indigo-600">土</span>
            </div>

            {/* Days Matrix */}
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 bg-slate-50/20">
              {calendarDays.map((dayItem, index) => {
                const dayNum = dayItem.date.getDate();
                const isSelected = selectedDay === dayItem.dateKey;
                const isWeekend = dayItem.date.getDay() === 0 || dayItem.date.getDay() === 6;

                return (
                  <div
                    key={index}
                    onClick={() => setSelectedDay(dayItem.dateKey)}
                    className={`min-h-[105px] p-2 transition-all cursor-pointer flex flex-col justify-between ${
                      !dayItem.isCurrentMonth ? 'bg-slate-100/40 text-slate-400' : 'bg-white'
                    } ${
                      isSelected
                        ? 'ring-2 ring-indigo-600 inset-0 z-10 bg-indigo-50/20'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* Header Row in Day Cell */}
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-xs font-extrabold font-mono px-1.5 py-0.5 rounded-md ${
                          dayItem.isToday
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : isWeekend
                            ? 'text-slate-500 bg-slate-100'
                            : 'text-slate-800 bg-slate-100/80'
                        }`}
                      >
                        {dayNum}
                      </span>

                      {dayItem.events.length > 0 && (
                        <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                          {dayItem.events.length}件
                        </span>
                      )}
                    </div>

                    {/* Events List inside Day Cell */}
                    <div className="space-y-1 flex-1 overflow-y-auto max-h-[72px] custom-scrollbar">
                      {dayItem.events.slice(0, 3).map((ev) => (
                        <div
                          key={ev.id}
                          className={`text-[10px] px-1.5 py-1 rounded font-bold transition-all truncate border flex items-center justify-between gap-1 ${
                            ev.type === 'JOINING'
                              ? 'bg-amber-50 text-amber-900 border-amber-200'
                              : ev.type === 'DINNER'
                              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                              : 'bg-indigo-50 text-indigo-900 border-indigo-200'
                          }`}
                          title={`${ev.title} (${ev.candidate.jobTitle})`}
                        >
                          <span className="truncate">{ev.title}</span>
                          {ev.time && <span className="text-[9px] opacity-75 font-mono">{ev.time}</span>}
                        </div>
                      ))}

                      {dayItem.events.length > 3 && (
                        <p className="text-[9px] text-slate-400 font-medium text-center">
                          他 {dayItem.events.length - 3} 件...
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Date Detail Agenda Panel (Same spec as Selection Calendar) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-indigo-600" />
                <h3 className="font-extrabold text-slate-900 text-sm font-mono">
                  {selectedDay ? `${selectedDay} のスケジュール・予定者` : '日付を選択してください'}
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                {selectedDayEvents.length}件の予定
              </span>
            </div>

            {selectedDayEvents.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p className="text-slate-500 text-xs">
                  {selectedDay} に登録された入社・会食・面談イベントはありません。
                </p>
                <p className="text-slate-400 text-[11px] mt-1">
                  カレンダーの日付枠をクリックすると、該当日の予定詳細が表示されます。
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {selectedDayEvents.map((ev) => (
                  <div
                    key={ev.id}
                    onClick={() => setSelectedCandidateId(ev.candidate.id)}
                    className="bg-white hover:bg-slate-50 border border-slate-200 hover:border-indigo-300 rounded-xl p-3.5 shadow-2xs hover:shadow-xs transition-all cursor-pointer group flex flex-col justify-between space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border inline-block mb-1 ${
                          ev.type === 'JOINING' ? 'bg-amber-50 text-amber-900 border-amber-200' :
                          ev.type === 'DINNER' ? 'bg-emerald-50 text-emerald-900 border-emerald-200' :
                          'bg-indigo-50 text-indigo-900 border-indigo-200'
                        }`}>
                          {ev.title}
                        </span>
                        <p className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition-colors">
                          {ev.candidate.name}
                        </p>
                        <p className="text-xs text-slate-500 font-medium">{ev.candidate.jobTitle}</p>
                      </div>

                      {ev.time && (
                        <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                          {ev.time}
                        </span>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                      <span>担当: {ev.candidate.assignees.join(', ')}</span>
                      <span className="font-bold text-indigo-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                        詳細 <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CARDS LIST VIEW */}
      {viewMode === 'cards' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
            <div>
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <span className="p-1 bg-indigo-600 text-white rounded-lg text-xs font-bold"><UserCheck className="w-3.5 h-3.5" /></span>
                入社予定者フォロー & オンボーディング状況一覧
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                内定承諾済みおよび内定フォロー中の候補者の「入社予定日」「入社前会食」「退職交渉状況」のリアルタイムサマリ
              </p>
            </div>
            <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full self-start sm:self-auto shrink-0">
              対象: {filteredJoiningCandidates.length}名
            </span>
          </div>

          {filteredJoiningCandidates.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
              <UserCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 font-bold text-sm">該当する入社予定者が見つかりません</p>
              <p className="text-slate-400 text-xs mt-1">検索条件をクリアするか、候補者詳細から入社日・フォロー情報を設定してください。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredJoiningCandidates.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelectedCandidateId(c.id)}
                  className="bg-white hover:bg-slate-50/80 border border-slate-200 hover:border-indigo-400 rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between space-y-4"
                >
                  <div>
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-base text-slate-900 group-hover:text-indigo-600 transition-colors">
                            {c.name}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">({c.id})</span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium mt-0.5">{c.jobTitle}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">推薦: {c.agencyName}</p>
                      </div>

                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                        c.phase === 'OFFER_ACCEPTED' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                        'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}>
                        {c.phase === 'OFFER_ACCEPTED' ? '内定承諾' : '内定提示'}
                      </span>
                    </div>

                    {/* Onboarding Key Info Blocks */}
                    <div className="space-y-2 mt-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-xs">
                      {/* Joining Date */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 font-semibold flex items-center gap-1.5">
                          <CalendarIcon className="w-4 h-4 text-indigo-600" /> 入社予定日:
                        </span>
                        <span className="font-extrabold text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-100 shadow-2xs font-mono">
                          {c.joiningDate || '日付未決定'}
                        </span>
                      </div>

                      {/* Resignation Negotiation */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 font-semibold flex items-center gap-1.5">
                          <Briefcase className="w-4 h-4 text-slate-500" /> 退職交渉:
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          c.resignationNegotiationStatus === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                          c.resignationNegotiationStatus === 'NOTICE_SUBMITTED' ? 'bg-amber-100 text-amber-800' :
                          c.resignationNegotiationStatus === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-800' :
                          c.resignationNegotiationStatus === 'DIFFICULT' ? 'bg-rose-100 text-rose-800' :
                          'bg-slate-200 text-slate-700'
                        }`}>
                          {
                            c.resignationNegotiationStatus === 'COMPLETED' ? '交渉完了' :
                            c.resignationNegotiationStatus === 'NOTICE_SUBMITTED' ? '退職願提出済' :
                            c.resignationNegotiationStatus === 'IN_PROGRESS' ? '交渉中' :
                            c.resignationNegotiationStatus === 'DIFFICULT' ? '難航・調整中' : '未着手'
                          }
                        </span>
                      </div>

                      {/* Pre-join Dinner */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 font-semibold flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-slate-500" /> 入社前会食:
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          c.preJoinDinnerStatus === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                          c.preJoinDinnerStatus === 'SCHEDULED' ? 'bg-amber-100 text-amber-800' :
                          'bg-slate-200 text-slate-700'
                        }`}>
                          {
                            c.preJoinDinnerStatus === 'COMPLETED' ? `実施済み (${c.preJoinDinnerDate || ''})` :
                            c.preJoinDinnerStatus === 'SCHEDULED' ? `予定あり (${c.preJoinDinnerDate || '日付未定'})` :
                            c.preJoinDinnerStatus === 'NOT_REQUIRED' ? '不要' : '未定'
                          }
                        </span>
                      </div>
                    </div>

                    {/* Onboarding Notes */}
                    {c.onboardingNotes && (
                      <div className="mt-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                        <p className="text-[11px] font-bold text-slate-700 mb-0.5 flex items-center gap-1">
                          <MessageSquare className="w-3 h-3 text-indigo-600" /> オンボーディング特記事項:
                        </p>
                        <p className="text-slate-600 leading-relaxed text-[11px] line-clamp-3">
                          {c.onboardingNotes}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Card Footer */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>社内担当: {c.assignees.join(', ')}</span>
                    <span className="font-bold text-indigo-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                      詳細・フォロー編集 <ChevronRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

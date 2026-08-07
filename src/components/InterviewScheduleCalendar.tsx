import React, { useState, useMemo } from 'react';
import { useATS } from '../context/ATSContext';
import { Candidate, SelectionPhase } from '../types';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  User, 
  Sparkles,
  CheckCircle2,
  AlertCircle,
  CalendarDays
} from 'lucide-react';

const PHASE_LABELS: Record<SelectionPhase, { label: string; bg: string; text: string; border: string }> = {
  CASUAL_INTERVIEW: { label: '面談', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  DOCUMENT_SCREENING: { label: '書類', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  FIRST_INTERVIEW: { label: '1次面接', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  SECOND_INTERVIEW: { label: '2次面接', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  FINAL_INTERVIEW: { label: '最終面接', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  OFFER_ISSUED: { label: '内定提示', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  OFFER_ACCEPTED: { label: '承諾', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  REJECTED_DECLINED: { label: '辞退/不採用', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' }
};

interface InterviewScheduleCalendarProps {
  defaultCollapsed?: boolean;
  className?: string;
}

export const InterviewScheduleCalendar: React.FC<InterviewScheduleCalendarProps> = ({
  defaultCollapsed = false,
  className = ''
}) => {
  const { filteredCandidates, setSelectedCandidateId } = useATS();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(defaultCollapsed);
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date(2026, 7, 1)); // 2026年8月基準 (mockDataに合致)
  const [selectedDay, setSelectedDay] = useState<string | null>('2026-08-03');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  // Format helper YYYY-MM-DD
  const formatDateKey = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Extract date from Candidate's nextScheduleDate (e.g. "2026-08-03T15:00" -> "2026-08-03")
  const getCandidateScheduleDate = (c: Candidate): string | null => {
    if (!c.nextScheduleDate) return null;
    return c.nextScheduleDate.split('T')[0];
  };

  const getCandidateScheduleTime = (c: Candidate): string | null => {
    if (!c.nextScheduleDate || !c.nextScheduleDate.includes('T')) return null;
    return c.nextScheduleDate.split('T')[1];
  };

  // Map candidates by date key
  const candidatesByDate = useMemo(() => {
    const map: Record<string, Candidate[]> = {};
    filteredCandidates.forEach((c) => {
      const dateKey = getCandidateScheduleDate(c) || c.appliedDate;
      if (dateKey) {
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push(c);
      }
    });
    return map;
  }, [filteredCandidates]);

  // Calendar matrix calculation
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sun, 1 = Mon ...
    const daysInMonth = lastDayOfMonth.getDate();

    const matrix: Array<{
      date: Date;
      dateKey: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      candidates: Candidate[];
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
        candidates: candidatesByDate[key] || []
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
        isToday: key === todayKey || key === '2026-08-01', // highlight reference date
        candidates: candidatesByDate[key] || []
      });
    }

    // Next month padding (to reach full weeks: 35 or 42 cells)
    const remaining = (7 - (matrix.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      const key = formatDateKey(d);
      matrix.push({
        date: d,
        dateKey: key,
        isCurrentMonth: false,
        isToday: false,
        candidates: candidatesByDate[key] || []
      });
    }

    return matrix;
  }, [year, month, candidatesByDate]);

  // Statistics for current month
  const monthStats = useMemo(() => {
    let totalCount = 0;
    let confirmedCount = 0;
    calendarDays.forEach((day) => {
      if (day.isCurrentMonth) {
        totalCount += day.candidates.length;
        confirmedCount += day.candidates.filter(
          (c) => c.scheduleStatus === 'SCHEDULE_CONFIRMED'
        ).length;
      }
    });
    return { totalCount, confirmedCount };
  }, [calendarDays]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date(2026, 7, 1));
  };

  // Candidates for selected day
  const selectedDayCandidates = selectedDay ? candidatesByDate[selectedDay] || [] : [];

  return (
    <div className={`bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden transition-all duration-300 ${className}`}>
      
      {/* Header Bar - Clean & Simple Light Theme */}
      <div className="bg-slate-50/90 border-b border-slate-200/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600 border border-indigo-100">
            <CalendarIcon className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-xs sm:text-sm text-slate-800">
              選考スケジュールカレンダー
            </h3>
            <span className="bg-indigo-50 text-indigo-700 font-mono text-[11px] font-bold px-2 py-0.5 rounded-md border border-indigo-100">
              {year}年{month + 1}月
            </span>
            <span className="text-xs text-slate-500 hidden md:inline">
              (予定: <strong className="text-slate-800">{monthStats.totalCount}件</strong> / 確定: <strong className="text-indigo-600">{monthStats.confirmedCount}件</strong>)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isCollapsed && (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 text-xs shadow-2xs">
              <button
                onClick={handlePrevMonth}
                className="p-1 hover:bg-slate-100 rounded cursor-pointer transition-colors text-slate-600 hover:text-slate-900"
                title="前月"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleToday}
                className="px-2 py-0.5 hover:bg-slate-100 rounded text-[11px] font-semibold cursor-pointer transition-colors text-slate-700"
              >
                今月
              </button>
              <button
                onClick={handleNextMonth}
                className="p-1 hover:bg-slate-100 rounded cursor-pointer transition-colors text-slate-600 hover:text-slate-900"
                title="翌月"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer shadow-2xs"
          >
            {isCollapsed ? (
              <>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                <span>カレンダーを展開</span>
              </>
            ) : (
              <>
                <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                <span>折りたたむ</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Collapsed State Summary Row */}
      {isCollapsed && (
        <div className="px-4 py-2.5 bg-white flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-indigo-500 shrink-0" />
            <span className="font-semibold text-slate-800">
              直近の選考予定:
            </span>
            <span className="text-slate-600 font-medium">
              8/3(月) 15:00 佐々木 亮平 氏 (最終面接) / 8/5(水) 14:00 高橋 健太 氏 (1次面接)
            </span>
          </div>
          <button
            onClick={() => setIsCollapsed(false)}
            className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline text-[11px] cursor-pointer flex items-center gap-0.5"
          >
            <span>全日程を表示</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Expanded State Calendar Body */}
      {!isCollapsed && (
        <div className="p-4 space-y-4">
          
          {/* Calendar Grid */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
            {/* Weekday Header */}
            <div className="grid grid-cols-7 bg-slate-100/80 text-center text-[11px] font-bold text-slate-600 border-b border-slate-200 py-2">
              <span className="text-rose-600">日</span>
              <span>月</span>
              <span>火</span>
              <span>水</span>
              <span>木</span>
              <span>金</span>
              <span className="text-indigo-600">土</span>
            </div>

            {/* Days Matrix */}
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 bg-slate-50/30">
              {calendarDays.map((dayItem, index) => {
                const dayNum = dayItem.date.getDate();
                const isSelected = selectedDay === dayItem.dateKey;
                const isWeekend = dayItem.date.getDay() === 0 || dayItem.date.getDay() === 6;

                return (
                  <div
                    key={index}
                    onClick={() => setSelectedDay(dayItem.dateKey)}
                    className={`min-h-[88px] p-1.5 transition-all cursor-pointer flex flex-col justify-between ${
                      !dayItem.isCurrentMonth ? 'bg-slate-100/50 text-slate-400' : 'bg-white'
                    } ${
                      isSelected ? 'ring-2 ring-indigo-600 inset-0 z-10 bg-indigo-50/30' : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* Day Number Header */}
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-xs font-bold font-mono px-1.5 py-0.2 rounded-full ${
                          dayItem.isToday
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : isWeekend
                            ? 'text-slate-500'
                            : 'text-slate-700'
                        }`}
                      >
                        {dayNum}
                      </span>

                      {dayItem.candidates.length > 0 && (
                        <span className="bg-indigo-100 text-indigo-800 font-bold text-[9px] px-1.5 py-0.2 rounded-full">
                          {dayItem.candidates.length}件
                        </span>
                      )}
                    </div>

                    {/* Candidates Badges in Cell */}
                    <div className="space-y-1 flex-1 overflow-y-auto max-h-[60px] no-scrollbar">
                      {dayItem.candidates.slice(0, 2).map((c) => {
                        const phaseInfo = PHASE_LABELS[c.phase] || PHASE_LABELS.FIRST_INTERVIEW;
                        const time = getCandidateScheduleTime(c);

                        return (
                          <div
                            key={c.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCandidateId(c.id);
                            }}
                            className={`p-1 rounded text-[10px] font-medium border transition-colors cursor-pointer shadow-2xs truncate flex items-center justify-between gap-1 ${phaseInfo.bg} ${phaseInfo.text} ${phaseInfo.border}`}
                            title={`${c.name} (${phaseInfo.label}) - クリックして詳細開く`}
                          >
                            <span className="font-bold truncate">{c.name}</span>
                            {time && <span className="text-[9px] font-mono opacity-80 shrink-0">{time}</span>}
                          </div>
                        );
                      })}

                      {dayItem.candidates.length > 2 && (
                        <div className="text-[9px] text-slate-500 font-bold text-center">
                          +{dayItem.candidates.length - 2}件 他
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Day Candidates Detail Panel */}
          {selectedDay && (
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-600" />
                  <span className="font-bold text-xs text-slate-800">
                    {selectedDay} の選考スケジュール・候補者 ({selectedDayCandidates.length}件)
                  </span>
                </div>
                <span className="text-[10px] text-slate-500">
                  クリックで候補者の詳細カルテを開きます
                </span>
              </div>

              {selectedDayCandidates.length === 0 ? (
                <p className="text-xs text-slate-400 py-2 text-center">
                  この日の選考・面接予定はありません。
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                  {selectedDayCandidates.map((c) => {
                    const phaseInfo = PHASE_LABELS[c.phase] || PHASE_LABELS.FIRST_INTERVIEW;
                    const time = getCandidateScheduleTime(c);

                    return (
                      <div
                        key={c.id}
                        onClick={() => setSelectedCandidateId(c.id)}
                        className="bg-white p-2.5 rounded-xl border border-slate-200 hover:border-indigo-400 shadow-2xs hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-xs text-slate-900 hover:text-indigo-600 transition-colors">
                            {c.name}
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${phaseInfo.bg} ${phaseInfo.text} ${phaseInfo.border}`}>
                            {phaseInfo.label}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-600 flex items-center justify-between">
                          <span className="font-bold text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">{c.jobTitle}</span>
                          {time ? (
                            <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded text-[10px] flex items-center gap-1">
                              <Clock className="w-3 h-3 text-indigo-500 shrink-0" />
                              <span>{time}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">時間未定</span>
                          )}
                        </div>

                        <div className="text-[10px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
                          <span>エージェント: {c.agencyName}</span>
                          <span className="text-indigo-600 font-semibold hover:underline flex items-center gap-0.5">
                            <span>詳細を表示</span>
                            <ChevronRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      )}

    </div>
  );
};

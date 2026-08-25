import React, { useState } from 'react';
import { useATS } from '../context/ATSContext';
import { SelectionPhase, ScheduleStatus } from '../types';
import { AptitudeTestStatusBadge } from './AptitudeTestStatusBadge';
import { isAptitudeTestRelevantPhase } from '../lib/aptitudeTestStatus';
import { computeYieldMetrics, computeYieldMetricsByPosition } from '../lib/yieldMetrics';
import { 
  BarChart, 
  Bar, 
  LineChart,
  Line,
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell, 
  CartesianGrid, 
  Legend 
} from 'recharts';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  CheckCircle2, 
  Award, 
  Sparkles, 
  Building2, 
  Filter,
  Star,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Calendar,
  Briefcase,
  UserCheck,
  ArrowRight,
  MessageSquare,
  BarChart2,
  LineChart as LineChartIcon,
  Check,
  ChevronRight,
  Download
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { candidates, agencies, filters, setFilters, setSelectedCandidateId, positionOptions, showToast, sendApplicationsDigest } = useATS();
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  // 月単位では区切れない任意の期間（例: 8/5〜8/20）を分析したい場合の代替モード。オンの間は
  // selectedMonthの月選択を無視し、appliedDate(YYYY-MM-DD文字列比較)で絞り込む。開始日・終了日は
  // 片方だけの指定も可（片方が空ならその側は無制限）。
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [trendMetric, setTrendMetric] = useState<'referrals' | 'acceptances' | 'both'>('referrals');
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [matrixDisplayMode, setMatrixDisplayMode] = useState<'both' | 'count' | 'rate'>('both');

  // Filter candidates for metrics — own local filters (month + position), independent of the
  // sidebar's global filters (this view analyzes across agencies/staff/phase regardless of what
  // the Kanban/list screens happen to be filtered to).
  const displayCandidates = candidates.filter((c) => {
    if (useCustomRange) {
      if (customStartDate && c.appliedDate < customStartDate) return false;
      if (customEndDate && c.appliedDate > customEndDate) return false;
    } else if (selectedMonth !== 'ALL' && c.appliedMonth !== selectedMonth) {
      return false;
    }
    if (selectedPositions.length > 0 && !selectedPositions.includes(c.jobTitle)) return false;
    return true;
  });

  // エージェント別歩留まりは、上の期間・ポジション絞り込み(displayCandidates)と同じ対象で
  // 計算し直す。ATSContext側のyieldMetricsは常に全期間・全ポジションの実績なので、期間指定
  // モードに切り替えても「最高歩留まり会社」カードとマトリクス表がそれだけ絞り込みを無視した
  // 全期間の数字のまま変わらないように見えていた。
  const displayYieldMetrics = computeYieldMetrics(agencies, displayCandidates);

  // Total KPIs
  const totalApps = displayCandidates.length;
  const activeCandidates = displayCandidates.filter((c) => !['OFFER_ACCEPTED', 'REJECTED', 'DECLINED'].includes(c.phase)).length;
  const offerCount = displayCandidates.filter((c) => ['OFFER_ISSUED', 'OFFER_ACCEPTED'].includes(c.phase)).length;
  const acceptCount = displayCandidates.filter((c) => c.phase === 'OFFER_ACCEPTED').length;
  const offerAcceptRate = offerCount > 0 ? Math.round((acceptCount / offerCount) * 100) : 0;

  // Joining Scheduled Candidates (入社予定者: 内定承諾済 or 入社日設定済 or 内定通知済でフォロー中)
  const joiningCandidates = displayCandidates.filter(
    (c) => c.joiningDate || c.phase === 'OFFER_ACCEPTED' || c.phase === 'OFFER_ISSUED'
  );

  // Find Top Quality Agency (highest overall yield or offer count)
  const topAgency = [...displayYieldMetrics]
    .filter((m) => m.totalApplications >= 2)
    .sort((a, b) => b.overallYieldRate - a.overallYieldRate)[0];

  // 1. Phase Distribution Data for Recharts Bar Chart
  const phaseLabels: Record<SelectionPhase, string> = {
    DOCUMENT_SCREENING: '書類選考',
    CASUAL_INTERVIEW: 'カジュアル面談',
    FIRST_INTERVIEW: '1次面接',
    SECOND_INTERVIEW: '2次面接',
    FINAL_INTERVIEW: '最終面接',
    OFFER_ISSUED: '内定',
    OFFER_ACCEPTED: '承諾',
    REJECTED: '見送り',
    DECLINED: '選考辞退'
  };

  const phaseColors: Record<SelectionPhase, string> = {
    DOCUMENT_SCREENING: '#c7d2fe',  // indigo-200 (pipeline stage, not an outcome)
    CASUAL_INTERVIEW: '#a5b4fc',    // indigo-300
    FIRST_INTERVIEW: '#818cf8',     // indigo-400
    SECOND_INTERVIEW: '#6366f1',    // indigo-500
    FINAL_INTERVIEW: '#4f46e5',     // indigo-600
    OFFER_ISSUED: '#f59e0b',        // amber (genuine pending-decision state)
    OFFER_ACCEPTED: '#10b981',      // emerald (genuine success state)
    REJECTED: '#f43f5e',            // rose (自社都合の見送り)
    DECLINED: '#ea580c'             // orange (候補者都合の選考辞退)
  };

  const phaseDistributionData = Object.keys(phaseLabels).map((phaseKey) => {
    const key = phaseKey as SelectionPhase;
    const count = displayCandidates.filter((c) => c.phase === key).length;
    return {
      phase: phaseLabels[key],
      count,
      color: phaseColors[key]
    };
  });

  // 2. Extract Monthly Trends Data for Agencies
  const monthStrings = (candidates.map((c) => c.appliedMonth).filter(Boolean) as string[]);
  const availableMonths: string[] = Array.from(new Set(monthStrings)).sort();
  const targetMonths: string[] = availableMonths.length > 0 ? availableMonths : ['2026-05', '2026-06', '2026-07'];

  // A) Monthly Referral Trend (月別 推薦数・応募数)
  const monthlyReferralData = targetMonths.map((m) => {
    const row: Record<string, any> = { month: `${m.replace('-', '年')}月` };
    agencies.forEach((ag) => {
      row[ag.name] = candidates.filter((c) => c.appliedMonth === m && c.agencyId === ag.id).length;
    });
    return row;
  });

  // B) Monthly Offer Acceptance Trend (月別 内定承諾数)
  const monthlyAcceptanceData = targetMonths.map((m) => {
    const row: Record<string, any> = { month: `${m.replace('-', '年')}月` };
    agencies.forEach((ag) => {
      row[ag.name] = candidates.filter(
        (c) => c.appliedMonth === m && c.agencyId === ag.id && c.phase === 'OFFER_ACCEPTED'
      ).length;
    });
    return row;
  });

  // C) Overall Total Referrals vs Acceptances by Agency Comparison Data
  const agencyComparisonData = agencies.map((ag) => {
    const totalRef = displayCandidates.filter((c) => c.agencyId === ag.id).length;
    const totalAcc = displayCandidates.filter((c) => c.agencyId === ag.id && c.phase === 'OFFER_ACCEPTED').length;
    return {
      name: ag.name.split(' ')[0],
      agencyFullName: ag.name,
      '推薦数 (応募)': totalRef,
      '内定承諾数': totalAcc,
      '承諾率 (%)': totalRef > 0 ? Math.round((totalAcc / totalRef) * 100) : 0
    };
  });

  // Agencies are distinct categories, so each gets its own hue rather than shades of one
  // color — order is a validated colorblind-safe categorical sequence, kept fixed (never
  // reassigned by rank) so a given agency's color doesn't shift as filters change.
  const agencyChartColors = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

  // 画面に出ている「分析対象期間・選考ポジション」の絞り込み結果(displayCandidates)をそのまま
  // CSVに書き出す。ヘッダーの「CSVエクスポート」(ATSContext.exportCSV)はサイドバーの全体フィルター
  // 由来で全く別の絞り込み対象なので、あちらを再利用せずこのビュー専用に書き出す。
  const scheduleStatusLabels: Record<ScheduleStatus, string> = {
    UNARRANGED: '未手配',
    PROPOSING_DATES: '候補日提示中',
    SCHEDULE_CONFIRMED: '日程確定',
    WAITING_RESULT: '結果待ち'
  };

  const periodLabelForFilename = useCustomRange
    ? `${customStartDate || '開始日未指定'}_${customEndDate || '終了日未指定'}`
    : selectedMonth === 'ALL' ? '全期間' : selectedMonth;

  // Chatへの手動送信ボタン向けの、人が読む用の期間ラベル（periodLabelForFilenameはCSVファイル名
  // 向けの機械的な表記のため、別に用意する）。
  const periodLabelForChat = useCustomRange
    ? `${customStartDate || '指定なし'}〜${customEndDate || '指定なし'}`
    : selectedMonth === 'ALL' ? '全期間（累積）' : `${selectedMonth.replace('-', '年')}月`;

  const [isSendingDailyDigest, setIsSendingDailyDigest] = useState(false);
  const [isSendingPeriodDigest, setIsSendingPeriodDigest] = useState(false);

  const sendDailyDigest = async () => {
    setIsSendingDailyDigest(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const todaysCandidates = candidates.filter((c) => c.appliedDate === today);
      const todaysPositionGroups = computeYieldMetricsByPosition(agencies, todaysCandidates);
      await sendApplicationsDigest({
        kind: 'DAILY_APPLICATIONS_DIGEST',
        periodLabel: `本日（${today}）`,
        positionGroups: todaysPositionGroups
      });
    } finally {
      setIsSendingDailyDigest(false);
    }
  };

  const sendPeriodDigest = async () => {
    setIsSendingPeriodDigest(true);
    try {
      await sendApplicationsDigest({
        kind: 'PERIOD_APPLICATIONS_DIGEST',
        periodLabel: periodLabelForChat,
        positionGroups: computeYieldMetricsByPosition(agencies, displayCandidates)
      });
    } finally {
      setIsSendingPeriodDigest(false);
    }
  };

  const exportDashboardCSV = () => {
    const headers = ['候補者ID', '名前', '選考ポジション', '応募日', '担当エージェント', '社内担当者', '選考フェーズ', '次回調整状況'];
    const rows = displayCandidates.map((c) => [
      c.id,
      c.name,
      c.jobTitle,
      c.appliedDate,
      c.agencyName,
      c.assignees.join('; '),
      phaseLabels[c.phase],
      scheduleStatusLabels[c.scheduleStatus]
    ]);

    // 候補者一覧のあとに、画面のマトリクス表と同じ絞り込み(displayYieldMetrics)でエージェント別
    // サマリを付加する。応募数だけだと表内の他の数字と比較しづらいので、通過数・歩留まり率も
    // 画面表示と同じ列構成でそのまま出力する。
    const agencySummaryHeaders = ['エージェント名', '対応する採用担当', '応募数', '書類通過数', '1次面接通過数', '内定数', '内定承諾数', '総合歩留まり率(%)'];
    const agencySummaryRows = displayYieldMetrics
      .filter((m) => m.totalApplications > 0)
      .map((m) => {
        const agency = agencies.find((ag) => ag.name === m.agencyName);
        return [
          m.agencyName,
          (agency?.assignedStaffNames || []).join('; ') || '未設定',
          m.totalApplications,
          m.documentPassCount,
          m.firstInterviewPassCount,
          m.offerCount,
          m.acceptCount,
          m.overallYieldRate
        ];
      });

    const csvContent = 'data:text/csv;charset=utf-8,﻿' + [
      headers,
      ...rows,
      [],
      agencySummaryHeaders,
      ...agencySummaryRows
    ].map((e) => e.map((x) => `"${x}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `bloom_dashboard_${periodLabelForFilename}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`分析対象期間の絞り込み結果（${displayCandidates.length}名）をCSVでダウンロードしました`, 'success');
  };

  return (
    <div className="space-y-6 pb-12">
      
      {/* Top Header & Month Filter */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-lg text-slate-900">分析ダッシュボード & 歩留まり（転換率）KPI</h2>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-slate-500">
              紹介エージェントごとの推薦件数・通過率・最終承諾までの質をリアルタイム可視化
            </p>
            {candidates.some(c => c.isArchived) && (
              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-[11px] font-medium px-2 py-0.5 rounded-md border border-slate-200">
                <Check className="w-3 h-3 text-emerald-600" />
                過去・削除済み候補者データ（{candidates.filter(c => c.isArchived).length}名）反映済
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="text-slate-600 font-medium">分析対象期間:</span>
          {!useCustomRange && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-slate-50 text-slate-800 border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 font-semibold cursor-pointer shadow-2xs"
            >
              <option value="ALL">全期間（累積）</option>
              {[...availableMonths].reverse().map((m) => {
                const [y, mo] = m.split('-');
                return (
                  <option key={m} value={m}>{y}年{Number(mo)}月</option>
                );
              })}
            </select>
          )}
          {useCustomRange && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-slate-50 text-slate-800 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 font-semibold shadow-2xs"
              />
              <span className="text-slate-400">〜</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-slate-50 text-slate-800 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 font-semibold shadow-2xs"
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => setUseCustomRange((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
              useCustomRange
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}
          >
            期間指定（応募日で任意の範囲）
          </button>
          <button
            type="button"
            onClick={exportDashboardCSV}
            disabled={displayCandidates.length === 0}
            title="現在の分析対象期間・選考ポジションの絞り込み結果をCSVで出力"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            CSVエクスポート（{displayCandidates.length}名）
          </button>
          <button
            type="button"
            onClick={sendDailyDigest}
            disabled={isSendingDailyDigest}
            title="本日の応募数・エージェント別進捗をChatに手動送信（担当者マスタ・エージェント設定で「本日の応募状況」を有効にしたWebhook宛）"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {isSendingDailyDigest ? '送信中…' : '本日の応募状況を送信'}
          </button>
          <button
            type="button"
            onClick={sendPeriodDigest}
            disabled={isSendingPeriodDigest || displayCandidates.length === 0}
            title="現在の分析対象期間・選考ポジションの応募数・エージェント別状況をChatに手動送信（担当者マスタ・エージェント設定で「指定期間の応募状況」を有効にしたWebhook宛）"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {isSendingPeriodDigest ? '送信中…' : '指定期間の応募状況を送信'}
          </button>
        </div>

        {/* Position filter — own local selection, same positionOptions toggle pattern as the
            sidebar FilterBar, but scoped to this dashboard only. */}
        <div className="w-full pt-3 border-t border-slate-200/80 flex flex-wrap items-center gap-1.5">
          <span className="text-slate-600 font-medium flex items-center gap-1 shrink-0 text-xs">
            <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
            選考ポジション:
          </span>
          <button
            type="button"
            onClick={() => setSelectedPositions([])}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedPositions.length === 0
                ? 'bg-slate-800 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            全ポジション
          </button>
          {positionOptions.map((pos) => {
            const isSelected = selectedPositions.includes(pos);
            return (
              <button
                key={pos}
                type="button"
                onClick={() =>
                  setSelectedPositions((prev) =>
                    prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
                  )
                }
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
          {selectedPositions.length > 0 && (
            <span className="ml-auto text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full font-mono font-medium">
              選択中: <strong className="font-bold">{selectedPositions.join(', ')}</strong> ({selectedPositions.length}ポジション)
            </span>
          )}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">総応募・推薦数</p>
            <p className="text-xl font-bold text-slate-900 mt-1">{totalApps} <span className="text-xs text-slate-500 font-normal">名</span></p>
            <p className="text-[11px] text-indigo-600 mt-1 flex items-center gap-1 font-medium">
              <TrendingUp className="w-3 h-3" /> 全エージェント合計
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Users className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">現在選考中（アクティブ）</p>
            <p className="text-xl font-bold text-emerald-600 mt-1">{activeCandidates} <span className="text-xs text-slate-500 font-normal">名</span></p>
            <p className="text-[11px] text-emerald-600 mt-1 font-medium">選考パイプライン稼働中</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <Layers className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">入社予定者</p>
            <p className="text-xl font-bold text-slate-900 mt-1">
              {joiningCandidates.length} <span className="text-xs text-slate-500 font-normal">名</span>
            </p>
            <p className="text-[11px] text-amber-600 mt-1 font-medium">
              内定承諾: {acceptCount}名 / フォロー中
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <UserCheck className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">内定通知 / 承諾完了</p>
            <p className="text-xl font-bold text-slate-800 mt-1">
              {acceptCount} <span className="text-xs text-slate-500 font-normal">/ {offerCount} 名</span>
            </p>
            <p className="text-[11px] text-amber-600 mt-1 font-bold">
              内定承諾率: {offerAcceptRate}%
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <Award className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">最高歩留まり会社</p>
            <p className="text-xs font-bold text-indigo-900 mt-1 line-clamp-1">
              {topAgency ? topAgency.agencyName.split(' ')[0] : 'なし'}
            </p>
            <p className="text-[11px] text-indigo-700 mt-1 font-mono font-bold">
              総合通過: {topAgency ? topAgency.overallYieldRate : 0}%
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Award className="w-4 h-4" />
          </div>
        </div>

      </div>

      {/* SECTION: 選考サマリ・進行中候補者一覧 (Selection Summary with Candidate Face Photos) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              <span>選考サマリ・進行中候補者一覧</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              現在選考パイプラインで進行中の候補者（顔写真・選考フェーズ・担当者）
            </p>
          </div>
          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full self-start sm:self-auto shrink-0">
            アクティブ選考中: {displayCandidates.filter(c => !c.isArchived && !['OFFER_ACCEPTED', 'REJECTED', 'DECLINED'].includes(c.phase)).length}名
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {displayCandidates
            .filter(c => !c.isArchived && !['OFFER_ACCEPTED', 'REJECTED', 'DECLINED'].includes(c.phase))
            .slice(0, 6)
            .map((c) => (
              <div
                key={c.id}
                onClick={() => setSelectedCandidateId(c.id)}
                className="bg-slate-50/70 hover:bg-indigo-50/60 border border-slate-200 hover:border-indigo-300 rounded-xl p-3.5 transition-all cursor-pointer group shadow-2xs hover:shadow-xs space-y-2"
              >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    {c.avatarUrl ? (
                      <img
                        src={c.avatarUrl}
                        alt={c.name}
                        className="w-11 h-11 rounded-full object-cover border-2 border-white shadow-xs group-hover:border-indigo-300 transition-colors"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-indigo-100 text-indigo-700 font-extrabold text-sm flex items-center justify-center border-2 border-white shadow-xs">
                        {c.name.slice(0, 1)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors text-sm truncate">
                        {c.name}
                      </span>
                      {c.age && <span className="text-xs text-slate-400 font-mono">({c.age}歳)</span>}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{c.jobTitle} • {c.agencyName.split(' ')[0]}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">担当: {c.assignees.join(', ')}</p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="bg-indigo-100 text-indigo-900 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-indigo-200/60">
                    {c.phase === 'DOCUMENT_SCREENING' && '書類選考'}
                    {c.phase === 'CASUAL_INTERVIEW' && '面談'}
                    {c.phase === 'FIRST_INTERVIEW' && '1次面接'}
                    {c.phase === 'SECOND_INTERVIEW' && '2次面接'}
                    {c.phase === 'FINAL_INTERVIEW' && '最終面接'}
                    {c.phase === 'OFFER_ISSUED' && '内定提示'}
                  </span>
                  <span className="text-[10px] text-slate-400 flex items-center gap-0.5 group-hover:text-indigo-600 transition-colors font-medium">
                    詳細 <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
              {isAptitudeTestRelevantPhase(c) && (
                <div className="flex items-center justify-end">
                  <AptitudeTestStatusBadge candidate={c} />
                </div>
              )}
              </div>
            ))}
        </div>
      </div>

      {/* Yield Matrix Analysis Table (歩留まり・転換率マトリクス) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <span>エージェント別 歩留まり（転換率・通過率）マトリクス分析</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              各エージェントの「通過人数（絶対数）」と「フェーズ間通過率（％）」を定量対比
            </p>
          </div>

          {/* 表示モード切替トグル */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs shrink-0">
            <button
              type="button"
              onClick={() => setMatrixDisplayMode('both')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                matrixDisplayMode === 'both'
                  ? 'bg-white text-indigo-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              人数 ＆ 通過率（推奨）
            </button>
            <button
              type="button"
              onClick={() => setMatrixDisplayMode('count')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                matrixDisplayMode === 'count'
                  ? 'bg-white text-indigo-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              人数重視
            </button>
            <button
              type="button"
              onClick={() => setMatrixDisplayMode('rate')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                matrixDisplayMode === 'rate'
                  ? 'bg-white text-indigo-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              率重視
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                <th className="py-3 px-3 min-w-[140px]">エージェント名</th>
                <th className="py-3 px-3 text-center min-w-[90px]">推薦数 (応募)</th>
                <th className="py-3 px-3 text-center min-w-[120px]">
                  書類通過
                  <span className="text-[10px] text-slate-500 font-normal block">応募 → 書類</span>
                </th>
                <th className="py-3 px-3 text-center min-w-[120px]">
                  1次通過
                  <span className="text-[10px] text-slate-500 font-normal block">書類 → 1次</span>
                </th>
                <th className="py-3 px-3 text-center min-w-[120px]">
                  最終 / 内定
                  <span className="text-[10px] text-slate-500 font-normal block">1次 → 最終</span>
                </th>
                <th className="py-3 px-3 text-center min-w-[120px]">
                  内定承諾
                  <span className="text-[10px] text-slate-500 font-normal block">内定 → 承諾</span>
                </th>
                <th className="py-3 px-3 text-center min-w-[120px]">
                  総合歩留まり率
                  <span className="text-[10px] text-slate-500 font-normal block">承諾 / 推薦数</span>
                </th>
                <th className="py-3 px-3 text-center min-w-[110px]">評価・品質ランク</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {displayYieldMetrics.map((m) => {
                const isHighQuality = m.overallYieldRate >= 20 || m.acceptCount >= 1;
                return (
                  <tr key={m.agencyName} className="hover:bg-slate-50/80 transition-colors">
                    
                    {/* Agency Name */}
                    <td className="py-3.5 px-3 font-bold text-sm text-slate-900">
                      {m.agencyName}
                    </td>

                    {/* Total Applications Count */}
                    <td className="py-3.5 px-3 text-center">
                      <div className="font-extrabold text-base text-slate-900 font-mono">
                        {m.totalApplications} <span className="text-xs font-normal text-slate-500">名</span>
                      </div>
                    </td>

                    {/* Document Pass (Count & Rate) */}
                    <td className="py-3.5 px-3 text-center">
                      <div className="space-y-1">
                        {(matrixDisplayMode === 'both' || matrixDisplayMode === 'count') && (
                          <div className="font-extrabold text-sm text-indigo-950 font-mono">
                            {m.documentPassCount} <span className="text-xs font-normal text-slate-500">名</span>
                          </div>
                        )}
                        {(matrixDisplayMode === 'both' || matrixDisplayMode === 'rate') && (
                          <span className="inline-block bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold px-2 py-0.5 rounded text-xs font-mono">
                            {m.documentPassRate}%
                          </span>
                        )}
                        {matrixDisplayMode === 'both' && (
                          <span className="text-[10px] text-slate-400 block font-mono">
                            ({m.documentPassCount}/{m.totalApplications})
                          </span>
                        )}
                      </div>
                    </td>

                    {/* First Interview Pass (Count & Rate) */}
                    <td className="py-3.5 px-3 text-center">
                      <div className="space-y-1">
                        {(matrixDisplayMode === 'both' || matrixDisplayMode === 'count') && (
                          <div className="font-extrabold text-sm text-indigo-950 font-mono">
                            {m.firstInterviewPassCount} <span className="text-xs font-normal text-slate-500">名</span>
                          </div>
                        )}
                        {(matrixDisplayMode === 'both' || matrixDisplayMode === 'rate') && (
                          <span className="inline-block bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold px-2 py-0.5 rounded text-xs font-mono">
                            {m.firstInterviewPassRate}%
                          </span>
                        )}
                        {matrixDisplayMode === 'both' && (
                          <span className="text-[10px] text-slate-400 block font-mono">
                            ({m.firstInterviewPassCount}/{m.documentPassCount || 1})
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Final / Offer (Count & Rate) */}
                    <td className="py-3.5 px-3 text-center">
                      <div className="space-y-1">
                        {(matrixDisplayMode === 'both' || matrixDisplayMode === 'count') && (
                          <div className="font-extrabold text-sm text-amber-950 font-mono">
                            {m.offerCount} <span className="text-xs font-normal text-slate-500">名</span>
                          </div>
                        )}
                        {(matrixDisplayMode === 'both' || matrixDisplayMode === 'rate') && (
                          <span className="inline-block bg-amber-50 text-amber-700 border border-amber-200 font-bold px-2 py-0.5 rounded text-xs font-mono">
                            {m.offerRate}%
                          </span>
                        )}
                        {matrixDisplayMode === 'both' && (
                          <span className="text-[10px] text-slate-400 block font-mono">
                            ({m.offerCount}/{m.firstInterviewPassCount || 1})
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Offer Accept (Count & Rate) */}
                    <td className="py-3.5 px-3 text-center">
                      <div className="space-y-1">
                        {(matrixDisplayMode === 'both' || matrixDisplayMode === 'count') && (
                          <div className="font-extrabold text-sm text-emerald-950 font-mono">
                            {m.acceptCount} <span className="text-xs font-normal text-slate-500">名</span>
                          </div>
                        )}
                        {(matrixDisplayMode === 'both' || matrixDisplayMode === 'rate') && (
                          <span className="inline-block bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2 py-0.5 rounded text-xs font-mono">
                            {m.acceptRate}%
                          </span>
                        )}
                        {matrixDisplayMode === 'both' && (
                          <span className="text-[10px] text-slate-400 block font-mono">
                            ({m.acceptCount}/{m.offerCount || 1})
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Overall Yield */}
                    <td className="py-3.5 px-3 text-center font-mono">
                      <div className="inline-flex flex-col items-center">
                        <div className="bg-indigo-600 text-white border border-indigo-700 px-2.5 py-1 rounded-lg font-black text-xs shadow-2xs">
                          {m.overallYieldRate}%
                        </div>
                        <span className="text-[10px] text-slate-500 font-bold mt-1">
                          承諾 {m.acceptCount}名 / 推薦 {m.totalApplications}名
                        </span>
                      </div>
                    </td>

                    {/* Quality Rank Badge */}
                    <td className="py-3.5 px-3 text-center">
                      {isHighQuality ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold px-2 py-0.5 rounded-full">
                          <Star className="w-3 h-3 text-emerald-600 fill-emerald-600 shrink-0" />
                          <span>優良（高承諾）</span>
                        </span>
                      ) : m.totalApplications > 0 ? (
                        <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] px-2 py-0.5 rounded-full font-medium">
                          選考進行中
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">実績なし</span>
                      )}
                    </td>

                  </tr>
                );
              })}

              {/* Total Summary Row */}
              {(() => {
                const totalAppsCount = displayYieldMetrics.reduce((acc, m) => acc + m.totalApplications, 0);
                const totalDocPassCount = displayYieldMetrics.reduce((acc, m) => acc + m.documentPassCount, 0);
                const totalFirstPassCount = displayYieldMetrics.reduce((acc, m) => acc + m.firstInterviewPassCount, 0);
                const totalOfferCount = displayYieldMetrics.reduce((acc, m) => acc + m.offerCount, 0);
                const totalAcceptCount = displayYieldMetrics.reduce((acc, m) => acc + m.acceptCount, 0);

                const avgDocRate = totalAppsCount > 0 ? Math.round((totalDocPassCount / totalAppsCount) * 100) : 0;
                const avgFirstRate = totalDocPassCount > 0 ? Math.round((totalFirstPassCount / totalDocPassCount) * 100) : 0;
                const avgOfferRate = totalFirstPassCount > 0 ? Math.round((totalOfferCount / totalFirstPassCount) * 100) : 0;
                const avgAcceptRate = totalOfferCount > 0 ? Math.round((totalAcceptCount / totalOfferCount) * 100) : 0;
                const avgOverallYield = totalAppsCount > 0 ? Math.round((totalAcceptCount / totalAppsCount) * 100) : 0;

                return (
                  <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-300 text-slate-900">
                    <td className="py-3 px-3 text-sm font-black text-indigo-950">
                      全社合計 / 全体平均
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="font-black text-base font-mono text-indigo-950">
                        {totalAppsCount} <span className="text-xs font-bold text-slate-600">名</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="space-y-0.5">
                        <div className="font-extrabold text-sm text-indigo-950 font-mono">{totalDocPassCount} 名</div>
                        <span className="inline-block bg-indigo-200/80 text-indigo-900 font-extrabold px-2 py-0.5 rounded text-xs font-mono">
                          {avgDocRate}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="space-y-0.5">
                        <div className="font-extrabold text-sm text-indigo-950 font-mono">{totalFirstPassCount} 名</div>
                        <span className="inline-block bg-indigo-200/80 text-indigo-900 font-extrabold px-2 py-0.5 rounded text-xs font-mono">
                          {avgFirstRate}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="space-y-0.5">
                        <div className="font-extrabold text-sm text-amber-950 font-mono">{totalOfferCount} 名</div>
                        <span className="inline-block bg-amber-200/80 text-amber-900 font-extrabold px-2 py-0.5 rounded text-xs font-mono">
                          {avgOfferRate}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="space-y-0.5">
                        <div className="font-extrabold text-sm text-emerald-950 font-mono">{totalAcceptCount} 名</div>
                        <span className="inline-block bg-emerald-200/80 text-emerald-900 font-extrabold px-2 py-0.5 rounded text-xs font-mono">
                          {avgAcceptRate}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center font-mono">
                      <div className="inline-flex flex-col items-center">
                        <div className="bg-slate-900 text-white px-2.5 py-1 rounded-lg font-black text-xs shadow-2xs">
                          {avgOverallYield}%
                        </div>
                        <span className="text-[10px] text-slate-600 font-bold mt-0.5">
                          ({totalAcceptCount}/{totalAppsCount}名)
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center text-xs font-bold text-slate-500">
                      全体総括
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts Grid: Phase Distribution & Interactive Agency Monthly Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Chart 1: Current Selection Phase Distribution */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col">
          <div className="mb-4">
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-indigo-600" />
              <span>選考フェーズ別 滞留人数グラフ</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">現在のパイプラインにおける各選考段階の候補者数</p>
          </div>

          <div className="h-72 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={phaseDistributionData} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.8} />
                <XAxis 
                  dataKey="phase" 
                  stroke="#64748b" 
                  fontSize={11} 
                  interval={0} 
                  angle={-20} 
                  textAnchor="end" 
                />
                <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', color: '#0f172a', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any) => [`${value} 名`, '人数']}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={28}>
                  {phaseDistributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Interactive Monthly Agency Trends (Referrals vs Acceptances) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                <span>月別・エージェント別 推移グラフ</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {trendMetric === 'referrals' && 'エージェントごとの月次「推薦数（応募件数）」の推移'}
                {trendMetric === 'acceptances' && 'エージェントごとの月次「内定承諾数」の推移'}
                {trendMetric === 'both' && 'エージェント別の「累計推薦数」vs「内定承諾数」比較'}
              </p>
            </div>

            {/* Controls Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Metric Selector Tabs */}
              <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                <button
                  onClick={() => setTrendMetric('referrals')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    trendMetric === 'referrals' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  推薦数
                </button>
                <button
                  onClick={() => setTrendMetric('acceptances')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    trendMetric === 'acceptances' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  承諾数
                </button>
                <button
                  onClick={() => setTrendMetric('both')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    trendMetric === 'both' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  対比
                </button>
              </div>

              {/* Chart Type Toggle (Bar vs Line) */}
              {trendMetric !== 'both' && (
                <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                  <button
                    onClick={() => setChartType('bar')}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                      chartType === 'bar' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-400 hover:text-slate-700'
                    }`}
                    title="棒グラフ"
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setChartType('line')}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                      chartType === 'line' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-400 hover:text-slate-700'
                    }`}
                    title="折れ線グラフ"
                  >
                    <LineChartIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="h-72 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              {trendMetric === 'both' ? (
                <BarChart data={agencyComparisonData} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.8} />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', color: '#0f172a', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar dataKey="推薦数 (応募)" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="内定承諾数" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              ) : chartType === 'line' ? (
                <LineChart 
                  data={trendMetric === 'referrals' ? monthlyReferralData : monthlyAcceptanceData} 
                  margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.8} />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', color: '#0f172a', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  {agencies.map((ag, idx) => (
                    <Line 
                      key={ag.id} 
                      type="monotone"
                      dataKey={ag.name} 
                      stroke={agencyChartColors[idx % agencyChartColors.length]} 
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  ))}
                </LineChart>
              ) : (
                <BarChart 
                  data={trendMetric === 'referrals' ? monthlyReferralData : monthlyAcceptanceData} 
                  margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.8} />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', color: '#0f172a', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  {agencies.map((ag, idx) => (
                    <Bar 
                      key={ag.id} 
                      dataKey={ag.name} 
                      fill={agencyChartColors[idx % agencyChartColors.length]} 
                      radius={[4, 4, 0, 0]} 
                    />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Dedicated Dual Trend Side-by-Side Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        
        {/* Card 1: Monthly Referral Count Trend */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
            <div>
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                月別・エージェント別 推薦数（応募件数）の推移
              </h4>
              <p className="text-[11px] text-slate-500">毎月の各エージェントからの候補者推薦件数の月次グラフ</p>
            </div>
            <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
              推薦数
            </span>
          </div>

          <div className="h-60 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyReferralData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.8} />
                <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', color: '#0f172a', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                {agencies.map((ag, idx) => (
                  <Bar 
                    key={ag.id} 
                    dataKey={ag.name} 
                    fill={agencyChartColors[idx % agencyChartColors.length]} 
                    radius={[4, 4, 0, 0]} 
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Card 2: Monthly Offer Acceptance Count Trend */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
            <div>
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                月別・エージェント別 内定承諾数の推移
              </h4>
              <p className="text-[11px] text-slate-500">毎月の各エージェント経由で内定承諾に至った人数の月次グラフ</p>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
              承諾数
            </span>
          </div>

          <div className="h-60 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyAcceptanceData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.8} />
                <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', color: '#0f172a', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                {agencies.map((ag, idx) => (
                  <Bar 
                    key={ag.id} 
                    dataKey={ag.name} 
                    fill={agencyChartColors[idx % agencyChartColors.length]} 
                    radius={[4, 4, 0, 0]} 
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

    </div>
  );
};

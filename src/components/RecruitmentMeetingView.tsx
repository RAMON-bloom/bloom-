import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Calendar, 
  Users, 
  User,
  Plus, 
  Sparkles, 
  CheckCircle2, 
  Circle, 
  Copy, 
  ChevronRight, 
  ChevronDown,
  Edit3,
  Save,
  Clock,
  Building2,
  HardDrive,
  Search,
  RefreshCw,
  ListTodo,
  BarChart3,
  Trash2,
  ChevronUp,
  X,
  Mail
} from 'lucide-react';
import { useATS } from '../context/ATSContext';
import { RecruiterReport, MeetingActionItem } from '../types';
import { summarizeDriveMeetingLog, findCalendarMeetingNotes, findGmailMeetingNotes } from '../lib/driveApi';
import { HISTORICAL_MEETING_LOGS } from '../data/historicalMeetingLogs';
import { computeRecruiterYieldSnapshot, computeRecruiterPipelineSnapshot } from '../lib/yieldMetrics';

export const RecruitmentMeetingView: React.FC = () => {
  const {
    meetingLogs,
    addMeetingLog,
    updateMeetingLog,
    deleteMeetingLog,
    importHistoricalMeetingLogs,
    staffList,
    candidates,
    agencies,
    setSelectedCandidateId,
    showToast,
    driveAccessToken,
    connectDrive
  } = useATS();

  const hasMissingHistoricalLogs = HISTORICAL_MEETING_LOGS.some(
    (h) => !meetingLogs.some((m) => m.id === h.id)
  );

  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ id: string; title: string } | null>(null);

  // "担当者別選考報告シート" only makes sense for staff actually assigned to at least one
  // agency — falls back to the full staff list if no agency has an assignee yet, so the
  // section never ends up empty.
  const agencyAssignedStaffList = staffList.filter((st) =>
    agencies.some((ag) => ag.assignedStaffNames?.includes(st.name))
  );
  const recruiterStaffList = agencyAssignedStaffList.length > 0 ? agencyAssignedStaffList : staffList;

  // Shared "no report yet" fallback shape — used both when the user starts typing into a
  // recruiter's report before one has been created for them, and by the pipeline/yield snapshot
  // backfill effect below when a meeting log never had a per-recruiter report at all (e.g. the
  // pre-app historical logs, see historicalMeetingLogs.ts). Takes the meeting date explicitly
  // rather than closing over `activeMeeting` so it can be defined ahead of that variable's
  // not-yet-loaded early return.
  const buildEmptyRecruiterReport = (recruiterName: string, meetingDateISO: string): RecruiterReport => ({
    recruiterName,
    progressNotes: '',
    recommendationNotes: '',
    yieldNotes: '',
    upcomingInitiatives: [],
    yieldSnapshot: computeRecruiterYieldSnapshot(recruiterName, candidates, agencies, meetingDateISO.slice(0, 7))
  });

  // Newest MTG first in the picker, regardless of the order logs were created/synced in.
  const sortedMeetingLogs = [...meetingLogs].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Selected Meeting Date/Log. Defaults to the newest MTG by date (not meetingLogs[0], whose
  // array order isn't guaranteed to match date order once Drive sync/merge has touched it).
  // This is a plain useState rather than one seeded once at module scope, so every time this
  // view remounts (it's conditionally rendered per activeTab in App.tsx, so switching tabs away
  // and back unmounts/remounts it) the default re-resolves to whatever is newest at that moment.
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>(
    sortedMeetingLogs[0]?.id || ''
  );

  // Active Recruiter Selection
  const [selectedRecruiter, setSelectedRecruiter] = useState<string>(
    recruiterStaffList[0]?.name || ''
  );

  useEffect(() => {
    if (recruiterStaffList.length > 0 && !recruiterStaffList.some((s) => s.name === selectedRecruiter)) {
      setSelectedRecruiter(recruiterStaffList[0].name);
    }
  }, [recruiterStaffList, selectedRecruiter]);

  // Section Collapse/Expand States for clean UI
  const [isOverallOpen, setIsOverallOpen] = useState(true);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(true);

  // Modals & States
  const [isNewMeetingModalOpen, setIsNewMeetingModalOpen] = useState(false);

  // New Meeting Form
  const [newMtgDate, setNewMtgDate] = useState(new Date().toISOString().slice(0, 10));

  // Initiative Input
  const [newInitiativeInput, setNewInitiativeInput] = useState('');

  // New Global Action Item Input
  const [newActionItemText, setNewActionItemText] = useState('');
  const [newActionItemAssignee, setNewActionItemAssignee] = useState(staffList[0]?.name || '');

  const [isSearchingCalendar, setIsSearchingCalendar] = useState(false);
  const [isSearchingGmail, setIsSearchingGmail] = useState(false);

  // Agency Stats Toggle for Meeting View
  const [agencyStatsPeriod, setAgencyStatsPeriod] = useState<'MONTH' | 'ALL'>('MONTH');
  const [agencyScope, setAgencyScope] = useState<'ASSIGNED' | 'ALL'>('ASSIGNED');

  // Manual Note Save Feedback States
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  const activeMeeting = meetingLogs.find(m => m.id === selectedMeetingId) || meetingLogs[0];

  // Scrolls back to the top of the page on every switch, so picking a different card from
  // lower in a long list doesn't leave the (now-updated) header off-screen and unnoticed.
  // Instant, not smooth: an animated scroll plays out over several frames, and the browser's
  // scroll-anchoring compensates mid-animation as the newly selected meeting's (differently
  // sized) content lands above the fold, fighting the animation and settling somewhere other
  // than the top entirely. Jumping straight there after the DOM has already committed sidesteps
  // that race.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [selectedMeetingId]);

  // Backfills a frozen pipeline snapshot the first time this meeting+recruiter combination is
  // viewed without one — covers three cases: (1) the pre-app historical logs, whose
  // recruiterReports intentionally starts empty; (2) older per-app meetings saved before
  // yieldSnapshot existed at all; and (3) meetings saved after yieldSnapshot existed but before
  // pipelineCandidates was added to it — those already have a yieldSnapshot (with rate numbers
  // real users are relying on), so this patches just the missing pipelineCandidates field into the
  // existing snapshot rather than recomputing the whole thing, which would silently shift the
  // already-frozen rates to today's live numbers. Without this, opening any past MTG's report for a
  // recruiter who has no pipeline snapshot yet always shows today's live candidate phases instead of
  // what was true back then.
  //
  // For any meeting OTHER than the newest one, that snapshot then freezes forever — a past meeting's
  // "who was in progress" list shouldn't drift as candidates' phases/assignees keep changing after
  // the fact. But the NEWEST meeting is the one people actively work from day to day between
  // meetings (e.g. reassigning a candidate to a different recruiter mid-week), so its pipeline list
  // is kept live instead: this effect re-checks it against current candidates every time candidates
  // change, and only writes back when the recomputed list actually differs (skip-if-unchanged, so a
  // background poll that didn't touch anything relevant to this recruiter doesn't spam
  // updateMeetingLog every 20s).
  useEffect(() => {
    if (!activeMeeting) return;
    const recruiterName = (recruiterStaffList.find((s) => s.name === selectedRecruiter) || recruiterStaffList[0])?.name;
    if (!recruiterName) return;

    const isLatestMeeting = activeMeeting.id === sortedMeetingLogs[0]?.id;

    const existingReports = activeMeeting.recruiterReports || [];
    const reportIndex = existingReports.findIndex((r) => r.recruiterName === recruiterName);
    const existingSnapshot = reportIndex >= 0 ? existingReports[reportIndex].yieldSnapshot : undefined;
    if (existingSnapshot?.pipelineCandidates && !isLatestMeeting) return;

    let updatedReport: RecruiterReport;
    if (reportIndex < 0) {
      updatedReport = buildEmptyRecruiterReport(recruiterName, activeMeeting.date);
    } else if (!existingSnapshot) {
      updatedReport = {
        ...existingReports[reportIndex],
        yieldSnapshot: computeRecruiterYieldSnapshot(recruiterName, candidates, agencies, activeMeeting.date.slice(0, 7))
      };
    } else {
      const freshPipeline = computeRecruiterPipelineSnapshot(recruiterName, candidates);
      if (isLatestMeeting && JSON.stringify(freshPipeline) === JSON.stringify(existingSnapshot.pipelineCandidates)) return;
      updatedReport = {
        ...existingReports[reportIndex],
        yieldSnapshot: { ...existingSnapshot, pipelineCandidates: freshPipeline }
      };
    }

    const newReportsList = reportIndex >= 0
      ? existingReports.map((r, i) => (i === reportIndex ? updatedReport : r))
      : [...existingReports, updatedReport];

    updateMeetingLog({ ...activeMeeting, recruiterReports: newReportsList }, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMeeting?.id, selectedRecruiter, candidates]);

  const handleSaveNotes = (label?: string) => {
    if (!activeMeeting) return;
    setIsSaving(true);
    updateMeetingLog(activeMeeting, { silent: true });
    setTimeout(() => {
      setIsSaving(false);
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      setLastSavedTime(timeStr);
      showToast(label ? `【${label}】を保存しました` : '議事録を保存しました', 'success');
    }, 250);
  };

  // Active Selected Recruiter Object
  const currentRecruiterStaff = recruiterStaffList.find(s => s.name === selectedRecruiter) || recruiterStaffList[0];

  // Handle Action Item Toggle
  const handleToggleActionItem = (actionId: string) => {
    const updatedActionItems = activeMeeting.actionItems.map(item => 
      item.id === actionId ? { ...item, done: !item.done } : item
    );
    updateMeetingLog({
      ...activeMeeting,
      actionItems: updatedActionItems
    });
  };

  // Handle Add New Action Item
  const handleAddActionItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActionItemText.trim()) return;

    const newItem: MeetingActionItem = {
      id: `act-${Date.now()}`,
      text: newActionItemText.trim(),
      assignee: newActionItemAssignee,
      done: false
    };

    updateMeetingLog({
      ...activeMeeting,
      actionItems: [...activeMeeting.actionItems, newItem]
    }, { silent: true });

    setNewActionItemText('');
    showToast(`アクションアイテムを追加しました`, 'success');
  };

  // Handle Create New Meeting Log
  const handleCreateMeetingLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMtgDate.trim()) return;

    const dateObj = new Date(newMtgDate);
    const formattedTitle = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;

    // Frozen here (creation time) rather than left to compute live on every future render, so
    // this meeting keeps showing what the pass rates/agency yields actually were when it was
    // held — see computeRecruiterYieldSnapshot's doc comment.
    const initialReports: RecruiterReport[] = recruiterStaffList.map(s => ({
      recruiterName: s.name,
      progressNotes: '',
      recommendationNotes: '',
      yieldNotes: '',
      upcomingInitiatives: [],
      yieldSnapshot: computeRecruiterYieldSnapshot(s.name, candidates, agencies, newMtgDate.slice(0, 7))
    }));

    const newId = addMeetingLog({
      title: formattedTitle,
      date: `${newMtgDate}T10:00`,
      meetUrl: '',
      attendees: recruiterStaffList.map(s => s.name),
      overallSummary: '',
      recruiterReports: initialReports,
      actionItems: []
    });

    setSelectedMeetingId(newId);
    setIsNewMeetingModalOpen(false);
    showToast(`新しい採用MTGログ（${formattedTitle}）を作成しました`, 'success');
  };

  // Shared between the normal view and the "no MTG logs yet" empty state below — both need a way
  // to actually create the first/next meeting, so this can't live inside the JSX that only renders
  // once a meeting already exists.
  const newMeetingModal = isNewMeetingModalOpen && (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
            <Plus className="w-5 h-5 text-indigo-600" />
            新規採用MTGログの作成
          </h3>
          <button
            type="button"
            onClick={() => setIsNewMeetingModalOpen(false)}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleCreateMeetingLog} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              MTG実施日
            </label>
            <input
              type="date"
              required
              value={newMtgDate}
              onChange={(e) => setNewMtgDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
            <span className="font-bold text-slate-800 block">自動初期化される項目:</span>
            <p>・社内リクルーター全名の個別の報告枠を作成</p>
            <p>・全体の初期アクションアイテム（未完了タスク）を設定</p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsNewMeetingModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 font-bold hover:bg-slate-50 text-xs cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-colors shadow-2xs cursor-pointer"
            >
              作成
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // Previously this bailed out to a placeholder with no way to actually act on its own
  // instructions ("「新規MTGを作成」ボタンから作成してください") — the real button only existed
  // further down in the JSX below, which this early return skipped entirely. That left anyone who
  // deleted every MTG log (or a fresh install with none yet) stuck: the page said to click a
  // button that was never rendered. It now renders that same button here.
  if (!activeMeeting) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center text-slate-500 max-w-4xl mx-auto shadow-2xs space-y-4">
        <FileText className="w-12 h-12 text-indigo-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-800">MTGログが登録されていません</h3>
        <p className="text-sm mt-1">「新規MTGを作成」ボタンから作成してください。</p>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsNewMeetingModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>新規MTG作成</span>
          </button>
          {hasMissingHistoricalLogs && (
            <button
              type="button"
              onClick={() => importHistoricalMeetingLogs()}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold text-xs px-4 py-2.5 rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5"
              title="アプリ導入以前の採用社内MTG議事録（2026年6月〜8月分）を取り込みます"
            >
              <HardDrive className="w-4 h-4 text-indigo-600" />
              <span>過去の議事録を取り込む</span>
            </button>
          )}
        </div>
        {newMeetingModal}
      </div>
    );
  }

  // Finds this meeting's calendar event (matched by title + date, not a fixed Meet code — the
  // recurring series' Meet code has already changed a few times) and imports its auto-generated
  // "Gemini によるメモ" doc directly.
  const handleImportFromCalendar = async () => {
    if (!driveAccessToken) {
      showToast('先にヘッダー右上の「Drive連携」からGoogleにログインしてください', 'warning');
      await connectDrive();
      return;
    }

    setIsSearchingCalendar(true);

    // カレンダー検索とDrive本文取得を別々にtry/catchするのは、403/401の意味が異なるため。
    // カレンダー検索側の403/401は自分のOAuthトークンがカレンダースコープを持っていない場合で、
    // 再ログインが有効。一方カレンダー検索は成功した（＝予定・添付ファイルの存在は分かった）のに
    // Drive本文取得だけ403になる場合は、Google Meetの自動議事録がその会議の参加者にしか共有
    // されないファイル単位の権限の問題であり、自分がその回に参加していなければ再ログインしても
    // 直らない。
    let match;
    try {
      match = await findCalendarMeetingNotes(driveAccessToken, activeMeeting.date);
    } catch (err: any) {
      const message = err.message || '不明なエラー';
      showToast(
        message.includes('403') || message.includes('401')
          ? 'カレンダーへのアクセス権限が不足している可能性があります。ヘッダー右上の「Drive連携」から一度ログアウトし、再度ログインしてください。'
          : `カレンダーの検索に失敗しました: ${message}`,
        'warning'
      );
      setIsSearchingCalendar(false);
      return;
    }

    if (!match.found || !match.fileId) {
      showToast('この日付に一致する「採用社内MTG」の予定、またはGemini議事録の添付が見つかりませんでした。', 'warning');
      setIsSearchingCalendar(false);
      return;
    }

    try {
      const file = { id: match.fileId, name: match.fileName || 'Gemini によるメモ', mimeType: 'application/vnd.google-apps.document' };
      const { rawContent, summary } = await summarizeDriveMeetingLog(driveAccessToken, file);

      const updatedReports = (activeMeeting.recruiterReports || []).map((r) => ({
        ...r,
        progressLog: `【カレンダー抽出ログ】議事録「${file.name}」より ${r.recruiterName} 担当分の協議内容ログを取り込み完了`
      }));

      updateMeetingLog({
        ...activeMeeting,
        rawTranscript: rawContent,
        fetchedOverallLog: summary.summaryMarkdown,
        recruiterReports: updatedReports,
        sourceDriveFileId: file.id,
        sourceDriveFileName: file.name
      }, { silent: true });

      showToast(`カレンダーの予定「${match.eventSummary}」から議事録を取り込み、AI要約しました`, 'success');
    } catch (err: any) {
      const message = err.message || '不明なエラー';
      showToast(
        message.includes('403') || message.includes('401')
          ? `この会議の議事録ファイル（「${match.eventSummary}」）を開く権限がありません。Google Meetの自動議事録はその回の参加者にのみ共有されるため、参加していない場合は取り込めません（ログアウト・再ログインでは解決しません）。実際に参加した方に一度取り込んでいただければ、その要約は保存され、以降は参加していない方も含め誰でも閲覧できるようになります。`
          : `議事録の取得・要約に失敗しました: ${message}`,
        'warning'
      );
    } finally {
      setIsSearchingCalendar(false);
    }
  };

  // カレンダーの予定にGemini議事録の添付が見つからない/古い予定が既にカレンダーから消えている
  // ケース向けの代替ルート。Google Meetのメモ・文字起こし機能はDocを作成すると同時にその共有通知
  // メールを送るため、その本文中のDocsリンクからfileIdを取り出し、以降はカレンダー取込と全く同じ
  // summarizeDriveMeetingLogに渡す（取り込み先の処理は共通）。
  const handleImportFromGmail = async () => {
    if (!driveAccessToken) {
      showToast('先にヘッダー右上の「Drive連携」からGoogleにログインしてください', 'warning');
      await connectDrive();
      return;
    }

    setIsSearchingGmail(true);

    // カレンダー取込と同じ理由でGmail検索とDrive本文取得を別々にtry/catchする。Gmail検索側の
    // 403/401はgmail.readonlyスコープが未取得（旧ログインのまま）の場合がほとんどで再ログインが
    // 有効。Drive本文取得だけ403になる場合はカレンダー取込と同様、その会議の参加者にしか共有
    // されていないファイル単位の権限の問題。
    let match;
    try {
      match = await findGmailMeetingNotes(driveAccessToken, activeMeeting.date);
    } catch (err: any) {
      const message = err.message || '不明なエラー';
      showToast(
        message.includes('403') || message.includes('401')
          ? 'Gmailへのアクセス権限が不足している可能性があります。ヘッダー右上の「Drive連携」から一度ログアウトし、再度ログインしてください。'
          : `Gmailの検索に失敗しました: ${message}`,
        'warning'
      );
      setIsSearchingGmail(false);
      return;
    }

    if (!match.found || !match.fileId) {
      showToast('この日付付近に、議事録Docへのリンクを含む「採用社内MTG」関連のメールが見つかりませんでした。', 'warning');
      setIsSearchingGmail(false);
      return;
    }

    try {
      const file = { id: match.fileId, name: match.fileName || 'Gmail議事録', mimeType: 'application/vnd.google-apps.document' };
      const { rawContent, summary } = await summarizeDriveMeetingLog(driveAccessToken, file);

      const updatedReports = (activeMeeting.recruiterReports || []).map((r) => ({
        ...r,
        progressLog: `【Gmail抽出ログ】議事録「${file.name}」より ${r.recruiterName} 担当分の協議内容ログを取り込み完了`
      }));

      updateMeetingLog({
        ...activeMeeting,
        rawTranscript: rawContent,
        fetchedOverallLog: summary.summaryMarkdown,
        recruiterReports: updatedReports,
        sourceDriveFileId: file.id,
        sourceDriveFileName: file.name
      }, { silent: true });

      showToast(`Gmailのメール「${match.eventSummary}」から議事録を取り込み、AI要約しました`, 'success');
    } catch (err: any) {
      const message = err.message || '不明なエラー';
      showToast(
        message.includes('403') || message.includes('401')
          ? `このメールが指す議事録ファイル（「${match.eventSummary}」）を開く権限がありません。Google Meetの自動議事録はその回の参加者にのみ共有されるため、参加していない場合は取り込めません（ログアウト・再ログインでは解決しません）。実際に参加した方に一度取り込んでいただければ、その要約は保存され、以降は参加していない方も含め誰でも閲覧できるようになります。`
          : `議事録の取得・要約に失敗しました: ${message}`,
        'warning'
      );
    } finally {
      setIsSearchingGmail(false);
    }
  };

  // Live Update Helper for Recruiter Report Text Fields
  const handleUpdateRecruiterField = (
    recruiterName: string, 
    field: 'progressNotes' | 'recommendationNotes' | 'yieldNotes', 
    value: string
  ) => {
    const existingReports = activeMeeting.recruiterReports || [];
    const reportIndex = existingReports.findIndex(r => r.recruiterName === recruiterName);

    const targetReport = existingReports[reportIndex] || buildEmptyRecruiterReport(recruiterName, activeMeeting.date);

    const updatedReport = { ...targetReport, [field]: value };
    let newReportsList = [...existingReports];
    if (reportIndex >= 0) {
      newReportsList[reportIndex] = updatedReport;
    } else {
      newReportsList.push(updatedReport);
    }

    // キー入力のたびに呼ばれるため、他の通知種別と違い保存トースト無し(silent)。「保存しました」
    // が1文字ごとに出続けるとむしろ入力の妨げになる。updateMeetingLog自体はここでも即座に
    // setMeetingLogsを呼んでおり、ローカル状態への反映・自動バックアップの予約は他の変更と同じ
    // タイミングで行われる。
    updateMeetingLog({
      ...activeMeeting,
      recruiterReports: newReportsList
    }, { silent: true });
  };

  // Add Initiative Item to Recruiter Report
  const handleAddInitiative = (recruiterName: string) => {
    if (!newInitiativeInput.trim()) return;

    const existingReports = activeMeeting.recruiterReports || [];
    const reportIndex = existingReports.findIndex(r => r.recruiterName === recruiterName);
    const targetReport = existingReports[reportIndex] || buildEmptyRecruiterReport(recruiterName, activeMeeting.date);

    const updatedInitiatives = [...(targetReport.upcomingInitiatives || []), newInitiativeInput.trim()];
    const updatedReport = { ...targetReport, upcomingInitiatives: updatedInitiatives };

    let newReportsList = [...existingReports];
    if (reportIndex >= 0) {
      newReportsList[reportIndex] = updatedReport;
    } else {
      newReportsList.push(updatedReport);
    }

    updateMeetingLog({
      ...activeMeeting,
      recruiterReports: newReportsList
    }, { silent: true });

    setNewInitiativeInput('');
    showToast('取り組み項目を追加しました', 'success');
  };

  // Delete Initiative Item
  const handleDeleteInitiative = (recruiterName: string, index: number) => {
    const existingReports = activeMeeting.recruiterReports || [];
    const reportIndex = existingReports.findIndex(r => r.recruiterName === recruiterName);
    if (reportIndex < 0) return;

    const targetReport = existingReports[reportIndex];
    const updatedInitiatives = (targetReport.upcomingInitiatives || []).filter((_, i) => i !== index);
    const updatedReport = { ...targetReport, upcomingInitiatives: updatedInitiatives };

    let newReportsList = [...existingReports];
    newReportsList[reportIndex] = updatedReport;

    updateMeetingLog({
      ...activeMeeting,
      recruiterReports: newReportsList
    }, { silent: true });
    showToast('取り組み項目を削除しました', 'info');
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${label}をコピーしました`, 'info');
  };

  // Selected Recruiter's Report Object
  const currentReport = activeMeeting.recruiterReports?.find(
    r => r.recruiterName === (currentRecruiterStaff?.name || selectedRecruiter)
  );

  const yieldSnapshot = currentReport?.yieldSnapshot;

  // Candidates assigned to selected recruiter — the frozen snapshot wins when present, so a past
  // meeting's pipeline list keeps showing who was in progress (and at what phase) back when it was
  // held, instead of always reflecting today's live candidate phases. Checked on pipelineCandidates
  // specifically, not just yieldSnapshot: a meeting saved before that field existed still has a
  // yieldSnapshot (with rate numbers) but no pipelineCandidates — falling through to the live
  // filter below is what keeps that case from crashing on `.length`/`.map` of undefined. The
  // backfill effect above patches pipelineCandidates into those on next view, silently.
  const assignedCandidates = yieldSnapshot?.pipelineCandidates
    ? yieldSnapshot.pipelineCandidates
    : candidates.filter(
        c => !c.isArchived &&
        c.assignees.includes(currentRecruiterStaff?.name || selectedRecruiter) &&
        !['OFFER_ACCEPTED', 'REJECTED', 'DECLINED'].includes(c.phase)
      );

  // Agencies associated with selected recruiter
  const assignedAgencies = agencies.filter(
    ag => ag.assignedStaffNames?.includes(currentRecruiterStaff?.name || selectedRecruiter)
  );

  const meetingMonth = activeMeeting?.date ? activeMeeting.date.slice(0, 7) : new Date().toISOString().slice(0, 7);

  // Helper to compute metrics per agency for the meeting view
  const getAgencyStats = (agencyId: string) => {
    const agCandidates = candidates.filter(c => {
      if (c.agencyId !== agencyId) return false;
      if (agencyStatsPeriod === 'MONTH' && meetingMonth) {
        return c.appliedDate && c.appliedDate.startsWith(meetingMonth);
      }
      return true;
    });

    const total = agCandidates.length;
    const docPass = agCandidates.filter(c => c.phase !== 'DOCUMENT_SCREENING').length;
    const firstPass = agCandidates.filter(c => 
      ['SECOND_INTERVIEW', 'FINAL_INTERVIEW', 'OFFER_ISSUED', 'OFFER_ACCEPTED'].includes(c.phase)
    ).length;
    const offerCount = agCandidates.filter(c => 
      ['FINAL_INTERVIEW', 'OFFER_ISSUED', 'OFFER_ACCEPTED'].includes(c.phase)
    ).length;
    const acceptCount = agCandidates.filter(c => c.phase === 'OFFER_ACCEPTED').length;

    return {
      total,
      docPass,
      docPassRate: total > 0 ? Math.round((docPass / total) * 100) : 0,
      firstPass,
      firstPassRate: docPass > 0 ? Math.round((firstPass / docPass) * 100) : 0,
      offerCount,
      offerRate: firstPass > 0 ? Math.round((offerCount / firstPass) * 100) : 0,
      acceptCount,
      acceptRate: offerCount > 0 ? Math.round((acceptCount / offerCount) * 100) : 0,
      overallYieldRate: total > 0 ? Math.round((acceptCount / total) * 100) : 0
    };
  };

  // Recruiter assigned candidates detail metrics — live calculation, used only as a fallback for
  // meetings saved before yieldSnapshot existed (or a recruiter row that's somehow still missing
  // one). Whenever a snapshot is present it wins, so a past meeting keeps showing what was true
  // when it was held instead of drifting as candidates' phases change afterward.
  const assignedRecruiterCandidates = candidates.filter(
    c => c.assignees.includes(currentRecruiterStaff?.name || selectedRecruiter)
  );

  const totalAssignedAll = assignedRecruiterCandidates.length;
  const liveDocPassCount = assignedRecruiterCandidates.filter(c => c.phase !== 'DOCUMENT_SCREENING').length;
  const liveDocPassRate = totalAssignedAll > 0 ? Math.round((liveDocPassCount / totalAssignedAll) * 100) : 0;

  const liveFirstPassCount = assignedRecruiterCandidates.filter(c =>
    ['SECOND_INTERVIEW', 'FINAL_INTERVIEW', 'OFFER_ISSUED', 'OFFER_ACCEPTED'].includes(c.phase)
  ).length;
  const liveFirstPassRate = liveDocPassCount > 0 ? Math.round((liveFirstPassCount / liveDocPassCount) * 100) : 0;

  const liveFinalOfferCount = assignedRecruiterCandidates.filter(c =>
    ['FINAL_INTERVIEW', 'OFFER_ISSUED', 'OFFER_ACCEPTED'].includes(c.phase)
  ).length;

  const liveAcceptCount = assignedRecruiterCandidates.filter(c => c.phase === 'OFFER_ACCEPTED').length;

  const docPassRate = yieldSnapshot?.docPassRate ?? liveDocPassRate;
  const firstPassRate = yieldSnapshot?.firstPassRate ?? liveFirstPassRate;
  const finalOfferCount = yieldSnapshot?.finalOfferCount ?? liveFinalOfferCount;
  const acceptCount = yieldSnapshot?.acceptCount ?? liveAcceptCount;

  // Same snapshot-first rule for the per-agency breakdown below.
  const displayAgencyStats = yieldSnapshot
    ? yieldSnapshot.agencyStats
    : assignedAgencies.map((ag) => {
        const s = getAgencyStats(ag.id);
        return {
          agencyId: ag.id,
          agencyName: ag.name,
          total: s.total,
          docPassRate: s.docPassRate,
          firstPassRate: s.firstPassRate,
          acceptCount: s.acceptCount,
          overallYieldRate: s.overallYieldRate
        };
      });

  return (
    <div className="space-y-4 pb-10 font-sans max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row gap-4 items-start">

        {/* MEETING PICKER: every MTG as a summary card, newest first — click one to load its full detail */}
        <div className="w-full lg:w-64 shrink-0 space-y-2 lg:sticky lg:top-4">
          {sortedMeetingLogs.map((m) => {
            const isActive = m.id === activeMeeting.id;
            const summaryExcerpt = (m.overallSummary || '')
              .split('\n')
              .map((line) => line.replace(/^[・\s【】]+/, '').trim())
              .filter(Boolean)
              .slice(0, 2)
              .join(' ');

            return (
              <div
                key={m.id}
                onClick={() => setSelectedMeetingId(m.id)}
                className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer group ${
                  isActive
                    ? 'bg-indigo-50 border-indigo-400 ring-1 ring-indigo-200'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 min-w-0">
                    <Calendar className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span className="truncate">{m.title}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isActive && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.2 rounded-full">
                        <CheckCircle2 className="w-3 h-3" />
                        表示中
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmTarget({ id: m.id, title: m.title });
                      }}
                      title={`${m.title} のMTGログを削除`}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 cursor-pointer transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">
                  {summaryExcerpt || '概要未入力'}
                </p>
              </div>
            );
          })}
        </div>

        {/* ACTIVE MEETING DETAIL */}
        <div className="flex-1 min-w-0 space-y-4">

      {/* HEADER & CONTROL BAR */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Left: Title & Meeting Date Selector */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
            <FileText className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-extrabold text-slate-900 text-base sm:text-lg tracking-tight">
                採用MTG 統合議事録・報告ボード
              </h2>
              {isSaving ? (
                <span className="flex items-center gap-1 text-[11px] font-bold text-indigo-600">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  保存中...
                </span>
              ) : (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/80">
                  {lastSavedTime ? `${lastSavedTime} 保存完了` : '自動保存ON'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
              <span>実施日:</span>
              <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200 font-bold text-slate-800">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs">{activeMeeting.title}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Quick Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => handleSaveNotes()}
            disabled={isSaving}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
          >
            <Save className="w-4 h-4" />
            <span>全体保存</span>
          </button>

          <button
            type="button"
            onClick={handleImportFromCalendar}
            disabled={isSearchingCalendar}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold text-xs px-3 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            title="この実施日のカレンダー予定（採用社内MTG）に添付されたGemini議事録を自動で探して取り込みます"
          >
            <Calendar className={`w-4 h-4 text-indigo-600 ${isSearchingCalendar ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline">{isSearchingCalendar ? '検索中' : 'カレンダーから議事録取込'}</span>
          </button>

          <button
            type="button"
            onClick={handleImportFromGmail}
            disabled={isSearchingGmail}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold text-xs px-3 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            title="この実施日前後にGoogle Meetの議事録Docへのリンクを含む「採用社内MTG」関連のメールがGmailに届いていないか自動で探して取り込みます（要: 一度ログアウトしてGmail連携権限つきで再ログイン）"
          >
            <Mail className={`w-4 h-4 text-indigo-600 ${isSearchingGmail ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline">{isSearchingGmail ? '検索中' : 'Gmailから議事録取込'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsNewMeetingModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>新規MTG作成</span>
          </button>

          {hasMissingHistoricalLogs && (
            <button
              type="button"
              onClick={() => importHistoricalMeetingLogs()}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold text-xs px-3 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              title="アプリ導入以前の採用社内MTG議事録（2026年6月〜8月分）を取り込みます"
            >
              <HardDrive className="w-4 h-4 text-indigo-600" />
              <span className="hidden sm:inline">過去の議事録を取り込む</span>
            </button>
          )}
        </div>
      </div>

      {/* SECTION 1: 担当者別選考報告シート */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-4">

        {/* Section Header & Recruiter Quick Selector Tab Bar */}
        <div className="space-y-3 border-b border-slate-100 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              <h3 className="font-extrabold text-slate-900 text-base sm:text-lg">
                1. 担当者別 選考報告シート
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              担当者を選択して各人の進捗・メモを更新
            </span>
          </div>

          {/* Recruiter Quick Selector Buttons */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {recruiterStaffList.map((st) => {
              const isSelected = (currentRecruiterStaff?.name || selectedRecruiter) === st.name;
              const stSnapshot = activeMeeting.recruiterReports?.find(r => r.recruiterName === st.name)?.yieldSnapshot;
              const liveCandCount = candidates.filter(c => !c.isArchived && c.assignees.includes(st.name) && !['OFFER_ACCEPTED', 'REJECTED', 'DECLINED'].includes(c.phase)).length;
              // Same live-vs-frozen split as the main pipeline effect above: the newest meeting always
              // shows today's real count, older meetings keep showing what was true when frozen.
              const candCount = stSnapshot?.pipelineCandidates && activeMeeting.id !== sortedMeetingLogs[0]?.id
                ? stSnapshot.pipelineCandidates.length
                : liveCandCount;

              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setSelectedRecruiter(st.name)}
                  className={`px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-xs font-extrabold'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  <span>{st.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${
                    isSelected ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-200/80 text-slate-600'
                  }`}>
                    {st.department}
                  </span>
                  {candCount > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                      isSelected ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {candCount}名
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Recruiter Detail Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* Left Side (4 Cols): Assigned Candidates & Yield Quick Stats */}
          <div className="lg:col-span-4 space-y-4">
            
            {/* Candidates List */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900 text-xs flex items-center justify-between">
                <span>{currentRecruiterStaff?.name} の担当選考中 ({assignedCandidates.length}名)</span>
              </h4>

              {assignedCandidates.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {assignedCandidates.map((cand) => (
                    <div 
                      key={cand.id}
                      onClick={() => setSelectedCandidateId(cand.id)}
                      className="p-2.5 bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-2 group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {cand.avatarUrl ? (
                          <img
                            src={cand.avatarUrl}
                            alt={cand.name}
                            className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0 shadow-2xs group-hover:border-indigo-400 transition-colors"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-extrabold text-xs flex items-center justify-center shrink-0 border border-slate-200">
                            {cand.name.slice(0, 1)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors text-xs truncate">
                            {cand.name}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {cand.jobTitle}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="bg-indigo-100 text-indigo-900 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {cand.phase === 'DOCUMENT_SCREENING' && '書類選考'}
                          {cand.phase === 'CASUAL_INTERVIEW' && '面談'}
                          {cand.phase === 'FIRST_INTERVIEW' && '1次面接'}
                          {cand.phase === 'SECOND_INTERVIEW' && '2次面接'}
                          {cand.phase === 'FINAL_INTERVIEW' && '最終面接'}
                          {cand.phase === 'OFFER_ISSUED' && '内定提示'}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-400 italic">
                  担当選考中の候補者はいません
                </div>
              )}
            </div>

            {/* Yield Quick Stats Pill */}
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/90 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-700 block text-[11px]">【担当候補者の歩留まり指標】</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded shrink-0 ${yieldSnapshot ? 'text-slate-500 bg-slate-100 border border-slate-200' : 'text-amber-700 bg-amber-50 border border-amber-200'}`}>
                  {yieldSnapshot ? 'この実施日時点' : '現在のデータ（未保存）'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-medium block">書類通過率</span>
                  <span className="font-extrabold text-indigo-700 font-mono text-xs">{docPassRate}%</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-medium block">1次通過率</span>
                  <span className="font-extrabold text-indigo-700 font-mono text-xs">{firstPassRate}%</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-medium block">内定到達数</span>
                  <span className="font-extrabold text-indigo-700 font-mono text-xs">{finalOfferCount}名</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-medium block">内定承諾数</span>
                  <span className="font-extrabold text-emerald-700 font-mono text-xs">{acceptCount}名</span>
                </div>
              </div>
            </div>

            {/* Assigned Agencies Yield Pill / Card */}
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/90 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 block text-[11px] flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                  【担当エージェントの選考歩留まり】
                </span>
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
                  {displayAgencyStats.length}社 紐づき
                </span>
              </div>

              {displayAgencyStats.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
                  {displayAgencyStats.map((agStats) => (
                    <div key={agStats.agencyId} className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1.5 shadow-2xs">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-slate-900 text-xs truncate">{agStats.agencyName}</span>
                        <span className="text-[10px] font-mono font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200/80">
                          決定打率 {agStats.overallYieldRate}%
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-1 text-center text-[10px] bg-slate-50 p-1.5 rounded-md border border-slate-100 font-mono">
                        <div>
                          <span className="text-[9px] text-slate-400 block font-sans">推薦数</span>
                          <span className="font-bold text-slate-900">{agStats.total}名</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 block font-sans">書類通過</span>
                          <span className="font-bold text-indigo-700">{agStats.docPassRate}%</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 block font-sans">1次通過</span>
                          <span className="font-bold text-indigo-700">{agStats.firstPassRate}%</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 block font-sans">内定承諾</span>
                          <span className="font-bold text-emerald-700">{agStats.acceptCount}名</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 bg-white rounded-lg border border-slate-200 text-center text-[11px] text-slate-400 italic">
                  {currentRecruiterStaff?.name || selectedRecruiter} に紐づいている担当エージェントはありません
                </div>
              )}
            </div>

          </div>

          {/* Right Side (8 Cols): Structured Input & Notes */}
          <div className="lg:col-span-8 space-y-4">
            
            {/* Field 1: 選考進捗・ボトルネック */}
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-800 text-xs flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                  1. 選考進捗・ボトルネック報告
                </span>
                <span className="text-[11px] text-slate-400 font-normal">直接編集可能</span>
              </label>
              <textarea
                value={currentReport?.progressNotes || ''}
                onChange={(e) => handleUpdateRecruiterField(currentRecruiterStaff?.name || selectedRecruiter, 'progressNotes', e.target.value)}
                rows={3}
                className="w-full p-3 bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors leading-relaxed"
                placeholder="担当候補者の選考進捗や日程調整の状況、ボトルネックを入力..."
              />

              {currentReport?.progressLog && (
                <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-2.5 text-xs text-indigo-950 font-medium leading-relaxed">
                  <span className="font-extrabold text-indigo-900 flex items-center gap-1.5 mb-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    【AI/Drive抽出ログ】
                  </span>
                  {currentReport.progressLog}
                </div>
              )}
            </div>

            {/* Field 2: エージェント連携 & 所感 */}
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                2. エージェント連携・推薦所感メモ
              </label>
              <textarea
                value={currentReport?.recommendationNotes || ''}
                onChange={(e) => handleUpdateRecruiterField(currentRecruiterStaff?.name || selectedRecruiter, 'recommendationNotes', e.target.value)}
                rows={2}
                className="w-full p-3 bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors leading-relaxed"
                placeholder="エージェントごとの推薦質の評価や追加依頼の所感を入力..."
              />
            </div>

            {/* Field 3: 今後の取り組み・ToDo */}
            <div className="space-y-2">
              <label className="block font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                3. 今後の取り組み・次回アクション
              </label>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/90 space-y-2">
                <ul className="space-y-1.5">
                  {currentReport?.upcomingInitiatives && currentReport.upcomingInitiatives.length > 0 ? (
                    currentReport.upcomingInitiatives.map((init, idx) => (
                      <li key={idx} className="flex items-center justify-between gap-2 text-xs text-slate-800 font-medium bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />
                          <span className="truncate">{init}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteInitiative(currentRecruiterStaff?.name || selectedRecruiter, idx)}
                          className="text-slate-400 hover:text-rose-600 p-0.5 rounded cursor-pointer transition-colors"
                          title="削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))
                  ) : (
                    <li className="text-slate-400 italic text-xs">取り組み事項はまだありません。</li>
                  )}
                </ul>

                {/* Add Initiative Input Form */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={newInitiativeInput}
                    onChange={(e) => setNewInitiativeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddInitiative(currentRecruiterStaff?.name || selectedRecruiter);
                      }
                    }}
                    placeholder="新しいアクション項目を入力..."
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddInitiative(currentRecruiterStaff?.name || selectedRecruiter)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
                  >
                    追加
                  </button>
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* SECTION 2: 全体議事録・決定事項 & 全体ToDo (統合スマートカード) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden transition-all">
        {/* Header Bar */}
        <div 
          onClick={() => setIsOverallOpen(!isOverallOpen)}
          className="bg-slate-50/80 hover:bg-slate-100/80 p-4 border-b border-slate-200 flex items-center justify-between cursor-pointer select-none transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
              <ListTodo className="w-4 h-4" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
              2. 全体議事録・決定事項 & ToDo
            </h3>
            <span className="text-xs text-slate-500 font-normal hidden sm:inline">
              （全体アジェンダ、共通決定事項、アクションアイテム）
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full">
              未完了タスク: {activeMeeting.actionItems?.filter(a => !a.done).length || 0}件
            </span>
            {isOverallOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </div>
        </div>

        {/* Content Body */}
        {isOverallOpen && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

              {/* Left Column (6 cols): Overall Meeting Notes */}
              <div className="lg:col-span-6 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    全体決定事項・アジェンダメモ
                  </label>
                  <button
                    type="button"
                    onClick={() => handleSaveNotes('全体メモ')}
                    disabled={isSaving}
                    className="text-xs text-indigo-600 hover:underline font-bold flex items-center gap-1"
                  >
                    <Save className="w-3 h-3" />
                    <span>保存</span>
                  </button>
                </div>

                <textarea
                  value={activeMeeting.overallSummary || ''}
                  onChange={(e) => updateMeetingLog({ ...activeMeeting, overallSummary: e.target.value }, { silent: true })}
                  rows={5}
                  className="w-full p-3 bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed transition-colors"
                  placeholder="定例MTG全体の決定事項、会社方針の変更点や共有事項を入力..."
                />

                {/* AI / Drive Summary Box if present */}
                {activeMeeting.fetchedOverallLog && (
                  <div className="bg-indigo-50/80 border border-indigo-200/90 rounded-xl p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between border-b border-indigo-200/60 pb-1.5">
                      <span className="font-extrabold text-indigo-900 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        【AI / Drive 抽出要約】
                        {activeMeeting.sourceDriveFileName && (
                          <span className="ml-1 text-[10px] font-normal text-indigo-500 truncate max-w-[160px]">
                            ({activeMeeting.sourceDriveFileName})
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => copyToClipboard(activeMeeting.fetchedOverallLog || '', '要約ログ')}
                        className="font-bold text-indigo-700 hover:underline text-[11px]"
                      >
                        コピー
                      </button>
                    </div>
                    <div className="text-indigo-950 leading-relaxed whitespace-pre-wrap font-medium">
                      {activeMeeting.fetchedOverallLog}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column (6 cols): Action Items Checklist */}
              <div className="lg:col-span-6 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                    全体アクションアイテム・ToDo
                  </label>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {activeMeeting.actionItems?.filter(a => a.done).length || 0} / {activeMeeting.actionItems?.length || 0} 完了
                  </span>
                </div>

                {/* Add New Task Form */}
                <form onSubmit={handleAddActionItem} className="flex gap-2">
                  <input
                    type="text"
                    value={newActionItemText}
                    onChange={(e) => setNewActionItemText(e.target.value)}
                    placeholder="新しいToDoを入力..."
                    className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />

                  <select
                    value={newActionItemAssignee}
                    onChange={(e) => setNewActionItemAssignee(e.target.value)}
                    className="px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    {staffList.map((st) => (
                      <option key={st.id} value={st.name}>
                        {st.name}
                      </option>
                    ))}
                  </select>

                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
                  >
                    追加
                  </button>
                </form>

                {/* Checklist */}
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {activeMeeting.actionItems && activeMeeting.actionItems.length > 0 ? (
                    activeMeeting.actionItems.map((item) => (
                      <div 
                        key={item.id}
                        onClick={() => handleToggleActionItem(item.id)}
                        className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                          item.done 
                            ? 'bg-slate-50 border-slate-200 text-slate-400 line-through' 
                            : 'bg-white border-slate-200 hover:border-indigo-300 text-slate-800 shadow-2xs'
                        }`}
                      >
                        <div className="flex items-center gap-2 text-xs font-medium min-w-0">
                          {item.done ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          ) : (
                            <Circle className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                          )}
                          <span className="truncate">{item.text}</span>
                        </div>

                        <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.2 rounded-full shrink-0">
                          {item.assignee}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center text-xs text-slate-400 italic">
                      タスクは未登録です
                    </div>
                  )}
                </div>

              </div>

            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: エージェント推薦・選考歩留まり分析 (折りたたみ統合コンテナ) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden transition-all">
        {/* Header Bar */}
        <div 
          onClick={() => setIsAnalyticsOpen(!isAnalyticsOpen)}
          className="bg-slate-50/80 hover:bg-slate-100/80 p-4 border-b border-slate-200 flex items-center justify-between cursor-pointer select-none transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
              <BarChart3 className="w-4 h-4" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
              3. エージェント推薦・選考歩留まり分析
            </h3>
            <span className="text-xs text-slate-500 font-normal hidden sm:inline">
              （各エージェントからの推薦数、書類・1次通過率、オファー承諾打率）
            </span>
          </div>

          <div className="flex items-center gap-3">
            {isAnalyticsOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </div>
        </div>

        {/* Content Body */}
        {isAnalyticsOpen && (
          <div className="p-4 space-y-4">
            {/* Filter Switches */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <span className="text-xs font-bold text-slate-700">集計条件フィルター:</span>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex items-center gap-0.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setAgencyStatsPeriod('MONTH')}
                    className={`px-3 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                      agencyStatsPeriod === 'MONTH'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    当月 ({meetingMonth.replace('-', '/')})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgencyStatsPeriod('ALL')}
                    className={`px-3 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                      agencyStatsPeriod === 'ALL'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    全期間
                  </button>
                </div>

                <div className="flex items-center gap-0.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setAgencyScope('ASSIGNED')}
                    className={`px-3 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                      agencyScope === 'ASSIGNED'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    担当社 ({assignedAgencies.length}社)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgencyScope('ALL')}
                    className={`px-3 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                      agencyScope === 'ALL'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    全社 ({agencies.length}社)
                  </button>
                </div>
              </div>
            </div>

            {/* Aggregate KPI Strip */}
            {(() => {
              const targetAgencies = agencyScope === 'ASSIGNED' ? assignedAgencies : agencies;
              
              let sumApps = 0;
              let sumDocPass = 0;
              let sumFirstPass = 0;
              let sumOffer = 0;
              let sumAccept = 0;

              targetAgencies.forEach(ag => {
                const st = getAgencyStats(ag.id);
                sumApps += st.total;
                sumDocPass += st.docPass;
                sumFirstPass += st.firstPass;
                sumOffer += st.offerCount;
                sumAccept += st.acceptCount;
              });

              return (
                <div className="space-y-4">
                  
                  {/* 5 KPI Pills */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center text-xs">
                    <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
                      <span className="text-[10px] text-slate-500 font-bold block">1. 推薦 (応募)</span>
                      <span className="text-base font-black text-slate-900 font-mono mt-0.5 block">{sumApps} <span className="text-xs font-normal text-slate-500">名</span></span>
                    </div>

                    <div className="bg-indigo-50/70 border border-indigo-200 p-2.5 rounded-xl">
                      <span className="text-[10px] text-indigo-700 font-bold block">2. 書類通過</span>
                      <span className="text-base font-black text-indigo-900 font-mono mt-0.5 block">{sumDocPass} <span className="text-xs font-normal text-indigo-600">名</span></span>
                      <span className="text-[10px] text-indigo-600 font-mono block">({sumApps > 0 ? Math.round((sumDocPass / sumApps) * 100) : 0}%)</span>
                    </div>

                    <div className="bg-indigo-50/70 border border-indigo-200 p-2.5 rounded-xl">
                      <span className="text-[10px] text-indigo-700 font-bold block">3. 1次面接通過</span>
                      <span className="text-base font-black text-indigo-900 font-mono mt-0.5 block">{sumFirstPass} <span className="text-xs font-normal text-indigo-600">名</span></span>
                      <span className="text-[10px] text-indigo-600 font-mono block">({sumDocPass > 0 ? Math.round((sumFirstPass / sumDocPass) * 100) : 0}%)</span>
                    </div>

                    <div className="bg-indigo-50/70 border border-indigo-200 p-2.5 rounded-xl">
                      <span className="text-[10px] text-indigo-700 font-bold block">4. 最終 / 内定</span>
                      <span className="text-base font-black text-indigo-900 font-mono mt-0.5 block">{sumOffer} <span className="text-xs font-normal text-indigo-600">名</span></span>
                      <span className="text-[10px] text-indigo-600 font-mono block">({sumFirstPass > 0 ? Math.round((sumOffer / sumFirstPass) * 100) : 0}%)</span>
                    </div>

                    <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl col-span-2 sm:col-span-1">
                      <span className="text-[10px] text-emerald-800 font-bold block">5. 内定承諾</span>
                      <span className="text-base font-black text-emerald-950 font-mono mt-0.5 block">{sumAccept} <span className="text-xs font-normal text-emerald-700">名</span></span>
                      <span className="text-[10px] text-emerald-700 font-mono block">({sumApps > 0 ? Math.round((sumAccept / sumApps) * 100) : 0}%)</span>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                          <th className="py-2.5 px-3.5">エージェント名</th>
                          <th className="py-2.5 px-2 text-center">推薦数</th>
                          <th className="py-2.5 px-2 text-center">書類通過</th>
                          <th className="py-2.5 px-2 text-center">1次通過</th>
                          <th className="py-2.5 px-2 text-center">最終 / 内定</th>
                          <th className="py-2.5 px-2 text-center">内定承諾</th>
                          <th className="py-2.5 px-2 text-center">決定打率</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {targetAgencies.length > 0 ? (
                          targetAgencies.map((ag) => {
                            const st = getAgencyStats(ag.id);
                            return (
                              <tr key={ag.id} className="hover:bg-slate-50/60 transition-colors">
                                <td className="py-2.5 px-3.5 font-bold text-slate-900">
                                  {ag.name}
                                </td>
                                <td className="py-2.5 px-2 text-center font-mono font-extrabold text-slate-900">
                                  {st.total} <span className="text-[10px] font-normal text-slate-400">名</span>
                                </td>
                                <td className="py-2.5 px-2 text-center">
                                  <div className="font-mono font-bold text-indigo-900 text-xs">
                                    {st.docPass} <span className="text-[10px] text-slate-400 font-normal">名</span>
                                  </div>
                                  <span className="text-[10px] text-indigo-600 font-mono bg-indigo-50 px-1.5 py-0.2 rounded font-semibold">
                                    {st.docPassRate}%
                                  </span>
                                </td>
                                <td className="py-2.5 px-2 text-center">
                                  <div className="font-mono font-bold text-indigo-900 text-xs">
                                    {st.firstPass} <span className="text-[10px] text-slate-400 font-normal">名</span>
                                  </div>
                                  <span className="text-[10px] text-indigo-600 font-mono bg-indigo-50 px-1.5 py-0.2 rounded font-semibold">
                                    {st.firstPassRate}%
                                  </span>
                                </td>
                                <td className="py-2.5 px-2 text-center">
                                  <div className="font-mono font-bold text-indigo-900 text-xs">
                                    {st.offerCount} <span className="text-[10px] text-slate-400 font-normal">名</span>
                                  </div>
                                  <span className="text-[10px] text-indigo-600 font-mono bg-indigo-50 px-1.5 py-0.2 rounded font-semibold">
                                    {st.offerRate}%
                                  </span>
                                </td>
                                <td className="py-2.5 px-2 text-center">
                                  <div className="font-mono font-bold text-emerald-950 text-xs">
                                    {st.acceptCount} <span className="text-[10px] text-slate-400 font-normal">名</span>
                                  </div>
                                  <span className="text-[10px] text-emerald-700 font-mono bg-emerald-50 px-1.5 py-0.2 rounded font-semibold">
                                    {st.acceptRate}%
                                  </span>
                                </td>
                                <td className="py-2.5 px-2 text-center">
                                  <span className="inline-block bg-emerald-600 text-white font-extrabold px-2.5 py-0.5 rounded text-[11px] font-mono shadow-2xs">
                                    {st.overallYieldRate}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={7} className="py-6 text-center text-slate-400 italic">
                              対象のエージェントデータがありません
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                </div>
              );
            })()}

          </div>
        )}
      </div>

        </div>
      </div>

      {/* DELETE MEETING LOG CONFIRMATION MODAL */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">MTGログの削除</h3>
                <p className="text-xs text-slate-500 mt-0.5">本当に削除してもよろしいですか？</p>
              </div>
            </div>

            <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200 font-medium">
              対象: <span className="font-bold text-slate-900">{deleteConfirmTarget.title}</span>
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
                  deleteMeetingLog(deleteConfirmTarget.id);
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

      {/* NEW MEETING LOG MODAL */}
      {newMeetingModal}

    </div>
  );
};

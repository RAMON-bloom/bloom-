import React, { useEffect, useState } from 'react';
import { useATS } from '../context/ATSContext';
import { X, EyeOff, FolderSync, UserPlus, FilePlus, Copy } from 'lucide-react';
import { SelectionPhase, DriveSyncDuplicateFolder, DriveSyncPhaseMoveDirection } from '../types';

const PHASE_LABELS: Record<SelectionPhase, string> = {
  DOCUMENT_SCREENING: '書類選考',
  CASUAL_INTERVIEW: 'カジュアル面談',
  FIRST_INTERVIEW: '1次面接',
  SECOND_INTERVIEW: '2次面接',
  FINAL_INTERVIEW: '最終面接',
  OFFER_ISSUED: '内定通知',
  OFFER_ACCEPTED: '内定承諾',
  REJECTED: '見送り',
  DECLINED: '選考辞退'
};

// Which folder to keep by default when a candidate's resume turns out to be duplicated across
// phase folders: the one the app already links to wins (no Drive change needed at all), then the
// one sitting in the folder matching the candidate's current phase, then whichever option came
// first — always a folder id in options, never left unset.
type ImportDetail = { jobTitle?: string; assignee?: string; agencyId?: string };
type ImportDetails = Record<string, ImportDetail>;

const BulkButtons: React.FC<{ onChange: (on: boolean) => void }> = ({ onChange }) => (
  <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold">
    <button
      type="button"
      onClick={() => onChange(true)}
      className="px-2 py-0.5 rounded-md border border-slate-200 bg-white text-indigo-700 hover:border-indigo-300 cursor-pointer"
    >
      すべて選択
    </button>
    <button
      type="button"
      onClick={() => onChange(false)}
      className="px-2 py-0.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:border-slate-300 cursor-pointer"
    >
      すべて解除
    </button>
  </span>
);

const defaultKeepFolderId =(group: DriveSyncDuplicateFolder): string => {
  const current = group.options.find((o) => o.isCurrent);
  if (current) return current.folderId;
  const phaseMatch = group.options.find((o) => o.phase === group.candidatePhase);
  return (phaseMatch || group.options[0]).folderId;
};

// Reviews the diff previewDriveSync computed before anything is actually applied. Phase moves
// default checked (existing, already-known candidates — low risk, usually a deliberate Drive
// reorganization). New imports default UNCHECKED — this is the actual source of the "past data
// silently lands in 選考" complaint, so bringing an old resume into the active pipeline now
// requires an explicit opt-in per item, with a one-click way to permanently ignore it instead.
// Duplicate folders default UNCHECKED too — deciding which of a candidate's Drive folders is the
// "real" one and discarding the rest is exactly the kind of judgment call that shouldn't happen
// silently, even though the discard itself only moves data into 99_完全削除済み rather than
// deleting it outright.
export const DriveSyncPreviewModal: React.FC = () => {
  const { driveSyncPreview, applyDriveSync, cancelDriveSyncPreview, isApplyingDriveSync, positionOptions, staffList, agencies } = useATS();

  const [checkedMoves, setCheckedMoves] = useState<Set<string>>(new Set());
  // Per phase-mismatch row: which side wins. Seeded from previewDriveSync's suggestedDirection
  // (app→Drive whenever the app clearly holds the newer decision), but always overridable here.
  const [moveDirections, setMoveDirections] = useState<Map<string, DriveSyncPhaseMoveDirection>>(new Map());
  const [checkedDocUpdates, setCheckedDocUpdates] = useState<Set<string>>(new Set());
  const [checkedImports, setCheckedImports] = useState<Set<string>>(new Set());
  const [checkedDuplicates, setCheckedDuplicates] = useState<Set<string>>(new Set());
  const [duplicateKeepSelections, setDuplicateKeepSelections] = useState<Map<string, string>>(new Map());
  const [ignoredKeys, setIgnoredKeys] = useState<Set<string>>(new Set());
  // Per new-import row: 選考ポジション / 主担当 / エージェント. Drive holds none of this, so without
  // picking here an imported candidate lands with a blank position and the first staff member.
  const [importDetails, setImportDetails] = useState<ImportDetails>({});
  const [showPastImports, setShowPastImports] = useState(false);
  const [showIgnoredImports, setShowIgnoredImports] = useState(false);
  // Rows from the 無視中 list taken off the ignore list in this review (applied on 反映).
  const [unignoredKeys, setUnignoredKeys] = useState<Set<string>>(new Set());

  // driveSyncPreview gets a fresh object identity every time previewDriveSync runs, so this
  // re-initializes selection state (every checkbox starts unchecked) each
  // time a new review opens, without needing the modal to unmount/remount.
  useEffect(() => {
    if (driveSyncPreview) {
      setCheckedMoves(new Set());
      setMoveDirections(new Map(driveSyncPreview.phaseMoves.map((m) => [m.candidateId, m.suggestedDirection])));
      // Everything starts unchecked: each item needs an explicit opt-in (一括選択 is available).
      setCheckedDocUpdates(new Set());
      setCheckedImports(new Set());
      setCheckedDuplicates(new Set());
      setDuplicateKeepSelections(
        new Map(driveSyncPreview.duplicateFolders.map((g) => [g.candidateId, defaultKeepFolderId(g)]))
      );
      setIgnoredKeys(new Set());
      setUnignoredKeys(new Set());
      setImportDetails({});
    }
  }, [driveSyncPreview]);

  if (!driveSyncPreview) return null;

  const toggleMove = (id: string) => {
    setCheckedMoves((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDocUpdate = (candidateId: string) => {
    setCheckedDocUpdates((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  };

  const toggleImport = (key: string) => {
    setCheckedImports((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const ignoreImport = (key: string) => {
    setIgnoredKeys((prev) => new Set(prev).add(key));
    setCheckedImports((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const toggleDuplicate = (candidateId: string) => {
    setCheckedDuplicates((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  };

  const selectDuplicateOption = (candidateId: string, folderId: string) => {
    setDuplicateKeepSelections((prev) => new Map(prev).set(candidateId, folderId));
  };

  const isStillIgnored = (e: (typeof driveSyncPreview.newImports)[number]) => !!e.isIgnored && !unignoredKeys.has(e.key);
  const allVisibleImports = driveSyncPreview.newImports.filter((e) => !isStillIgnored(e) && !ignoredKeys.has(e.key));
  // Folders someone chose 無視する earlier. Hidden unless opened; each can be imported directly
  // (checkbox) or put back into the normal lists (無視を解除).
  const ignoredImports = driveSyncPreview.newImports.filter(isStillIgnored);
  const unignoreImport = (key: string) => setUnignoredKeys((prev) => new Set(prev).add(key));
  // Past data (見送り・選考辞退 folders, or nothing in the folder touched for 10+ days) is listed
  // separately, collapsed, so the actionable imports aren't buried under history.
  const visibleImports = allVisibleImports.filter((e) => !e.isPast);
  const pastImports = allVisibleImports.filter((e) => e.isPast);
  const ignoreAllPast = () => {
    setIgnoredKeys((prev) => new Set([...prev, ...pastImports.map((e) => e.key)]));
    setCheckedImports((prev) => new Set([...prev].filter((k) => !pastImports.some((e) => e.key === k))));
  };

  const setDetail = (key: string, patch: ImportDetail) =>
    setImportDetails((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  // Applies one value to every checked import (all visible ones when none are checked yet).
  const setDetailForAll = (patch: ImportDetail) =>
    setImportDetails((prev) => {
      const next = { ...prev };
      const checked = visibleImports.filter((e) => checkedImports.has(e.key));
      (checked.length > 0 ? checked : visibleImports).forEach((e) => {
        next[e.key] = { ...next[e.key], ...patch };
      });
      return next;
    });

  const selectAllMoves = (on: boolean) =>
    setCheckedMoves(on ? new Set(driveSyncPreview.phaseMoves.map((m) => m.candidateId)) : new Set());
  const selectAllDocUpdates = (on: boolean) =>
    setCheckedDocUpdates(on ? new Set(driveSyncPreview.docUpdates.map((d) => d.candidateId)) : new Set());
  const selectAllImports = (on: boolean) =>
    setCheckedImports(on ? new Set(visibleImports.map((e) => e.key)) : new Set());
  const selectAllDuplicates = (on: boolean) =>
    setCheckedDuplicates(on ? new Set(driveSyncPreview.duplicateFolders.map((g) => g.candidateId)) : new Set());
  const selectEverything = (on: boolean) => {
    selectAllMoves(on);
    selectAllDocUpdates(on);
    selectAllImports(on);
    selectAllDuplicates(on);
  };
  const selectedTotal = checkedMoves.size + checkedDocUpdates.size + checkedImports.size + checkedDuplicates.size;

  const setMoveDirection = (candidateId: string, direction: DriveSyncPhaseMoveDirection) => {
    setMoveDirections((prev) => new Map(prev).set(candidateId, direction));
  };
  const directionOf = (candidateId: string): DriveSyncPhaseMoveDirection =>
    moveDirections.get(candidateId) ||
    driveSyncPreview.phaseMoves.find((m) => m.candidateId === candidateId)?.suggestedDirection ||
    'DRIVE_TO_APP';

  const handleApply = () => {
    const checkedMoveIds = Array.from(checkedMoves);
    applyDriveSync({
      phaseMoveCandidateIds: checkedMoveIds.filter((id) => directionOf(id) === 'DRIVE_TO_APP'),
      driveFolderMoveCandidateIds: checkedMoveIds.filter((id) => directionOf(id) === 'APP_TO_DRIVE'),
      importKeys: Array.from(checkedImports),
      ignoreKeys: Array.from(ignoredKeys),
      unignoreKeys: Array.from(unignoredKeys),
      importDetails,
      docUpdateCandidateIds: Array.from(checkedDocUpdates),
      duplicateResolutions: Array.from(checkedDuplicates)
        .map((candidateId) => ({ candidateId, keepFolderId: duplicateKeepSelections.get(candidateId) || '' }))
        .filter((r) => r.keepFolderId)
    });
  };

  const renderImportRow = (e: (typeof allVisibleImports)[number]) => (
    <div
      key={e.key}
      className="flex flex-wrap items-center gap-2.5 bg-slate-50/80 border border-slate-200 rounded-lg px-3 py-2"
    >
      <input
        type="checkbox"
        checked={checkedImports.has(e.key)}
        onChange={() => toggleImport(e.key)}
        className="accent-indigo-600 shrink-0"
      />
      <span className="text-xs font-medium text-slate-800 flex-1 min-w-[10rem] truncate" title={e.displayName}>
        {e.displayName}
      </span>
      <span className="text-[11px] text-slate-500 shrink-0">{PHASE_LABELS[e.phase]}</span>
      <select
        value={importDetails[e.key]?.jobTitle || ''}
        onChange={(ev) => setDetail(e.key, { jobTitle: ev.target.value })}
        title="選考ポジション"
        className="text-[11px] border border-slate-300 rounded-md px-1.5 py-1 bg-white shrink-0"
      >
        <option value="">ポジション未設定</option>
        {positionOptions.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <select
        value={importDetails[e.key]?.assignee || ''}
        onChange={(ev) => setDetail(e.key, { assignee: ev.target.value })}
        title="主担当"
        className="text-[11px] border border-slate-300 rounded-md px-1.5 py-1 bg-white shrink-0"
      >
        <option value="">主担当（既定）</option>
        {staffList.map((st) => (
          <option key={st.name} value={st.name}>{st.name}</option>
        ))}
      </select>
      <select
        value={importDetails[e.key]?.agencyId || ''}
        onChange={(ev) => setDetail(e.key, { agencyId: ev.target.value })}
        title="エージェント"
        className="text-[11px] border border-slate-300 rounded-md px-1.5 py-1 bg-white shrink-0 max-w-[140px]"
      >
        <option value="">エージェント（フォルダ名から推定）</option>
        {agencies.map((ag) => (
          <option key={ag.id} value={ag.id}>{ag.name}</option>
        ))}
      </select>
      {isStillIgnored(e) ? (
        <button
          type="button"
          onClick={() => unignoreImport(e.key)}
          title="無視リストから外し、通常の一覧に戻す"
          className="flex items-center gap-1 text-[11px] font-semibold text-indigo-500 hover:text-indigo-700 cursor-pointer shrink-0"
        >
          <span>無視を解除</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => ignoreImport(e.key)}
          title="今後この項目を検知対象から除外する"
          className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
        >
          <EyeOff className="w-3.5 h-3.5" />
          <span>無視する</span>
        </button>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-xl animate-in fade-in zoom-in-95 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h3 className="font-bold text-lg text-slate-900">Drive同期の確認</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              反映する項目にチェックを入れてください。チェックを外した項目は今回反映されず、次回の同期で改めて確認されます。
            </p>
          </div>
          <button
            onClick={cancelDriveSyncPreview}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 px-5 py-2 border-b border-slate-100 text-[11px] text-slate-500 shrink-0">
          <span>全セクションまとめて:</span>
          <button
            type="button"
            onClick={() => selectEverything(true)}
            className="px-2 py-0.5 rounded-md border border-slate-200 bg-white font-semibold text-indigo-700 hover:border-indigo-300 cursor-pointer"
          >
            一括選択
          </button>
          <button
            type="button"
            onClick={() => selectEverything(false)}
            className="px-2 py-0.5 rounded-md border border-slate-200 bg-white font-semibold text-slate-600 hover:border-slate-300 cursor-pointer"
          >
            一括選択解除
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {driveSyncPreview.phaseMoves.length === 0 &&
            driveSyncPreview.docUpdates.length === 0 &&
            driveSyncPreview.duplicateFolders.length === 0 &&
            allVisibleImports.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">確認する差分はありません。</p>
            )}

          {driveSyncPreview.duplicateFolders.length > 0 && (
            <div>
              <h4 className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-1.5">
                <Copy className="w-4 h-4 text-rose-600" />
                <span>重複フォルダ（{driveSyncPreview.duplicateFolders.length}件）</span>
                <BulkButtons onChange={selectAllDuplicates} />
              </h4>
              <p className="text-[11px] text-slate-500 mb-2">
                同じ候補者のフォルダが複数のフェーズにまたがって残っています。残すフォルダを選んでください。選ばなかったフォルダは「99_完全削除済み」へ移動します（完全な削除ではありません）。
              </p>
              <div className="space-y-2.5">
                {driveSyncPreview.duplicateFolders.map((g) => {
                  const keepFolderId = duplicateKeepSelections.get(g.candidateId) || '';
                  const checked = checkedDuplicates.has(g.candidateId);
                  return (
                    <div key={g.candidateId} className="bg-slate-50/80 border border-slate-200 rounded-lg px-3 py-2.5">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDuplicate(g.candidateId)}
                          className="accent-indigo-600 shrink-0"
                        />
                        <span className="text-xs font-bold text-slate-900 flex-1 truncate">{g.candidateName}</span>
                        <span className="text-[11px] text-slate-500 shrink-0">{PHASE_LABELS[g.candidatePhase]}</span>
                      </label>
                      <div className="mt-2 ml-6 space-y-1.5">
                        {g.options.map((o) => (
                          <label
                            key={o.folderId}
                            className={`flex items-center gap-2 text-[11px] rounded-md px-2 py-1.5 border cursor-pointer ${
                              keepFolderId === o.folderId
                                ? 'border-indigo-300 bg-indigo-50'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`dup-${g.candidateId}`}
                              checked={keepFolderId === o.folderId}
                              onChange={() => selectDuplicateOption(g.candidateId, o.folderId)}
                              className="accent-indigo-600 shrink-0"
                            />
                            <span className="font-semibold text-slate-700 shrink-0">
                              {(o.phase && PHASE_LABELS[o.phase]) || o.phaseLabel}
                            </span>
                            <span
                              className="text-slate-500 flex-1 truncate"
                              title={o.files.map((f) => f.name).join('、')}
                            >
                              {o.files.length > 0 ? `${o.files.length}件（${o.files.map((f) => f.name).join('、')}）` : 'ファイルなし'}
                            </span>
                            {o.isCurrent && (
                              <span className="shrink-0 text-indigo-600 font-bold">現在アプリに登録中</span>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {driveSyncPreview.phaseMoves.length > 0 && (
            <div>
              <h4 className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-1.5">
                <FolderSync className="w-4 h-4 text-indigo-600" />
                <span>フェーズの食い違い（{driveSyncPreview.phaseMoves.length}件）</span>
                <BulkButtons onChange={selectAllMoves} />
              </h4>
              <p className="text-[11px] text-slate-500 mb-2">
                アプリ上の選考フェーズと、Drive上でフォルダが置かれているフェーズが一致していない登録済み候補者です。行ごとに、どちらを正とするか選んでください。
                アプリで選考を進めたのにDrive側のフォルダ移動が済んでいないケースは「Driveフォルダを移動」、Drive上で手でフォルダを動かしたケースは「アプリのフェーズを変更」を選びます。
              </p>
              <div className="space-y-2">
                {driveSyncPreview.phaseMoves.map((m) => {
                  const direction = directionOf(m.candidateId);
                  const checked = checkedMoves.has(m.candidateId);
                  const appToDrive = direction === 'APP_TO_DRIVE';
                  return (
                    <div
                      key={m.candidateId}
                      className={`bg-slate-50/80 border rounded-lg px-3 py-2 ${checked ? 'border-slate-200' : 'border-slate-200 opacity-70'}`}
                    >
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMove(m.candidateId)}
                          className="accent-indigo-600 shrink-0"
                        />
                        <span className="text-xs font-bold text-slate-900 flex-1 truncate">{m.candidateName}</span>
                        <span className="text-[11px] text-slate-500 shrink-0">
                          アプリ: <span className={appToDrive ? 'font-semibold text-indigo-700' : ''}>{PHASE_LABELS[m.currentPhase]}</span>
                        </span>
                        <span className="text-slate-300 shrink-0">/</span>
                        <span className="text-[11px] text-slate-500 shrink-0">
                          Drive: <span className={appToDrive ? '' : 'font-semibold text-indigo-700'}>{PHASE_LABELS[m.drivePhase]}</span>
                        </span>
                      </label>
                      <div className="mt-1.5 ml-6 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <button
                          type="button"
                          disabled={!checked}
                          onClick={() => setMoveDirection(m.candidateId, 'APP_TO_DRIVE')}
                          className={`px-2 py-1 rounded-md border cursor-pointer disabled:cursor-default ${
                            appToDrive
                              ? 'border-indigo-300 bg-indigo-50 text-indigo-700 font-semibold'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          Driveフォルダを「{PHASE_LABELS[m.currentPhase]}」へ移動
                        </button>
                        <button
                          type="button"
                          disabled={!checked}
                          onClick={() => setMoveDirection(m.candidateId, 'DRIVE_TO_APP')}
                          className={`px-2 py-1 rounded-md border cursor-pointer disabled:cursor-default ${
                            !appToDrive
                              ? 'border-indigo-300 bg-indigo-50 text-indigo-700 font-semibold'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          アプリのフェーズを「{PHASE_LABELS[m.drivePhase]}」に変更
                        </button>
                        {m.suggestedDirection === 'APP_TO_DRIVE' && (
                          <span className="text-slate-400">
                            （アプリ側の判断が新しいと推定されるため、Driveフォルダの移動を推奨）
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {driveSyncPreview.docUpdates.length > 0 && (
            <div>
              <h4 className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-1.5">
                <FilePlus className="w-4 h-4 text-indigo-600" />
                <span>登録済み候補者への書類追加（{driveSyncPreview.docUpdates.length}件）</span>
                <BulkButtons onChange={selectAllDocUpdates} />
              </h4>
              <p className="text-[11px] text-slate-500 mb-2">
                既に登録済みの候補者のDriveフォルダに、アプリがまだ把握していないファイルが増えています。原本の選択肢に追加するだけで、Drive側のファイルは移動しません。
              </p>
              <div className="space-y-1.5">
                {driveSyncPreview.docUpdates.map((d) => (
                  <label
                    key={d.candidateId}
                    className="flex items-center gap-2.5 bg-slate-50/80 border border-slate-200 rounded-lg px-3 py-2 cursor-pointer hover:border-indigo-300"
                  >
                    <input
                      type="checkbox"
                      checked={checkedDocUpdates.has(d.candidateId)}
                      onChange={() => toggleDocUpdate(d.candidateId)}
                      className="accent-indigo-600 shrink-0"
                    />
                    <span className="text-xs font-bold text-slate-900 flex-1 truncate">{d.candidateName}</span>
                    <span className="text-[11px] text-slate-500 shrink-0 truncate max-w-[220px]" title={d.newFiles.map((f) => f.name).join('、')}>
                      +{d.newFiles.length}件（{d.newFiles.map((f) => f.name).join('、')}）
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {visibleImports.length > 0 && (
            <div>
              <h4 className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-indigo-600" />
                <span>新規インポート候補（{visibleImports.length}件）</span>
                <BulkButtons onChange={selectAllImports} />
              </h4>
              <p className="text-[11px] text-slate-500 mb-2">
                Driveにあるが未登録のレジュメです。取り込まないものは「無視する」を押してください。以後の同期で検知されなくなります。
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mb-2 text-[11px] text-slate-600">
                <span className="font-semibold">一括設定（チェック済み、なければ全件）:</span>
                <select
                  value=""
                  onChange={(ev) => ev.target.value && setDetailForAll({ jobTitle: ev.target.value })}
                  className="border border-slate-300 rounded-md px-1.5 py-1 bg-white"
                >
                  <option value="">選考ポジション…</option>
                  {positionOptions.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <select
                  value=""
                  onChange={(ev) => ev.target.value && setDetailForAll({ assignee: ev.target.value })}
                  className="border border-slate-300 rounded-md px-1.5 py-1 bg-white"
                >
                  <option value="">主担当…</option>
                  {staffList.map((st) => (
                    <option key={st.name} value={st.name}>{st.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                {visibleImports.map(renderImportRow)}
              </div>
            </div>
          )}

          {pastImports.length > 0 && (
            <div className="border border-slate-200 rounded-xl bg-slate-50/60">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setShowPastImports((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  <span>{showPastImports ? '▼' : '▶'}</span>
                  <span>過去データ（{pastImports.length}件）</span>
                </button>
                <span className="text-[11px] text-slate-400">見送り・選考辞退フォルダ、または10日以上更新のないフォルダ</span>
                <button
                  type="button"
                  onClick={ignoreAllPast}
                  className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 hover:text-rose-600 hover:border-rose-200 cursor-pointer"
                  title="今後の同期でこれらを表示しない（「反映する」実行時に確定）"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>すべて無視して今後表示しない</span>
                </button>
              </div>
              {showPastImports && <div className="space-y-1.5 px-3 pb-3">{pastImports.map(renderImportRow)}</div>}
            </div>
          )}

          {ignoredImports.length > 0 && (
            <div className="border border-dashed border-slate-200 rounded-xl">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setShowIgnoredImports((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  <span>{showIgnoredImports ? '▼' : '▶'}</span>
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>無視中（{ignoredImports.length}件）</span>
                </button>
                <span className="text-[11px] text-slate-400">以前「無視する」にしたフォルダ。チェックで取り込み、または無視を解除できます</span>
              </div>
              {showIgnoredImports && <div className="space-y-1.5 px-3 pb-3">{ignoredImports.map(renderImportRow)}</div>}
            </div>
          )}

          {unignoredKeys.size > 0 && (
            <p className="text-[11px] text-slate-400">
              {unignoredKeys.size}件の無視を解除します（「反映する」実行時に確定します）。
            </p>
          )}

          {ignoredKeys.size > 0 && (
            <p className="text-[11px] text-slate-400">
              {ignoredKeys.size}件を無視リストに追加します（「反映する」実行時に確定します）。
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 shrink-0">
          <button
            type="button"
            onClick={cancelDriveSyncPreview}
            disabled={isApplyingDriveSync}
            className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={isApplyingDriveSync || (selectedTotal === 0 && ignoredKeys.size === 0 && unignoredKeys.size === 0)}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold px-4 py-2 rounded-lg shadow-2xs transition-all cursor-pointer"
          >
            {isApplyingDriveSync ? '反映中...' : `選択した内容を反映する（${selectedTotal}件）`}
          </button>
        </div>
      </div>
    </div>
  );
};

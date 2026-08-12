import React, { useEffect, useState } from 'react';
import { useATS } from '../context/ATSContext';
import { X, EyeOff, FolderSync, UserPlus, FilePlus } from 'lucide-react';
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

// Reviews the diff previewDriveSync computed before anything is actually applied. Phase moves
// default checked (existing, already-known candidates — low risk, usually a deliberate Drive
// reorganization). New imports default UNCHECKED — this is the actual source of the "past data
// silently lands in 選考" complaint, so bringing an old resume into the active pipeline now
// requires an explicit opt-in per item, with a one-click way to permanently ignore it instead.
export const DriveSyncPreviewModal: React.FC = () => {
  const { driveSyncPreview, applyDriveSync, cancelDriveSyncPreview, isApplyingDriveSync } = useATS();

  const [checkedMoves, setCheckedMoves] = useState<Set<string>>(new Set());
  const [checkedDocUpdates, setCheckedDocUpdates] = useState<Set<string>>(new Set());
  const [checkedImports, setCheckedImports] = useState<Set<string>>(new Set());
  const [ignoredKeys, setIgnoredKeys] = useState<Set<string>>(new Set());

  // driveSyncPreview gets a fresh object identity every time previewDriveSync runs, so this
  // re-initializes selection state (all phase moves pre-checked, all imports/ignores empty) each
  // time a new review opens, without needing the modal to unmount/remount.
  useEffect(() => {
    if (driveSyncPreview) {
      setCheckedMoves(new Set(driveSyncPreview.phaseMoves.map((m) => m.candidateId)));
      // Doc updates default checked too — they only add files already sitting in that candidate's
      // own Drive folder to resumeDocuments, nothing moves or changes in Drive itself.
      setCheckedDocUpdates(new Set(driveSyncPreview.docUpdates.map((d) => d.candidateId)));
      setCheckedImports(new Set());
      setIgnoredKeys(new Set());
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

  const visibleImports = driveSyncPreview.newImports.filter((e) => !ignoredKeys.has(e.key));
  const selectedTotal = checkedMoves.size + checkedDocUpdates.size + checkedImports.size;

  const handleApply = () => {
    applyDriveSync({
      phaseMoveCandidateIds: Array.from(checkedMoves),
      importKeys: Array.from(checkedImports),
      ignoreKeys: Array.from(ignoredKeys),
      docUpdateCandidateIds: Array.from(checkedDocUpdates)
    });
  };

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

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {driveSyncPreview.phaseMoves.length === 0 &&
            driveSyncPreview.docUpdates.length === 0 &&
            visibleImports.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">確認する差分はありません。</p>
            )}

          {driveSyncPreview.phaseMoves.length > 0 && (
            <div>
              <h4 className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-1.5">
                <FolderSync className="w-4 h-4 text-indigo-600" />
                <span>フェーズ更新（{driveSyncPreview.phaseMoves.length}件）</span>
              </h4>
              <p className="text-[11px] text-slate-500 mb-2">
                Drive上でフォルダが別フェーズへ移動されていた、登録済みの候補者です。
              </p>
              <div className="space-y-1.5">
                {driveSyncPreview.phaseMoves.map((m) => (
                  <label
                    key={m.candidateId}
                    className="flex items-center gap-2.5 bg-slate-50/80 border border-slate-200 rounded-lg px-3 py-2 cursor-pointer hover:border-indigo-300"
                  >
                    <input
                      type="checkbox"
                      checked={checkedMoves.has(m.candidateId)}
                      onChange={() => toggleMove(m.candidateId)}
                      className="accent-indigo-600 shrink-0"
                    />
                    <span className="text-xs font-bold text-slate-900 flex-1 truncate">{m.candidateName}</span>
                    <span className="text-[11px] text-slate-500 shrink-0">{PHASE_LABELS[m.currentPhase]}</span>
                    <span className="text-slate-300 shrink-0">→</span>
                    <span className="text-[11px] font-semibold text-indigo-700 shrink-0">
                      {PHASE_LABELS[m.drivePhase]}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {driveSyncPreview.docUpdates.length > 0 && (
            <div>
              <h4 className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-1.5">
                <FilePlus className="w-4 h-4 text-indigo-600" />
                <span>登録済み候補者への書類追加（{driveSyncPreview.docUpdates.length}件）</span>
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
              </h4>
              <p className="text-[11px] text-slate-500 mb-2">
                Driveにあるが未登録のレジュメです。取り込まないものは「無視する」を押してください。以後の同期で検知されなくなります。
              </p>
              <div className="space-y-1.5">
                {visibleImports.map((e) => (
                  <div
                    key={e.key}
                    className="flex items-center gap-2.5 bg-slate-50/80 border border-slate-200 rounded-lg px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={checkedImports.has(e.key)}
                      onChange={() => toggleImport(e.key)}
                      className="accent-indigo-600 shrink-0"
                    />
                    <span className="text-xs font-medium text-slate-800 flex-1 truncate" title={e.displayName}>
                      {e.displayName}
                    </span>
                    <span className="text-[11px] text-slate-500 shrink-0">{PHASE_LABELS[e.phase]}</span>
                    <button
                      type="button"
                      onClick={() => ignoreImport(e.key)}
                      title="今後この項目を検知対象から除外する"
                      className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>無視する</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
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
            disabled={isApplyingDriveSync || (selectedTotal === 0 && ignoredKeys.size === 0)}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold px-4 py-2 rounded-lg shadow-2xs transition-all cursor-pointer"
          >
            {isApplyingDriveSync ? '反映中...' : `選択した内容を反映する（${selectedTotal}件）`}
          </button>
        </div>
      </div>
    </div>
  );
};

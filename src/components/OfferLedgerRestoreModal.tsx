import React, { useEffect, useMemo, useState } from 'react';
import { X, History } from 'lucide-react';
import { useATS } from '../context/ATSContext';
import { readOfferLedger, StoredOfferLedgerRow } from '../lib/driveApi';
import { diffLedgerAgainstApp } from '../lib/ledgerRestore';
import { Candidate } from '../types';

// Backup route for 入社・フォロー管理: shows what the Drive 内定者台帳 recorded that the app no
// longer has (or has differently) and writes the chosen values back into the candidates.
// By default only fields that are empty in the app are restored; overwriting values the app
// currently holds is an explicit opt-in.
export const OfferLedgerRestoreModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { candidates, driveAccessToken, applyCandidatePatches, showToast } = useATS();
  const [rows, setRows] = useState<StoredOfferLedgerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!driveAccessToken) {
      setError('先にGoogleにログインしてください');
      return;
    }
    readOfferLedger(driveAccessToken)
      .then(setRows)
      .catch((err) => setError(err.message || '内定者台帳を読み込めませんでした'));
  }, [driveAccessToken]);

  const { diffs, missingNames } = useMemo(
    () => (rows ? diffLedgerAgainstApp(rows, candidates) : { diffs: [], missingNames: [] }),
    [rows, candidates]
  );
  // Candidates with something to restore under the current mode.
  const restorable = diffs
    .map((d) => ({ ...d, active: d.fields.filter((f) => overwrite || f.appEmpty) }))
    .filter((d) => d.active.length > 0);

  // Everything with empty-field fills starts checked; turning on overwrite doesn't auto-check more.
  useEffect(() => {
    setChecked(new Set(diffs.filter((d) => d.fields.some((f) => f.appEmpty)).map((d) => d.candidate.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selected = restorable.filter((d) => checked.has(d.candidate.id));

  const handleApply = () => {
    const patches: Record<string, Partial<Candidate>> = {};
    selected.forEach((d) => {
      patches[d.candidate.id] = d.active.reduce<Partial<Candidate>>((acc, f) => ({ ...acc, ...f.patch }), {});
    });
    applyCandidatePatches(patches);
    showToast(`内定者台帳から${selected.length}名の入社・フォロー情報を復元しました`, 'success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-xl max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-600" />
              内定者台帳から復元
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Driveの「内定者台帳」に最後に記録された入社・フォロー情報を、アプリに戻します。
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {error && <p className="text-sm text-rose-600">{error}</p>}
          {!error && !rows && <p className="text-sm text-slate-400 text-center py-8">内定者台帳を読み込んでいます…</p>}
          {rows && (
            <>
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="accent-indigo-600" />
                <span>アプリ側に値がある項目も、台帳の値で上書きする（通常はオフ：空欄の項目だけを補完）</span>
              </label>

              {restorable.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">
                  {overwrite ? '台帳とアプリの内容に違いはありません。' : '台帳から補完できる空欄はありません。'}
                </p>
              ) : (
                <div className="space-y-2">
                  {restorable.map((d) => (
                    <label
                      key={d.candidate.id}
                      className="block bg-slate-50/80 border border-slate-200 rounded-lg px-3 py-2 cursor-pointer hover:border-indigo-200"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked.has(d.candidate.id)}
                          onChange={() => toggle(d.candidate.id)}
                          className="accent-indigo-600"
                        />
                        <span className="text-xs font-bold text-slate-900">{d.candidate.name}</span>
                        <span className="text-[11px] text-slate-400 ml-auto">台帳の最終記録: {d.ledgerUpdatedAt.slice(0, 10)}</span>
                      </div>
                      <ul className="mt-1.5 ml-6 space-y-0.5">
                        {d.active.map((f) => (
                          <li key={f.key} className="text-[11px] text-slate-600">
                            <span className="font-semibold text-slate-700">{f.label}:</span>{' '}
                            <span className="text-slate-400">{f.appValue || '（空欄）'}</span>
                            <span className="mx-1">→</span>
                            <span className="font-semibold text-indigo-700">{f.ledgerValue}</span>
                          </li>
                        ))}
                      </ul>
                    </label>
                  ))}
                </div>
              )}

              {missingNames.length > 0 && (
                <p className="text-[11px] text-slate-400">
                  台帳にあるがアプリに候補者がいないため復元できない: {missingNames.join('、')}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 shrink-0">
          <button type="button" onClick={onClose} className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer">
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={selected.length === 0}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer"
          >
            選択した{selected.length}名に復元する
          </button>
        </div>
      </div>
    </div>
  );
};

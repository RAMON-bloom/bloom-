import React, { useState, useEffect } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { useATS } from '../context/ATSContext';
import { Candidate } from '../types';
import { ONBOARDING_CHECKLIST_ITEMS, getChecklistEntry, countCheckedOnboardingItems } from '../lib/onboardingUtils';

// 備考は入力ごとではなく、欄を離れた時に保存する（1文字ごとにDrive同期が走らないように）。
const NoteInput: React.FC<{ value: string; placeholder?: string; onCommit: (v: string) => void }> = ({ value, placeholder, onCommit }) => {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      type="text"
      value={text}
      placeholder={placeholder || '備考'}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== value) onCommit(text);
      }}
      className="w-full bg-white border border-slate-300 text-slate-900 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
    />
  );
};

export const OnboardingChecklist: React.FC<{ candidate: Candidate }> = ({ candidate }) => {
  const { updateOnboardingChecklistItem } = useATS();
  const done = countCheckedOnboardingItems(candidate);
  const total = ONBOARDING_CHECKLIST_ITEMS.length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
      <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-indigo-600" />
          <h3 className="font-bold text-xs text-slate-900">入社手続きチェックリスト</h3>
        </div>
        <span
          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
            done === total ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
          }`}
        >
          {done} / {total} 完了
        </span>
      </div>
      <div className="p-4">
        <p className="text-[11px] text-slate-500 mb-3">チェックと備考は入力するとすぐ自動保存されます（保存ボタンは不要です）。</p>
        <div className="divide-y divide-slate-100">
          {ONBOARDING_CHECKLIST_ITEMS.map((item) => {
            const entry = getChecklistEntry(candidate, item.id);
            return (
              <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-2 py-2">
                <label className="flex items-center gap-2 sm:w-72 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={entry.checked}
                    onChange={(e) => updateOnboardingChecklistItem(candidate.id, item.id, { checked: e.target.checked })}
                    className="w-4 h-4 cursor-pointer accent-indigo-600"
                  />
                  <span className={`text-xs font-bold ${entry.checked ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{item.label}</span>
                </label>
                <div className="flex-1">
                  <NoteInput
                    value={entry.note}
                    placeholder={item.notePlaceholder}
                    onCommit={(v) => updateOnboardingChecklistItem(candidate.id, item.id, { note: v })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

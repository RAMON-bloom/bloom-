import React, { useState } from 'react';
import { XCircle } from 'lucide-react';

interface RejectionReasonModalProps {
  open: boolean;
  targetLabel: string; // '見送り' or '選考辞退'
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export const RejectionReasonModal: React.FC<RejectionReasonModalProps> = ({ open, targetLabel, onConfirm, onCancel }) => {
  const [reason, setReason] = useState('');

  if (!open) return null;

  const handleConfirm = () => {
    onConfirm(reason);
    setReason('');
  };

  const handleCancel = () => {
    setReason('');
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-sm animate-in fade-in zoom-in-95">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3 mb-4">
          <XCircle className="w-5 h-5 text-rose-600" />
          <h3 className="font-bold text-lg text-slate-900">「{targetLabel}」にする</h3>
        </div>

        <label className="block text-slate-700 font-bold mb-1.5 text-sm">理由メモ（任意）</label>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="例: 実務要件未達、他社に決定、条件面で折り合わず"
          rows={3}
          className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
        />

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4 mt-4">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-lg cursor-pointer font-medium"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg shadow-2xs cursor-pointer"
          >
            {targetLabel}にする
          </button>
        </div>
      </div>
    </div>
  );
};

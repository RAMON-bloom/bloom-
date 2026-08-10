import React from 'react';
import { X, History } from 'lucide-react';
import { CHANGELOG } from '../data/changelog';

interface ChangelogModalProps {
  onClose: () => void;
}

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-slate-900 text-base">更新履歴</h2>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {CHANGELOG.map((entry) => (
            <div key={entry.date} className="space-y-1.5">
              <h3 className="font-mono font-bold text-slate-900 text-sm">{entry.date}</h3>
              <ul className="space-y-1 pl-5 list-disc marker:text-slate-300">
                {entry.items.map((item, i) => (
                  <li key={i} className="text-xs text-slate-600 leading-relaxed">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

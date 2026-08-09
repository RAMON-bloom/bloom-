import React, { useState } from 'react';
import { X, Send, ArrowLeft, Plus, Bug, Lightbulb, MessageSquare, MessageCircle } from 'lucide-react';
import { useATS } from '../context/ATSContext';
import { InquiryCategory } from '../types';

interface InquiryModalProps {
  onClose: () => void;
}

const CATEGORY_META: Record<InquiryCategory, { label: string; icon: React.ElementType; color: string }> = {
  BUG: { label: 'バグ報告', icon: Bug, color: 'text-rose-600 bg-rose-50 border-rose-200' },
  SUGGESTION: { label: '改善提案', icon: Lightbulb, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  OTHER: { label: 'その他', icon: MessageSquare, color: 'text-slate-600 bg-slate-100 border-slate-200' }
};

const formatTimestamp = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const InquiryModal: React.FC<InquiryModalProps> = ({ onClose }) => {
  const { inquiries, addInquiryMessage } = useATS();

  const [activeInquiryId, setActiveInquiryId] = useState<string | null>(null);
  const [pendingCategory, setPendingCategory] = useState<InquiryCategory | null>(null);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);

  const sortedInquiries = [...inquiries].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const activeInquiry = activeInquiryId ? inquiries.find((inq) => inq.id === activeInquiryId) : undefined;
  const inThread = activeInquiryId !== null || pendingCategory !== null;
  const threadCategory = activeInquiry?.category || pendingCategory;

  const handleBack = () => {
    setActiveInquiryId(null);
    setPendingCategory(null);
    setDraft('');
  };

  const handleSend = () => {
    const text = draft.trim();
    if (!text || !threadCategory || isSending) return;
    setIsSending(true);
    try {
      const id = addInquiryMessage(threadCategory, text, activeInquiryId || undefined);
      setActiveInquiryId(id);
      setPendingCategory(null);
      setDraft('');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg h-[600px] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            {inThread ? (
              <button
                onClick={handleBack}
                className="p-1 -ml-1 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 cursor-pointer"
                title="一覧に戻る"
              >
                <ArrowLeft className="w-4.5 h-4.5" />
              </button>
            ) : (
              <MessageCircle className="w-4.5 h-4.5 text-indigo-600" />
            )}
            <h2 className="font-bold text-slate-900 text-sm">
              {inThread && threadCategory ? `お問い合わせ（${CATEGORY_META[threadCategory].label}）` : 'お問い合わせ'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {!inThread ? (
          /* List / start-new view */
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div>
              <p className="text-xs font-bold text-slate-500 mb-2">新しいお問い合わせを送る</p>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(CATEGORY_META) as InquiryCategory[]).map((key) => {
                  const meta = CATEGORY_META[key];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={key}
                      onClick={() => setPendingCategory(key)}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-bold cursor-pointer transition-colors hover:opacity-80 ${meta.color}`}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {sortedInquiries.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-500 mb-2">これまでのお問い合わせ</p>
                <div className="space-y-1.5">
                  {sortedInquiries.map((inq) => {
                    const meta = CATEGORY_META[inq.category];
                    const Icon = meta.icon;
                    const lastMessage = inq.messages[inq.messages.length - 1];
                    return (
                      <button
                        key={inq.id}
                        onClick={() => setActiveInquiryId(inq.id)}
                        className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer text-left transition-colors"
                      >
                        <span className={`p-1.5 rounded-lg border shrink-0 ${meta.color}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-bold text-slate-800">{meta.label}</span>
                          <span className="block text-xs text-slate-500 truncate">{lastMessage?.text}</span>
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">{formatTimestamp(inq.updatedAt)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Thread (chat) view */
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {(activeInquiry?.messages || []).length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">
                  最初のメッセージを送信してお問い合わせを開始してください。
                </p>
              ) : (
                (activeInquiry?.messages || []).map((msg) => (
                  <div key={msg.id} className="flex flex-col items-end gap-0.5">
                    <div className="max-w-[85%] bg-indigo-600 text-white text-xs leading-relaxed px-3.5 py-2.5 rounded-2xl rounded-tr-sm whitespace-pre-wrap shadow-2xs">
                      {msg.text}
                    </div>
                    <span className="text-[10px] text-slate-400 pr-1">{formatTimestamp(msg.createdAt)}</span>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t border-slate-200 shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="メッセージを入力（Enterで送信、Shift+Enterで改行）"
                  rows={2}
                  className="flex-1 resize-none text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
                <button
                  onClick={handleSend}
                  disabled={!draft.trim() || isSending}
                  className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl cursor-pointer transition-colors shrink-0"
                  title="送信"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              {!activeInquiryId && (
                <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                  <Plus className="w-3 h-3" />
                  <span>送信すると新しいお問い合わせスレッドが作成されます</span>
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

import React from 'react';
import {
  X,
  HelpCircle,
  Kanban,
  ListFilter,
  Users,
  BarChart3,
  UserCheck,
  Archive,
  Building2,
  HardDrive,
  MessageCircle
} from 'lucide-react';

interface HelpGuideModalProps {
  onClose: () => void;
}

interface GuideSection {
  icon: React.ElementType;
  title: string;
  body: string[];
}

const SECTIONS: GuideSection[] = [
  {
    icon: Kanban,
    title: '選考サマリ（候補者のカンバン管理）',
    body: [
      '「新規候補者を登録」から履歴書・職務経歴書をアップロードすると、AIが内容を自動で読み取ってプロフィールを作成します。',
      '候補者カードは選考フェーズ（書類選考→カジュアル面談→1次面接→…）の列に並び、カードをクリックすると詳細（プロフィール・評価メモ・選考フロー）を確認・編集できます。',
      '書類選考が「合格」になると、自動的にカジュアル面談を飛ばして1次面接に進みます。'
    ]
  },
  {
    icon: ListFilter,
    title: '候補者一覧テーブル / 過去候補者一覧',
    body: [
      '候補者一覧テーブルでは、全候補者を表形式で確認・絞り込みできます。',
      '「見送り」（自社都合の不採用）・「選考辞退」（候補者都合の辞退）になった候補者は「過去候補者一覧」に移動し、必要であれば復元できます。'
    ]
  },
  {
    icon: Users,
    title: '採用MTG',
    body: [
      '定例の採用MTGごとに、担当者からの進捗報告やアクションアイテムを記録できます。',
      'カレンダー予定に紐づくGoogle Meetの自動議事録があれば、Driveから取り込んでAI要約を保存できます。'
    ]
  },
  {
    icon: BarChart3,
    title: '分析ダッシュボード',
    body: ['エージェント別・職種別の歩留まりなど、選考状況を集計したグラフを確認できます。']
  },
  {
    icon: UserCheck,
    title: '入社予定者管理',
    body: ['内定承諾済みの候補者について、入社予定日・入社前会食・退職交渉状況などを管理できます。']
  },
  {
    icon: Building2,
    title: 'エージェントマスタ / 弊社採用担当者',
    body: [
      '取引エージェントや社内担当者の情報を登録・編集できます。',
      '担当者ごと、または複数人で見るスペース宛に、Google Chatへの通知Webhookを登録できます（新規候補者アサイン・選考結果確定・書類選考の督促・書類選考通過スレッド作成・候補者スレッドへの評価サマリ書き込み・お問い合わせなど、通知の種類ごとに受け取るWebhookを選べます）。',
      '自分の「Google ChatメンションID」を登録すると、自分宛の通知が太字テキストではなく本物の@メンション（Chatに通知が届く）になります。IDの調べ方は担当者編集フォームの説明を参照してください。'
    ]
  },
  {
    icon: HardDrive,
    title: 'Google Drive連携',
    body: [
      '画面右上の「Drive連携」からログインすると、履歴書原本の保存やデータのバックアップ・復元が行えます。',
      '候補者・エージェント・担当者・MTGログなどのデータは、変更のたびに自動でDriveへバックアップされます。'
    ]
  },
  {
    icon: MessageCircle,
    title: 'お問い合わせ',
    body: [
      '画面右上の吹き出しアイコンから、バグ報告・改善提案・その他のカテゴリを選んでメッセージ形式で開発者に問い合わせできます。',
      'アプリ内のチャット形式でやり取りが続けられ、開発者からの返信もこのスレッドに届きます（開発者側にはGoogle Chatへの通知も送られます）。'
    ]
  }
];

export const HelpGuideModal: React.FC<HelpGuideModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-slate-900 text-base">このアプリの使い方</h2>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <div key={section.title} className="space-y-1.5">
                <h3 className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                  <Icon className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>{section.title}</span>
                </h3>
                <ul className="space-y-1 pl-6 list-disc marker:text-slate-300">
                  {section.body.map((line, i) => (
                    <li key={i} className="text-xs text-slate-600 leading-relaxed">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

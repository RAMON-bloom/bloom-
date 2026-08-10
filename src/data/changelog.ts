// Plain-language release notes shown in the app's 更新履歴 modal (Header.tsx). Each entry is one
// day's worth of shipped changes, newest first. This is hand-maintained — add a new entry (or
// items to today's, if one already exists) whenever a user-visible feature or fix ships, written
// for the recruiters using this app rather than as a git-log dump (skip pure refactors/internal
// cleanup that nobody outside the app's own code would notice).
export interface ChangelogEntry {
  date: string; // YYYY-MM-DD
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-08-10',
    items: [
      '履歴書のAI解析で、選考ポジション（EC/BP/AIX/BRE/BCA）欄が候補者の実際の職種で上書きされてしまう不具合を修正',
      '新規候補者登録時のChat通知（書類選考担当者宛）で、担当者名を太字で表示するよう修正（グループ向け通知も含む）',
      '候補者詳細の評価入力フォームで、書類選考フェーズの評価入力者が登録時に選んだ書類選考担当者と一致するよう修正',
      'セキュリティ強化: 外部から不正にAPIを呼び出せないよう、通信の認証チェックを追加'
    ]
  },
  {
    date: '2026-08-09',
    items: [
      'エージェント別の歩留まり集計が実態と異なっていた不具合を修正',
      '「会食: 未」バッジが未設定の候補者全員に表示されてしまう不具合を修正',
      '分析ダッシュボードの期間フィルターが、データのある月を正しく反映するよう修正',
      '選考スケジュール・入社予定管理カレンダーの「本日」表示がズレる不具合を修正',
      '履歴書の顔写真切り抜きで、ズーム・回転の調整が保存時に反映されない不具合を修正',
      '候補者詳細の「履歴書」タブに、存在しない項目が表示される不具合を修正',
      '評価保存時に、次回面接官以外のメンバーもメンション対象に選べるように',
      'Google Chatの個人宛通知で本物の@メンションに対応（メンションID登録者のみ、一部制約あり）',
      '書類選考通過スレッドに、各フェーズの評価サマリ（合否・LCM評価・次回面接官）を自動投稿するWebhookを追加',
      'Chatスレッドへの返信が別スレッドに分かれてしまう不具合を修正',
      '開発者へのお問い合わせをアプリ内チャット形式に変更（双方向でやり取り可能に）',
      'デモデータのリセット機能を削除し、アプリ内使い方ガイドを追加',
      '候補者詳細のAI抽出サマリータブを削除',
      'Chat通知の種類ごとに、担当者が受け取るWebhookを選べるように',
      '選考結果確定時にGoogle Chatで通知するように',
      '面談ログのDrive/カレンダー取込を、選考フェーズごとに実行できるように'
    ]
  },
  {
    date: '2026-08-08',
    items: [
      '候補者ごとに専用のDriveフォルダを自動作成するように',
      '履歴書ファイルの自動圧縮に対応（アップロード上限超過時）',
      '候補者を完全削除した際、Drive上のデータも連動して削除するよう修正',
      '書類選考担当者を主担当者と別に指定できるように（新規登録時のChat通知も連動）',
      '面接評価のグレード・LCM評価の初期値を「未選択」に変更（誤って評価済みに見えないように）',
      '各選考フェーズごとに面接官を個別に紐づけられるように',
      'エージェント・社内担当者・候補者・MTGログをDriveと自動同期するように',
      '分析ダッシュボードに選考ポジション（EC/BP/AIX/BRE/BCA）フィルターを追加',
      'Googleログインユーザーが自分で採用担当者として自己登録できるように'
    ]
  },
  {
    date: '2026-08-06〜07',
    items: [
      'Google Drive連携を追加（バックアップ・履歴書保存・議事録AI要約）',
      '社内ドメイン限定のGoogleログインを追加',
      '履歴書をフェーズごとのDriveフォルダで管理し、フェーズ変更時に自動移動するように',
      'Drive上で直接追加・移動された履歴書を検知して同期する機能を追加',
      '候補者登録時に顔写真を履歴書から自動抽出するように'
    ]
  }
];

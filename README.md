# bloom採用管理

社内向け中途採用管理（ATS）アプリ。候補者管理、選考カンバン、採用MTG議事録、エージェント歩留まり分析に加えて、
Google Drive連携（バックアップ・レジュメ保管・議事録AI要約）を備えています。

## 主な機能

- 候補者管理（カンバン/一覧/詳細）、選考フェーズ管理、評価メモ
- エージェントマスタ・歩留まり分析ダッシュボード
- 採用MTG統合議事録ボード（担当者別レポート、アクションアイテム管理）
- **Google Drive連携**
  - ヘッダー右上の「Drive連携」からGoogleアカウントでログイン
  - 候補者・エージェント・担当者・MTGログを指定フォルダにJSONバックアップ／復元
  - レジュメ解析時、元ファイルを自動でDriveの「履歴書・応募書類」フォルダに保存
  - 採用MTGビューから、Drive上のGoogle Docs / テキスト議事録ファイルを検索・取り込み、Gemini AIで要約

データは通常ブラウザの localStorage に保存されます（Driveバックアップは任意のスナップショット機能です）。

## セットアップ（ローカル実行）

**前提:** Node.js

1. 依存関係をインストール
   ```
   npm install
   ```
2. `.env.local` を作成し、以下を設定(このファイルはコミットしないこと。`.gitignore` で除外済み)
   ```
   GEMINI_API_KEY=your_gemini_api_key
   VITE_RECRUITMENT_DRIVE_FOLDER_ID=1Ied-Nn7WYk_k5OBYu-TUznI78UZL4t5G

   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_APP_ID=...
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   ```
   - `GEMINI_API_KEY`: https://aistudio.google.com/apikey で発行（レジュメ解析・議事録AI要約に使用。未設定でも簡易フォールバック動作します）
   - `VITE_RECRUITMENT_DRIVE_FOLDER_ID`: 連携先Driveフォルダ「05_中途採用管理」のID（Drive URLの `/folders/` 以降の文字列）
   - `VITE_FIREBASE_*`: Firebaseコンソール → プロジェクトの設定 → マイアプリ(ウェブアプリ)の設定値。
     以前は `firebase-applet-config.json` にハードコードされていましたが、Gitに秘密情報を含めないよう
     環境変数化しました。値は各担当者のローカル環境・Vercelの環境変数にのみ設定してください。
3. 起動
   ```
   npm run dev
   ```

## Google Drive連携を有効化するには（初回のみ・GCP側の設定）

このアプリは Firebase Authentication（Google連携済み）で発行される OAuth アクセストークンを使い、
ブラウザから直接 Google Drive REST API を呼び出します。追加のGCP設定が必要です。

1. Firebaseプロジェクト（`VITE_FIREBASE_PROJECT_ID`）に対応するGCPプロジェクトで
   **Google Drive API** を有効化する（APIとサービス → ライブラリ）。
2. **OAuth同意画面** のスコープに `.../auth/drive` を追加、またテスト運用時はテストユーザーに社内メンバーを追加する。
3. 対象の Drive フォルダ「05_中途採用管理」を、ログインする社内Googleアカウントが編集可能な状態で共有しておく。

## Vercelへのデプロイ

このリポジトリは Vite（フロントエンド）+ `/api` 配下の Vercel Serverless Functions（バックエンド）構成です。
ローカル開発時は `server.ts`（Express）が同じハンドラをマウントして動作します。

1. Vercelでこのリポジトリをインポート（Framework Preset: Vite）
2. Vercelプロジェクトの環境変数に以下を設定
   - `GEMINI_API_KEY`
   - `VITE_RECRUITMENT_DRIVE_FOLDER_ID`
   - `VITE_FIREBASE_PROJECT_ID` / `VITE_FIREBASE_APP_ID` / `VITE_FIREBASE_API_KEY` /
     `VITE_FIREBASE_AUTH_DOMAIN` / `VITE_FIREBASE_STORAGE_BUCKET` / `VITE_FIREBASE_MESSAGING_SENDER_ID`
3. デプロイ後のドメインを、Firebase Authentication の「承認済みドメイン」に追加する
   （Firebaseコンソール → Authentication → Settings → 承認済みドメイン）

## View in AI Studio

https://ai.studio/apps/f625c786-3ec4-435c-b8e7-7bb9e270f1bc

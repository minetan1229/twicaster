# 小計画 (Small Plan): 実装手順と検証ステップ

## ステップ一覧

### ステップ 1: ポップアップの即時進捗表示の実装
1. `src/popup/popup.ts`:
   - `downloadBtn` のクリックリスナー内で、`resetProgress()` 直後に初期進捗表示 `showProgress({ stage: 'fetching', progress: 0, message: 'ダウンロードを準備中...' })` を呼び出す。
   - `downloadAllBtn` の確認後コールバック内でも同様に初期進捗表示を呼び出す。
2. コミット: `feat(popup): 即時進捗演出の表示`

### ステップ 2: オフスクリーン起動待機と確実なメッセージ配信
1. `src/offscreen/offscreen.ts`:
   - スクリプト冒頭で `chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_READY })` を送信。
   - バックグラウンドからの `CHECK_OFFSCREEN` に対して `OFFSCREEN_READY` を返答できるようにする。
2. `src/background/background.ts`:
   - `ensureOffscreenDocument()` を定義。
   - `chrome.offscreen.hasDocument()` の確認と新規作成時の `OFFSCREEN_READY` 待機（Promise + timeout）。
   - `DOWNLOAD_STREAM` 処理内で `ensureOffscreenDocument()` の完了を `await` してからメッセージをオフスクリーンへ送信。
3. コミット: `fix(background): オフスクリーンドキュメントの初期化待機とメッセージ送信の同期`

### ステップ 3: ビルド・検証・動作確認
1. `npm run typecheck`
2. `npm run build`
3. Git差分・コミット行数確認（300行ルール遵守）
4. プルリクエスト作成（`gh pr create`）とCIチェック

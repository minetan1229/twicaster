# 小計画: 実装・検証ステップ

## ステップ一覧

1. **型定義 (`src/shared/types.ts`) の更新**
   - デバッグログメッセージ型、ストレージ保存用の状態インターフェース追加。
   - `DEBUG_LOG`, `GET_DOWNLOAD_STATUS`, `DOWNLOAD_STATUS_RESPONSE` などのメッセージ型追加。

2. **オフスクリーン (`src/offscreen/offscreen.ts`) の改修**
   - `initFFmpeg` の進捗通知、エラーハンドリング詳細化。
   - `CHECK_OFFSCREEN` に即時応答するリスナーの強化。
   - `chrome.downloads.download` 失敗時の即時エラー報告。
   - デバッグログ送信機能の追加。

3. **バックグラウンド (`src/background/background.ts`) の改修**
   - `ensureOffscreenDocument` のデッドロック防止（既存チェック＋短時間pingポーリング＋createDocumentフォールバック）。
   - ストリーム一覧およびダウンロード状態の `chrome.storage.local` 永続化と同期。
   - デバッグログの集約管理とPopupへの送信。

4. **ポップアップ (`src/popup/popup.html`, `popup.css`, `popup.ts`) の改修**
   - デバッグモードトグルUIとログ表示枠の追加。
   - 入力値（開始・終了時間、画質、ファイル名、選択中ストリームID）の `chrome.storage.local` への保存および起動時復元。
   - ダウンロード中ステータスの再接続時復元（ポップアップを閉じて再オープンしても進捗バーが継続表示される）。
   - 戻るボタンや削除時の状態クリア。

5. **ビルドと動作検証**
   - `npm run build` および `npm run typecheck` を実行しコンパイルエラー・型エラーがないことを検証。
   - 変更行数が1コミット300行以内になるよう段階的にコミット。

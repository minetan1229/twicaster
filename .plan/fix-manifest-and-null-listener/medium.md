# マニフェスト・ポップアップ・バックグラウンドのエラー修正（中項目）

## 1. Manifest仕様準拠
- `manifest.json` からトップレベルの `"offscreen": { ... }` を削除（権限 `permissions: ["offscreen"]` は維持）。
- `host_permissions` から無効なパターン `*://dl*.twitcasting.tv/*` を削除（`*://*.twitcasting.tv/*` で全サブドメインがカバーされる）。

## 2. Popup UIとスクリプトの整合性確保
- `popup.html` に現在存在するDOM構成（単一ストリーム一覧、戻るボタン、詳細画面、ダウンロードボタン、時間入力、プリセットなど）に合わせて `popup.ts` の要素参照（`elements`）を整理する。
- 存在しない要素（`tabs`, `tabPanels`, `downloadAllBtn`, `clearAllBtn`, `aboutBtn`, `confirmModal` 等）に対する無条件な `addEventListener` や DOM 操作を削除または存在判定（オプショナルチェーン・ガード節）を追加し、ポップアップ起動時の致命的なクラッシュを防止する。

## 3. Background デバッガーエラーハンドリング改善
- `attachDebugger` / `detachDebugger` において、既にアタッチされている場合（`Another debugger is already attached`）やタブが存在しない場合（`No tab with given id`）のエラーを安全にハンドリング・クリーンアップし、例外を外側に漏らさない。
- `chrome.runtime.onMessage` の非同期応答ハンドリングの精査。

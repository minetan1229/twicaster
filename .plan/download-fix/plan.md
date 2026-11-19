# .plan/download-fix/plan.md: ダウンロード開始トリガーおよび進捗表示修正 計画

## 概要
ダウンロードボタンを押してもダウンロード演出（進捗バー・状態表示）が始まらない問題を解決する。

## 問題の根本原因
1. **ポップアップ側 UI フィードバックの遅延・非表示**:
   - `downloadBtn` および `downloadAllBtn` 押下時に `resetProgress()` が実行され、進捗コンテナが `hidden` になる。
   - バックグラウンド/オフスクリーンからの最初の進捗メッセージ（`DOWNLOAD_PROGRESS`）を受信するまでUI上で何の演出も始まらないため、無反応に見える。
2. **バックグラウンドとオフスクリーン間のメッセージ喪失**:
   - バックグラウンドで `chrome.offscreen.createDocument()` を呼び出し、直後に `addHistoryEntry().then()` 内で `chrome.runtime.sendMessage({ type: DOWNLOAD_STREAM })` を発火している。
   - オフスクリーンドキュメントのスクリプト実行開始・リスナー登録前にメッセージが送信され、受信されずに捨てられる。
3. **オフスクリーン既存時の二重生成エラー**:
   - `chrome.offscreen.hasDocument()` の判定がないため、すでに存在する場合のエラーハンドリングが不適切で後続処理が停止する。
4. **オフスクリーン側での準備完了通知の欠如**:
   - オフスクリーン側で起動時に `OFFSCREEN_READY` を送信していないため、バックグラウンド側が確実にオフスクリーン準備完了を待つことができない。

## 構成
- Big Plan: [big.md](./big.md) - 全体アーキテクチャと改善方針
- Medium Plan: [medium.md](./medium.md) - バックグラウンド通信同期とUI演出の仕様
- Small Plan: [small.md](./small.md) - 具体的な実装・検証ステップ

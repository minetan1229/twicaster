# 中計画 (Medium Plan): 各コンポーネントの改修仕様

## 1. ポップアップ (Popup) の改善
- ボタン押下時に即時 `showProgress({ stage: 'fetching', progress: 0, message: 'ダウンロードを準備中...' })` を呼び出す。
- これにより、バックグラウンドやオフスクリーンからの非同期通信を待たずにUI上で即座に演出が開始され、ユーザーにアクションが受け付けられたことが伝わる。
- ボタンを無効化（disable）して多重送信を防止。

## 2. オフスクリーン (Offscreen) の改善
- スクリプト読み込み完了時、直ちに `chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_READY })` を発行。
- バックグラウンドからの `PING` または再問い合わせ時にも `OFFSCREEN_READY` を返答できるようにする。

## 3. バックグラウンド (Background) の改善
- オフスクリーンドキュメントの管理関数 `ensureOffscreenDocument()` を導入:
  - `chrome.offscreen.hasDocument()` をチェック。
  - 存在しない場合は `chrome.offscreen.createDocument()` を呼び出し、`OFFSCREEN_READY` メッセージの到着を Promise で待機（タイムアウト付き）。
  - 既に存在する場合は即時 resolve、あるいは確認メッセージを交わす。
- オフスクリーン準備完了後に安全に `chrome.runtime.sendMessage({ type: MessageType.DOWNLOAD_STREAM, payload: ... })` を送信。
- エラーハンドリング: オフスクリーンの初期化に失敗した場合は `DOWNLOAD_ERROR` をポップアップに返答し、UIを復帰させる。

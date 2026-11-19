# 中計画: ダウンロード不具合解消・デバッグモード・状態永続化

## 課題の分析と解決方針

### 1. ダウンロードが「準備中...」で止まる問題
- **原因1: ensureOffscreenDocument の promise 再利用および初期化タイミングのデッドロック**
  - `background.ts` で `chrome.offscreen.createDocument` 時にドキュメントが既に存在していたり、`OFFSCREEN_READY` メッセージが即座に送られて background のリスナー登録前に通過してしまうと、15秒タイムアウトするか、タイムアウト後に rejection されエラーハンドリングで止まる。
  - `offscreen.ts` 起動時に `chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_READY })` だけでなく、background側から ping を送ってポーリング確認する機構を設ける。
- **原因2: FFmpeg初期化のエラーがPopupに伝達されない or サイレントにハング**
  - FFmpeg.wasm のロード（`ffmpeg.load`）で workerURL / coreURL の相対パス解決エラーや CSP エラーが起きた際、詳細エラーがPopupに伝わらない。
  - `initFFmpeg` のロード中にも `reportProgress({ stage: 'processing', message: 'FFmpeg初期化中...' })` を通知し、ロード成否・エラーを明確にする。
- **原因3: ダウンロード完了時の objectURL / chrome.downloads のエラー処理**
  - `chrome.downloads.download` のコールバックで `chrome.runtime.lastError` が発生しても `resolve(undefined)` で無視され `DOWNLOAD_COMPLETE` が送信されてしまっていた不整合を正しくハンドリング。

### 2. デバッグモード (Debug Mode)
- ヘッダーまたはフッターにデバッグモード切り替えトグルスイッチを配置。
- デバッグログ表示領域（折りたたみ/スクロール可能）を追加。
- background / offscreen / popup 間で発生したメッセージ送受信イベントやエラー詳細ログを蓄積・表示し、ワンクリックでコピー可能にする。

### 3. ポップアップを閉じても完全リセットされない仕組み (状態永続化)
- `chrome.storage.local` に以下を永続化:
  1. 検出済みストリーム一覧 (`capturedStreams`)
  2. 選択中ストリームID、入力された開始/終了秒数、フォーマット入力、画質選択、出力ファイル名
  3. 現在進行中のダウンロード進捗 (`activeDownloadProgress`)
- ポップアップ起動時（`DOMContentLoaded` / `loadStreams`）に保存状態を読み込み、直前の画面状態（ストリーム詳細画面、入力フォーム、進捗バー）を完全に復元する。
- フォーム入力変更時（`input` / `change`）に自動デバウンス保存。

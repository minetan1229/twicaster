# 小計画: 01_download_abort_small.md

## タスク手順
1. `popup.html`:
   - `#download-btn` の隣に `#cancel-btn` (class: `btn btn-secondary hidden`, text: `ダウンロード中止`) を追加。
2. `popup.ts`:
   - `elements.cancelBtn` を定義し、クリックイベントで `chrome.runtime.sendMessage({ type: MessageType.STOP_DOWNLOAD, payload: { streamId: currentStream.id } })` を送信。
   - ダウンロード中は `downloadBtn` を非表示（または無効化）、`cancelBtn` を表示。
   - ダウンロード完了・エラー・キャンセル時は `cancelBtn` を非表示にし、`downloadBtn` を復帰。
   - ダウンロードステータス復元時 (`restoreActiveDownload`) にも、ダウンロード中であれば `cancelBtn` を表示する。
3. `background.ts`:
   - `STOP_DOWNLOAD` 受信時に、Offscreen Document に対しても `chrome.runtime.sendMessage({ type: MessageType.STOP_DOWNLOAD, payload: { streamId } })` を転送。
   - `currentDownloadStreamId` と `currentDownloadProgress` をリセットし、`DOWNLOAD_PROGRESS`（中止状態）または中止通知を送信。
4. `offscreen.ts`:
   - `STOP_DOWNLOAD` 受信時に `activeDownloads` の AbortController を `abort()`。
   - `clipVideo` および `recordLiveStream` で `abortSignal` の発火を各フェーズ（セグメント取得・FFmpeg書き込み・FFmpeg exec・Blob生成・ダウンロード開始）で検知し、適切にクリーンアップして AbortError を処理。

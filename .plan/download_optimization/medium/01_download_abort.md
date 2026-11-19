# 中計画: ダウンロード停止機能 (01_download_abort)

## 現状の課題
- `offscreen.ts` には `activeDownloads: Map<string, AbortController>` と `STOP_DOWNLOAD` ハンドラが存在するが、`background.ts` 経由でオフスクリーンに `STOP_DOWNLOAD` が中継されていない。
- `background.ts` 内では `STOP_DOWNLOAD` 受信時に `recordingStates` (Liveのみ) を abort しているだけで、Offscreen Document 内の `activeDownloads` に対して `chrome.runtime.sendMessage({ type: MessageType.STOP_DOWNLOAD, payload: { streamId } })` を転送していない。
- `popup.html` / `popup.ts` に「ダウンロード停止」「キャンセル」ボタンが存在せず、ダウンロード中に停止する手段がない。
- ダウンロード完了・エラー・停止時に `currentDownloadStreamId` と `currentDownloadProgress` が適切にクリアされ、UIが初期状態（ダウンロード可能状態）に戻る必要がある。

## 解決方針
1. `popup.html` に「停止」ボタン (`#cancel-btn`) を追加（ダウンロード実行中に表示）。
2. `popup.ts` でダウンロード開始時に「停止」ボタンを表示、「ダウンロード」ボタンを非表示（または無効化）。停止ボタン押下時に `STOP_DOWNLOAD` を送信。
3. `background.ts` で `STOP_DOWNLOAD` 受信時に、Liveの `recordingStates` の abort に加え、Offscreen Document へ `STOP_DOWNLOAD` を転送し、`currentDownloadStreamId` と `currentDownloadProgress` をリセット。
4. `offscreen.ts` で `STOP_DOWNLOAD` 受信時に `activeDownloads` の controller を abort し、ダウンロード中の一時ファイル・セグメントクリーンアップを行う。

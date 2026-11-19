# [Small Plan] 具体的な実装ステップとテスト項目

## 1. 実装手順

1. **`src/content/content.ts` の改修**:
   - `chrome.runtime.onMessage` で `GET_CURRENT_TIME` を受信した際、現在の `<video>` から `currentTime` と `duration` を取得して即時返信するリスナーを追加。
   - `extractVideoId` の正規表現を修正し、`/movie/\d+` 形式およびチャンネル名形式に対応。

2. **`src/background/background.ts` の改修**:
   - `extractVideoId` の正規表現を統一・強化。
   - `GET_CURRENT_TIME` ハンドラで、対象ストリームの `tabId` が存在すれば `chrome.tabs.sendMessage` を試行。応答があれば最新の `currentTimes` を更新して返却。
   - タブが存在しない場合はキャッシュ（`streamId` または `videoId`）や LIVE 経過時間計算でフォールバック。

3. **`src/shared/time.ts` の改修**:
   - `validateTimeRange` に `isLive?: boolean` オプションを追加し、LIVE配信時は `end > duration` のチェックをスキップするよう改修。

4. **`src/popup/popup.ts` の改修**:
   - `showStreamDetail` に `preserveInputs?: boolean` 引数を追加。同一ストリームの更新受信時に入力中・入力済みの時間を保持。
   - 「現在」ボタンのフォールバック値を開始時間は 0、終了時間は duration に設定。
   - ダウンロード実行時のバリデーション呼び出しで `isLive: currentStream.type === 'live'` を渡す。

5. **ビルドおよび品質検証**:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run build`
   - 各種エッジケース（動画未再生、LIVE配信、VOD、タブ閉じ後）の検証。

# 小計画: 02_time_selection_small.md

## タスク手順
1. `content.ts`:
   - `findVideoElement()` を拡張し、`document.querySelectorAll('video')` から最も再生時間が進んでいるか再生中の video 要素を検出。
   - video 要素が見つからない場合、iframe 内の走査や TwitCasting 特有のプレイヤーDOMクラス (`.tw-player`, `#twitcasting-player` 等) を考慮。
2. `background.ts`:
   - `GET_CURRENT_TIME` 受信時に、タブとの通信タイムアウト（1秒）を設け、応答がない場合でも速やかにフォールバック（保存されている `currentTimes` または `stream.liveInfo` による経過時間計算）を返す。
   - `CURRENT_TIME_UPDATE` の蓄積ロジックを修正し、動画の再生終了時やシーク時の値が正確に更新されるようにする。
3. `popup.ts`:
   - 「現在」ボタン押下時、取得した秒数を小数点第1位までに丸め、`startSeconds` / `endSeconds` と `startHhmmss` / `endHhmmss` に正しくフォーマット（`formatTime`）して即時反映。
   - 入力値変更時にリアルタイムでバリデーションと時間範囲の再計算を行い、`savePopupState()` を確実に実行。

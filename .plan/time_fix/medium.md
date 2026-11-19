# [Medium] 時間フォーマット正常化と相対プリセットの動的計算

## 目的
1. `formatTime` の秒部分のパディング不具合（`05:0000`）を解消し、標準的な `HH:MM:SS` または `MM:SS` 形式にする。
2. プリセットボタンで固定値ではなく、現在入力値に対する相対差分（+300秒, -300秒など）を適用可能にし、上限・下限でクランプする。

## 影響範囲
- `src/shared/time.ts`: `formatTime`
- `src/popup/popup.ts`: `startPresets`, `endPresets` のボタンデータ属性およびクリックハンドラ

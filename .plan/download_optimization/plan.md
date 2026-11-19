# ダウンロード停止・時間指定機能改善・FFmpegロード高速化 計画

## 概要
ユーザーからの以下の要望を解決する：
1. **ダウンロード停止機能**: ダウンロード中・録画中に停止（キャンセル）できるようにするUIと、バックエンド(offscreen/background)の完全連携・リソース解放。
2. **時間指定機能（「現在」時間等）の不具合見直し・修正**: 「現在」ボタン押下時やタブ時間同期が取れない問題の解消、VODとLIVE双方での正確な時間取得と反映。
3. **FFmpegロードの高速化**: 32MBある `ffmpeg-core.wasm` のダウンロード・コンパイルに時間がかかる問題を、拡張機能起動時/バックグラウンド事前ウォームアップ・プリロードおよびキャッシュ最適化によって改善。

## 構成
- 大計画: `.plan/download_optimization/plan.md`
- 中計画:
  - `.plan/download_optimization/medium/01_download_abort.md` (ダウンロード停止機能)
  - `.plan/download_optimization/medium/02_time_selection_fix.md` (時間指定・現在時刻同期修正)
  - `.plan/download_optimization/medium/03_ffmpeg_preload.md` (FFmpegプリロード・高速化)
- 小計画:
  - 各中計画に対応する小タスク

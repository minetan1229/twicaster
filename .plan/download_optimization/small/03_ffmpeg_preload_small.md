# 小計画: 03_ffmpeg_preload_small.md

## タスク手順
1. `offscreen.ts`:
   - スクリプト読み込み完了時（トップレベル）に `initFFmpeg().catch(...)` を非同期で自動実行開始。
   - すでに初期化が進行中か完了していれば多重実行を防ぐプロミス共有機構 (`ffmpegLoadingPromise`) を導入。
2. `background.ts`:
   - ストリームを検出した時（`STREAM_CAPTURED` 時）に `ensureOffscreenDocument()` をバックグラウンドで呼び出し、事前ウォームアップを行う。
   - ポップアップが開かれた時（`GET_STREAMS` などの初期リクエスト受信時）にも `ensureOffscreenDocument()` をトリガー。
3. 検証:
   - ユーザーが「ダウンロード」を押す前にオフスクリーンと FFmpeg のロードが完了しているため、ボタン押下時に「FFmpegエンジンを初期化中...」で待たされず、直ちにセグメント取得・結合処理に進むことを確認。

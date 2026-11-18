# 中計画: Discord Bot メインエントリポイントの実装

## 目的
`node dist/index.js` および `npm start` で Discord Bot が正常に起動・稼働できるように、メインエントリポイント（`src/index.ts`）を実装する。

## 実装スコープ
1. メインエントリポイント `src/index.ts` の作成
   - `.env` からの環境変数読み込み（`discord_bot_token`）
   - `DataStore` の初期化
   - `discord.js` の `Client` 初期化およびイベントハンドラ（`ready`, `interactionCreate`, `error`）の登録
   - 基本スラッシュコマンド（`/ping`, `/set_admin`, `/set_server`, `/set_4sim_api_key`）のハンドリング基盤
2. `package.json` に `"start": "node dist/index.js"` スクリプトの追加
3. 単体テストの追加と動作検証

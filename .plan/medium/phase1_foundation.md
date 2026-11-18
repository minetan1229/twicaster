# 中計画: フェーズ1 基盤構築 & データストレージモデル

## 概要
システム全体の型安全性を担保するための TypeScript プロジェクト初期化、CI設定、および project.md に規定されている `data/li.json` と `data/gr.json` の型定義とファイルアクセス・永続化マネージャーを実装する。

## タスク一覧
1. プロジェクト設定ファイルの作成
   - `package.json`, `tsconfig.json`, CIワークフロー（GitHub Actions: lint, type-check, test）
2. データ構造の型定義
   - `AccountData`, `LineAccount`, `GroupBotStatus`, `LineGroup` 等の型定義
3. データストレージマネージャーの実装
   - `data/li.json` の読み込み・保存・更新（排他制御/アトミック書き込み考慮）
   - `data/gr.json` の読み込み・保存・更新
4. 単体テスト作成とCI通過

# 小計画: タスク1 - TypeScript初期設定 & CI & データモデル実装

## 実装ステップ
1. `package.json` の作成（TypeScript, vitest, discord.js, linejs 等の依存関係設定）
2. `tsconfig.json` の作成
3. GitHub Actions ワークフロー (`.github/workflows/ci.yml`) の設定
4. データモデル型定義 (`src/types/data.ts`)
   - `li.json` スキーマ: `{ [uuid: string]: { mid: string; account: { token: string; ip: string; logincount: number; last_login_time: string; first_login_name: string }; group_id: string; status: 'active' | 'sleep' | 'ban'; type: 'self' | 'bot' } }`
   - `gr.json` スキーマ: `{ [ggid: string]: { name: string; create_time: string; ob_mid: string; bot_status: { [botKey: string]: { status: 'active' | 'None'; mid: string } } } }`
5. データストアマネージャークラス (`src/storage/dataStore.ts`)
   - 安全な読み込みとアトミック書き込み
6. 単体テスト (`test/storage/dataStore.test.ts`)
7. テスト実行とCIパス確認

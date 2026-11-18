# 大計画: Discord - LINE マルチセッション管理システム

## 目的
project.md の仕様に基づき、DiscordをUIとして複数のLINEアカウント（linejs使用、self/bot対応）を軽量・高速かつセッション単位で並行管理・操作できるシステムの構築。

## 全体フェーズ
1. **フェーズ1: 基盤構築**
   - TypeScript/Node.js環境構築、ESLint/Prettier、テスト環境（Vitest/Jest）、CIワークフロー設定
   - データストレージ（`data/li.json`, `data/gr.json`）の整合性・CRUDレイヤーの実装
2. **フェーズ2: Discord Bot 基盤と権限・設定機能**
   - Discord.js スラッシュコマンド基盤の作成
   - 権限管理（admin, bot_ob, comon）の実装
   - サーバー設定・管理者設定（/set_server, /set_admin, /set_4sim_api_key）
   - システム管理コマンド（/sys, /ping, /restart）
3. **フェーズ3: LINE セッション管理エンジン & 4sim.net連携**
   - linejs によるマルチセッション管理・ワーカー管理
   - 4sim.net APIクライアントとアカウント自動登録（/create_line）
   - LINEログイン・トークン永続化（QRコード送信・トークン再ログイン・self/bot分岐）（/login_line）
4. **フェーズ4: LINEグループ & Botプール管理**
   - グループ作成/変更/削除（/create_group_id, /change_group, /del_group_id）
   - Botフェイルオーバー（bot1がBAN・停止時にbot2〜5を昇格）
   - LINE内コマンド（/hi, /bot_number）とOpType 25・既読管理
5. **フェーズ5: 総合検証 & 最適化**
   - 各セッションのメモリ・プロセス負荷検証
   - 全体結合テストとCIパス

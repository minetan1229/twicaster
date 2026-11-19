# 小計画: スラッシュコマンド実装とEphemeralメッセージ化

## タスク一覧
1. **ブランチ作成**: `new/slash-commands-ephemeral` の作成
2. **既存コマンドの修正**:
   - `set_admin`, `set_server`, `set_4sim_api_key` のレスポンスを `ephemeral: true` に統一
3. **新規スラッシュコマンドの定義追加**:
   - `/sys`
   - `/restart`
   - `/bot_list_line`
   - `/logout_line`
   - `/create_group_id`
   - `/change_group`
   - `/del_group_id`
   - `/create_line`
4. **コマンドハンドラーのロジック実装**:
   - 各コマンドの引数パース、権限チェック、DataStoreおよびサービスとの連携
   - すべての応答（成功、失敗、例外）で `ephemeral: true` を設定
5. **単体テストの作成・実行**:
   - 各コマンドが `ephemeral: true` で返信することを検証
   - 権限不足時の挙動を検証
6. **300行以内での分割コミットとPR作成・CI検証・マージ**:
   - 各コミットが300行以内になるよう維持
   - PR作成・CI確認・master/mainへのマージ

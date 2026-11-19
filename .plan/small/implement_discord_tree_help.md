# 小計画: /tree・/helpコマンドおよびAutocomplete/Embed便利機能の実装

## タスク一覧
1. **ブランチ作成**: `new/discord-tree-help-features`（作成済み）
2. **Slash Command 定義の更新**:
   - `/help`: コマンドリスト表示
   - `/tree`: グループ・アカウントツリー構造可視化表示
   - `/logout_line`: uuid オプションに `.setAutocomplete(true)` を設定
   - `/change_group`: uuid, group_id オプションに `.setAutocomplete(true)` を設定
   - `/del_group_id`: group_id オプションに `.setAutocomplete(true)` を設定
3. **Autocomplete ハンドラーの実装**:
   - `interaction.isAutocomplete()` を受け取り、uuid/group_id の候補（最大25件）をフィルタリングして `interaction.respond()` で返却
4. **コマンドハンドラーの実装・改善**:
   - `/tree`: グループとアカウントを紐づけてツリー図文字列を生成し、Embed またはコードブロックで返信
   - `/help`: 全コマンドの説明・引数・権限を分類した Embed で返信
   - `/create_line`: `deferReply({ ephemeral: true })` を使用
5. **テストの拡充**:
   - `/tree`, `/help` の実行テスト
   - Autocomplete ハンドラーの単体テスト
6. **分割コミット（300行制限遵守）とPR作成・CI・マージ**:

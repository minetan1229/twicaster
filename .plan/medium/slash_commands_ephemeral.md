# 中計画: Discordスラッシュコマンドの拡張とEphemeral応答への統一

## 目的
ユーザーからの要望「コマンドをSlash Commandsにしたり、ephemeral messageに変えたりして」に基づき、
すべてのDiscordコマンドをSlash Commandとして定義し、すべてのコマンド応答（設定、システム情報、アカウント・グループ管理、エラー通知等）を実行者のみが閲覧できるephemeral messageに統一する。

## 対象コマンド
1. **既存コマンドのephemeral化**:
   - `/ping`: すでにephemeral
   - `/set_admin`: 成功時も `ephemeral: true` に変更
   - `/set_server`: 成功時も `ephemeral: true` に変更
   - `/set_4sim_api_key`: 成功時も `ephemeral: true` に変更
2. **システム管理コマンド（追加）**:
   - `/sys`: システム稼働状況・稼働時間・登録アカウント/グループ統計（ephemeral: true）
   - `/restart`: Bot再起動コマンド（管理者限定、ephemeral: true）
3. **LINE・グループ管理コマンド（追加）**:
   - `/bot_list_line`: 登録LINEアカウント一覧（admin/bot_ob限定、ephemeral: true）
   - `/logout_line`: 指定アカウントのログアウト/ステータス更新（admin限定、ephemeral: true）
   - `/create_group_id`: グループ登録（admin/bot_ob限定、ephemeral: true）
   - `/change_group`: アカウントのグループ変更（admin/bot_ob限定、ephemeral: true）
   - `/del_group_id`: グループ登録解除（admin限定、ephemeral: true）
4. **4sim アカウント作成コマンド（追加）**:
   - `/create_line`: 4sim.net連携による番号発行・アカウント作成準備（admin/bot_ob限定、ephemeral: true）

## 検証方針
- コマンド定義がすべてSlashCommandBuilderで正しく生成されていること
- 各コマンドハンドラーが権限チェックを行い、すべて `ephemeral: true` で応答すること
- テストコードを拡充し、各コマンドの実行およびephemeralフラグの検証を行うこと

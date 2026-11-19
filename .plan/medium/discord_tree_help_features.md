# 中計画: LINEツリー可視化、ヘルプコマンド、Discord便利機能の実装

## 目的
ユーザー要望である「tree可視化（グループ・Botの階層表示）」「コマンドリスト（/help）」「Discordの便利仕様（Autocomplete、Embed、deferReplyなど）」を実装し、Discord Botの操作性とユーザー体験を向上させる。

## 実装内容
1. **/tree コマンド**:
   - グループおよび所属LINEアカウント、未所属アカウントの階層構造をツリー形式（ASCII tree）で可視化
   - 権限: admin / bot_ob（ephemeral: true）
2. **/help コマンド**:
   - システム管理、LINEアカウント管理、グループ管理の各コマンド一覧、引数、権限をカテゴリ別にリッチEmbedで表示
   - 権限: 全員（ephemeral: true）
3. **Discord便利機能の適用**:
   - **Autocomplete**: `/logout_line`, `/change_group`, `/del_group_id` における uuid, group_id の補完候補表示
   - **Embed 表示**: `/sys`, `/tree`, `/help` 等の情報を EmbedBuilder による見やすいリッチメッセージで出力
   - **deferReply**: 時間がかかるコマンド（`/create_line` 等）でタイムアウトを防止

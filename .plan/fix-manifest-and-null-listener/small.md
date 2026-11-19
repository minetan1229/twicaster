# 実装・検証タスク（小項目）

## 手順
1. **計画書・TODOの反映とコミット**
   - `.plan/fix-manifest-and-null-listener/` の作成
   - `.todo.md` に今回の修正タスクを記載
2. **`manifest.json` の修正**
   - `"offscreen"` キー削除
   - `host_permissions` の `"*://dl*.twitcasting.tv/*"` 削除
3. **`src/popup/popup.ts` の修正**
   - 存在しないDOM要素の `addEventListener` の安全化（オプショナルチェーンまたはnullチェック）
   - 単一ストリーム一覧構成に合わせた要素管理と初期化処理
4. **`src/background/background.ts` の改善**
   - `attachDebugger` と `detachDebugger` のエラーハンドリング堅牢化
5. **ビルドと型チェック**
   - `npm run build` および `npm run typecheck` を実行しエラーがないことを確認
   - `dist/manifest.json`, `dist/popup.js`, `dist/background.js` が正常に出力されることを確認
6. **PR作成とマージ確認**

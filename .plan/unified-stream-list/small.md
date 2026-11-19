# Twicaster 小計画: 実装手順

1. `src/popup/popup.html` を簡潔な構成に整理
2. `src/popup/popup.css` を整理（不要な複雑モーダル等を削り、LIVE/VODバッジ等の必要なスタイルを維持）
3. `src/popup/popup.ts` をスリム化（例外を無くし、要素の安全な取得とイベントハンドリングを徹底）
4. 型チェック（`npm run typecheck`）とビルド（`npm run build`）の確認
5. コミット（300行以内分割）

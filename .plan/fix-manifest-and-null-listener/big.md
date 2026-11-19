# マニフェスト不正キー・URLパターンおよびポップアップ初期化エラーの修正計画（大項目）

## 目的
ユーザーから報告されたChrome拡張機能のManifest読み込みエラーおよび実行時エラー群を根本的に解消し、拡張機能が正常に読み込まれ、ポップアップおよびバックグラウンドが安定動作する状態を実現する。

## 対象課題
1. `manifest.json` における無効なトップレベルキー `offscreen` の削除
2. `manifest.json` における不正なURLマッチパターン `*://dl*.twitcasting.tv/*` の修正
3. `popup.ts` 内での非存在DOM要素（タブ、モーダル、ボタン等）に対する `addEventListener` 呼び出しによる `TypeError: Cannot read properties of null` の解消
4. `background.ts` におけるデバッガーのアタッチ/デタッチ競合および例外ハンドリングの強化
5. ビルド成果物（`dist/`）への確実な反映と動作検証

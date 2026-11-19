# [Small] 実装ステップと検証計画

## 実装ステップ
1. `src/shared/time.ts`:
   - `formatTime` を修正。秒の整数部を2桁 `padStart(2, '0')` し、小数部がある場合は小数点以下1桁を末尾に付加する。
2. `src/popup/popup.ts`:
   - 相対時間プリセット（-5分, -30分, -1時間, +5分, +30分, +1時間）に `type: 'relative'`, `delta: number` を導入。
   - クリックハンドラで `type === 'relative'` の場合、現在入力欄の値（パースした秒数）に `delta` を加算し、`0 <= time <= duration` にクランプして反映。
3. ビルドおよび動作確認:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run build`

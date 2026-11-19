# 中計画: headers.ts 未使用変数警告の解消

## 課題
- `src/shared/headers.ts` の 21行目: `'isTwitCasting' is assigned a value but never used` の ESLint 警告が発生している。
- `isTwitCasting` は参照されておらず、不要またはプレフィックス `_` を付与すべき。

## 対応方針
- `_isTwitCasting` にリネームするか、不要な宣言を削除する。

# 開発と変更の管理

`main` を公開版の基準とする。機能追加・修正は作業ブランチで行い、変更点と検証結果をPull Requestに記載する。CI合格を確認してから取り込む。

仕様とデータの扱いは [AGENTS.md](AGENTS.md) に従う。原観測台帳とM1.0/M1.1は保存し、独自補完と観測済みの項目を区別する。戦闘エンジンでは整数tick・注入乱数・安定ID順を維持する。

Node.js 22.12以上で `npm ci`、`npx playwright install chromium` を実行する。型検査・lint・エンジン試験・サーバー試験を通し、ビルド後に配布版のE2E・画像比較を実行する。

```powershell
$env:VITE_USE_OFFICIAL_ICONS = 'false'
npm run typecheck
npm run lint
npm run test:engine
npm run test:server
npm run build
$env:BATTLE_E2E_PRODUCTION = '1'
npm run test:e2e
npm run test:visual
```

結果と未達条件を [実装状況](docs/implementation-status.md) に記録する。見た目を意図的に変更した場合だけ基準画像を更新し、別実行で比較を確認する。公開基準画像は自作アイコンの表示で作る。

秘密情報、認証トークン、`.env.local`、録画・一時ファイルをコミットしない。第三者の参考画像とそれを埋め込む仕様HTMLはローカルに保管し、Gitには含めない。画像を必要とする元資料の厳密な検証スクリプトは、参考画像のあるローカル環境で実行する。

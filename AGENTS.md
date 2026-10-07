# BattleSim 作業規約

仕様の正典は `closed-battle-spec-v0.2/closed-battle-spec/AGENTS.md` と同ディレクトリの `docs/runtime-r1.md` R1.3、`docs/map-spec.md` G1/D1.1。元の観測台帳・M1.0/M1.1を変更しない。

実装はこのワークスペース直下の npm workspaces。共通契約は packages/contracts、実行データは packages/content と data/runtime、純粋エンジンは packages/engine、再生は packages/replay、権威サーバーは apps/server、画面は apps/web。

戦闘内で Date.now / Math.random / DOM を使わない。整数tick・注入された乱数・安定ID順を維持。陣営の公開型を新規構築し、不可視情報と認証トークンをログに出さない。コンテンツの独自補完と観測を区別し、原作内部式や全仕様の未検証項目を検証済みと呼ばない。

完了前に npm run typecheck / lint / test:engine / test:server / test:e2e / test:visual / build を実行。結果と未達条件は docs/implementation-status.md に記録する。

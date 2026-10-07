# 招待ルーム通信

この実装はゲストの招待ルームをサーバーメモリに保持する。戦闘の演算は`@battle/engine`へ渡し、サーバー時計は設定締切、再接続、切断敗北、終了リプレイの保持にだけ使う。サーバー再起動を跨ぐ復旧は対象外。

HTTPのJSON応答は`Cache-Control: no-store`。表示名は1〜20文字。全陣営で8人、各陣営4人まで。開始後の新規参加は拒否する。

| 操作 | HTTP | 本文・応答 |
|---|---|---|
| 状態確認 | `GET /api/health` | `{ok:true}` |
| コンテンツ | `GET /api/catalog` | `{content,maps}`。公開のキャラクター・装備・初期地形 |
| 作成 | `POST /api/rooms` | `{name,stage:"I"|"II"|"III",team:"A"|"B"}` |
| 参加 | `POST /api/rooms/join` | `{inviteCode,name,team}` |
| 再接続 | `POST /api/rooms/reconnect` | `{roomId,token}` |
| 完全リプレイ | `GET /api/replays/:roomId` | `Authorization: Bearer <token>`。終了後24時間、参加者のみ |

作成・参加・再接続の応答は`{roomId,inviteCode,participantId,token,team}`。トークンは暗号学的乱数32バイトから生成し、メモリだけに置く。招待コードは本人認証として扱わない。要求本文とトークンをログへ出さない。

WebSocketは同じオリジンの`/ws`へ接続する。URLへ認証情報を含めず、最初に`{type:"authenticate",roomId,token}`を送る。5秒以内に認証が完了しない接続を閉じる。同じ本人の新接続で古い接続を置き換える。

認証後の更新は`{type,requestId,matchId,turn,revision,payload}`。編成中は`matchId:null,turn:0`。試合開始後は公開された試合IDとターンを送る。`requestId`は参加者ごとに一意とし、同一内容の再送は同じACKを返す。同じIDで異なる内容を送ると`REQUEST_REUSED`。ACKは`{type:"ack",requestId,revision,turn}`、失敗は`{type:"error",requestId?,code,message}`。

| type | payload | 権限・フェーズ |
|---|---|---|
| `roster` | `{roster:{base:[4個のID],help:[段階指定人数のID],changes:[{unitIndex,loadout:{main:[4枠],sub:[4枠]}}]}}` | 自陣営リーダー、編成中、一度だけ確定 |
| `assign` | `{unitId,participantId}` | 自陣営リーダー、編成または設定中、自陣営のみ |
| `start` | `{}` | ホスト、両編成確定・全ユニット担当割当後 |
| `plan` | `{unitId,commands:[最大32件]}` | 設定中、現在の担当者のみ |
| `ready` | `{ready:boolean}` | 設定中。表示用の完了状態、締切を短縮しない |
| `tag` | `{contactId,tag}` | 試合中、自陣営の接触のみ。0〜12文字、空欄で解除 |

全変更とタイマー処理はルームごとのキューで順序を固定する。`revision`は編成確定、担当変更、開始、次ターン、終了で進める。プラン／タグ更新では進めず、別担当者の同時入力を受け付ける。担当変更は最新プランを引き継ぎ、旧revisionの遅延入力を拒否する。設定更新は受信時刻が締切未満の場合のみ受理し、一致と直後を拒否する。初期編成・担当割当は自陣営の既定値から開始し、リーダーが担当を変更できる。

配信は各参加者向けに新しい`PublicRoom`を構築する。`{type:"room",room,state?,plans,events,turnReplay?}`の`room`は`id,inviteCode,matchId,stage,status,hostId,revision,turn,deadline,participants,leaders,roster,rosterReady,owners,ready,result`。`participants`は`{id,name,team,connected}`だけで、`roster,owners,ready,plans,events`は自陣営の値だけ。`state`はエンジンの`projectState`による公開状態で、乱数、敵プラン、敵の真のID、未視認の装備・HP・高さ、非可視の地形変更を含めない。公開イベントIDも陣営別に採番し、敵の内部IDや不可視イベント件数を引き継がない。

最新ターンの`turnReplay:{turn,maps,frames,plans?}`は公開地形を共有するコンパクト形式。`maps`は陣営別に観測された`BattleMap[]`、`frames`は`{tick,state:Omit<PublicState,'map'>,mapIndex,events:BattleEvent[]}`。クライアントは`maps[mapIndex]`を各フレームの`state.map`へ復元する。`plans`はその再生ターンで実行した自陣営の`TurnPlan[]`のみで、未設定ユニットの既定WAITも含む。コマンドは公開契約のフィールドから新しく構築し、敵プラン、乱数種、内部の追加情報を含めない。最新ターン再生とそのプランは次ターンの設定中も保持し、現在の設定プランとは独立する。全状態や全陣営イベントを配信する`Frame`そのものは送らない。タグは陣営内で共有し、完全リプレイに`tagHistory:[{turn,absoluteTick,team,contactId,tag,receivedAt}]`を追加して非同期編集の時系列を残す。

設定150秒、実行表示15秒を6ターン繰り返す。未設定駒は現在の装備／向きを維持するWAITをサーバーが確定する。切断しても時計を止めない。再接続は切断から60秒以内。同陣営の接続者へリーダー権限を移し、担当変更が可能。片側全員の切断が120秒続けば敗北、双方なら勝敗なしで中断。サーバー終了・解決失敗は中断とする。

完全リプレイは終了時のみ乱数種・全プラン・全イベント・全状態を開示する。JSONは`closed-battle-replay-graph-1`形式で共有オブジェクトを参照に置き換え、`@battle/replay`の`deserializeReplay`で全状態を復元する。地形を151フレームごとに重複保存しない。終了から24時間で破棄する。ブラウザーのSPAファイルは`dist`から配信し、パスが配信ディレクトリの外へ解決される要求を拒否する。

2026-10-07: 発射イベントの details.visual は表示専用の weaponId/actionKind/origin/aim。公開イベントでは射手が自陣営または発射時に視認された場合のみoriginを開示し、aimは自陣営の射撃または対象が公開された場合だけを渡す。乱数・内部敵ID・不可視射手の位置を混入しない。成功した自陣営の装備アクション名を表示に使用する。

新規戦闘は state.effects.movementPolicy='skip-occupied-v1' を持ち、状態ハッシュと完全リプレイに保存する。通常移動・TRACK・GUARDの競合中に後続経路があれば着地を省略する。自陣営のpendingMoveにvia/continuationPath/awaitingContinuationを保持し、相手には予約を送らない。policyなしの旧状態はR1.3の停止・返却・再試行を維持する。旧記録は記録フレームのまま再生し、新方針へ変換しない。

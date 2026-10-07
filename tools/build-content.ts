import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { BattleMap, CharacterPreset, ContentPack, EffectDefinition, Loadout, Stats, WeaponProfile } from '../packages/contracts/src/index';
import { compileContent } from '../packages/content/src/compiler';
import { createCalibratedContent, C2_CALIBRATION_RECORD } from '../packages/content/src/calibration';

const sourceRoot = 'closed-battle-spec-v0.2/closed-battle-spec';
const read = (path: string): any => JSON.parse(readFileSync(`${sourceRoot}/data/${path}`, 'utf8'));
const characters = read('characters.json') as any[];
const weaponLedger = read('weapons.json') as any[];
const skillLedger = read('skills-index.json') as any[];
const help = read('help-pools.json');
const statKeys = ['ap', 'trion', 'attack', 'defense', 'evasion', 'support', 'technique'] as const;
const snapshot = 'closed-selection-current-rank-loadout-C1.0';
const original = { evidenceStatus: 'original' as const, sourceIds: [] as string[] };

// Every row is selected separately. No missing value, role average, or name branch reaches runtime.
// Column order: AP, trion, attack, defense, evasion, support, technique.
const statRows = [
  [18,6,7,8,8,9,8], [17,7,7,5,7,4,8], [20,7,9,7,10,8,8], [18,5,7,5,8,5,6],
  [18,6,8,6,8,7,8], [17,6,7,9,7,8,8], [16,7,11,7,6,6,8], [17,5,6,6,7,6,6],
  [17,7,7,7,7,8,7], [17,7,12,5,7,5,9], [15,5,6,4,5,4,7], [17,8,8,6,7,7,8],
  [15,9,7,7,5,8,7], [15,7,7,5,5,6,9], [18,8,7,6,8,7,8], [18,5,7,5,8,4,6],
  [15,6,5,6,5,7,7], [15,7,7,7,5,8,8], [18,4,7,5,8,6,6], [17,7,10,5,7,5,9],
  [14,6,6,6,4,7,9], [18,5,6,6,8,7,7], [18,5,6,6,8,6,6], [18,4,8,6,7,7,9],
  [17,6,9,6,7,6,7], [15,8,6,5,7,6,8], [13,2,3,4,4,5,6], [16,6,9,6,8,6,7],
  [16,14,12,7,6,7,8], [15,7,8,10,5,11,10], [12,25,2,4,3,5,6], [15,6,8,5,5,6,10],
  [14,5,6,5,4,7,7], [15,6,8,6,5,8,8], [17,5,6,7,6,7,7], [16,7,6,6,6,7,8],
  [17,7,9,10,7,9,9], [17,7,8,7,7,7,7], [17,5,6,8,7,8,8], [15,7,7,6,5,8,8],
  [16,6,6,6,6,7,7], [14,5,6,7,4,8,11], [17,5,6,7,7,7,6], [18,12,10,9,8,8,9],
  [18,6,14,8,8,9,8], [19,6,9,8,9,8,9], [14,6,9,6,4,7,13], [15,12,8,8,5,10,9],
  [18,7,9,8,8,8,8], [17,8,11,7,7,7,9], [21,5,9,5,11,6,7], [15,7,8,6,5,7,10],
  [17,7,7,8,7,9,8], [15,6,8,5,5,6,9], [17,7,7,8,7,9,8], [17,9,8,5,7,5,8],
  [20,6,8,5,10,5,6], [17,6,8,8,7,8,9], [19,4,8,7,9,8,9], [15,6,9,6,5,7,12],
  [17,8,8,8,7,9,9], [18,7,10,9,8,7,8], [15,7,8,6,5,8,10], [18,7,8,5,8,6,8],
];
const rationales = [
  '風間隊の連携型ARとして防御8と援護9を分離。機動8をAP18の候補に採用。',
  '単独部隊と隠密銃装備を参考にAP17/技術8、援護4を独自選択。BBFの未掲載値は推定。',
  '機動10と近接描写を参考。防御7/援護8は二つの別候補として採用。',
  '拳銃中心の機動8を参考。防御5と援護5は独立した補完候補。',
  '追跡と指揮を行う攻撃手としてAP18/援護7を選択。未掲載7能力を個別設計。',
  '防御・援護9を参考に受け9/援護8へ別採用。',
  '旋空の戦闘描写を参考に攻撃11、機動6、援護6を個別設計。',
  '弧月と射撃の両装備を参考に攻撃6/技術6、機動7を個別選択。',
  'ARの援護役を参考に防御7/援護8。',
  '攻撃12と技術9を参考。防御5/援護5を別採用。',
  'BBF防御・援護4を参考に低防御4/援護4を独立採用。',
  '射撃支援の描写を参考に防御6/援護7を選択。',
  '銃手の広域支援を参考に防御7/援護8を分離。',
  '隠密狙撃を参考に機動5/技術9/援護6を個別設計。',
  '聴覚を生かす近接連携を参考に防御6/援護7。',
  '積極的な接近描写を参考に機動8/攻撃7、援護4を独自選択。',
  'BBFと支援描写を参考に防御6/援護7。',
  '狙撃援護を参考に防御7/援護8を分離。',
  '接近機動8を参考に防御5/援護6を独立採用。',
  '拳銃近距離の攻撃10/技術9を参考。防御5/援護5は別補完。',
  '狙撃連携を参考に防御6/援護7。',
  '小荒井との支援を参考に防御6/援護7。',
  '防御・援護6を参考に別候補6/6。',
  '観測済み6能力を維持。機動8のBBF参考からAP18を個別採用。',
  '散弾銃と指揮の描写を参考に防御6/援護6。',
  '7能力はシミュ観測台帳値を保持。BBF変換を適用しない。',
  '7能力はシミュ観測台帳値を保持。BBF変換を適用しない。',
  '7能力はシミュ観測台帳値を保持。BBF変換を適用しない。',
  'BBF攻撃12/トリオン14を参考。防御7/援護7は別補完。',
  '狙撃指揮・支援を参考に防御10/援護11を分離。',
  '観測トリオン25を保持しBBF38を却下。援護5/技術6だけを独立採用。',
  '狙撃技術10を参考に防御5/援護6を独立採用。',
  '観測AP14ほか4能力を保持。射手支援を参考に回避4/援護7を独立補完。',
  '観測AP15/攻撃8/防御6/援護8を保持。残項目のみBBFを参考。',
  '7能力はシミュ観測台帳値を保持。BBF変換を適用しない。',
  '観測5能力を保持。残回避6/技術8だけをBBF参考で補完。',
  '高防御と防衛連携の描写を参考に防御10/援護9。',
  '散弾銃の支援描写を参考に防御7/援護7。',
  '味方支援とブレード防御を参考に防御8/援護8。',
  '射撃連携所有者として援護8、機動5/防御6を別設計。',
  '銃手支援を参考に防御6/援護7。',
  '狙撃の技術11を参考に防御7/援護8。',
  '近接援護と連携を参考に防御7/援護7。',
  '角付き近界トリガー時のBBFを通常装備へ直輸入しない。標準装備としてトリオン12/機動8などを個別設計。',
  'BBF攻撃14を参考。防御8/援護9は個別補完。',
  'BBF機動9/技術9を参考。防御8/援護8は別採用。',
  'BBF技術13を参考。防御6/援護7は別採用。',
  '射撃支援を参考に防御8/援護10。',
  '草壁隊のAR装備を参考にAP18/攻撃9/防御8/援護8を個別設計。',
  '銃手の戦闘描写を参考に攻撃11/技術9/援護7を個別設計。',
  'BBF機動11を参考。防御5/援護6は別補完。',
  '狙撃3銃種とサイレンサーを参考に攻撃8/技術10/援護7を個別設計。',
  '部隊支援を参考に防御8/援護9。',
  '二本狙撃銃を参考に防御5/援護6。',
  '連携ARとして防御8/援護9を分離。',
  'BBF防御・援護5を参考に二つの候補5/5。',
  'BBF機動10を参考。防御5/援護5は別補完。',
  'ARの射撃防御を参考に防御8/援護8。',
  '槍の攻防を参考に防御7/援護8を独立採用。',
  'BBF技術12を参考。防御6/援護7は別補完。',
  '多武装支援と隊長役を参考に防御8/援護9/技術9を個別設計。',
  '二刀レイガストの装備を参考に攻撃10/防御9/技術8を個別設計。',
  '片桐隊狙撃手として機動5/技術10/援護8を個別設計。',
  'バイパー射撃の技術を参考に防御5/援護6を分離。',
];

// Explicit profiles: AP/wait/power/hit/range/sector. R1's nine baselines are retained.
const combat: Record<number, [WeaponProfile['actionKind'], number, number, number, number, number, number, WeaponProfile['powerModel'], string?]> = {
  1:['sniper',5,3,20,85,12,30,'ibis'], 2:['shot',2,1,10,100,8,60,'trion'], 3:['shot',2,1,11,95,5,60,'trion','pistol'],
  4:['shot',2,1,12,95,5,60,'trion','shotgun'], 5:['shot',3,1,13,90,8,60,'trion','rifle'], 6:['sniper',4,2,140,95,14,30,'fixed'],
  12:['melee',2,1,10,95,2,120,'attack'], 13:['melee',2,1,11,93,2,120,'attack'],
  22:['shot',2,1,9,100,8,60,'trion'], 23:['shot',2,1,10,97,5,60,'trion','pistol'], 24:['shot',3,1,11,98,9,75,'trion'],
  25:['shot',3,1,12,95,8,60,'trion','rifle'], 26:['shot',3,1,10,92,8,60,'trion'], 27:['shot',3,1,11,91,5,60,'trion','pistol'],
  29:['blast',2,1,8,100,8,60,'meteor'], 30:['blast',4,2,10,90,9,60,'meteor','grenade'], 31:['blast',3,2,9,90,8,60,'meteor','rifle'],
  32:['sniper',3,1,80,95,12,30,'fixed'], 33:['melee',2,1,9,90,2,120,'attack'], 35:['melee',2,1,10,95,2,120,'attack'], 36:['melee',2,1,11,93,3,105,'attack'],
};
const supportOptions: Record<number, Record<string, number | boolean | string>> = {
  7:{specialAction:'escudo',ap:3,wait:1,range:4,height:2,durability:300},
  8:{specialAction:'chameleon',ap:2,wait:1,evade:10,noAutomaticTarget:true}, 9:{grasshopper:true,maxRise:4,riseAp:2},
  10:{silencer:true,requiresGun:true}, 11:{allRoundBp:5000}, 14:{specialAction:'star-maker',ap:1,turns:1},
  15:{specialAction:'spider',ap:2,wait:1,maxZones:6,enemyMoveAp:1}, 16:{specialAction:'spider',ap:1,wait:1,maxZones:4,enemyMoveAp:1},
  17:{specialAction:'thruster',ap:2,wait:1,powerBp:15000}, 18:{specialAction:'thruster',ap:3,wait:1,powerBp:17000},
  19:{specialAction:'timer',ap:1,wait:1,fuseTicks:10,activationDelayTicks:10}, 20:{beacon:true,specialAction:'beacon',ap:2,wait:1,maxUses:3},
  21:{specialAction:'teleport',ap:3,wait:2,range:4}, 28:{stealth:true,maintenanceAp:0},
  34:{specialAction:'genyo',ap:2,wait:1,powerBp:12500}, 37:{specialAction:'senku',ap:2,wait:1,powerBp:15000,range:4},
  38:{specialAction:'lead',ap:2,wait:1,requiredSlots:2,speedBp:5000,rangeBp:5000},
  39:{specialAction:'lead-custom',ap:1,wait:1,maxUses:3,speedBp:6500,rangeBp:7000},
  40:{specialAction:'idaten',ap:4,wait:3,maxSteps:5}, 41:{specialAction:'mako',ap:3,wait:2,minBp:8000,maxBp:18000},
};
const dependencies: Record<number, number[]> = {10:[3,4,5,23,25,27,30,31,32,6],14:[4],16:[13],17:[33],18:[33],19:[24,29],34:[35,36],37:[35,36],38:[32,22],39:[3,27],40:[35],41:[35]};
const disabledWeapons = new Map<number, string>();
const wid = (n: number): string => `trigger_${String(n).padStart(2,'0')}`;
const weapons: WeaponProfile[] = weaponLedger.map((w, i) => {
  const n = i+1; const c = combat[n]; const opts = supportOptions[n];
  return { ...original, id:w.id, name:w.name, family:w.family, enabled:!disabledWeapons.has(n),
    status:disabledWeapons.get(n) ?? 'executable-original-profile',
    actionKind:c?.[0] ?? (dependencies[n] ? 'option' : 'support'), attackAp:c?.[1] ?? null,
    defenseAp:[11,33,35,36].includes(n) ? 1 : null, waitUnits:c?.[2] ?? ([11].includes(n)?1:0),
    basePower:c?.[3] ?? null,baseHit:c?.[4] ?? null,range:c?.[5] ?? null,sector:c?.[6] ?? 120,
    powerModel:c?.[7] ?? 'none',requiredSlots:[1,6,32,38].includes(n)?2:1, dependencies:(dependencies[n]??[]).map(wid),
    defenseModel:n===11?'shield':n===33?'raygust':[35,36].includes(n)?'kogetsu':null,
    penetration:n===1,structureDamage:c ? (n===6?60:n===32?20:c[3]) : null,projectile:[29,30,31].includes(n),
    friendlyFire:[29,30,31].includes(n),guardable:![29,30,31].includes(n),evadable:![29,30,31].includes(n),
    options:{...opts,...(c?.[0]==='melee'?{nonAttackerPenaltyAp:1}:{}),...(n===33?{supportsShieldMode:true}:{}),...(dependencies[n]?.length?{dependenciesMode:'any'}:{}),...(c?.[8]?{gunClass:c[8]}:{}),...(n===5?{compatibleGunClasses:'rifle,machinegun'}:{}),...(n===6?{fixedPower:140}:{}),...(n===32?{fixedPower:80}:{}),...(n===24?{homing:true,curvedPath:true}:{}),...([26,27].includes(n)?{curvedPath:true,waypointsRequired:true,maxWaypoints:8}:{}),...(n===29?{blastBudget:12,projectileSpeed:1732051,maxAgeTicks:50,fuse:0,hp:1}:{}),...(n===30?{blastBudget:14,projectileSpeed:1299038,maxAgeTicks:60,fuse:3,hp:2,arcHeight:2800000,gravity:140000}:{}),...(n===31?{blastBudget:10,projectileSpeed:2598076,maxAgeTicks:40,fuse:0,hp:1,arcHeight:0,gravity:0}:{}),...(n===1?{penetrationBudget:12,localFractureCoefficient:500000}:{}),...(n===13?{modifiedBlade:true}:{}),...(n===36?{spear:true}:{})},
    referenceIds:[`weapon-ledger:${w.id}`,...([2,3,6,9,11,12,28,33,35].includes(n)?['runtime-r1:baseline']:['S16-trigger-descriptions'])],
    rationale:`C1個別補完。${w.name}の原作分類を保持。数値はシミュ観測ではない。${disabledWeapons.get(n)??'R1.3の実行分類へ明示適用。'}`,
  };
});

// [kind, hook, values, own explanation]. Numeric choices absent from S3 are C1 supplements.
const effectRows: [string,string,Record<string,number|boolean|string>,string][] = [
  ['melee-link','follow-up',{windowTicks:5,ap:0,wait:0},'近接所有者の直前発射と他味方通常攻撃からMAIN追撃。'],
  ['shot-link','follow-up',{windowTicks:5,ap:1,wait:0},'射撃所有者の直前発射と他味方通常攻撃から有料MAIN追撃。'],
  ['dual-power','before-power',{family:'shotgun',bp:12000},'両側散弾銃の出力を12000bpにする補完。'],
  ['dual-power','before-power',{family:'rifle',bp:11500},'両側突撃銃の出力を11500bpにする補完。'],
  ['suppress-shot','after-defense',{apDrain:1,wait:1},'射撃の防御成立時だけ追加APと待ちを付ける。'],
  ['suppress-sniper','after-defense',{apDrain:1,wait:1},'狙撃の防御成立時だけ追加APと待ちを付ける。'],
  ['blade-parry','before-defense',{bp:12500,wait:0},'弧月受けの補正12500bpと防御待ち0。'],
  ['close-shooter','before-power',{maxRange:6,powerBp:11500,hit:10},'6セル以内の射手弾へ補完出力と命中補正。'],
  ['escudo-hit','special',{apDrain:3,wait:1},'エスクード対象のAPと待ちを変更する作用定義。'],
  ['decoy','after-targeted',{defenseBp:8000,actions:6},'自分への攻撃者へ6完了コマンドの防御低下。'],
  ['stealth-kill','before-damage',{requires:'trigger_10',except:'instinct-evasion',outsideDefenseSector:true},'サイレンサー射撃の防御扇外条件付き撃破。'],
  ['learn-defense','before-defense',{repeat:2,bp:12500,signature:'attackerId,weaponId'},'同じ攻撃者/weaponIdの攻撃に2回目以降、補完防御倍率12500bp。'],
  ['guaranteed-hit','before-hit',{weapon:'trigger_06',except:'instinct-evasion'},'イーグレット限定で命中抽選を省く。'],
  ['instinct-evasion','before-evasion',{sniperBonus:20,maxPercent:80,outsideSector:true},'扇外回避と狙撃回避のR1補正。'],
  ['mobile-sniper','before-cost',{amount:-1,minimum:1},'狙撃APを1減らし最低1。'],
  ['vital-hit','after-damage',{percent:30},'正の被害成立後30%の条件付き撃破。'],
  ['hearing','observation',{range:10},'半径10の移動報告。光学情報を付与しない。'],
  ['melee-defense','before-defense',{requiresLoadoutMelee:true},'狙撃装備中の近接被弾に所持ブレード受けを選択。'],
  ['strong-legs','turn-start',{ap:1},'未反映flagの場合だけAPを1増加。'],
  ['sniper-pressure','after-defense-evasion',{apDrain:1},'狙撃を防御・回避した対象へAP1追加消費。'],
  ['mixed-dual','before-cost-power',{apDiscount:1,discountScope:'combined',bp:11500},'近接と射撃の両攻撃AP合計を1減らし、両側へ出力の補完補正。'],
  ['precise-sniper','before-hit',{hit:10,range:2},'狙撃命中10pt/射程2の独自補完。'],
  ['attack-cost','before-cost',{amount:1},'全攻撃APを1増やす。待ちは維持。'],
  ['spear-range','before-range',{family:'弧月',range:3},'弧月の基準射程を3に固定、旋空は対象外。'],
  ['twin-snipe','before-cost',{weapon:'trigger_06',apDiscount:3,discountScope:'combined'},'二本イーグレットの合計APを3軽減。'],
  ['trion-range','before-range',{range:1,blastRange:1,blastCellScale:3464102},'射撃射程と爆発範囲へ大トリオン補正。'],
  ['trion-range','before-range',{range:2,blastRange:2,blastCellScale:3464102},'射撃射程と爆発範囲へ極大トリオン補正。'],
  ['dual-power','before-power',{family:'pistol',bp:12000},'両側拳銃に出力12000bpの補完。'],
  ['quick-shot','priority',{group:1},'双方発射意図があるtickだけ先行群。'],
  ['pin-sniper','before-hit-power',{hit:15,bp:12000},'行動中・待ち中の対象への狙撃補正。'],
  ['random-power','before-power',{actionKind:'shot',minBp:7000,maxBp:11000},'注入乱数で射撃出力の範囲を選ぶ。'],
  ['random-power','before-power',{actionKind:'sniper',minBp:8000,maxBp:11500},'注入乱数で狙撃出力の範囲を選ぶ。'],
  ['composite-dual','before-power',{subPowerBp:20000,subActionKind:'sniper',requiresFamily:'アステロイド'},'通常弾両攻撃のSUBを二倍狙撃分類。'],
  ['no-melee-penalty','before-cost',{amount:0},'攻撃手装備の位置ペナルティを免除。'],
  ['lead-custom','special',{maxUses:3,leadTicks:30,apDrain:3,evade:0},'改造鉛弾を試合3回準備。適合拳銃の次発にAP低下/30tick回避封鎖。'],
  ['lead-sniper','special',{weapon:'trigger_32',range:10,hit:70,leadTicks:30,apDrain:3,evade:0},'ライトニングと鉛弾の次発を射程10/命中70に固定。AP低下/30tick回避封鎖。'],
  ['lead-hound','special',{family:'ハウンド',range:4,hit:80,noRangeBonus:true,leadTicks:30,apDrain:3,evade:0},'追尾弾と鉛弾の次発を射程4/命中80に固定。トリオン射程補正を除外。'],
  ['option-ap','before-cost',{weapon:'trigger_08',amount:-1,evade:10},'カメレオンの起動消費と回避補正。'],
  ['attack-cost','before-cost',{family:'machinegun',amount:-1},'機関銃分類の射撃AP軽減。未監査の機関砲へ自動適用しない。'],
  ['loadout-aptitude','turn-start-power',{family:'pistol',ap:1,bp:11500},'拳銃所持でAP1と独自出力補正。'],
  ['special-power','before-power',{special:'genyo',bp:12500},'幻踊固有行動への追加出力補正。'],
  ['synthesis','special',{requires:'dual-shooter',maxUses:2,allowedPairs:'asteroid+asteroid,asteroid+meteor,hound+meteor,viper+meteor'},'両側射手弾を準備して次発に明示合成profileを適用。試合2回。'],
  ['guard-defense','before-defense',{bp:12500},'GUARD身代わりで独自防御倍率。'],
  ['loadout-aptitude','turn-start',{family:'弧月',ap:2},'弧月所持でAPを2増加。'],
  ['silencer-hit','before-hit',{hit:10},'サイレンサー使用射撃へ独自命中補正10pt。'],
  ['distance-power','before-power',{family:'shotgun',maxRange:5,bpPerCell:1000},'散弾銃の距離差ごとに独自倍率を加算。'],
  ['loadout-aptitude','turn-start',{family:'スコーピオン',ap:2},'スコーピオン所持でAPを2増加。'],
  ['option-ap','before-cost',{weapon:'trigger_15',amount:-1},'通常スパイダー設置APを1軽減。'],
  ['attack-cost','before-cost',{family:'grenade',amount:-1},'擲弾銃分類の射撃APを1軽減。'],
  ['option-wait','after-special',{weapon:'trigger_21',divisor:2},'テレポーター待ちを2除算して切り上げ。'],
  ['versatile','match-setup',{maxSelections:2,excluded:'skill_42,skill_52',allowed:'skill_38,skill_39,skill_40,skill_41,skill_43,skill_44,skill_45,skill_46,skill_47,skill_48,skill_49,skill_50,skill_53,skill_54,skill_55'},'適正二つを試合中に明示選択。合成/変化弾適正は除外。'],
  ['curved-shot','special',{requires:'viper',maxWaypoints:8},'最大8経由点の各3D区間を検証し次のバイパー弾へ曲折経路を設定。'],
  ['special-random-floor','before-power',{special:'mako',minBp:10000},'魔光乱数の独自下限10000bp。'],
  ['lead-hit','before-hit',{hit:15},'鉛弾の命中減少へ独自軽減15pt。'],
  ['wire-boost','before-power-evasion-defense',{powerBp:11500,evade:10,defenseBp:11500},'ワイヤー上の独自攻撃・回避・防御補正。'],
];
const disabledEffects = new Set<number>();
const hookMap: Record<string,string> = {'follow-up':'GROUP_END','before-power':'BEFORE_FIRE','before-hit':'HIT','before-defense':'DEFEND','before-evasion':'EVADE','before-cost':'BEFORE_FIRE','before-damage':'DAMAGE','after-damage':'DAMAGE','after-defense':'DEFEND','after-defense-evasion':'EVADE','after-targeted':'SELECT_TARGET','before-cost-power':'BEFORE_FIRE','before-hit-power':'BEFORE_FIRE','before-range':'SELECT_TARGET','turn-start':'TURN_START','turn-start-power':'TURN_START','priority':'BEFORE_FIRE','observation':'SELECT_TARGET','special':'COMMAND_START','after-special':'COMMAND_START','match-setup':'COMMAND_START','before-power-evasion-defense':'BEFORE_FIRE'};
const effects: EffectDefinition[] = skillLedger.map((e,i) => {
  const [kind,triggerHook,values,description] = effectRows[i];
  return {...original,id:e.id,name:e.name,enabled:!disabledEffects.has(i+1),status:disabledEffects.has(i+1)?'defined-but-command-or-duration-unimplemented':'individual-C1-executable',
    kind,triggerHook:hookMap[triggerHook],values:{...values,activation:['lead-custom','lead-sniper','lead-hound','synthesis','versatile','curved-shot'].includes(kind)?'manual':'passive',target:['decoy','suppress-shot','suppress-sniper','sniper-pressure','escudo-hit','stealth-kill','vital-hit'].includes(kind)?'attack-target':'effect-owner',condition:kind,visibility:'owner-and-observed-outcome',release:kind==='learn-defense'?'match-end':kind==='decoy'?'target-six-completed-actions':'action-end'},description,priority:triggerHook==='follow-up'?70:triggerHook.includes('cost')?10:triggerHook.includes('hit')?20:triggerHook.includes('evasion')?30:triggerHook.includes('defense')?40:50,
    ap:i===1?1:[35,36,37,42,51,52].includes(i+1)?2:0,wait:i+1===42?1:0,stackKey:e.id,maxStacks:1,duration:['learn-defense','versatile','lead-custom'].includes(kind)?'match':['lead-sniper','lead-hound'].includes(kind)?'tick':triggerHook==='turn-start'?'turn':'action',
    referenceIds:[`S3:skill:${e.id}`],rationale:'S3は名称・条件の二次整理。実行フック/倍率の未記載分はC1独自補完。所有者完全性を保証しない。'};
});

const weaponByName = new Map(weapons.map(w=>[w.name,w.id]));
const skillByName = new Map(effects.map(e=>[e.name,e.id]));
// Original supplemental ownership. This is neither a recovered normal skill list nor S3 ownership evidence.
const skillAssignments: number[][] = [
  [1,38,47],[11,38,45],[14,19,47],[28,40],[21,44],[7,43,44],[7,44],[21,44],
  [4,43],[14,47],[32],[4,5,39],[31,39,49],[13,22],[17,38,47],[19,44],
  [5,45],[6,20],[19,44],[28,29,40],[18,22],[7,43,44],[41,44],[13,16,48],
  [3,46],[15,22],[48,55],[1,51],[8,33],[12,22],[23,27,36,37],[6,30],
  [8,10],[18,34],[19,44],[2,4],[7,12],[3,46],[7,41],[2,26],
  [4,5],[22,30],[7,38],[9,42,52],[1,44],[1,38,47],[13,16],[2,26,42,52],
  [21,43],[4,29,40],[19,47],[11,45],[4,43,50],[25,22],[4,43,50],[24,50],
  [1,53],[35,54],[24,41],[13,22],[4,48],[7,43],[20,22],[52,22],
];
const provenance: ContentPack['overrides'] = [];
const restrictions: any[] = [];
const presets: CharacterPreset[] = [];
const bbfIds = new Set([1,3,4,6,9,10,11,12,13,15,17,18,19,20,21,22,23,24,25,27,28,29,30,31,32,34,36,37,38,39,41,42,43,45,46,47,48,51,53,54,55,56,57,58,59,60,64]);
// Only the five BBF reference dimensions used in candidate selection are stored here.
// trion/attack/combined defense-support/mobility/technique, from secondary BBF table, volume14.
const bbfRows: Record<number,number[]> = {
  1:[6,7,9,8,8],3:[7,9,8,10,8],4:[5,7,5,8,6],6:[6,7,9,7,8],9:[7,7,7,7,7],10:[7,12,5,7,9],
  11:[5,6,4,5,7],12:[8,8,7,7,8],13:[9,7,7,5,7],15:[8,7,7,8,8],17:[6,5,6,5,7],18:[7,7,8,5,8],
  19:[4,7,6,8,6],20:[7,10,5,7,9],21:[6,6,7,4,9],22:[5,6,6,8,7],23:[5,6,6,8,6],24:[4,8,7,8,9],
  25:[6,9,6,7,7],27:[2,3,4,4,5],28:[6,9,6,8,7],29:[14,12,7,6,8],30:[7,8,11,5,10],31:[38,2,5,3,6],
  32:[6,8,6,5,10],34:[6,8,8,5,8],36:[7,6,7,6,8],37:[7,9,10,7,9],38:[7,8,7,7,7],39:[5,6,8,7,8],
  41:[6,6,7,6,7],42:[5,6,8,4,11],43:[5,6,7,7,6],45:[6,14,9,8,8],46:[6,9,8,9,9],47:[6,9,7,4,13],
  48:[12,8,10,5,9],51:[5,9,6,11,7],53:[7,7,9,7,8],54:[6,8,6,5,9],55:[7,7,9,7,8],56:[9,8,5,7,8],
  57:[6,8,5,10,6],58:[6,8,8,7,9],59:[4,8,8,9,9],60:[6,9,7,5,12],64:[7,8,6,8,8],
};
for (let i=0;i<characters.length;i++) {
  const c=characters[i]; const row=statRows[i]; const stats={} as Stats;
  for (let j=0;j<statKeys.length;j++) {
    const field=statKeys[j]; const observed=c.simulation_stats[field]; const value=observed ?? row[j]; stats[field]=value;
    provenance.push({characterId:c.id,field,value,snapshot,transformationVersion:'C1.0',plausibleRange:observed!==null?[value,value]:[Math.max(0,value-(field==='ap'?2:2)),Math.min(field==='ap'?40:60,value+2)],validationCaseIds:[`C1-${c.id}-${field}`, 'CONTENT-T1'],
      ...(observed!==null?{evidenceStatus:'observed' as const,sourceIds:['S3'],referenceIds:[`observation-ledger:${c.id}:${field}`]}:{...original,referenceIds:[`rank-reference:${c.id}`,...(bbfIds.has(i+1)?[`bbf:${c.id}`]:[])]}),
      rationale:`${field}=${value}: ${rationales[i]} ${observed!==null?'既存シミュ値固定。':'この欄は候補採用であり公式値転記ではない。'}`});
  }
  const loadout: Loadout={main:c.normal_loadout.main.map((name:string)=>weaponByName.get(name)??'none'),sub:c.normal_loadout.sub.map((name:string)=>weaponByName.get(name)??'none')};
  const knownSkills=c.known_simulation_skills.map((name:string)=>skillByName.get(name));
  const skills=[...new Set([...knownSkills,...skillAssignments[i].map(n=>`skill_${String(n).padStart(2,'0')}`)])] as string[];
  if (skills.some((id:string|undefined)=>!id)) throw new Error(`unknown skill name ${c.id}`);
  const rangeOverride: Record<string,number>={};
  for (const id of new Set([...loadout.main,...loadout.sub])) {
    const profile=weapons.find(w=>w.id===id);
    if(profile?.range!==null && profile?.range!==undefined) {
      rangeOverride[id]=profile.range;
      provenance.push({...original,characterId:c.id,field:`rangeOverride.${id}`,value:profile.range,snapshot,transformationVersion:'C1.0',plausibleRange:[Math.max(1,profile.range-2),Math.min(64,profile.range+2)],validationCaseIds:[`C1-${c.id}-${id}-range`],referenceIds:[`C1:weapon:${id}`,`rank-reference:${c.id}`],rationale:`${c.name}の${profile.name}にC1個別profileの最大射程${profile.range}を明示採用。BBF射程から自動変換した値ではない。`});
    }
  }
  const common={...original,characterId:c.id,name:c.name,group:c.group,position:c.position,kind:'character' as const,stats,defaultLoadout:loadout,skills,
    rangeOverride,assetId:`original-token:${c.id}`,snapshot,strongLegsIncluded:skills.includes('skill_19'),referenceIds:[`character-ledger:${c.id}`,`C1:${c.id}`],rationale:rationales[i]};
  presets.push({...common,id:c.id,enabled:false,status:'normal-ownership-unconfirmed',mode:'normal',skills:knownSkills});
  const removedWeapons=[...loadout.main,...loadout.sub].filter(id=>id!=='none'&&!weapons.find(w=>w.id===id)?.enabled);
  const removedSkills=skills.filter((id:string)=>!effects.find(e=>e.id===id)?.enabled);
  const allowedLoadout={main:loadout.main.map(id=>removedWeapons.includes(id)?'none':id),sub:loadout.sub.map(id=>removedWeapons.includes(id)?'none':id)};
  // Non-executable support entries become explicit empty slots in this limited sandbox preset.
  // Such a preset is never the normal simulation snapshot and the removals are manifested.
  restrictions.push({presetId:`${c.id}-supplemented`,characterId:c.id,normalOwnershipComplete:false,observedOrSecondaryKnownEffectIds:knownSkills,supplementedEffectIds:skills.filter(id=>!knownSkills.includes(id)),omittedWeaponIds:[...new Set(removedWeapons)],omittedEffectIds:removedSkills,reason:'explicit-original-sandbox-not-normal-simulation'});
  presets.push({...common,id:`${c.id}-supplemented`,enabled:true,status:'supplemented-original-ownership-unconfirmed',mode:'supplemented',defaultLoadout:allowedLoadout,skills:skills.filter((id:string)=>!removedSkills.includes(id))});
  if ([26,27,28,35].includes(i+1)) {
    const train={main:allowedLoadout.main.slice(),sub:allowedLoadout.sub.slice()};
    presets.push({...common,id:`${c.id}-training`,enabled:true,status:'training-core-known-stat-limited-skill-snapshot',mode:'training',defaultLoadout:train,strongLegsIncluded:knownSkills.includes('skill_19'),skills:knownSkills.filter((id:string)=>['skill_01','skill_02','skill_05','skill_06','skill_14','skill_15','skill_19','skill_29'].includes(id))});
  }
}
// Explicit range adoptions from S11 are independent supplemental bindings, never observed weapon rows.
for (const [id,weapon,value] of [['char_27',wid(2),7],['char_28',wid(3),5],['char_26',wid(6),14],['char_35',wid(22),7],['char_25',wid(4),5],['char_33',wid(2),7],['char_36',wid(5),8],['char_34',wid(6),14],['char_45',wid(35),2]] as const) {
  for (const preset of presets.filter(c=>c.characterId===id)) preset.rangeOverride[weapon]=value;
  const record={...original,characterId:id,field:`rangeOverride.${weapon}`,value,snapshot,transformationVersion:'C1.0',plausibleRange:[value,value],validationCaseIds:[`C1-${id}-range`],referenceIds:[`S11:range:${id}`],rationale:`S11の人物射程を参考に${weapon}へ明示採用。原資料の武器結合は未確認なので独自overrideとする。`};
  const old=provenance.findIndex(o=>o.characterId===id&&o.field===record.field);
  if(old>=0)provenance[old]=record;else provenance.push(record);
}
const nameToId = new Map(characters.map(c=>[c.name,c.id]));
const pack: ContentPack={version:'C1.0-sandbox',ruleVersion:'R1.3',calibrated:false,characters:presets,weapons,effects,
  helpPools:{I:help.I.map((name:string)=>`${nameToId.get(name)}-supplemented`),II:help.II.map((name:string)=>`${nameToId.get(name)}-supplemented`),III:help.III.map((name:string)=>`${nameToId.get(name)}-supplemented`)},
  teams:read('teams.json').map((t:any)=>({...t,members:t.members.map((name:string)=>`${nameToId.get(name)}-supplemented`)})),overrides:provenance};
compileContent(pack);
mkdirSync('data/runtime',{recursive:true});mkdirSync('data/maps/M1.2',{recursive:true});
const write=(path:string,value:unknown):void=>writeFileSync(path,JSON.stringify(value,null,2)+'\n','utf8');
const calibratedPack = compileContent(createCalibratedContent(pack));
write('data/runtime/content-pack-b1.json',pack);
write('data/runtime/content-pack.json',calibratedPack);
write('data/runtime/calibration-report.json',C2_CALIBRATION_RECORD);
write('data/runtime/calibration-overrides.json',calibratedPack.weapons.filter(w=>['ibis','meteor'].includes(w.powerModel)).flatMap(w=>Object.entries(w.options??{}).filter(([field])=>['penetrationBudget','localFractureCoefficient','blastBudget'].includes(field)).map(([field,value])=>({...original,weaponId:w.id,field:`options.${field}`,value,baselineValue:pack.weapons.find(b=>b.id===w.id)?.options?.[field],snapshot:'C2-project-fixture-calibration',transformationVersion:'C2.0',referenceIds:[C2_CALIBRATION_RECORD.id],rationale:C2_CALIBRATION_RECORD.rationale,plausibleRange:[value,value],validationCaseIds:C2_CALIBRATION_RECORD.validationCaseIds}))));
write('data/runtime/preset-restrictions.json',restrictions);
write('data/runtime/weapon-overrides.json',weapons.flatMap(w=>['attackAp','defenseAp','waitUnits','basePower','baseHit','range','sector','requiredSlots','structureDamage',...Object.keys(w.options??{}).map(key=>`options.${key}`)].map(field=>{
  const value=field.startsWith('options.')?w.options?.[field.slice(8)]:w[field as keyof WeaponProfile];
  return {...original,weaponId:w.id,snapshot,field,value,transformationVersion:'C1.0',referenceIds:w.referenceIds,rationale:w.rationale,
    plausibleRange:typeof value==='number'?[value,value]:null,applicability:value===null?'not-applicable':'explicit-profile',validationCaseIds:[`C1-${w.id}-${field}`,'CONTENT-T8']};
})));
const sourceValueFields: Record<string,string[]>={skill_01:['ap'],skill_05:['apDrain','wait'],skill_06:['apDrain','wait'],skill_09:['apDrain','wait'],skill_10:['actions'],skill_15:['amount'],skill_16:['percent'],skill_17:['range'],skill_19:['ap'],skill_20:['apDrain'],skill_21:['apDiscount'],skill_23:['amount'],skill_24:['range'],skill_25:['apDiscount'],skill_26:['range','blastRange'],skill_27:['range','blastRange'],skill_35:['maxUses'],skill_36:['range','hit'],skill_37:['range','hit'],skill_38:['amount'],skill_39:['amount'],skill_40:['ap'],skill_44:['ap'],skill_47:['ap'],skill_48:['amount'],skill_49:['amount'],skill_50:['divisor'],skill_51:['maxSelections']};
write('data/runtime/effect-contracts.json',effects.map(e=>({...e,snapshot,transformationVersion:'C1.0',
  knownOwnerCharacterIds:characters.filter(c=>c.known_simulation_skills.includes(e.name)).map(c=>c.id),
  supplementalOwnerCharacterIds:characters.filter((_c,i)=>skillAssignments[i].some(n=>`skill_${String(n).padStart(2,'0')}`===e.id)).map(c=>c.id),
  normalOwnershipComplete:false,sourceDescriptionId:`S3:skill:${e.id}`,
  sourceNumericReference:e.id==='skill_31'?{minPercent:70,maxPercent:110,evidenceStatus:'secondary-summary',sourceIds:['S3']}:e.id==='skill_32'?{minPercent:80,maxPercent:115,evidenceStatus:'secondary-summary',sourceIds:['S3']}:e.id==='skill_33'?{subMultiplier:2,evidenceStatus:'secondary-summary',sourceIds:['S3']}:null,
  valueOverrides:Object.entries(e.values).map(([field,value])=>({...((sourceValueFields[e.id]??[]).includes(field)?{evidenceStatus:'secondary-summary',sourceIds:['S3']}:original),field,value,referenceIds:[`S3:skill:${e.id}`],rationale:(sourceValueFields[e.id]??[]).includes(field)?'S3明記の数値・百分率を二次整理として採用。原作直接観測には昇格しない。':'未記載の倍率・型・個別実行値はC1独自補完。',plausibleRange:typeof value==='number'?[value,value]:null,validationCaseIds:[`C1-${e.id}-${field}`]})),
})));
write('data/runtime/reference-records.json',characters.map((c:any,i:number)=>({id:`rank-reference:${c.id}`,characterId:c.id,url:c.sources.character,evidenceStatus:'secondary-summary',snapshot:'rank-current-loadout-before-selection',reviewedAt:'2026-10-06',bbfReferenceId:bbfIds.has(i+1)?`bbf:${c.id}`:null,bbfURL:bbfIds.has(i+1)?'https://w.atwiki.jp/worldtrigger2ch/pages/383.html':null,rationale:rationales[i]})));
write('data/runtime/bbf-references.json',Object.entries(bbfRows).map(([n,values])=>({id:`bbf:${characters[Number(n)-1].id}`,characterId:characters[Number(n)-1].id,snapshot:'volume14-BBF-secondary',evidenceStatus:'secondary-summary',sourceIds:['S-BBF-WIKI'],url:'https://w.atwiki.jp/worldtrigger2ch/pages/383.html',reviewedAt:'2026-10-06',values:Object.fromEntries(['trion','attack','defenseSupport','mobility','technique'].map((field,i)=>[field,values[i]]))})));
const sourcePaths=['characters.json','weapons.json','skills-index.json','teams.json','help-pools.json','range-observations.json','weapon-row-observations.json',...['I','II','III'].flatMap(s=>[`maps/city-${s}.json`,`maps/M1.0/city-${s}.json`])];
const sourceHashes=Object.fromEntries(sourcePaths.map(path=>[path,createHash('sha256').update(readFileSync(`${sourceRoot}/data/${path}`)).digest('hex')]));
if (existsSync('data/runtime/source-lock.json')) {
  const locked=JSON.parse(readFileSync('data/runtime/source-lock.json','utf8')) as Record<string,string>;
  for (const [path,hash] of Object.entries(locked)) if (sourceHashes[path]!==hash) throw new Error(`Observation source changed: ${path}`);
} else write('data/runtime/source-lock.json',sourceHashes);
for (const stage of ['I','II','III'] as const) {
  const map=read(`maps/city-${stage}.json`) as BattleMap;
  map.version='M1.2';map.schemaVersion=2;map.geometryVersion='G1-D1.1';map.structures=[];
  for (const building of map.buildings) {
    const category=building.category;
    building.materialId=/factory|industrial/.test(category)?'industrial':/tower|midrise|office|commercial|mall|building/.test(category)?'reinforced':'residential';
    const durability={residential:300,industrial:600,reinforced:1200}[building.materialId as 'residential'|'industrial'|'reinforced'];
    for (const cellId of building.cellIds) {
      const cell=map.cells.find(c=>c.id===cellId)!;
      const height=(cell.roofHeight??cell.groundHeight)-cell.groundHeight;
      for (let layerIndex=0;layerIndex<height;layerIndex++) {
        const id=`${building.id}/${cellId}/${layerIndex}`;
        map.structures.push({id,buildingId:building.id,cellId,layerIndex,materialId:building.materialId,maxDurability:durability,currentDurability:durability,supportIds:layerIndex?[`${building.id}/${cellId}/${layerIndex-1}`]:[]});
      }
    }
  }
  write(`data/maps/M1.2/city-${stage}.json`,map);
}
const baselineManifest={schemaVersion:1,contentVersion:pack.version,ruleVersion:pack.ruleVersion,mapVersion:'M1.2',geometryVersion:'G1-D1.1',calibrated:false,
  sourceHashes,counts:{characters:64,normalEnabled:0,supplementedEnabled:64,trainingCore:4,weapons:41,weaponsEnabled:weapons.filter(w=>w.enabled).length,effects:55,effectsEnabled:effects.filter(e=>e.enabled).length},
  ownershipComplete:false,sourcePriority:['simulation-observation','simulation-secondary','contemporary-rank','official-trigger','rank-secondary','original'],
  limitations:['C1 stats and modifiers are explicit original supplements, not official formulas','Normal ownership lists are incomplete: all normal presets disabled','Supplemented presets are restricted sandbox snapshots; see preset-restrictions.json','B1 not calibrated by U-D1/U-D2','M1.2 inherits functional provisional M1.1 placement; M10/M11 not established'],
  citations:[{id:'S3',url:'https://w.atwiki.jp/worldtrigger2ch/pages/430.html',kind:'secondary-summary'},{id:'S-BBF-WIKI',url:'https://w.atwiki.jp/worldtrigger2ch/pages/383.html',kind:'secondary-summary',snapshot:'volume14'}, {id:'S16',url:'https://worldtrigger.info/article/trigger.php',kind:'official-trigger-reference'}]};
write('data/runtime/manifest-b1.json',baselineManifest);
write('data/runtime/manifest.json',{...baselineManifest,contentVersion:calibratedPack.version,calibrated:true,baselineContent:'content-pack-b1.json',calibration:C2_CALIBRATION_RECORD,limitations:baselineManifest.limitations.filter(item=>item!=='B1 not calibrated by U-D1/U-D2').concat('C2 meets project fixture U-D1/U-D2 targets; official physical scale remains unverified')});
console.log(`Generated ${calibratedPack.version} and preserved ${pack.version}: 64 individual stats, 41 weapon profiles (${weapons.filter(w=>w.enabled).length} enabled), 55 named effects (${effects.filter(e=>e.enabled).length} enabled), 3 M1.2 maps.`);

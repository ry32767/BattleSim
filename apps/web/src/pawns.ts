/** Original vector designs; no official sprite or recovered appearance data. */
export const PAWN_HEIGHT = 26;
export type PawnFacing = 'front' | 'back' | 'left' | 'right';
export type PawnAction = 'idle' | 'fire' | 'melee' | 'damage' | 'defend' | 'evade' | 'defeat';
type Hair = 'crop' | 'part' | 'spike' | 'bob' | 'wave' | 'swept' | 'ponytail' | 'braid' | 'mohawk' | 'fringe' | 'curly' | 'tuft';
type Face = 'round' | 'oval' | 'square' | 'pointed';
type Brows = 'soft' | 'straight' | 'angled' | 'arched';
type Glasses = 'none' | 'round' | 'square' | 'half';
type Uniform = 'stripe' | 'double-stripe' | 'panel' | 'zip' | 'chevron' | 'collar';
type Palette = 'slate' | 'ochre' | 'wine' | 'teal' | 'violet' | 'indigo' | 'olive' | 'copper';
const palettes: Record<Palette, { uniformColor: string; trimColor: string }> = {
  slate: { uniformColor: '#25334a', trimColor: '#9db9cf' }, ochre: { uniformColor: '#665231', trimColor: '#e6cc83' },
  wine: { uniformColor: '#653943', trimColor: '#dbacb4' }, teal: { uniformColor: '#245c60', trimColor: '#a6d5cc' },
  violet: { uniformColor: '#55445f', trimColor: '#c6b5de' }, indigo: { uniformColor: '#354c70', trimColor: '#a9c3ec' },
  olive: { uniformColor: '#4f5939', trimColor: '#c3d09e' }, copper: { uniformColor: '#6b4535', trimColor: '#e4b99b' },
};
const evidence = { evidenceStatus: 'original' as const, sourceIds: [] as string[], assetReview: 'original-design' as const };
export type PawnDesign = typeof evidence & {
  id: string; name: string; hairStyle: Hair; hairColor: string; skinColor: string; face: Face; brows: Brows;
  glasses: Glasses; uniform: Uniform; palette: Palette; uniformColor: string; trimColor: string; uniformNumber: string;
  facings: readonly PawnFacing[]; rationale: string;
};
type PawnRow = [string,string,Hair,string,string,Face,Brows,Glasses,Uniform,Palette,string];
// Each row is an authored design choice. IDs do not select a hash or random palette.
const rows: PawnRow[] = [
  ['char_01','歌川遼','part','#293244','#eed1b3','oval','soft','none','zip','slate','01'],
  ['char_02','漆間恒','crop','#313540','#dcb58f','square','straight','none','panel','olive','02'],
  ['char_03','空閑遊真','tuft','#d6dedb','#f4d9c6','round','angled','none','chevron','indigo','03'],
  ['char_04','巴虎太郎','spike','#4d3d33','#e8c5a0','round','soft','none','stripe','ochre','04'],
  ['char_05','王子一彰','wave','#655142','#f0d2b8','pointed','arched','none','collar','violet','05'],
  ['char_06','辻新之助','fringe','#262d37','#eac3a8','oval','straight','none','double-stripe','teal','06'],
  ['char_07','生駒達人','swept','#3c3435','#d7b08e','square','angled','half','panel','copper','07'],
  ['char_08','帯島ユカリ','bob','#4b3d39','#f2d7b8','round','arched','none','chevron','wine','08'],
  ['char_09','柿崎国治','crop','#393b42','#ddba94','square','soft','none','collar','indigo','09'],
  ['char_10','影浦雅人','mohawk','#282d34','#dcb192','pointed','angled','none','zip','wine','10'],
  ['char_11','別役太一','curly','#7b6345','#efd5b4','round','soft','none','double-stripe','ochre','11'],
  ['char_12','犬飼澄晴','swept','#9f8a5d','#f1d3b9','oval','arched','none','stripe','teal','12'],
  ['char_13','北添尋','crop','#434a54','#d7b998','round','straight','none','panel','slate','13'],
  ['char_14','外岡一斗','part','#393b46','#e5c0a4','pointed','straight','none','collar','olive','14'],
  ['char_15','菊地原士郎','ponytail','#53604f','#edcbb0','oval','angled','none','zip','violet','15'],
  ['char_16','南沢海','spike','#5a4738','#e7bf99','pointed','arched','none','double-stripe','copper','16'],
  ['char_17','来馬辰也','part','#5d554b','#e3c4a6','round','soft','round','stripe','olive','17'],
  ['char_18','穂刈篤','fringe','#40454c','#d8b698','square','straight','none','chevron','slate','18'],
  ['char_19','小荒井登','tuft','#756044','#eed0ad','round','angled','none','collar','ochre','19'],
  ['char_20','弓場拓磨','swept','#343035','#cfaa89','square','angled','half','zip','teal','20'],
  ['char_21','古寺章平','part','#4c4544','#e9cbb0','oval','soft','round','panel','indigo','21'],
  ['char_22','奥寺常幸','crop','#4e5147','#ddbfa1','pointed','straight','none','double-stripe','olive','22'],
  ['char_23','三浦雄太','fringe','#65564e','#e4c2a1','round','arched','none','stripe','copper','23'],
  ['char_24','木虎藍','bob','#343547','#f2d3bc','pointed','angled','none','zip','wine','24'],
  ['char_25','諏訪洸太郎','spike','#5b4938','#d8b18e','square','straight','none','panel','ochre','25'],
  ['char_26','隠岐孝二','swept','#8c785c','#edd0b0','oval','soft','none','collar','teal','26'],
  ['char_27','三雲修','part','#25303a','#f0d0b7','oval','soft','square','zip','slate','07'],
  ['char_28','香取葉子','wave','#69515b','#f1d6c1','pointed','arched','none','chevron','violet','28'],
  ['char_29','二宮匡貴','swept','#2b303d','#e4c2a4','square','straight','none','collar','slate','29'],
  ['char_30','東春秋','ponytail','#514d45','#d6b292','oval','soft','none','double-stripe','olive','30'],
  ['char_31','雨取千佳','bob','#3a4b4c','#f3dac3','round','soft','none','panel','teal','31'],
  ['char_32','絵馬ユズル','fringe','#53535f','#e9cdb8','pointed','straight','none','stripe','indigo','32'],
  ['char_33','水上敏志','curly','#4d4340','#deb999','oval','arched','none','zip','copper','33'],
  ['char_34','荒船哲次','crop','#383c46','#d6b397','square','angled','none','chevron','indigo','34'],
  ['char_35','樫尾由多嘉','tuft','#594b40','#eacaad','round','straight','none','collar','wine','35'],
  ['char_36','照屋文香','braid','#644f40','#f0ceb0','oval','soft','none','double-stripe','ochre','36'],
  ['char_37','村上鋼','part','#404447','#dfbea1','square','soft','none','panel','teal','37'],
  ['char_38','堤大地','crop','#69594c','#dbb696','oval','straight','none','stripe','copper','38'],
  ['char_39','熊谷友子','ponytail','#5e4641','#edc9aa','pointed','angled','none','chevron','wine','39'],
  ['char_40','蔵内和紀','wave','#4b4e55','#e8c9ad','oval','arched','half','collar','violet','40'],
  ['char_41','若村麓郎','spike','#765c43','#e2be98','square','soft','none','double-stripe','olive','41'],
  ['char_42','半崎義人','fringe','#363b4a','#e9ccb7','round','straight','none','panel','violet','42'],
  ['char_43','笹森日佐人','tuft','#716552','#efd3b5','oval','arched','none','zip','indigo','43'],
  ['char_44','ヒュース','swept','#b7b29b','#e9d0b2','pointed','straight','none','stripe','slate','44'],
  ['char_45','太刀川慶','wave','#4b3532','#d9af91','square','angled','none','chevron','wine','45'],
  ['char_46','風間蒼也','fringe','#363b38','#e8c7aa','pointed','angled','none','zip','olive','46'],
  ['char_47','当真勇','curly','#5a5d63','#dcbda4','oval','arched','none','panel','copper','47'],
  ['char_48','出水公平','spike','#ac936c','#f0d5b6','round','soft','none','double-stripe','teal','48'],
  ['char_49','佐伯竜司','part','#655548','#e5c3a0','square','arched','none','collar','ochre','49'],
  ['char_50','里見一馬','tuft','#3d4e57','#edcab0','oval','angled','square','stripe','indigo','50'],
  ['char_51','緑川駿','mohawk','#70594c','#f0d2b1','round','arched','none','panel','olive','51'],
  ['char_52','宇野隼人','crop','#50444a','#dec0a8','pointed','soft','none','chevron','violet','52'],
  ['char_53','嵐山准','swept','#5c493d','#e6bf9c','oval','straight','none','zip','wine','53'],
  ['char_54','佐鳥賢','part','#635a4a','#efd0ad','round','arched','none','double-stripe','copper','54'],
  ['char_55','時枝充','fringe','#47484c','#e4c5ab','pointed','soft','none','stripe','teal','55'],
  ['char_56','加古望','ponytail','#58404a','#efd3bf','oval','arched','none','collar','violet','56'],
  ['char_57','黒江双葉','bob','#393643','#f4dac5','round','straight','none','chevron','indigo','57'],
  ['char_58','三輪秀次','spike','#303642','#e4c0a3','pointed','angled','none','panel','slate','58'],
  ['char_59','米屋陽介','tuft','#806347','#e5bf99','oval','angled','none','double-stripe','ochre','59'],
  ['char_60','奈良坂透','part','#4a4640','#e6c8ad','square','straight','none','stripe','olive','60'],
  ['char_61','片桐隆明','wave','#424955','#e1c3aa','oval','soft','square','zip','indigo','61'],
  ['char_62','一条雪丸','braid','#6e5548','#e9c5a5','pointed','arched','none','panel','wine','62'],
  ['char_63','桃園藤一郎','curly','#71624d','#dfb999','round','straight','round','collar','copper','63'],
  ['char_64','那須玲','bob','#3b444e','#f3d7c3','oval','soft','none','double-stripe','teal','64'],
];
export const pawnDesigns: readonly PawnDesign[] = rows.map(([id,name,hairStyle,hairColor,skinColor,face,brows,glasses,uniform,palette,uniformNumber])=>({
  ...evidence,id,name,hairStyle,hairColor,skinColor,face,brows,glasses,uniform,palette,...palettes[palette],uniformNumber,
  facings: ['front','back','left','right'], rationale: '明示した自作配色・髪型・顔・服装。番号は識別用デザイン。原作外観の確認済み記録ではない。',
}));
export type WeaponShape = 'sniper' | 'cube' | 'pistol' | 'shotgun' | 'rifle' | 'wall' | 'cloak-device' | 'disc' | 'nozzle' | 'shield' | 'blade' | 'tagger' | 'wire' | 'booster' | 'timer' | 'beacon' | 'ring' | 'cloak' | 'grenade' | 'spear' | 'weight';
export type WeaponDesign = typeof evidence & { id: string; name: string; shapeKind: WeaponShape; variant: string; length: number; width: number; marks: number; accentColor: string; rationale: string };
type WeaponRow = [string,string,WeaponShape,string,number,number,number,string];
const weaponRows: WeaponRow[] = [
  ['trigger_01','アイビス','sniper','heavy-breech',16,4,3,'#bbc8dc'],
  ['trigger_02','アステロイド','cube','square-bullet',6,5,0,'#c5e5f0'],
  ['trigger_03','アステロイド(拳銃型)','pistol','compact-asteroid',8,3,1,'#c5e5f0'],
  ['trigger_04','アステロイド(散弾銃型)','shotgun','twin-bore',11,4,2,'#d5dca0'],
  ['trigger_05','アステロイド(突撃銃型)','rifle','box-magazine',13,3,1,'#c5e5f0'],
  ['trigger_06','イーグレット','sniper','long-scope',15,2,1,'#dee5ec'],
  ['trigger_07','エスクード','wall','segmented-wall',8,6,3,'#91c6bb'],
  ['trigger_08','カメレオン','cloak-device','prism-disc',6,4,2,'#a0c8e8'],
  ['trigger_09','グラスホッパー','disc','jump-chevron',6,3,1,'#bddda0'],
  ['trigger_10','サイレンサー','nozzle','muzzle-sleeve',7,2,3,'#aeb8c4'],
  ['trigger_11','シールド','shield','hex-guard',8,6,0,'#90d9ed'],
  ['trigger_12','スコーピオン','blade','short-double-edge',11,2,0,'#c9e7db'],
  ['trigger_13','スコーピオン(改)','blade','fork-tip',12,3,2,'#e4bfde'],
  ['trigger_14','スタアメーカー','tagger','star-emitter',6,3,1,'#ead390'],
  ['trigger_15','スパイダー','wire','wire-reel',6,4,1,'#dfc19b'],
  ['trigger_16','スパイダー(改):拳銃型','pistol','wire-reel-pistol',8,4,3,'#dfc19b'],
  ['trigger_17','スラスター','booster','single-jet',7,3,1,'#a1d7ec'],
  ['trigger_18','スラスター(改)','booster','twin-jet',8,4,2,'#d4b8ec'],
  ['trigger_19','タイマー(試作)','timer','clock-dial',5,4,3,'#efd795'],
  ['trigger_20','ダミービーコン(試作)','beacon','twin-antenna',6,4,2,'#abd6cc'],
  ['trigger_21','テレポーター(試作)','ring','paired-gate',7,4,2,'#c3b3e6'],
  ['trigger_22','ハウンド','cube','orbit-bullet',6,5,1,'#b0d89c'],
  ['trigger_23','ハウンド(拳銃型)','pistol','orbit-pistol',8,3,2,'#b0d89c'],
  ['trigger_24','ハウンド(改)','cube','split-orbit',7,5,3,'#d8c3ec'],
  ['trigger_25','ハウンド(突撃銃型)','rifle','orbit-magazine',13,3,2,'#b0d89c'],
  ['trigger_26','バイパー','cube','zigzag-bullet',6,5,2,'#ddbad4'],
  ['trigger_27','バイパー(拳銃型)','pistol','zigzag-pistol',8,3,3,'#ddbad4'],
  ['trigger_28','バッグワーム','cloak','folded-cloak',9,7,0,'#7e9c81'],
  ['trigger_29','メテオラ','cube','burst-bullet',7,6,3,'#ecc095'],
  ['trigger_30','メテオラ(擲弾銃型)','grenade','drum-launcher',12,5,2,'#ecc095'],
  ['trigger_31','メテオラ(突撃銃型)','rifle','burst-magazine',13,4,3,'#ecc095'],
  ['trigger_32','ライトニング','sniper','slim-stock',13,2,0,'#ade0ec'],
  ['trigger_33','レイガスト','blade','wide-guard-blade',12,5,1,'#a4d6d8'],
  ['trigger_34','幻踊','ring','wave-control',7,3,3,'#c9b8df'],
  ['trigger_35','弧月','blade','curved-single-edge',14,2,1,'#e5dcb9'],
  ['trigger_36','弧月(改):槍','spear','long-pole-tip',17,2,2,'#e5dcb9'],
  ['trigger_37','旋空','ring','sweep-control',8,3,1,'#dcdbab'],
  ['trigger_38','鉛弾','weight','linked-weight',6,5,2,'#a9b2c7'],
  ['trigger_39','鉛弾(改)','weight','triple-weight',6,4,3,'#c6acd7'],
  ['trigger_40','韋駄天(試作)','booster','speed-fins',8,3,3,'#b5d9ab'],
  ['trigger_41','魔光(試作)','ring','radial-control',8,4,4,'#e7b6c4'],
];
export const weaponDesigns: readonly WeaponDesign[] = weaponRows.map(([id,name,shapeKind,variant,length,width,marks,accentColor])=>({...evidence,id,name,shapeKind,variant,length,width,marks,accentColor,rationale:'装備分類を識別する自作縮略形。改造品・銃形・専用optionを個別設計。公式形状の復元ではない。'}));
const pawnLookup = new Map(pawnDesigns.map(design=>[design.id,design]));
const weaponLookup = new Map(weaponDesigns.map(design=>[design.id,design]));
const neutralDesign:PawnDesign={...pawnDesigns[0],id:'unknown',name:'未識別',hairStyle:'crop',hairColor:'#67747c',skinColor:'#d8c9b9',face:'round',brows:'straight',glasses:'none',uniform:'panel',uniformColor:'#4c5a66',trimColor:'#aab6bf',uniformNumber:'?',rationale:'未解決IDは中立の自作シルエットで示し、既知人物へ割り当てない。'};
export function getPawnDesign(presetId: string): PawnDesign | undefined { return pawnLookup.get(/^(char_\d{2})(?:-|$)/.exec(presetId)?.[1] ?? presetId); }
export function getWeaponDesign(id: string): WeaponDesign | undefined { return weaponLookup.get(id); }
export function facingForDirection(direction: number): PawnFacing {
  const quadrant = Math.floor((((Number.isFinite(direction)?direction:0)%360+360)%360+45)%360/90);
  return (['right','front','left','back'] as const)[quadrant];
}
export type PawnOptions = { presetId: string; name?: string; copy?: number; teamColor: string; direction: number; main?: string; sub?: string; mainMode?: 'attack' | 'shield'; subMode?: 'attack' | 'shield'; stealth?: boolean; moving?: boolean; action?: PawnAction; motionProgress?: number; scale?: number; reducedMotion?: boolean };
function polygon(ctx: CanvasRenderingContext2D, points: number[][]) { ctx.beginPath(); points.forEach(([x,y],index)=>index?ctx.lineTo(x,y):ctx.moveTo(x,y)); ctx.closePath(); ctx.fill(); ctx.stroke(); }
function line(ctx: CanvasRenderingContext2D, points: number[][]) { ctx.beginPath(); points.forEach(([x,y],index)=>index?ctx.lineTo(x,y):ctx.moveTo(x,y)); ctx.stroke(); }
function ellipse(ctx: CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number) { ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();ctx.stroke(); }
function equipment(ctx:CanvasRenderingContext2D,id:string,side:number,mode:'attack'|'shield',swing:number,action:PawnAction) {
  const design=getWeaponDesign(id);if(!design||design.shapeKind==='cloak')return;
  ctx.save();ctx.translate(side*5.5,-9);ctx.scale(side,1);ctx.rotate(swing);
  const l=design.length,w=design.width;ctx.fillStyle='#455565';ctx.strokeStyle='#172431';ctx.lineWidth=.7;
  const shape=id==='trigger_33'&&mode==='shield'?'shield':design.shapeKind;
  if(shape==='blade') { polygon(ctx,[[0,0],[l,-2],[l-2,w/2],[0,w/2]]);line(ctx,[[0,-2],[0,w+1]]); }
  else if(shape==='spear') { line(ctx,[[0,1],[l,1]]);polygon(ctx,[[l-4,-2],[l+1,1],[l-4,4]]); }
  else if(['pistol','rifle','shotgun','sniper','grenade'].includes(shape)) {
    ctx.fillRect(0,-w/2,l,w);ctx.strokeRect(0,-w/2,l,w);ctx.fillRect(1,0,2,4);
    if(shape!=='pistol')ctx.fillRect(4,w/2,3,3);
    if(shape==='sniper'){ctx.fillRect(5,-w/2-2,4,2);ctx.fillRect(-2,0,3,2);}
    if(shape==='shotgun')line(ctx,[[3,0],[l,0]]);
    if(shape==='grenade')ellipse(ctx,5,1,3,3);
    if(action==='fire'){ctx.fillStyle=design.accentColor;polygon(ctx,[[l,-3],[l+4,0],[l,3],[l+1,0]]);}
  } else if(shape==='shield') { ctx.globalAlpha=.8;ctx.fillStyle=design.accentColor;polygon(ctx,[[2,-6],[8,-4],[9,2],[5,7],[1,2]]);line(ctx,[[5,-4],[5,4]]); }
  else if(shape==='cube') { ctx.fillStyle=design.accentColor;polygon(ctx,[[2,-3],[7,-5],[10,-2],[10,3],[5,5],[2,2]]);line(ctx,[[2,-3],[6,0],[10,-2],[6,0],[5,5]]); }
  else if(shape==='wall'){ctx.fillStyle=design.accentColor;ctx.fillRect(1,-5,7,11);ctx.strokeRect(1,-5,7,11);line(ctx,[[3,-5],[3,6],[6,6],[6,-5]]);}
  else if(shape==='wire'){ellipse(ctx,4,0,3,4);line(ctx,[[6,0],[10,3],[12,-1]]);}
  else if(shape==='booster'){polygon(ctx,[[0,-2],[7,-2],[9,0],[7,2],[0,2]]);ctx.fillStyle=design.accentColor;polygon(ctx,[[0,-2],[-4,0],[0,2]]);}
  else if(shape==='nozzle'){ctx.fillRect(1,-2,l,4);ctx.strokeRect(1,-2,l,4);ellipse(ctx,l,0,1,2);}
  else if(shape==='beacon'){ctx.fillRect(2,-2,5,5);line(ctx,[[3,-2],[1,-6],[3,-2],[6,-2],[8,-6]]);}
  else if(shape==='weight'){ctx.fillRect(2,-3,5,6);ctx.strokeRect(2,-3,5,6);line(ctx,[[4,-3],[4,-5],[7,-5]]);}
  else { ctx.fillStyle=design.accentColor;ellipse(ctx,5,0,l/2,w);if(shape==='timer')line(ctx,[[5,-3],[5,0],[7,1]]);else if(shape==='tagger')polygon(ctx,[[5,-4],[6,-1],[9,0],[6,1],[5,4],[4,1],[1,0],[4,-1]]);else line(ctx,[[3,-1],[7,1]]); }
  ctx.strokeStyle=design.accentColor;for(let n=0;n<design.marks;n++)line(ctx,[[2+n*2,-w/2-1],[2+n*2,w/2+1]]);
  if(design.variant==='fork-tip')line(ctx,[[design.length-3,0],[design.length,3]]);
  ctx.restore();
}
function hair(ctx:CanvasRenderingContext2D,design:PawnDesign,back:boolean) {
  ctx.fillStyle=design.hairColor;ctx.strokeStyle='#26333b';ctx.lineWidth=.65;
  ctx.beginPath();ctx.arc(0,-18,6,Math.PI,Math.PI*2);ctx.lineTo(6,-16);ctx.lineTo(-6,-16);ctx.closePath();ctx.fill();ctx.stroke();
  if(back) { ellipse(ctx,0,-18,5.7,5.5); }
  if(['spike','tuft','mohawk'].includes(design.hairStyle))polygon(ctx,[[-5,-20],[-3,-25],[-1,-21],[1,-26],[3,-21],[5,-23],[6,-18]]);
  else if(['bob','fringe'].includes(design.hairStyle))polygon(ctx,[[-6,-19],[6,-19],[6,-12],[3,-14],[3,-18],[-2,-16],[-5,-13],[-6,-14]]);
  else if(design.hairStyle==='part')polygon(ctx,[[-6,-19],[-1,-23],[4,-21],[6,-17],[1,-19],[-3,-16]]);
  else if(design.hairStyle==='swept')polygon(ctx,[[-6,-20],[1,-24],[6,-21],[7,-18],[1,-19],[-4,-16]]);
  else if(design.hairStyle==='wave'||design.hairStyle==='curly'){for(const [x,y] of [[-4,-20],[0,-22],[4,-20],[-5,-17],[5,-17]])ellipse(ctx,x,y,2.3,2);}
  else if(design.hairStyle==='ponytail'){polygon(ctx,[[4,-19],[8,-19],[9,-10],[6,-12],[5,-17]]);}
  else if(design.hairStyle==='braid'){for(let n=0;n<4;n++)ellipse(ctx,6,-18+n*2,1.5,1.5);}
}
/** Draw only disclosed state. The caller owns visibility, real-world scale, and selection badges. */
export function drawPawn(ctx:CanvasRenderingContext2D,x:number,y:number,options:PawnOptions):void {
  const design=getPawnDesign(options.presetId)??neutralDesign,facing=facingForDirection(options.direction),back=facing==='back',sideView=facing==='left'||facing==='right';
  const action=options.action??'idle',inputProgress=options.motionProgress??(action==='defeat'?1:0),progress=Number.isFinite(inputProgress)?Math.max(0,Math.min(1,inputProgress)):0;
  const motion=options.reducedMotion?0:Math.sin(progress*Math.PI),walk=options.moving&&!options.reducedMotion?Math.sin(progress*Math.PI*2):0;
  ctx.save();ctx.translate(x+(action==='evade'?motion*3:0),y-Math.abs(walk)*.6);ctx.scale(options.scale??1,options.scale??1);
  if(facing==='left')ctx.scale(-1,1);
  if(action==='defeat'&&!options.reducedMotion){ctx.translate(0,-1);ctx.rotate(-Math.PI/2*progress);ctx.globalAlpha=1-progress*.45;}
  else if(action==='damage')ctx.rotate(motion*.13);
  else if(action==='fire')ctx.translate(-motion*.8,0);
  ctx.strokeStyle='#172431';ctx.lineWidth=.7;ctx.fillStyle='#283440';
  ctx.fillRect(-4,-4+walk*.8,3,5);ctx.fillRect(1,-4-walk*.8,3,5);
  ctx.fillStyle=design.uniformColor;polygon(ctx,[[-5,-13],[5,-13],[6,-4],[-6,-4]]);
  ctx.strokeStyle=design.trimColor;ctx.lineWidth=1;
  if(design.uniform==='stripe')line(ctx,[[-4,-8],[4,-8]]);
  else if(design.uniform==='double-stripe'){line(ctx,[[-4,-9],[4,-9]]);line(ctx,[[-4,-7],[4,-7]]);}
  else if(design.uniform==='panel') { ctx.fillStyle=design.trimColor;ctx.fillRect(-3,-12,2,7); }
  else if(design.uniform==='chevron')line(ctx,[[-4,-11],[0,-8],[4,-11]]);
  else if(design.uniform==='collar')line(ctx,[[-4,-13],[0,-10],[4,-13]]);
  else line(ctx,[[0,-13],[0,-5]]);
  ctx.fillStyle=options.teamColor;ctx.fillRect(-6,-12,2,3);ctx.fillRect(4,-12,2,3);
  ctx.fillStyle='#f3f1e8';ctx.font='bold 4px monospace';ctx.textAlign='center';ctx.fillText(design.uniformNumber,0,-5.5);
  const cloak=options.stealth||options.main==='trigger_28'||options.sub==='trigger_28';
  if(cloak){ctx.fillStyle='#344d45';ctx.strokeStyle='#8caf94';polygon(ctx,[[-6,-15],[6,-15],[8,-2],[3,-3],[0,-2],[-3,-3],[-8,-2]]);line(ctx,[[0,-13],[0,-3]]);}
  ctx.fillStyle=design.skinColor;ctx.strokeStyle='#7b675b';ctx.lineWidth=.55;
  const rx=design.face==='square'?5.8:design.face==='pointed'?4.6:5.3,ry=design.face==='oval'?6:5.2;
  const width=sideView?rx*.8:rx;
  if(design.face==='square')polygon(ctx,[[-width,-21],[width,-21],[width,-15],[width-1,-12.5],[-width+1,-12.5],[-width,-15]]);
  else if(design.face==='pointed')polygon(ctx,[[-width,-21],[width,-21],[width,-16],[0,-12],[-width,-16]]);
  else ellipse(ctx,0,-17.5,width,ry);
  hair(ctx,design,back);
  if(!back){
    ctx.fillStyle='#25313b';const eyes=sideView?[2.6]:[-2.5,2.5];
    for(const eye of eyes){ctx.fillRect(eye-.5,-17,.9,1.2);ctx.strokeStyle='#26333b';ctx.lineWidth=.6;if(design.brows==='soft'||design.brows==='arched'){ctx.beginPath();ctx.moveTo(eye-1,-18.5);ctx.quadraticCurveTo(eye,-18.5-(design.brows==='arched'?1:.4),eye+1,-18.5);ctx.stroke();}else line(ctx,[[eye-1,-18.5],[eye+1,-18.5+(design.brows==='angled'?.7:0)]]);}
    ctx.strokeStyle='#997c70';line(ctx,sideView?[[4,-16],[5,-15],[3,-15]]:[[-1,-14],[1,-14]]);
    if(design.glasses!=='none'){ctx.strokeStyle='#344a60';ctx.lineWidth=.65;for(const eye of eyes){if(design.glasses==='round'){ctx.beginPath();ctx.arc(eye,-16.5,1.8,0,Math.PI*2);ctx.stroke();}else if(design.glasses==='half')line(ctx,[[eye-1.8,-16],[eye-1.2,-14.8],[eye+1.5,-14.8],[eye+1.8,-16]]);else ctx.strokeRect(eye-1.8,-18,3.6,3);}if(!sideView)line(ctx,[[-.7,-16.5],[.7,-16.5]]);}
  }
  ctx.strokeStyle=design.uniformColor;ctx.lineWidth=2.4;line(ctx,[[-4,-12],[-6,-9+walk*.3]]);line(ctx,[[4,-12],[6,-9-walk*.3]]);
  ctx.fillStyle=design.skinColor;ctx.strokeStyle='#7b675b';ctx.lineWidth=.5;ellipse(ctx,-5.5,-9,1,1);ellipse(ctx,5.5,-9,1,1);
  const swing=action==='melee'?-motion*.9:action==='defend'?-motion*.4:walk*.05;
  equipment(ctx,options.sub??'none',-1,options.subMode??'attack',-swing,action);
  equipment(ctx,options.main??'none',1,options.mainMode??'attack',swing,action);
  ctx.fillStyle=action==='damage'?'#d75245':'#faf2d3';ctx.strokeStyle='#263544';ctx.lineWidth=.8;
  const glyph:Record<PawnAction,string>={idle:options.moving?'↔':'',fire:'↗',melee:'╱',damage:'!',defend:'◇',evade:'›',defeat:'×'};
  if(glyph[action]){ctx.font='bold 7px sans-serif';ctx.textAlign='center';ctx.strokeText(glyph[action],0,-28);ctx.fillText(glyph[action],0,-28);}
  ctx.restore();
}

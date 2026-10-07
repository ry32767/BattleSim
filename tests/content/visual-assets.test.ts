import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pawnDesigns, weaponDesigns, getPawnDesign, getWeaponDesign, facingForDirection, drawPawn, PAWN_HEIGHT, type PawnAction } from '../../apps/web/src/pawns';
import sourceLock from '../../data/runtime/source-lock.json';

describe('original complete visual metadata',()=>{
  it('explicitly designs every original character and weapon ID without source claims',()=>{
    const root='closed-battle-spec-v0.2/closed-battle-spec/data/';
    const characters=JSON.parse(readFileSync(root+'characters.json','utf8')) as {id:string;name:string}[];
    const weapons=JSON.parse(readFileSync(root+'weapons.json','utf8')) as {id:string;name:string}[];
    expect(pawnDesigns.map(d=>({id:d.id,name:d.name}))).toEqual(characters.map(({id,name})=>({id,name})));
    expect(weaponDesigns.map(d=>({id:d.id,name:d.name}))).toEqual(weapons.map(({id,name})=>({id,name})));
    expect(pawnDesigns).toHaveLength(64);expect(weaponDesigns).toHaveLength(41);
    for(const design of [...pawnDesigns,...weaponDesigns]){expect(design.evidenceStatus).toBe('original');expect(design.sourceIds).toEqual([]);expect(design.assetReview).toBe('original-design');expect(design.rationale).toBeTruthy();}
  });
  it('uses unique authored combinations, four facings, aliases and distinct weapon variants',()=>{
    const combinations=pawnDesigns.map(({hairStyle,hairColor,skinColor,face,brows,glasses,uniform,palette})=>JSON.stringify([hairStyle,hairColor,skinColor,face,brows,glasses,uniform,palette]));
    expect(new Set(combinations).size).toBe(64);
    for(const design of pawnDesigns){expect(design.facings).toEqual(['front','back','left','right']);expect(getPawnDesign(design.id+'-supplemented')).toBe(design);expect(getPawnDesign(design.id+'-training')).toBe(design);expect(design.uniformNumber).toMatch(/^\d{2}$/);}
    expect(new Set(weaponDesigns.map(d=>d.shapeKind+':'+d.variant)).size).toBe(41);
    expect(getWeaponDesign('trigger_03')!.shapeKind).toBe('pistol');expect(getWeaponDesign('trigger_04')!.shapeKind).toBe('shotgun');expect(getWeaponDesign('trigger_05')!.shapeKind).toBe('rifle');expect(getWeaponDesign('trigger_01')!.shapeKind).toBe('sniper');expect(getWeaponDesign('trigger_36')!.shapeKind).toBe('spear');
    expect(getPawnDesign('char_99')).toBeUndefined();expect(getWeaponDesign('none')).toBeUndefined();
  });
  it('quantizes mainDirection consistently and supplies a body scale contract',()=>{
    expect([0,90,180,270,360,-90].map(facingForDirection)).toEqual(['right','front','left','back','right','back']);
    expect(PAWN_HEIGHT).toBe(26);
  });
  it('draws every direction, weapon, action and reduced-motion state using only Canvas commands',()=>{
    const text:string[]=[],coordinates:number[]=[];
    const context=new Proxy({}, {get:(_target,key)=>key==='fillText'||key==='strokeText'?(value:string)=>text.push(value):(...args:unknown[])=>{for(const value of args)if(typeof value==='number')coordinates.push(value);},set:()=>true}) as CanvasRenderingContext2D;
    const actions:PawnAction[]=['idle','fire','melee','damage','defend','evade','defeat'];
    for(const design of pawnDesigns)for(const direction of [0,90,180,270])for(const action of actions)for(const reducedMotion of [false,true])drawPawn(context,1,2,{presetId:design.id,teamColor:'#5699cc',direction,main:'trigger_33',sub:'trigger_28',mainMode:'shield',stealth:true,moving:true,action,motionProgress:.5,scale:.6,reducedMotion});
    for(const design of weaponDesigns)drawPawn(context,0,0,{presetId:'char_27-training',teamColor:'#5699cc',direction:90,main:design.id,action:'fire'});
    expect(coordinates.every(Number.isFinite)).toBe(true);for(const glyph of ['↔','↗','╱','!','◇','›','×'])expect(text).toContain(glyph);
  });
  it('holds the completed defeat pose and retains its glyph without motion',()=>{
    const rotations:number[]=[],text:string[]=[];
    const context=new Proxy({}, {get:(_target,key)=>key==='rotate'?(angle:number)=>rotations.push(angle):key==='fillText'?(value:string)=>text.push(value):()=>{},set:()=>true}) as CanvasRenderingContext2D;
    drawPawn(context,0,0,{presetId:'char_27',teamColor:'#5699cc',direction:90,action:'defeat',motionProgress:1});
    expect(rotations).toEqual([-Math.PI/2]);rotations.length=0;
    drawPawn(context,0,0,{presetId:'char_27',teamColor:'#5699cc',direction:90,action:'defeat',motionProgress:1,reducedMotion:true});
    expect(rotations).toEqual([]);expect(text).toContain('×');
    drawPawn(context,0,0,{presetId:'unidentified',teamColor:'#5699cc',direction:90});expect(text).toContain('?');
  });
  it('leaves all original observation ledgers and old maps untouched',()=>{
    for(const [path,hash] of Object.entries(sourceLock))expect(createHash('sha256').update(readFileSync('closed-battle-spec-v0.2/closed-battle-spec/data/'+path)).digest('hex')).toBe(hash);
  });
});

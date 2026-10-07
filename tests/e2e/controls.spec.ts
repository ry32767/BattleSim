import { test, expect, type Page } from '@playwright/test';
async function start(page: Page) {
  await page.goto('/'); await page.getByRole('button',{name:'この部隊で演習を始める',exact:false}).click();
  await expect(page.locator('.phase-label')).toHaveText('PLANNING');
}
async function noPageScroll(page:Page) {
  expect(await page.evaluate(()=>({x:document.documentElement.scrollWidth<=innerWidth,y:document.documentElement.scrollHeight<=innerHeight}))).toEqual({x:true,y:true});
}
test('戦闘は画面内に収まり、スマホでも盤面と行動設定を切り替える',async({page})=>{
  await page.setViewportSize({width:1366,height:768});await start(page);await noPageScroll(page);
  await page.getByRole('button',{name:'装備・向き',exact:true}).click();await expect(page.getByLabel('MAINの向き',{exact:true})).toBeInViewport();await noPageScroll(page);
  await page.setViewportSize({width:375,height:900});await noPageScroll(page);await expect(page.locator('.map-panel')).toBeVisible();
  await page.getByRole('button',{name:'行動設定・レーダー',exact:true}).click();await expect(page.locator('.control-panel')).toBeVisible();await expect(page.getByLabel('MAINの向き',{exact:true})).toBeInViewport();await noPageScroll(page);
  await expect(page.getByRole('button',{name:'行動を確定して同時実行',exact:false})).toBeInViewport();
  await page.getByRole('button',{name:'行動',exact:true}).click();await expect(page.getByRole('button',{name:'待機を追加',exact:true})).toBeInViewport();await page.getByRole('button',{name:'待機を追加',exact:true}).click();
  await page.getByRole('button',{name:'移動経路を設定',exact:true}).click();await expect(page.locator('.map-panel')).toBeVisible();
  const mobileCanvas=page.locator('.map-panel canvas'), bounds=await mobileCanvas.boundingBox();
  const units=JSON.parse(await mobileCanvas.getAttribute('data-unit-positions') ?? '[]') as {x:number;y:number}[];
  await page.mouse.click(bounds!.x+units[1].x,bounds!.y+units[1].y);
  await expect(page.getByRole('button',{name:'経路を確定',exact:true})).toBeInViewport();await page.getByRole('button',{name:'経路を確定',exact:true}).click();await noPageScroll(page);

});
test('レーダーは開始前に動かず実行tickと同期し、リプレイの停止・シークにも同期する',async({page})=>{
  await page.clock.install();await start(page);await page.clock.runFor(100);
  const radar=page.locator('.radar-panel canvas');
  const before=await radar.getAttribute('data-contact-positions');await page.clock.runFor(1000);
  expect(await radar.getAttribute('data-contact-positions')).toBe(before);
  await page.getByRole('button',{name:'行動を確定して同時実行',exact:false}).click();await page.clock.runFor(25);
  await expect(page.locator('.save-state')).toContainText('実行記録を再生中',{timeout:30000});await page.clock.runFor(3000);
  await expect(page.getByRole('button',{name:'前ターンのリプレイ',exact:true})).toBeDisabled();
  // Read both canvases in one browser task so the playback cannot advance between reads.
  expect(await page.evaluate(() => {
    const boardTick = document.querySelector('.map-panel canvas')?.getAttribute('data-view-tick');
    return !!boardTick && document.querySelector('.radar-panel canvas')?.getAttribute('data-view-tick') === boardTick;
  })).toBe(true);
  expect(await radar.getAttribute('data-contact-positions')).not.toBe(before);
  await page.clock.runFor(12500);await expect(page.locator('.phase-label')).toHaveText('PLANNING');
  await page.getByRole('button',{name:'前ターンのリプレイ',exact:true}).click();
  const replayRadar=page.locator('.replay-radar-panel canvas'),replayBoard=page.locator('.replay-board canvas');
  const max=Number(await page.getByLabel('リプレイ時刻').getAttribute('max'));
  for(const ratio of [.1,.5,.8]) { await page.getByLabel('リプレイ時刻').fill(String(Math.floor(max*ratio))); await page.clock.runFor(50);expect(await replayRadar.getAttribute('data-view-tick')).toBe(await replayBoard.getAttribute('data-view-tick')); }
  await page.getByLabel('リプレイ時刻').fill('0');await page.clock.runFor(50);
  const paused=await replayRadar.getAttribute('data-contact-positions');await page.clock.runFor(500);expect(await replayRadar.getAttribute('data-contact-positions')).toBe(paused);
  await page.getByRole('button',{name:'再生',exact:true}).click();await page.clock.runFor(1000);
  const ticks=await page.evaluate(()=>[document.querySelector('.replay-radar-panel canvas')?.getAttribute('data-view-tick'),document.querySelector('.replay-board canvas')?.getAttribute('data-view-tick')]);expect(ticks[0]).toBe(ticks[1]);expect(await replayRadar.getAttribute('data-contact-positions')).not.toBe(paused);
});
test('駒の右クリック・MAIN/SUBドラッグ・3D回転・ダブルクリックタグを操作できる',async({page})=>{
  await start(page);
  const canvas=page.locator('.map-panel canvas'),box=await canvas.boundingBox();expect(box).not.toBeNull();
  const positions=JSON.parse(await canvas.getAttribute('data-unit-positions') ?? '[]') as {id:string;x:number;y:number}[];
  const unit=positions[0];expect(unit).toBeDefined();
  await page.mouse.click(box!.x+unit.x,box!.y+unit.y-10,{button:'right'});
  await expect(page.getByRole('menu',{name:'キャラの行動'})).toBeVisible();
  await page.getByRole('menuitem',{name:'待機を追加',exact:true}).click();await expect(page.locator('.command-strip .command')).toHaveCount(2);
  await page.getByRole('button',{name:'装備・向き',exact:true}).click();
  for(const slot of ['MAIN','SUB']) {
    const before=await page.getByLabel(`${slot}の向き`,{exact:true}).inputValue();
    const handle=page.getByRole('button',{name:`${slot}の向きをドラッグ`,exact:true}),h=await handle.boundingBox();expect(h).not.toBeNull();
    await page.mouse.move(h!.x+h!.width/2,h!.y+h!.height/2);await page.mouse.down();await page.mouse.move(h!.x+h!.width/2+55,h!.y+h!.height/2-65,{steps:8});await page.mouse.up();
    expect(await page.getByLabel(`${slot}の向き`,{exact:true}).inputValue()).not.toBe(before);
  }
  await expect(page.locator('.command-strip .command')).toHaveCount(2);
  await page.getByRole('button',{name:'右へ回転',exact:true}).click();await expect(canvas).toHaveAttribute('data-rotation','30');
  await page.getByRole('button',{name:'平面に切替',exact:true}).click();await expect(canvas).toHaveAttribute('data-rotation','0');
  await page.getByRole('button',{name:'斜め俯瞰に切替',exact:true}).click();await expect(canvas).toHaveAttribute('data-rotation','30');
  await page.getByRole('button',{name:'回転をリセット',exact:true}).click();await expect(canvas).toHaveAttribute('data-rotation','0');
  await page.locator('.radar-panel').getByRole('button',{name:'展開',exact:true}).click();
  const radar=page.locator('.radar-panel canvas');await expect(radar).toBeVisible();const rbox=await radar.boundingBox();
  const contacts=JSON.parse(await radar.getAttribute('data-contact-positions') ?? '[]') as {x:number;y:number}[];
  expect(contacts.length).toBeGreaterThan(0);await page.mouse.dblclick(rbox!.x+contacts[0].x,rbox!.y+contacts[0].y);
  await expect(page.getByRole('dialog',{name:'タグ・接触詳細',exact:true})).toBeVisible();
  await page.getByLabel('手動タグ').fill('追跡対象');await page.getByRole('button',{name:'タグを保存',exact:true}).click();
  await expect(page.locator('.selected-summary')).toContainText('追跡対象');
});

test('公式アイコン・大きいレーダー・スマホパネルの最小化で編集状態を維持する',async({page})=>{
  await page.setViewportSize({width:375,height:900});await start(page);
  const icon=page.locator('.map-panel .official-icon').first();
  if(process.env.VITE_USE_OFFICIAL_ICONS==='false') await expect(icon).toHaveCount(0);
  else if(await icon.count()) await expect(icon).toHaveAttribute('src',/^https:\/\/worldtrigger.info\/img\/quiz\/top\/\d{2}\.jpg$/);
  await expect(page.locator('.radar-panel')).not.toBeVisible();
  await page.getByRole('button',{name:'行動設定・レーダー',exact:true}).click();
  expect((await page.locator('.radar-panel canvas').boundingBox())!.height).toBeGreaterThanOrEqual(200);
  await page.getByRole('button',{name:'待機を追加',exact:true}).click();
  await page.getByRole('button',{name:'最小化して盤面へ',exact:false}).click();await expect(page.locator('.control-panel')).not.toBeVisible();
  await page.getByRole('button',{name:'行動設定・レーダー',exact:true}).click();await expect(page.locator('.command-strip .command')).toHaveCount(2);
  await page.getByRole('button',{name:'レーダーを拡大',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'拡大レーダー',exact:true});await expect(dialog).toBeVisible();
  expect((await dialog.locator('canvas').boundingBox())!.height).toBeGreaterThan(300);
  const beforeZoom=await dialog.locator('canvas').getAttribute('data-contact-positions');
  await dialog.getByRole('button',{name:'拡大',exact:true}).click();
  await expect(dialog.locator('canvas')).not.toHaveAttribute('data-contact-positions',beforeZoom??'');
  expect(await dialog.locator('canvas').getAttribute('data-view-tick')).toBe(await page.locator('.map-panel canvas').getAttribute('data-view-tick'));
  await dialog.getByRole('button',{name:'閉じる ×',exact:true}).click();await noPageScroll(page);
});

test('リプレイは行動tickへ送り、視点別の扇とスマホのレーダー・ログを開閉する',async({page})=>{
  await page.clock.install();await start(page);await page.clock.runFor(100);
  await page.getByRole('button',{name:'行動を確定して同時実行',exact:false}).click();await page.clock.runFor(25);
  await expect(page.locator('.save-state')).toContainText('実行記録を再生中',{timeout:30000});await page.clock.runFor(15500);
  await page.getByRole('button',{name:'前ターンのリプレイ',exact:true}).click();await page.clock.runFor(100);
  const board=page.locator('.replay-board canvas');
  expect(JSON.parse(await board.getAttribute('data-sector-actors')??'[]')).toHaveLength(9);
  await expect(page.getByLabel('視点',{exact:true}).locator('option[value="full"]')).toHaveCount(0);
  await page.getByRole('button',{name:'次の行動tick',exact:true}).click();await page.clock.runFor(50);
  await expect(board).toHaveAttribute('data-view-tick','0');
  expect(JSON.parse(await board.getAttribute('data-effect-kinds')??'[]')).toContain('activate');
  await page.getByRole('button',{name:'次の行動tick',exact:true}).click();await page.clock.runFor(50);
  const tick=Number(await board.getAttribute('data-view-tick'));expect(tick).toBeGreaterThan(1);
  await page.getByRole('button',{name:'前の行動tick',exact:true}).click();await page.clock.runFor(50);await expect(board).toHaveAttribute('data-view-tick','0');
  await page.getByLabel('視点',{exact:true}).selectOption('A');await page.clock.runFor(100);
  expect(JSON.parse(await board.getAttribute('data-sector-actors')??'[]')).toHaveLength(9);
  await page.setViewportSize({width:375,height:900});await page.clock.runFor(100);
  await expect(page.locator('.replay-side-panels')).not.toBeVisible();
  await page.getByRole('button',{name:'レーダー ⌃',exact:true}).click();await expect(page.locator('.replay-radar-panel')).toBeVisible();
  await page.getByRole('button',{name:'レーダー ⌄',exact:true}).click();await expect(page.locator('.replay-side-panels')).not.toBeVisible();
  await page.getByRole('button',{name:'出来事・原因 ⌃',exact:true}).click();await expect(page.locator('.replay-events')).toBeVisible();
  await page.getByRole('button',{name:'出来事・原因 ⌄',exact:true}).click();
  expect((await page.locator('.replay-board .battle-canvas').boundingBox())!.height).toBeGreaterThan(300);
});

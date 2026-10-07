import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
async function start(page: Page, stage: 'I'|'II'|'III' = 'I') {
  await page.goto('/');
  await page.locator('.stage-selector button').filter({ has: page.locator('.stage-roman', { hasText: new RegExp(`^${stage}$`) }) }).click();
  await expect(page.getByRole('button', { name: 'この部隊で演習を始める' })).toBeEnabled();
  await page.getByRole('button', { name: 'この部隊で演習を始める' }).click();
  await expect(page.locator('.battle-screen')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
}
for (const [stage, count] of [['I',9],['II',14],['III',24]] as const) {
  test(`段階${stage}の編成・MAIN/SUB・匿名レーダー・編集`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await start(page, stage);
    await expect(page.locator('.unit-list .unit-row')).toHaveCount(count);
    await page.getByRole('button', { name: '待機を追加', exact: true }).click();
    await expect(page.locator('.command-strip .command')).toHaveCount(2);
    await page.getByRole('button', { name: '元に戻す', exact: true }).click();
    await expect(page.locator('.command-strip .command')).toHaveCount(1);
    await page.getByRole('button', { name: 'やり直す', exact: true }).click();
    await expect(page.locator('.command-strip .command')).toHaveCount(2);
    await page.getByRole('button',{name:'装備・向き',exact:true}).click();
    await page.getByLabel('MAINの向き',{exact:true}).fill('123'); await page.getByLabel('SUBの向き',{exact:true}).fill('287');
    await page.getByRole('button', { name: '装備・向きを反映', exact: true }).click();
    await expect(page.getByLabel('MAINの向き',{exact:true})).toHaveValue('123'); await expect(page.getByLabel('SUBの向き',{exact:true})).toHaveValue('287');
    await expect(page.getByRole('button',{name:'モノクロ',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'動きを軽減',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'部隊・接触一覧',exact:true}).click();
    await page.getByRole('button', { name: /^接触 \d/ }).click();
    await expect(page.locator('.contact-row')).not.toHaveCount(0);
    await expect(page.locator('.contact-row').first()).toContainText('正体不明');
    await page.locator('.contact-row').first().dblclick();
    await page.getByLabel('手動タグ').fill('北の敵'); await page.getByRole('button', { name: 'タグを保存', exact: true }).click();
    await expect(page.locator('.contact-row').first()).toContainText('北の敵');
    await page.getByRole('dialog',{name:'部隊・接触一覧'}).getByRole('button',{name:'閉じる ×',exact:true}).click();
    await page.locator('.radar-panel').getByRole('button',{name:'展開',exact:true}).click();
    await page.getByLabel('接触番号を表示').uncheck(); await page.getByLabel('接触番号を表示').check();
    await expect(page.locator('.contact-row').first()).toContainText('北の敵');
    expect(errors).toEqual([]);
  });
}
test('編成の空き枠の選択肢と未変更保存',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message)); await page.goto('/');
  await page.locator('.loadout-editor summary').click(); await page.getByLabel('装備変更ユニット').selectOption('0');
  await expect(page.getByLabel('main装備枠4').locator('option[value="none"]')).toHaveText('空き');
  await page.getByRole('button',{name:'装備変更を保存',exact:true}).click();
  await expect(page.locator('.loadout-editor summary')).toContainText('0 / 2体');
  await page.getByLabel('装備変更ユニット').selectOption('-1'); await expect(page.locator('.loadout-columns')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('6ターン同時実行から試合後リプレイ、時刻移動、保存', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[]=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.clock.install();
  await start(page);
  for (let turn = 1; turn <= 6; turn++) {
    await page.getByRole('button', { name: '全員に中央進軍を設定', exact: true }).click();
    await page.getByRole('button', { name: '行動を確定して同時実行', exact: false }).click();
    await page.clock.runFor(25);
    await expect(page.locator('.save-state')).toContainText('実行記録を再生中', { timeout: 30000 });
    await page.clock.runFor(15500);
    if (turn < 6) await expect(page.locator('.phase-label')).toHaveText('PLANNING');
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  await expect(page.locator('.result-panel')).toBeVisible();
  await page.getByRole('button', { name: '試合全体を振り返る', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const maxAction=Number(await page.getByLabel('リプレイ時刻').getAttribute('max'));
  await page.getByLabel('リプレイ時刻').fill(String(Math.floor(maxAction/2)));
  await page.getByRole('button', { name: '前の行動tick', exact: true }).click();
  await page.getByRole('button', { name: '次の行動tick', exact: true }).click();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'JSON保存', exact: true }).click();
  expect((await download).suggestedFilename()).toContain('6turns');
  await page.getByRole('button', { name: '閉じて設定へ戻る', exact: false }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('招待ルームで両陣営の編成を確定して開始、担当と提出', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  const pa = await a.newPage(), pb = await b.newPage();
  await pa.goto('/'); await pa.getByRole('button', { name: '招待ルーム', exact: true }).click();
  await pa.getByLabel('表示名').fill('青隊長'); await pa.getByRole('button', { name: '招待ルームを作成', exact: true }).click();
  await expect(pa.locator('.room-bar')).toBeVisible();
  const code = await pa.locator('.room-bar strong').innerText();
  await pb.goto('/'); await pb.getByRole('button', { name: '招待ルーム', exact: true }).click();
  await pb.getByLabel('表示名').fill('橙隊長'); await pb.getByLabel('招待コード', { exact: true }).fill(code); await pb.getByRole('button', { name: 'ルームへ参加', exact: true }).click();
  await expect(pb.locator('.room-bar')).toBeVisible();
  await pa.getByRole('button', { name: '自陣営の部隊を確定', exact: true }).click(); await pb.getByRole('button', { name: '自陣営の部隊を確定', exact: true }).click();
  await expect(pa.getByRole('button', { name: '両陣営で試合開始', exact: true })).toBeEnabled();
  await pa.getByRole('button', { name: '両陣営で試合開始', exact: true }).click();
  await expect(pa.locator('.unit-list .unit-row')).toHaveCount(9); await expect(pb.locator('.unit-list .unit-row')).toHaveCount(9);
  await pa.getByRole('button', { name: '待機を追加', exact: true }).click(); await pa.getByRole('button', { name: 'プランを確認・送信', exact: true }).click();
  await expect(pa.locator('.save-state')).toContainText('サーバー受理済み');
  await expect(pa.getByRole('alert')).toHaveCount(0); await expect(pb.getByRole('alert')).toHaveCount(0);
  await a.close(); await b.close();
});

test('4対4の招待ルームで両陣営の担当変更とプラン引き継ぎ', async ({ browser }) => {
  const contexts = [], pages: Page[] = [];
  try {
    for (let i=0;i<8;i++) { const context=await browser.newContext(); contexts.push(context); pages.push(await context.newPage()); }
    const host=pages[0]; await host.goto('/');
    await host.locator('.stage-selector button').filter({has:host.locator('.stage-roman',{hasText:/^II$/})}).click();
    await host.getByRole('button',{name:'招待ルーム',exact:true}).click(); await host.getByLabel('表示名').fill('A1');
    await host.getByRole('button',{name:'招待ルームを作成',exact:true}).click(); await expect(host.locator('.room-bar')).toBeVisible();
    const code=await host.locator('.room-bar strong').innerText();
    for(let i=1;i<8;i++) { const page=pages[i],team=i<4?'A':'B',name=`${team}${i<4?i+1:i-3}`;
      await page.goto('/'); await page.getByRole('button',{name:'招待ルーム',exact:true}).click();
      await page.getByLabel('表示名').fill(name); await page.getByLabel('招待コード',{exact:true}).fill(code); await page.getByLabel('陣営').selectOption(team);
      await page.getByRole('button',{name:'ルームへ参加',exact:true}).click(); await expect(page.locator('.room-bar')).toBeVisible();
    }
    await expect(host.locator('.room-bar')).toContainText('A 4/4 · B 4/4');
    await expect(pages[1].getByRole('button',{name:'自陣営の部隊を確定',exact:true})).toBeDisabled();
    await host.getByRole('button',{name:'自陣営の部隊を確定',exact:true}).click();
    await pages[4].getByRole('button',{name:'自陣営の部隊を確定',exact:true}).click();
    await expect(host.getByRole('button',{name:'両陣営で試合開始',exact:true})).toBeEnabled(); await host.getByRole('button',{name:'両陣営で試合開始',exact:true}).click();
    for(const page of pages) await expect(page.locator('.unit-list .unit-row')).toHaveCount(14);
    for(const [leader,recipient,name] of [[pages[0],pages[1],'A2'],[pages[4],pages[5],'B2']] as const) {
      await leader.getByLabel('操作担当').selectOption({label:name});
      await expect(recipient.locator('.unit-row').first()).toContainText(name); await expect(recipient.getByRole('button',{name:'待機を追加',exact:true})).toBeEnabled();
      await expect(leader.getByRole('button',{name:'待機を追加',exact:true})).toBeDisabled();
      await recipient.getByRole('button',{name:'待機を追加',exact:true}).click(); await recipient.getByRole('button',{name:'プランを確認・送信',exact:true}).click();
      await expect(recipient.locator('.save-state')).toContainText('サーバー受理済み');
      await leader.getByLabel('操作担当').selectOption({label:name[0]+'1'});
      await expect(leader.getByRole('button',{name:'待機を追加',exact:true})).toBeEnabled(); await expect(recipient.getByRole('button',{name:'待機を追加',exact:true})).toBeDisabled();
      await expect(leader.locator('.command-strip .command')).toHaveCount(2);
      await leader.getByLabel('操作担当').selectOption({label:name});
      await expect(recipient.getByRole('button',{name:'待機を追加',exact:true})).toBeEnabled();
      await expect(recipient.getByRole('button',{name:'元に戻す',exact:true})).toBeDisabled();
    }
    await pages[1].getByRole('button',{name:'待機を追加',exact:true}).click();
    await expect(pages[1].locator('.command-strip .command')).toHaveCount(3);
    await host.getByRole('button',{name:'部隊・接触一覧',exact:true}).click();await host.getByRole('button',{name:/^接触 \d/}).click();await host.locator('.contact-row').first().dblclick();
    await host.getByLabel('手動タグ').fill('共有タグ');await host.getByRole('button',{name:'タグを保存',exact:true}).click();
    await expect(host.locator('.contact-row').first()).toContainText('共有タグ');
    await expect(pages[1].locator('.command-strip .command')).toHaveCount(3);
    for(const page of pages) await expect(page.getByRole('alert')).toHaveCount(0);
  } finally { for(const context of contexts) await context.close(); }
});
test('visual 広幅・狭幅の戦闘盤面の基準画面', async ({ page }) => {
  await start(page, 'III');
  await expect(page.locator('.battle-screen')).toHaveScreenshot('battle-wide.png', { animations: 'disabled', mask: [page.locator('.timer')] });
  await page.setViewportSize({ width: 375, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('.battle-screen')).toHaveScreenshot('battle-narrow.png', { animations: 'disabled', mask: [page.locator('.timer')] });
  await page.screenshot({ path: 'output/game-narrow.png', fullPage: true });
  await page.setViewportSize({ width: 1366, height: 900 }); await page.screenshot({ path: 'output/game-wide.png', fullPage: true });
});
test('visual 独立リプレイと背景プランの保持', async ({ page }) => {
  await page.clock.install(); await start(page);
  await page.getByRole('button',{name:'全員に中央進軍を設定',exact:true}).click();
  await page.getByRole('button',{name:'行動を確定して同時実行',exact:false}).click();
  await page.clock.runFor(25); await expect(page.locator('.save-state')).toContainText('実行記録を再生中',{timeout:30000}); await page.clock.runFor(15500);
  await page.getByRole('button',{name:'待機を追加',exact:true}).click();
  const commandCount = await page.locator('.command-strip .command').count();
  await page.getByRole('button',{name:'前ターンのリプレイ',exact:true}).click();
  await page.getByLabel('注目するユニット').selectOption({index:1});
  await expect(page.locator('.route-comparison')).toContainText('予定');
  await expect(page.getByRole('dialog')).toHaveScreenshot('replay-wide.png',{animations:'disabled',mask:[page.locator('.timer')]});
  await page.screenshot({path:'output/replay-wide.png',fullPage:true});
  await page.setViewportSize({width:375,height:900});
  expect(await page.locator('.replay-board .battle-canvas').evaluate(el=>el.clientHeight)).toBeGreaterThanOrEqual(200);
  await expect(page.getByRole('dialog')).toHaveScreenshot('replay-narrow.png',{animations:'disabled',mask:[page.locator('.timer')]});
  await page.getByRole('button',{name:'閉じて設定へ戻る',exact:false}).click();
  await expect(page.locator('.command-strip .command')).toHaveCount(commandCount);
});
test('visual スマホの操作ドロワーと拡大レーダー',async({page})=>{
  await page.setViewportSize({width:375,height:900});await start(page);
  await page.getByRole('button',{name:'行動設定・レーダー',exact:true}).click();
  await expect(page.locator('.battle-screen')).toHaveScreenshot('battle-controls-narrow.png',{animations:'disabled',mask:[page.locator('.timer')]});
  await page.screenshot({path:'output/game-controls-narrow.png',fullPage:true});
  await page.getByRole('button',{name:'レーダーを拡大',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'拡大レーダー',exact:true})).toHaveScreenshot('radar-expanded-narrow.png',{animations:'disabled'});
  await page.screenshot({path:'output/radar-expanded-narrow.png',fullPage:true});
});
for(const width of [1366,1920]) test(`最大48体の実行描画性能 ${width}px`, async ({ page })=>{
  await page.setViewportSize({width,height:width===1366?768:1080}); await start(page,'III');
  await page.getByRole('button',{name:'全員に中央進軍を設定',exact:true}).click(); await page.getByRole('button',{name:'行動を確定して同時実行',exact:false}).click();
  await expect(page.locator('.save-state')).toContainText('実行記録を再生中',{timeout:30000});
  const canvas=page.locator('.battle-canvas canvas').first();
  const before=Number(await canvas.getAttribute('data-rendered-frames')), begin=Date.now();
  await page.waitForTimeout(3000);
  const frames=Number(await canvas.getAttribute('data-rendered-frames'))-before, durationMs=Date.now()-begin, fps=frames*1000/durationMs;
  const environment=await page.evaluate(()=>({browser:navigator.userAgent,logicalCpus:navigator.hardwareConcurrency,viewport:{width:innerWidth,height:innerHeight}}));
  await mkdir('output',{recursive:true});
  await writeFile(`output/render-performance-${width}.json`,JSON.stringify({environment,bodies:48,frames,durationMs,fps,goalFps:30,passed:fps>=30},null,2));
  expect(fps).toBeGreaterThanOrEqual(30);
});

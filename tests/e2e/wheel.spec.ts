import { test, expect, type Page } from '@playwright/test';
test.use({ hasTouch: true, actionTimeout: 10000 });
async function start(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: 'この部隊で演習を始める' }).click();
  await expect(page.locator('.phase-label')).toHaveText('PLANNING');
  await expect(page.locator('.map-panel canvas')).not.toHaveAttribute('data-unit-positions', '[]');
}
async function unitPoint(page: Page) {
  const canvas = page.locator('.map-panel canvas'), box = (await canvas.boundingBox())!;
  const unit = JSON.parse(await canvas.getAttribute('data-unit-positions') ?? '[]')[0] as { x: number; y: number };
  return { x: box.x + unit.x, y: box.y + unit.y - 10 };
}
async function openWheel(page: Page) {
  const point = await unitPoint(page); await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(page.getByRole('menu', { name: 'キャラの行動' })).toBeVisible();
}
async function clickSector(page: Page, index: number, count: number) {
  const box = (await page.locator('.wheel-disc').boundingBox())!;
  const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
  const point = { x: box.x + box.width / 2 + Math.cos(angle) * box.width / 4, y: box.y + box.height / 2 + Math.sin(angle) * box.width / 4 };
  expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName,point)).toBe('path');
  await page.mouse.click(point.x, point.y);
}
test('扇形全体のクリックで即保存し、連続選択や閉じる操作で設定が失われずコマンドも増えない', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page); await openWheel(page);
  const menu = page.getByRole('menu', { name: 'キャラの行動' });
  await expect(menu.getByRole('menuitem')).toHaveCount(8);
  await expect(menu.getByRole('button', { name: 'トリガー変更を反映' })).toHaveCount(0);
  await clickSector(page, 0, 8);
  const mainOptions = menu.getByRole('menuitemradio');
  const expectedMain = await page.locator('.equipment-control.main select').first().locator('option').allTextContents();
  expect(await mainOptions.locator('strong').allTextContents()).toEqual([...new Set(expectedMain)]);
  const emptyIndex = [...new Set(expectedMain)].indexOf('空き');
  await clickSector(page, emptyIndex, await mainOptions.count());
  await expect(menu.getByRole('menuitemradio', { name: 'MAIN 空き', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.command-strip .command')).toHaveCount(2);
  await expect(page.locator('.equipment-control.main select').first()).toHaveValue('none');
  await menu.getByRole('menuitemradio', { name: 'MAIN 空き', exact: true }).click();
  await expect(page.locator('.command-strip .command')).toHaveCount(2);
  await page.keyboard.press('Escape'); await menu.getByRole('menuitem', { name: 'SUB', exact: true }).click();
  await menu.getByRole('menuitemradio', { name: 'SUB 空き', exact: true }).click();
  await expect(page.locator('.equipment-control.sub select').first()).toHaveValue('none');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0); await expect(page.locator('.command-strip .command')).toHaveCount(2);
  await page.getByRole('button', { name: '装備・向き', exact: true }).click();
  await expect(page.locator('.equipment-control.main select').first()).toHaveValue('none');
  await expect(page.locator('.equipment-control.sub select').first()).toHaveValue('none');
  await openWheel(page); await menu.getByRole('menuitem', { name: 'MAIN', exact: true }).click();
  await menu.getByRole('menuitemradio').first().click(); await page.mouse.click(1365,1);
  await expect(menu).toHaveCount(0);
  await expect(page.locator('.command-strip .command')).toHaveCount(2);
  await expect(page.locator('.equipment-control.main select').first()).not.toHaveValue('none');
  await page.getByRole('button', { name: 'プランを確認', exact: true }).click(); await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('スマホの長押しで円形メニューを開き、移動ドラッグでは開かず、画面端に収まる', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 }); await start(page);
  const point = await unitPoint(page), cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await expect(page.getByRole('menu')).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const menu = page.getByRole('menu'), box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(900);
  await menu.getByRole('menuitem', { name: 'MAIN', exact: true }).click();
  await menu.getByRole('menuitemradio', { name: 'MAIN 空き', exact: true }).click();
  await expect(page.locator('.command-strip .command')).toHaveCount(2);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  const next = await unitPoint(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [next] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: next.x + 25, y: next.y }] });
  await page.waitForTimeout(650); await expect(menu).toHaveCount(0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
});
test('未視認の接触にはトリガーを出さず、円形メニューからタグ詳細を開ける', async ({ page }) => {
  await start(page);
  const radar = page.locator('.radar-panel canvas'), box = (await radar.boundingBox())!;
  const contact = JSON.parse(await radar.getAttribute('data-contact-positions') ?? '[]')[0] as { x: number; y: number };
  await page.mouse.click(box.x + contact.x, box.y + contact.y, { button: 'right' });
  const menu = page.getByRole('menu'); await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveCount(1);
  await expect(menu.getByRole('menuitem', { name: 'MAIN', exact: true })).toHaveCount(0);
  await menu.getByRole('menuitem', { name: 'タグ・接触詳細を編集' }).click();
  await expect(page.getByRole('dialog', { name: 'タグ・接触詳細', exact: true })).toBeVisible();
});
test('visual 円形トリガーメニューの広幅・375px', async ({ page }) => {
  for (const width of [1366, 375]) {
    await page.setViewportSize({ width, height: 900 }); await start(page); await openWheel(page);
    await expect(page.getByRole('menu')).toHaveScreenshot(`wheel-${width}.png`);
    await page.getByRole('menuitem', { name: 'MAIN', exact: true }).click();
    await expect(page.getByRole('menu')).toHaveScreenshot(`wheel-main-${width}.png`);
  }
});

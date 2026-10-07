import { test, expect, type Page } from '@playwright/test';

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'この部隊で演習を始める', exact: false }).click();
  await expect(page.locator('.phase-label')).toHaveText('PLANNING');
}
async function addThree(page: Page) {
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '待機を追加', exact: true }).click();
}

test('3件以上の登録行動を連結し、ブロックから編集・削除して選択キャラだけを表示する', async ({ page }) => {
  await start(page); await addThree(page);
  const flow = page.locator('.control-panel .action-flow');
  await expect(flow.locator('.flow-node')).toHaveCount(4);
  await expect(flow).toContainText('3件登録');
  for (const node of await flow.locator('.flow-node').all()) await expect(node).toBeVisible();
  const first = flow.getByRole('button', { name: /^1 待機/ });
  await first.click();
  await expect(first).toHaveAttribute('aria-current', 'step');
  await page.getByLabel('コマンドの保持時間').selectOption('20');
  await expect(first).toContainText('予定 2秒');
  await expect(first).toContainText('M '); await expect(first).toContainText('S ');
  expect(await flow.locator('.flow-node').first().evaluate(el => getComputedStyle(el, '::after').content)).toContain('→');
  await page.getByRole('button', { name: '削除', exact: true }).click();
  await expect(flow.locator('.flow-node')).toHaveCount(3);
  const firstName = await flow.locator('.flow-heading strong').innerText();
  await page.getByRole('button', { name: '部隊・接触一覧', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '部隊・接触一覧', exact: true });
  await dialog.locator('.unit-row button').nth(1).click();
  await expect(dialog).toHaveCount(0);
  await expect(flow).toContainText('0件登録');
  await expect(flow.locator('.flow-heading strong')).not.toHaveText(firstName);
  await page.getByRole('button', { name: '部隊・接触一覧', exact: true }).click();
  await dialog.locator('.unit-row button').first().click();
  await expect(dialog).toHaveCount(0);
  await expect(flow).toContainText('2件登録');
});

for (const width of [1366, 375]) test(`盤面を広げ、行動一覧から編集へ戻って登録を維持する ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await start(page);
  if (width === 375) await page.getByRole('button', { name: '行動設定・レーダー', exact: true }).click();
  await addThree(page);
  if (width === 375) await page.getByRole('button', { name: '最小化して盤面へ', exact: false }).click();
  const canvas = page.locator('.map-panel canvas');
  const before = (await canvas.boundingBox())!;
  await page.getByRole('button', { name: '盤面を広く表示', exact: true }).click();
  await expect(page.locator('.control-panel')).not.toBeVisible();
  await expect.poll(async () => (await canvas.boundingBox())!.height).toBeGreaterThan(before.height + 60);
  if (width > 760) expect((await canvas.boundingBox())!.width).toBeGreaterThan(before.width + 300);
  await page.getByRole('button', { name: '行動一覧', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '登録済み行動', exact: true });
  await expect(dialog.locator('.flow-node')).toHaveCount(4);
  await dialog.getByRole('button', { name: /^2 待機/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.control-panel')).toBeVisible();
  await expect(page.locator('.control-panel .command[aria-current="step"]')).toContainText('2');
  await expect(page.locator('.control-panel .action-flow')).toContainText('3件登録');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});

test('visual 接続された行動ブロックと広い盤面のPC・スマホ表示', async ({ page }) => {
  await page.clock.install(); await start(page); await addThree(page); await page.clock.runFor(100);
  await page.getByRole('button', { name: '一覧を拡大', exact: true }).click();
  const options = { mask: [page.locator('.timer')], maxDiffPixels: 150 };
  await expect(page).toHaveScreenshot('flow-wide.png', options);
  await page.setViewportSize({ width: 375, height: 900 }); await page.clock.runFor(100);
  await expect(page).toHaveScreenshot('flow-narrow.png', options);
  await page.getByRole('dialog', { name: '登録済み行動', exact: true }).getByRole('button', { name: '閉じる ×', exact: true }).click();
  await page.getByRole('button', { name: '盤面を広く表示', exact: true }).click(); await page.clock.runFor(100);
  await expect(page).toHaveScreenshot('board-focus-narrow.png', options);
});

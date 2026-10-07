import { test, expect, type Page } from '@playwright/test';

function observe(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(request.url()));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  page.on('request', request => { if (/\/api\//.test(request.url())) errors.push('Unexpected server request'); });
  page.on('websocket', () => errors.push('Unexpected server connection'));
  return errors;
}

for (const stage of ['I', 'II', 'III']) test(`Pagesの段階${stage}をサーバーなしで開始`, async ({ page }) => {
  const errors = observe(page);
  if (stage === 'II') await page.setViewportSize({ width: 375, height: 900 });
  await page.addInitScript(() => sessionStorage.setItem('closed-battle-session', '{}'));
  await page.goto('./');
  await expect(page.getByRole('button', { name: '招待ルーム', exact: true })).toHaveCount(0);
  await page.locator('.stage-selector button').filter({ has: page.locator('.stage-roman', { hasText: new RegExp(`^${stage}$`) }) }).click();
  await page.getByRole('button', { name: 'この部隊で演習を始める', exact: false }).click();
  await expect(page.locator('.battle-screen')).toBeVisible();
  await expect(page.locator('.official-icon')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.locator('.battle-canvas canvas').first().getAttribute('data-rendered-frames')).not.toBeNull();
  if (stage === 'II') {
    await page.getByRole('button', { name: '行動設定・レーダー', exact: true }).click();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '待機を追加', exact: true }).click();
    await expect(page.locator('.control-panel .flow-node')).toHaveCount(4);
    await page.getByRole('button', { name: '最小化して盤面へ', exact: false }).click();
    const canvas = page.locator('.map-panel canvas'), before = (await canvas.boundingBox())!.height;
    await page.getByRole('button', { name: '盤面を広く表示', exact: true }).click();
    await expect.poll(async () => (await canvas.boundingBox())!.height).toBeGreaterThan(before + 60);
    await page.getByRole('button', { name: '行動一覧', exact: true }).click();
    const flow = page.getByRole('dialog', { name: '登録済み行動', exact: true });
    await expect(flow).toContainText('3件登録');
    await flow.getByRole('button', { name: /^2 待機/ }).click();
    await expect(page.locator('.control-panel .command[aria-current="step"]')).toContainText('2');
    await expect(page.locator('.control-panel')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('Pagesの6ターン戦闘・保存・再インポートで両Workerが動作する', async ({ page }) => {
  const errors = observe(page);
  await page.clock.install();
  await page.goto('./');
  await page.getByRole('button', { name: 'この部隊で演習を始める', exact: false }).click();
  for (let turn = 1; turn <= 6; turn++) {
    await page.getByRole('button', { name: '全員に中央進軍を設定', exact: true }).click();
    await page.getByRole('button', { name: '行動を確定して同時実行', exact: false }).click();
    await page.clock.runFor(25);
    await expect(page.locator('.save-state')).toContainText('実行記録を再生中');
    await page.clock.runFor(15500);
    if (turn < 6) await expect(page.locator('.phase-label')).toHaveText('PLANNING');
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  await page.getByRole('button', { name: '試合全体を振り返る', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON保存', exact: true }).click();
  const record = await downloaded;
  expect(record.suggestedFilename()).toContain('6turns');
  await page.getByRole('button', { name: '閉じて設定へ戻る', exact: false }).click();
  await page.locator('input[type=file]').setInputFiles((await record.path())!);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});

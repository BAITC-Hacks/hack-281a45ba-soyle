import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { AppState } from '../src/domain';

const storageKey = 'sana-mvp-v1';

function tourismProposal(page: Page, team: string) {
  return page.locator('article.proposal-card')
    .filter({ has: page.getByRole('heading', { name: team, exact: true }) })
    .filter({ hasText: 'AI-гид по городам Казахстана' });
}

async function downloadSnapshot(page: Page): Promise<AppState> {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать текущие данные', exact: true }).click();
  const downloaded = await downloading;
  const path = await downloaded.path();
  if (!path) throw new Error('Резервная копия не была создана.');
  return JSON.parse(await readFile(path, 'utf8')) as AppState;
}

test('конфликт сохраняет все локальные действия и повторяет запись после восстановления исходного снимка', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByTestId('task-card')).toHaveCount(5);
  const original = await page.evaluate(key => localStorage.getItem(key)!, storageKey);
  await page.getByRole('button', { name: 'Отклики команд', exact: true }).click();

  const second = await context.newPage();
  await second.goto('/');
  await second.getByRole('button', { name: 'Отклики команд', exact: true }).click();
  await tourismProposal(second, 'Steppe AI').getByRole('button', { name: 'Отклонить', exact: true }).click();
  const latest = await second.evaluate(key => localStorage.getItem(key), storageKey);
  await expect(page.locator('.storage-banner')).toContainText('Данные изменились в другой вкладке');

  await tourismProposal(page, 'Steppe AI').getByRole('button', { name: 'Выбрать команду', exact: true }).click();
  await tourismProposal(page, 'Tamyr Tech').getByRole('button', { name: 'Отклонить', exact: true }).click();
  await expect(tourismProposal(page, 'Steppe AI')).toContainText('Команда выбрана');
  await expect(tourismProposal(page, 'Tamyr Tech')).toContainText('Отклонено');
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(latest);
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(true);

  const pending = await downloadSnapshot(page);
  expect(pending.proposals.find(item => item.id === 'proposal-guide-steppe')?.status).toBe('accepted');
  expect(pending.proposals.find(item => item.id === 'proposal-guide-tamyr')?.status).toBe('rejected');

  // A conflicting reset must not replace pending work or silently change the UI.
  await page.getByRole('button', { name: 'Как это работает', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Восстановить демоданные', exact: true }).click();
  expect(await downloadSnapshot(page)).toEqual(pending);
  await page.getByRole('button', { name: 'Отклики команд', exact: true }).click();

  // An undo in the other tab removes the conflict; retry must write local work.
  await second.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: storageKey, raw: original });
  await expect(page.locator('.storage-banner')).toContainText('Локальные изменения ещё не сохранены');
  await page.getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
  await expect(page.locator('.storage-banner')).toHaveCount(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), storageKey)).toEqual(pending);
  await expect(tourismProposal(page, 'Steppe AI')).toContainText('Команда выбрана');
  await expect(tourismProposal(page, 'Tamyr Tech')).toContainText('Отклонено');
  await second.close();
});

test('повторная отправка отклика при конфликте обновляет одну попытку без дубликатов', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByTestId('task-card')).toHaveCount(5);
  const original = await page.evaluate(key => localStorage.getItem(key)!, storageKey);
  const originalState = JSON.parse(original) as AppState;
  await page.getByRole('button', { name: 'Студент', exact: true }).click();
  await page.getByRole('button', { name: 'AI-гид по городам Казахстана', exact: true }).click();
  const idea = 'Уникальный отклик для проверки повторной отправки.';
  await page.getByLabel(/^Идея решения/).fill(idea);
  await page.getByLabel(/^План работы/).fill('Первый вариант плана.');
  await page.getByLabel(/^Срок реализации/).fill('14 дней');
  await page.getByLabel(/^Ссылка на прототип/).fill('https://example.com/retry-prototype');

  const second = await context.newPage();
  await second.goto('/');
  await second.getByRole('button', { name: 'Отклики команд', exact: true }).click();
  await tourismProposal(second, 'Steppe AI').getByRole('button', { name: 'Отклонить', exact: true }).click();
  const latest = await second.evaluate(key => localStorage.getItem(key), storageKey);
  await expect(page.locator('.storage-banner')).toContainText('Данные изменились в другой вкладке');

  await page.getByRole('button', { name: 'Отправить предложение', exact: true }).click();
  await expect(page.locator('.detail-proposal-form').getByRole('alert')).toContainText('Предложение не отправлено');
  const firstAttempt = (await downloadSnapshot(page)).proposals.find(p => p.idea === idea)!;
  expect(firstAttempt).toBeDefined();
  await page.getByLabel(/^План работы/).fill('Уточнённый план после первой попытки.');
  await page.getByRole('button', { name: 'Отправить предложение', exact: true }).click();
  await page.getByRole('button', { name: 'Отправить предложение', exact: true }).click();
  const pending = await downloadSnapshot(page);
  expect(pending.proposals).toHaveLength(originalState.proposals.length + 1);
  expect(pending.proposals.filter(p => p.idea === idea)).toEqual([{ ...firstAttempt, plan: 'Уточнённый план после первой попытки.' }]);
  await expect(page.locator('article.proposal-card').filter({ hasText: idea })).toHaveCount(1);
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(latest);

  await second.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: storageKey, raw: original });
  await expect(page.locator('.storage-banner')).toContainText('Локальные изменения ещё не сохранены');
  await page.getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
  await page.getByRole('button', { name: 'Отправить предложение', exact: true }).click();
  await expect(page.locator('.detail-submit-success')).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), storageKey)).toEqual(pending);
  await second.close();
});

test('повторное открытие конфликтной задачи сохраняет предыдущие локальные правки полей', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'AI-гид по городам Казахстана', exact: true }).click();
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
  const need = 'Локальная потребность, которая должна сохраниться после повторного открытия.';
  await page.getByLabel('Потребность или проблема', { exact: true }).fill(need);
  await page.getByRole('button', { name: 'Подтвердить сведения', exact: true }).click();

  const second = await context.newPage();
  await second.goto('/');
  await second.getByRole('button', { name: 'Отклики команд', exact: true }).click();
  await tourismProposal(second, 'Steppe AI').getByRole('button', { name: 'Отклонить', exact: true }).click();
  const latest = await second.evaluate(key => localStorage.getItem(key), storageKey);
  await expect(page.locator('.storage-banner')).toContainText('Данные изменились в другой вкладке');
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await expect(page.locator('.editor-form-error')).toContainText('Изменения не сохранены');

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'К моим задачам', exact: true }).click();
  await page.getByRole('button', { name: 'AI-гид по городам Казахстана', exact: true }).click();
  await expect(page.locator('.detail-main')).toContainText(need);
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
  await expect(page.getByLabel('Потребность или проблема', { exact: true })).toHaveValue(need);
  const contact = 'Новый локальный контакт: coordinator@example.com';
  await page.getByLabel('Контакт', { exact: true }).fill(contact);
  await page.getByRole('button', { name: 'Подтвердить сведения', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await expect(page.locator('.editor-form-error')).toContainText('Изменения не сохранены');
  const pending = await downloadSnapshot(page);
  expect(pending.tasks.find(t => t.id === 'task-tourism')?.fields).toMatchObject({ need, contact });
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(latest);
  await second.close();
});

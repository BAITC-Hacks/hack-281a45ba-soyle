import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page), 'Подбор не должен вызывать необработанные ошибки').toEqual([]);
});

async function saveCatalogScreenshot(page: Page, name: string) {
  await mkdir('.artifacts', { recursive: true });
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  });
  await page.screenshot({ path: `.artifacts/${name}.png`, fullPage: true });
}

test('подбор: команда меняет порядок, совпадения объясняются, фильтры и роль сбрасываются', async ({ page }) => {
  await page.goto('/');
  const cards = page.getByTestId('task-card');
  const sorting = page.getByLabel('Сортировка задач');
  const onlyMatches = page.getByRole('checkbox', { name: 'Только с совпадениями' });
  await expect(onlyMatches).toHaveCount(0);
  await page.getByRole('button', { name: 'Студент', exact: true }).click();
  await page.getByLabel('Закрыть сообщение').click();
  await expect(sorting).toHaveValue('team');
  await expect(cards).toHaveCount(5);
  await expect(cards.first()).toContainText('AI-гид по городам Казахстана');
  await expect(cards.first()).toContainText('AI / ML: в задаче есть «AI»');

  await page.getByLabel('Активная команда').selectOption('team-qadam');
  await expect(page.getByText('Подбор для Qadam', { exact: true })).toBeVisible();
  await expect(cards.first()).toContainText('Карта доступной городской среды');
  await expect(cards.first()).toContainText('Ваше направление: Город и общество');
  await expect(cards.first()).toContainText('Карты: в задаче есть «Карта»');
  await expect(cards).toHaveCount(5);
  await saveCatalogScreenshot(page, 'matching-desktop');

  await page.getByLabel('Активная команда').selectOption('team-nomad');
  await expect(cards.first()).toContainText('Прогноз спроса для локального магазина');
  await onlyMatches.check();
  await expect(cards).toHaveCount(1);
  await page.getByLabel('Фильтр по теме').selectOption('Образование');
  await expect(cards).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Пока ничего не нашлось' })).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click();
  await expect(onlyMatches).not.toBeChecked();
  await expect(page.getByLabel('Фильтр по теме')).toHaveValue('all');
  await expect(cards).toHaveCount(5);

  await sorting.selectOption('rating');
  await expect(cards.first()).toContainText('AI-гид по городам Казахстана');
  await sorting.selectOption('rating-asc');
  await expect(cards.first()).toContainText('Умный маршрут сбора вторсырья');
  await sorting.selectOption('team');
  await expect(cards.first()).toContainText('Прогноз спроса для локального магазина');
  await onlyMatches.check();
  await page.getByRole('button', { name: 'Бизнес', exact: true }).click();
  await expect(onlyMatches).toHaveCount(0);
  await expect(sorting).toHaveValue('rating');
  await expect(cards).toHaveCount(5);
});

test('подбор на экране 390px: фильтр доступен и горизонтальной прокрутки нет', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Студент', exact: true }).click();
  await page.getByLabel('Закрыть сообщение').click();
  await page.getByLabel('Активная команда').selectOption('team-qadam');
  await page.getByRole('checkbox', { name: 'Только с совпадениями' }).check();
  await expect(page.getByTestId('task-card')).toHaveCount(2);
  await expect(page.getByTestId('task-card').first()).toContainText('Карта доступной городской среды');
  await saveCatalogScreenshot(page, 'matching-mobile');
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.viewport).toBe(390);
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
});

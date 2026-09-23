import { mkdir, readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { AppState } from '../src/domain';

const storageKey = 'sana-mvp-v1';
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page), 'Приложение не должно выдавать необработанные ошибки').toEqual([]);
});

async function storedState(page: Page): Promise<AppState> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), storageKey);
}

async function openTask(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true, level: 1 })).toBeVisible();
}

function proposal(page: Page, team: string, task: string): Locator {
  return page.locator('article.proposal-card')
    .filter({ has: page.getByRole('heading', { name: team, exact: true }) })
    .filter({ hasText: task });
}

async function fillProposal(page: Page, idea = 'Соберем понятный прототип с проверкой на синтетических данных.') {
  await page.getByLabel(/^Идея решения/).fill(idea);
  await page.getByLabel(/^План работы/).fill('Уточним данные, соберем интерфейс и проверим согласованные сценарии.');
  await page.getByLabel(/^Срок реализации/).fill('14 дней');
  await page.getByLabel(/^Ссылка на прототип/).fill('https://example.com/demo-prototype');
}

async function screenshot(page: Page, name: string) {
  await mkdir('.artifacts', { recursive: true });
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  });
  await page.screenshot({ path: `.artifacts/${name}.png`, fullPage: true });
}

async function downloadText(page: Page, button: Locator): Promise<string> {
  const pending = page.waitForEvent('download');
  await button.click();
  const download = await pending;
  const path = await download.path();
  if (!path) throw new Error('Браузер не создал скачиваемый файл.');
  return readFile(path, 'utf8');
}

function backupFile(state: AppState) {
  return { name: 'soyle-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) };
}

async function rateThroughBackend(page: Page, button: Locator, endpoint: 'confirm' | 'publish', expectedScore: number) {
  const pending = page.waitForResponse(response => response.url().endsWith(`/api/tasks/${endpoint}`) && response.request().method() === 'POST');
  await button.click();
  const response = await pending;
  expect(response.ok(), `Backend ${endpoint} должен принять проверенную карточку`).toBe(true);
  const result = await response.json();
  expect(result.rating.score).toBe(expectedScore);
  if (endpoint === 'confirm') expect(result.confirmedFields).toContain('context');
}

test('каталог: опубликованные задачи, фильтры, поиск и порядок рейтингов', async ({ page }) => {
  await page.goto('/');
  const cards = page.getByTestId('task-card');
  await expect(cards).toHaveCount(5);
  await expect(cards.first()).toContainText('AI-гид по городам Казахстана');
  const ratings = () => cards.evaluateAll(elements => elements.map(element => Number(element.getAttribute('data-rating'))));
  expect(await ratings()).toEqual([100, 90, 75, 60, 30]);
  await screenshot(page, 'catalog');

  await page.getByLabel('Сортировка задач').selectOption('rating-asc');
  expect(await ratings()).toEqual([30, 60, 75, 90, 100]);
  await page.getByLabel('Фильтр по теме').selectOption('Образование');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Навигатор навыков для первой стажировки');
  await page.getByLabel('Фильтр по готовности').selectOption('priority');
  await expect(cards).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Пока ничего не нашлось' })).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click();
  await expect(cards).toHaveCount(5);
  await page.getByLabel('Фильтр по готовности').selectOption('priority');
  await expect(cards).toHaveCount(2);
  await page.getByLabel('Фильтр по готовности').selectOption('all');
  await page.getByLabel('Поиск задач').fill('  Dala  ');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Прогноз спроса для локального магазина');
  await page.getByLabel('Очистить поиск').click();
  await page.getByLabel('Сортировка задач').selectOption('newest');
  await expect(cards.first()).toContainText('AI-гид по городам Казахстана');
});

test('полный путь через backend: два AI-этапа в mock, публикация с 20 баллами, пересчёт до 100 и отклик', async ({ page }) => {
  test.setTimeout(60_000);
  const externalRequests: string[] = [];
  page.on('request', request => {
    if (['fetch', 'xhr'].includes(request.resourceType()) && !request.url().startsWith('http://127.0.0.1:5173/')) {
      externalRequests.push(request.url());
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Разместить задачу', exact: true }).click();
  await page.getByLabel('Описание задачи', { exact: true }).fill('У нас небольшой магазин.');
  const questionsResponse = page.waitForResponse(response => response.url().endsWith('/api/ai') && response.request().postDataJSON().stage === 'questions');
  await page.getByRole('button', { name: 'Получить вопросы', exact: true }).click();
  const questionsReply = await questionsResponse;
  expect(questionsReply.ok()).toBe(true);
  const questions = await questionsReply.json();
  expect(questions.stage).toBe('questions');
  expect(questions.mode).toBe('mock');
  expect(questions.questions.length).toBeGreaterThanOrEqual(3);
  expect(questions.questions[0].id).toMatch(/^q\d+$/);
  expect(questions.questions[0].field).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Добавим важные детали' })).toBeVisible();
  expect(await page.locator('.editor-question').count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.editor-answer-example')).toHaveCount(5);
  await expect(page.locator('.editor-answer-example').first()).toContainText('Пример ответа');
  await screenshot(page, 'questions');
  for (const answer of await page.locator('.editor-question textarea').all()) await expect(answer).toHaveValue('');
  await expect(page.getByTestId('rating-score')).toHaveText('0');
  await expect(page.locator('.editor-analysis-summary')).toContainText(/mock|демонстрацион|без.*модели/i);
  await page.getByLabel('Потребность или проблема', { exact: true }).fill('Замечать низкий запас до следующей поставки.');
  const cardResponse = page.waitForResponse(response => response.url().endsWith('/api/ai') && response.request().postDataJSON().stage === 'card');
  await page.getByRole('button', { name: 'Сформировать карточку', exact: true }).click();
  const cardReply = await cardResponse;
  expect(cardReply.ok()).toBe(true);
  const cardResult = await cardReply.json();
  expect(cardResult.stage).toBe('card');
  expect(cardResult.mode).toBe('mock');
  expect(cardResult.card.need).toBe('Замечать низкий запас до следующей поставки.');
  expect(cardResult.card.data).toBeNull();
  expect(cardResult.card.contact).toBeNull();
  const cardRequest = cardReply.request().postDataJSON();
  expect(cardRequest.answers).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'need', answer: 'Замечать низкий запас до следующей поставки.' })]));
  const title = 'Учет остатков магазина «Демо Маркет»';
  await expect(page.locator('details.editor-field-example')).toHaveCount(11);
  const titleInput = page.getByRole('textbox', { name: 'Название задачи', exact: true });
  await expect(titleInput).toHaveAttribute('aria-required', 'true');
  await titleInput.fill('\u200B\u2060\uFEFF');
  await page.getByRole('combobox', { name: 'Тема или отрасль', exact: true }).fill('Ритейл');
  await page.getByRole('button', { name: 'Опубликовать задачу', exact: true }).click();
  await expect(page.getByText('Добавьте название для каталога.', { exact: true })).toBeVisible();
  expect((await storedState(page)).tasks).toHaveLength(10);
  await page.getByRole('textbox', { name: 'Название задачи', exact: true }).fill(title);
  await page.getByRole('combobox', { name: 'Тема или отрасль', exact: true }).fill('Ритейл');
  await expect(page.getByTestId('rating-score')).toHaveText('0');
  await page.getByRole('button', { name: 'Опубликовать задачу', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Подтвердить сведения');
  await rateThroughBackend(page, page.getByRole('button', { name: 'Подтвердить сведения', exact: true }), 'confirm', 20);
  await expect(page.getByTestId('rating-score')).toHaveText('20');
  await screenshot(page, 'editor');
  await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
  await expect(page.locator('.detail-publication')).toHaveText('Черновик');
  await page.getByRole('button', { name: 'Каталог задач', exact: true }).click();
  await expect(page.getByTestId('task-card')).toHaveCount(5);
  await page.getByRole('button', { name: /Мои задачи/ }).click();
  await openTask(page, title);
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
  await rateThroughBackend(page, page.getByRole('button', { name: 'Опубликовать задачу', exact: true }), 'publish', 20);
  await expect(page.locator('.detail-publication')).toHaveText('Опубликована');
  await expect(page.getByTestId('rating-score')).toHaveText('20');
  await page.getByRole('button', { name: 'Каталог задач', exact: true }).click();
  await page.getByLabel('Поиск задач').fill(title);
  await expect(page.getByTestId('task-card')).toHaveCount(1);
  await expect(page.getByTestId('task-card')).toHaveAttribute('data-rating', '20');
  await openTask(page, title);

  await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
  await page.getByLabel('Потребность или проблема', { exact: true }).fill('Управляющему нужен список товаров, которые надо заказать до следующей поставки.');
  await expect(page.getByTestId('rating-score')).toHaveText('10');
  for (const [label, value] of [
    ['Целевые пользователи', 'Продавец и управляющий магазина.'],
    ['Данные и материалы', 'Синтетический CSV: артикул, товар, остаток и минимальный запас.'],
    ['Ограничения', 'Две недели, браузер, без интеграции с кассой.'],
    ['Ожидаемый результат', 'Панель остатков с фильтром по дефициту.'],
    ['Критерии успеха', 'Все товары ниже порога найдены на тестовом наборе за два действия.'],
    ['Контакт', 'demo-store@example.com'],
    ['Взаимодействие и обратная связь', 'Два созвона в неделю и обратная связь по прототипу.'],
  ]) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }
  await expect(page.getByTestId('rating-score')).toHaveText('10');
  await rateThroughBackend(page, page.getByRole('button', { name: 'Подтвердить сведения', exact: true }), 'confirm', 100);
  await expect(page.getByTestId('rating-score')).toHaveText('100');
  await rateThroughBackend(page, page.getByRole('button', { name: 'Сохранить изменения', exact: true }), 'publish', 100);
  await expect(page.getByTestId('rating-score')).toHaveText('100');
  await screenshot(page, 'detail');
  await page.reload();
  await page.getByLabel('Поиск задач').fill(title);
  await expect(page.getByTestId('task-card')).toHaveAttribute('data-rating', '100');
  const savedTask = (await storedState(page)).tasks.find(item => item.fields.title === title);
  expect(savedTask?.published).toBe(true);
  expect(savedTask?.confirmedFields).toHaveLength(11);

  await page.getByRole('button', { name: 'Студент', exact: true }).click();
  await openTask(page, title);
  const idea = 'Панель остатков с подсветкой дефицита и поиском по артикулу.';
  await fillProposal(page, idea);
  await page.getByRole('button', { name: 'Отправить предложение', exact: true }).click();
  await expect(proposal(page, 'Steppe AI', title)).toContainText(idea);
  await page.getByRole('button', { name: 'Бизнес', exact: true }).click();
  await page.getByRole('button', { name: /Отклики команд/ }).click();
  const submitted = proposal(page, 'Steppe AI', title);
  await submitted.getByRole('button', { name: 'Выбрать команду', exact: true }).click();
  await expect(submitted).toContainText('Команда выбрана');
  expect(externalRequests, 'AI-деморежим не требует внешних запросов').toEqual([]);
});

test('некорректные AI-ответы на обоих этапах сохраняют ввод и позволяют повторить запрос', async ({ page }) => {
  let breakStage: 'questions' | 'card' | null = 'questions';
  const attempts: string[] = [];
  await page.route('**/api/ai', async route => {
    const stage = route.request().postDataJSON().stage;
    attempts.push(stage);
    if (stage === breakStage) {
      breakStage = null;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{malformed-ai-response' });
    } else {
      await route.continue();
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Разместить задачу', exact: true }).click();
  const source = 'У нас небольшой магазин, процессы пока описаны только в бумажном журнале.';
  await page.getByLabel('Описание задачи', { exact: true }).fill(source);
  await page.getByRole('button', { name: 'Получить вопросы', exact: true }).click();
  await expect(page.locator('.editor-page').getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Описание задачи', { exact: true })).toHaveValue(source);
  await expect(page.getByRole('button', { name: 'Получить вопросы', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Получить вопросы', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Добавим важные детали' })).toBeVisible();
  const need = 'Сотрудники должны быстро находить актуальные товары для покупателя.';
  await page.getByLabel('Потребность или проблема', { exact: true }).fill(need);
  breakStage = 'card';
  await page.getByRole('button', { name: 'Сформировать карточку', exact: true }).click();
  await expect(page.locator('.editor-page').getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Потребность или проблема', { exact: true })).toHaveValue(need);
  await expect(page.getByRole('heading', { name: 'Добавим важные детали' })).toBeVisible();
  await expect(page.getByTestId('rating-score')).toHaveText('0');
  await page.getByRole('button', { name: 'Сформировать карточку', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Карточка вашей задачи' })).toBeVisible();
  await expect(page.getByLabel('Потребность или проблема', { exact: true })).toHaveValue(need);
  await expect(page.getByLabel('Контекст', { exact: true })).toHaveValue(source);
  await expect(page.getByLabel('Контакт', { exact: true })).toHaveValue('');
  await expect(page.getByTestId('rating-score')).toHaveText('0');
  expect(attempts).toEqual(['questions', 'questions', 'card', 'card']);
  expect((await storedState(page)).tasks).toHaveLength(10);
});

test('низкий рейтинг не мешает отклику; форма валидирует данные и сохраняет предложение', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Студент', exact: true }).click();
  await page.getByLabel('Активная команда').selectOption('team-steppe');
  const title = 'Умный маршрут сбора вторсырья';
  await openTask(page, title);
  await expect(page.getByTestId('rating-score')).toHaveText('30');
  await expect(page.getByText('В задаче ещё есть открытые вопросы.', { exact: false })).toBeVisible();
  const submit = page.getByRole('button', { name: 'Отправить предложение', exact: true });
  await submit.click();
  await expect(page.getByText('Опишите идею решения.', { exact: true })).toBeVisible();
  expect((await storedState(page)).proposals).toHaveLength(7);

  const idea = 'Уточним адреса и построим проверяемый маршрут для волонтеров.';
  await fillProposal(page, idea);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Бизнес', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Студент', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel(/^Идея решения/)).toHaveValue(idea);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByLabel('Активная команда').selectOption('team-qadam');
  await expect(page.getByLabel('Активная команда')).toHaveValue('team-steppe');
  await expect(page.getByLabel(/^Идея решения/)).toHaveValue(idea);
  await page.getByLabel(/^Идея решения/).fill('\u200B\u2060\uFEFF');
  await submit.click();
  await expect(page.getByText('Опишите идею решения.', { exact: true })).toBeVisible();
  await page.getByLabel(/^Идея решения/).fill(idea);
  await page.getByLabel(/^Ссылка на прототип/).fill('javascript:alert(1)');
  await submit.click();
  await expect(page.getByText('Введите полную ссылку, начинающуюся с https:// или http://.', { exact: true })).toBeVisible();
  await page.getByLabel(/^Ссылка на прототип/).fill('https://example.com/route');
  await submit.click();
  await expect(proposal(page, 'Steppe AI', title)).toContainText(idea);
  await expect(proposal(page, 'Steppe AI', title)).toContainText('На рассмотрении');
  expect((await storedState(page)).proposals).toHaveLength(8);
  await expect(proposal(page, 'Steppe AI', title).getByRole('button', { name: 'Выбрать команду' })).toHaveCount(0);

  await page.getByRole('button', { name: /Мои отклики/ }).click();
  await expect(proposal(page, 'Steppe AI', title)).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Отклики команд/ }).click();
  await expect(proposal(page, 'Steppe AI', title)).toContainText(idea);
});

test('бизнес выбирает несколько команд, отклоняет предложение и начисляет баллы один раз', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Отклики команд/ }).click();
  const title = 'AI-гид по городам Казахстана';
  const first = proposal(page, 'Steppe AI', title);
  const second = proposal(page, 'Tamyr Tech', title);
  await first.getByRole('button', { name: 'Выбрать команду', exact: true }).click();
  await second.getByRole('button', { name: 'Выбрать команду', exact: true }).click();
  await expect(first).toContainText('Команда выбрана');
  await expect(second).toContainText('Команда выбрана');
  await expect(second.getByRole('button', { name: 'Подтвердить этап', exact: true })).toBeVisible();

  const rejected = proposal(page, 'Orbit', 'Навигатор навыков для первой стажировки');
  await rejected.getByRole('button', { name: 'Отклонить', exact: true }).click();
  await expect(rejected).toContainText('Отклонено');
  await first.getByRole('button', { name: 'Подтвердить этап', exact: true }).click();
  await expect(first).toContainText('Первый этап подтверждён');
  await expect(first.getByRole('button', { name: 'Подтвердить этап', exact: true })).toHaveCount(0);
  const snapshot = await storedState(page);
  expect(snapshot.proposals.filter(item => item.taskId === 'task-tourism' && item.status === 'accepted')).toHaveLength(2);
  expect(snapshot.proposals.filter(item => item.teamId === 'team-steppe' && item.milestoneConfirmed)).toHaveLength(1);
  await page.getByRole('button', { name: 'Команды', exact: true }).click();
  const teamCard = page.locator('article.team-profile-card').filter({ has: page.getByRole('heading', { name: 'Steppe AI', exact: true }) });
  await expect(teamCard).toContainText('50 баллов прогресса');
  await page.reload();
  await page.getByRole('button', { name: /Отклики команд/ }).click();
  await expect(first).toContainText('Первый этап подтверждён');
  await expect(first.getByRole('button', { name: 'Подтвердить этап', exact: true })).toHaveCount(0);
  await expect(second).toContainText('Команда выбрана');
  await expect(rejected).toContainText('Отклонено');
  await page.getByRole('button', { name: 'Студент', exact: true }).click();
  await expect(page.locator('.team-points')).toHaveText('50 баллов');
});

test('сброс данных: отмена сохраняет изменения, подтверждение восстанавливает набор', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Отклики команд/ }).click();
  await proposal(page, 'Steppe AI', 'AI-гид по городам Казахстана').getByRole('button', { name: 'Отклонить', exact: true }).click();
  const changed = await storedState(page);
  expect(changed.proposals.find(item => item.id === 'proposal-guide-steppe')?.status).toBe('rejected');
  await page.getByRole('button', { name: 'Как это работает', exact: true }).click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Восстановить демоданные', exact: true }).click();
  expect(await storedState(page)).toEqual(changed);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Восстановить демоданные', exact: true }).click();
  await expect(page.getByTestId('task-card')).toHaveCount(5);
  const restored = await storedState(page);
  expect(restored.tasks).toHaveLength(10);
  expect(restored.teams).toHaveLength(5);
  expect(restored.proposals).toHaveLength(7);
  expect(restored.proposals.find(item => item.id === 'proposal-guide-steppe')?.status).toBe('pending');
});

test('пример из руководства начинает подготовку с описания и предлагает уточнения', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('task-card')).toHaveCount(5);
  await screenshot(page, 'catalog');
  await page.getByRole('button', { name: 'Как это работает', exact: true }).click();
  await page.getByRole('button', { name: 'Попробовать на примере', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Начнем с вашей идеи', exact: true })).toBeVisible();
  await expect(page.getByLabel('Описание задачи', { exact: true })).toHaveValue(/У нас небольшой магазин/);
  await page.getByRole('button', { name: 'Получить вопросы', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Добавим важные детали', exact: true })).toBeVisible();
  expect(await page.locator('.editor-question').count()).toBeGreaterThanOrEqual(3);
});

test('резервная копия: скачивание, отмена замены, отклонение поврежденного файла и восстановление', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Отклики команд', exact: true }).click();
  const selected = proposal(page, 'Steppe AI', 'AI-гид по городам Казахстана');
  await selected.getByRole('button', { name: 'Отклонить', exact: true }).click();
  const original = await storedState(page);
  await page.getByRole('button', { name: 'Как это работает', exact: true }).click();
  const downloaded = JSON.parse(await downloadText(page, page.getByRole('button', { name: 'Скачать копию', exact: true }))) as AppState;
  expect(downloaded).toEqual(original);

  await page.getByRole('button', { name: 'Отклики команд', exact: true }).click();
  await selected.getByRole('button', { name: 'Выбрать команду', exact: true }).click();
  const changed = await storedState(page);
  expect(changed).not.toEqual(original);
  await page.getByRole('button', { name: 'Как это работает', exact: true }).click();
  const input = page.getByLabel('Файл резервной копии');
  page.once('dialog', dialog => dialog.dismiss());
  await input.setInputFiles(backupFile(downloaded));
  await expect(page.getByRole('button', { name: 'Загрузить копию', exact: true })).toBeEnabled();
  expect(await storedState(page)).toEqual(changed);
  await input.setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{not-json') });
  await expect(page.locator('.data-tools').getByRole('alert')).toContainText('Не удалось прочитать JSON');
  expect(await storedState(page)).toEqual(changed);
  page.once('dialog', dialog => dialog.accept());
  await input.setInputFiles(backupFile(downloaded));
  await expect(page.getByTestId('task-card')).toHaveCount(5);
  expect(await storedState(page)).toEqual(original);
});

test('вторая вкладка: конфликт не затирает данные и позволяет скачать черновик перед загрузкой обновлений', async ({ page, context }) => {
  await page.goto('/');
  await openTask(page, 'AI-гид по городам Казахстана');
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
  const editedNeed = 'Уникальный текст первой вкладки, который нельзя потерять при конфликте.';
  await page.getByLabel('Потребность или проблема', { exact: true }).fill(editedNeed);
  await page.getByRole('button', { name: 'Подтвердить сведения', exact: true }).click();
  const second = await context.newPage();
  await second.goto('/');
  await second.getByRole('button', { name: 'Отклики команд', exact: true }).click();
  await proposal(second, 'Steppe AI', 'AI-гид по городам Казахстана').getByRole('button', { name: 'Отклонить', exact: true }).click();
  const latest = await storedState(second);
  await expect(page.locator('.storage-banner')).toContainText('Данные изменились в другой вкладке');
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await expect(page.getByLabel('Потребность или проблема', { exact: true })).toHaveValue(editedNeed);
  await expect(page.locator('.editor-form-error')).toContainText('Изменения не сохранены');
  expect(await storedState(page)).toEqual(latest);
  const pending = JSON.parse(await downloadText(page, page.getByRole('button', { name: 'Скачать текущие данные', exact: true }))) as AppState;
  expect(pending.tasks.find(item => item.id === 'task-tourism')?.fields.need).toBe(editedNeed);
  const draft = JSON.parse(await downloadText(page, page.getByRole('button', { name: 'Скачать текущий черновик', exact: true })));
  expect(draft.task.fields.need).toBe(editedNeed);
  expect(draft.version).toBeUndefined();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Загрузить обновления', exact: true }).click();
  await expect(page.getByLabel('Потребность или проблема', { exact: true })).toHaveValue(editedNeed);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Загрузить обновления', exact: true }).click();
  await expect(page.getByTestId('task-card')).toHaveCount(5);
  await expect(page.locator('.storage-banner')).toHaveCount(0);
  expect(await storedState(page)).toEqual(latest);
  await second.close();
});

test('переполненное хранилище: явное предупреждение, копия изменений из памяти и повторное сохранение', async ({ page }) => {
  await page.goto('/');
  const original = await storedState(page);
  await page.evaluate(key => {
    const storage = Storage.prototype as Storage & { originalSetItem?: typeof Storage.prototype.setItem };
    storage.originalSetItem = Storage.prototype.setItem;
    storage.setItem = function (name, value) {
      if (name === key) throw new DOMException('Storage is full', 'QuotaExceededError');
      return storage.originalSetItem!.call(this, name, value);
    };
  }, storageKey);
  await page.getByRole('button', { name: 'Отклики команд', exact: true }).click();
  const target = proposal(page, 'Steppe AI', 'AI-гид по городам Казахстана');
  await target.getByRole('button', { name: 'Отклонить', exact: true }).click();
  await expect(target).toContainText('Отклонено');
  await expect(page.locator('.storage-banner')).toContainText('Не удалось сохранить изменения на устройстве');
  expect(await storedState(page)).toEqual(original);
  const backup = JSON.parse(await downloadText(page, page.getByRole('button', { name: 'Скачать текущие данные', exact: true }))) as AppState;
  expect(backup.proposals.find(item => item.id === 'proposal-guide-steppe')?.status).toBe('rejected');
  await page.evaluate(() => {
    const storage = Storage.prototype as Storage & { originalSetItem?: typeof Storage.prototype.setItem };
    Storage.prototype.setItem = storage.originalSetItem!;
    delete storage.originalSetItem;
  });
  await page.getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
  await expect(page.locator('.storage-banner')).toHaveCount(0);
  expect(await storedState(page)).toEqual(backup);
  await page.reload();
  await page.getByRole('button', { name: 'Отклики команд', exact: true }).click();
  await expect(target).toContainText('Отклонено');
});

test('устаревший архив не подменяет текущий поврежденный оригинал при ошибке архивирования', async ({ page }) => {
  const broken = '{current-corrupt-save';
  const oldArchive = '{previous-corrupt-save';
  await page.addInitScript(({ key, raw, previous }) => {
    localStorage.setItem(key, raw);
    localStorage.setItem(`${key}-recovery`, previous);
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === `${key}-recovery`) throw new DOMException('Storage is full', 'QuotaExceededError');
      return originalSetItem.call(this, name, value);
    };
  }, { key: storageKey, raw: broken, previous: oldArchive });
  await page.goto('/');
  await expect(page.getByTestId('task-card')).toHaveCount(5);
  await expect(page.locator('.storage-banner')).toContainText('Исходные данные не перезаписаны');
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(broken);
  expect(await page.evaluate(key => localStorage.getItem(`${key}-recovery`), storageKey)).toBe(oldArchive);
  expect(await downloadText(page, page.getByRole('button', { name: 'Скачать исходное сохранение', exact: true }))).toBe(broken);
});

for (const [name, value] of [
  ['невалидный JSON', '{invalid'],
  ['несовместимая версия', JSON.stringify({ version: 99, tasks: [], teams: [], proposals: [] })],
  ['пустой набор команд', JSON.stringify({ version: 1, tasks: [], teams: [], proposals: [] })],
] as const) {
  test(`поврежденное сохранение: ${name} вызывает восстановление без падения`, async ({ page }) => {
    await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key: storageKey, raw: value });
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText('Загружены демонстрационные данные');
    await expect(page.getByTestId('task-card')).toHaveCount(5);
    const restored = await storedState(page);
    expect(restored.teams).toHaveLength(5);
    expect(restored.tasks).toHaveLength(10);
    expect(await page.evaluate(key => localStorage.getItem(`${key}-recovery`), storageKey)).toBe(value);
    expect(await downloadText(page, page.getByRole('button', { name: 'Скачать исходное сохранение', exact: true }))).toBe(value);
  });
}

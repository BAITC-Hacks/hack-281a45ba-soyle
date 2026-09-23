import { expect, test, type Page } from '@playwright/test'
import { createMockResponse, type AIRequest } from '../src/ai'
import { createSeed } from '../src/seed'

test('новая задача показывает реальный деморежим до первого AI-запроса', async ({ page, request }) => {
  // StrictMode may abort the first component fetch during its mount check.
  // Inspect the API independently and verify the surviving fetch through the UI.
  const response = await request.get('/api/health')
  expect(response.ok()).toBe(true)
  expect(await response.json()).toMatchObject({ ai: { mode: 'mock', configured: true } })
  await page.goto('/')
  await page.getByRole('button', { name: 'Разместить задачу', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Деморежим:' })).toBeVisible()
})

test('ошибка настройки AI объясняет org-ID и позволяет заполнить карточку вручную', async ({ page }) => {
  const message = 'AI не настроен: идентификатор организации org-… не заменяет API-ключ.'
  await page.route('**/api/health', (route) => route.fulfill({ json: { ai: { mode: 'openai', configured: false, message } } }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Разместить задачу', exact: true }).click()
  await expect(page.locator('.editor-content .form-error[role="status"]')).toHaveText(message)
  const manualCard = page.getByRole('button', { name: 'Заполнить карточку вручную', exact: true })
  await expect(manualCard).toBeEnabled()
  await manualCard.click()
  await expect(page.getByRole('heading', { name: 'Карточка вашей задачи', exact: true })).toBeVisible()
  await expect(page.getByLabel('Название задачи', { exact: false })).toBeEditable()
})

async function startQuestions(page: Page) {
  await page.route('**/api/ai', async (route) => {
    const request = route.request().postDataJSON() as AIRequest
    await route.fulfill({ json: createMockResponse(request) })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Разместить задачу', exact: true }).click()
  await page.getByLabel('Описание задачи', { exact: true }).fill('У нас небольшой магазин, учёт пока ведётся в бумажном журнале.')
  await page.getByRole('button', { name: 'Получить вопросы', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Добавим важные детали' })).toBeVisible()
}

test('повторная генерация не возвращает старый ответ после ручной правки карточки', async ({ page }) => {
  await startQuestions(page)
  const originalNeed = 'Показывать остатки только директору магазина.'
  const correctedNeed = 'Показывать остатки сотрудникам торгового зала.'
  await page.getByLabel('Потребность или проблема', { exact: true }).fill(originalNeed)
  await page.getByRole('button', { name: 'Сформировать карточку', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Карточка вашей задачи' })).toBeVisible()
  await expect(page.getByLabel('Потребность или проблема', { exact: true })).toHaveValue(originalNeed)
  await page.getByLabel('Потребность или проблема', { exact: true }).fill(correctedNeed)
  await page.getByRole('button', { name: 'Уточнение', exact: false }).click()
  await page.getByLabel('Целевые пользователи', { exact: true }).fill('Продавцы магазина, которые консультируют покупателей.')
  await page.getByRole('button', { name: 'Сформировать карточку', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Карточка вашей задачи' })).toBeVisible()
  await expect(page.getByLabel('Потребность или проблема', { exact: true })).toHaveValue(correctedNeed)
  await expect(page.getByLabel('Целевые пользователи', { exact: true })).toHaveValue('Продавцы магазина, которые консультируют покупателей.')
})

test('удаление ещё не применённого ответа снова разрешает сохранить черновик', async ({ page }) => {
  await startQuestions(page)
  const answer = page.getByLabel('Потребность или проблема', { exact: true })
  const save = page.getByRole('button', { name: 'Сохранить черновик', exact: true })
  await answer.fill('Временный ответ, который автор решил убрать.')
  await expect(save).toBeDisabled()
  await answer.fill('')
  await expect(save).toBeEnabled()
  await save.click()
  await expect(page.getByRole('heading', { name: 'Новая задача', exact: true })).toBeVisible()
})

test('возврат к уже применённому ответу не требует повторной генерации', async ({ page }) => {
  await startQuestions(page)
  const originalNeed = 'Помочь продавцам находить нужные товары.'
  await page.getByLabel('Потребность или проблема', { exact: true }).fill(originalNeed)
  await page.getByRole('button', { name: 'Сформировать карточку', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Карточка вашей задачи' })).toBeVisible()
  await page.getByRole('button', { name: 'Уточнение', exact: false }).click()
  const answer = page.getByLabel('Потребность или проблема', { exact: true })
  const save = page.getByRole('button', { name: 'Сохранить черновик', exact: true })
  await answer.fill('Временное дополнение.')
  await expect(save).toBeDisabled()
  await answer.fill(originalNeed)
  await expect(save).toBeEnabled()
})

test('чужая задача не предлагает недоступные действия с командами', async ({ page }) => {
  const state = createSeed()
  const task = state.tasks.find((item) => item.id === 'task-tourism')!
  task.ownerId = 'another-business'
  const accepted = state.proposals.find((item) => item.taskId === task.id)!
  accepted.status = 'accepted'
  accepted.milestoneConfirmed = false
  await page.addInitScript((snapshot) => localStorage.setItem('sana-mvp-v1', JSON.stringify(snapshot)), state)
  await page.goto('/')
  await page.getByRole('button', { name: task.fields.title, exact: true }).click()
  await expect(page.getByRole('heading', { name: task.fields.title, exact: true, level: 1 })).toBeVisible()
  await expect(page.locator('.proposal-card-accepted')).toBeVisible()
  await expect(page.locator('.proposal-card-pending')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Редактировать', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Выбрать команду', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Отклонить', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Подтвердить этап', exact: true })).toHaveCount(0)
  await expect(page.locator('.detail-proposals-hint')).toHaveCount(0)
})

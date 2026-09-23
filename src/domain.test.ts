import { afterEach, describe, expect, it, vi } from 'vitest'
import { BUSINESS_ID, confirmMilestone, emptyFields, FIELD_KEYS, getRating, getTeamPoints, hasContent, normalizeVisibleText, safeHttpUrl, updateProposalStatus } from './domain'
import type { AppState, FieldKey, Task } from './domain'
import { createSeed } from './seed'
import { loadState, saveState, STORAGE_KEY } from './storage'

function scoredTask(keys: FieldKey[]): Task {
  const fields = emptyFields()
  keys.forEach((key) => { fields[key] = `Подтверждённые сведения: ${key}` })
  return { id: 'test-task', ownerId: BUSINESS_ID, company: 'Демо', fields, confirmedFields: keys, published: false, createdAt: '2026-09-23T08:00:00.000Z', updatedAt: '2026-09-23T08:00:00.000Z', source: '' }
}

function memoryStorage(initial?: string) {
  const values = new Map<string, string>()
  if (initial !== undefined) values.set(STORAGE_KEY, initial)
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
  }
  vi.stubGlobal('localStorage', storage)
  return storage
}

afterEach(() => vi.unstubAllGlobals())

describe('рейтинг подтверждённой задачи', () => {
  it('не считает невидимые форматные символы подтверждёнными фактами', () => {
    const task = scoredTask([...FIELD_KEYS])
    FIELD_KEYS.forEach((key) => { task.fields[key] = ' \u200B\u200C\u200D\u2060\uFEFF\uFE0F\u034F\u0000\n ' })
    expect(getRating(task).score).toBe(0)
    expect(hasContent(task.fields.need)).toBe(false)
    expect(hasContent(' \u200BПроблема\u2060 ')).toBe(true)
    expect(normalizeVisibleText(' \u200BПервая строка\nВторая строка\u2060 ')).toBe('Первая строка\nВторая строка')
  })

  it('не начисляет баллы за черновик, пробелы и неподтверждённые сведения', () => {
    const task = scoredTask([...FIELD_KEYS])
    task.confirmedFields = ['context', 'need', 'data']
    task.fields.context = ' \n\t '
    task.fields.need = ''
    expect(getRating(task).score).toBe(20)
    expect(getRating(task).criteria[0].missing).toEqual(['context', 'need'])
  })

  it('выдаёт ровно 100 за полную карточку и не зависит от публикации', () => {
    const task = scoredTask([...FIELD_KEYS])
    expect(getRating(task).score).toBe(100)
    expect(getRating(task).level).toBe('priority')
    expect(getRating({ ...task, published: true })).toEqual(getRating(task))
    expect(getRating(task).criteria.every((criterion) => criterion.missing.length === 0)).toBe(true)
  })

  it.each([
    [[], 0, 'clarify'],
    [['context', 'need', 'result'], 35, 'clarify'],
    [['context', 'need', 'data'], 40, 'working'],
    [['context', 'need', 'data', 'result', 'users'], 65, 'working'],
    [['context', 'need', 'data', 'result', 'success'], 70, 'ready'],
    [['context', 'need', 'data', 'result', 'success', 'users', 'contact'], 85, 'ready'],
    [['context', 'need', 'data', 'result', 'success', 'users', 'contact', 'interaction'], 90, 'priority'],
  ] as Array<[FieldKey[], number, string]>)('правильно определяет уровень для набора %j', (keys, score, level) => {
    expect(getRating(scoredTask(keys))).toMatchObject({ score, level })
  })

  it('пересчитывает баллы и объяснение после дополнения карточки', () => {
    const task = scoredTask(['context', 'need'])
    expect(getRating(task).score).toBe(20)
    task.fields.data = 'CSV, 200 синтетических записей'
    expect(getRating(task).score).toBe(20)
    task.confirmedFields.push('data')
    expect(getRating(task).score).toBe(40)
    expect(getRating(task).criteria.find((criterion) => criterion.key === 'data')?.missing).toEqual([])
  })
})

describe('предложения и подтверждение этапа', () => {
  it('позволяет принять несколько команд без автоматического отклонения остальных', () => {
    const original = createSeed()
    const first = 'proposal-guide-steppe'
    const second = 'proposal-guide-tamyr'
    const state = updateProposalStatus(updateProposalStatus(original, first, 'accepted'), second, 'accepted')
    expect(state.proposals.filter((proposal) => proposal.taskId === 'task-tourism' && proposal.status === 'accepted')).toHaveLength(2)
    expect(original.proposals.find((proposal) => proposal.id === first)?.status).toBe('pending')
  })

  it('не подтверждает этап непринятой команды, а принятый этап начисляет 50 баллов один раз', () => {
    const initial = createSeed()
    const id = 'proposal-guide-steppe'
    expect(confirmMilestone(initial, id)).toBe(initial)
    const accepted = updateProposalStatus(initial, id, 'accepted')
    const confirmed = confirmMilestone(accepted, id)
    expect(getTeamPoints(confirmed, 'team-steppe')).toBe(50)
    expect(confirmMilestone(confirmed, id)).toBe(confirmed)
    expect(getTeamPoints(confirmMilestone(confirmed, id), 'team-steppe')).toBe(50)
    expect(accepted.proposals.find((proposal) => proposal.id === id)?.milestoneConfirmed).toBe(false)
  })

  it('отклонение прекращает начисление баллов и очищает подтверждение', () => {
    const state = updateProposalStatus(createSeed(), 'proposal-retail-nomad', 'rejected')
    expect(getTeamPoints(state, 'team-nomad')).toBe(0)
    expect(state.proposals.find((proposal) => proposal.id === 'proposal-retail-nomad')?.milestoneConfirmed).toBe(false)
    expect(confirmMilestone(state, 'proposal-retail-nomad')).toBe(state)
  })

  it('не изменяет состояние для неизвестного предложения', () => {
    const state = createSeed()
    expect(updateProposalStatus(state, 'missing', 'accepted')).toBe(state)
    expect(confirmMilestone(state, 'missing')).toBe(state)
  })
})

describe('безопасные ссылки', () => {
  it.each(['https://example.com/prototype', 'http://localhost:5173/demo', ' HTTPS://example.com ', 'http://[::1]:5173/', 'https://example.com/hello%20world', 'https://пример.рф/проект'])('разрешает абсолютный HTTP(S) URL %s', (url) => {
    expect(safeHttpUrl(url)).toBe(true)
  })
  it.each(['', '   ', 'javascript:alert(1)', 'data:text/html,test', '//example.com', '/prototype', 'example.com', 'https:example.com', 'https:///example.com', 'file:///C:/test'])('отклоняет ссылку %s', (url) => {
    expect(safeHttpUrl(url)).toBe(false)
  })
  it.each(['https://example.com/a b', 'https://user:password@example.com', 'https://@example.com', 'https://example.com\\@other.example', 'https://exa\nmple.com', '\thttps://example.com', 'https://exa\u200Bmple.com', 'https://example.com/' + 'x'.repeat(2000)])('не разрешает замаскированные, некорректные или слишком длинные ссылки', (url) => {
    expect(safeHttpUrl(url)).toBe(false)
  })
})

describe('демонстрационные данные и хранение', () => {
  it('содержит разнообразные черновики, карточки, команды и отклики, включая задачу с низким рейтингом', () => {
    const state = createSeed()
    expect(state.tasks.filter((task) => !task.published).length).toBeGreaterThanOrEqual(5)
    expect(state.tasks.filter((task) => task.published).length).toBeGreaterThanOrEqual(5)
    expect(state.teams.length).toBeGreaterThanOrEqual(5)
    expect(state.proposals.length).toBeGreaterThanOrEqual(5)
    expect(new Set(state.tasks.filter((task) => task.published).map((task) => getRating(task).level))).toEqual(new Set(['clarify', 'working', 'ready', 'priority']))
    const lowTask = state.tasks.find((task) => task.published && getRating(task).score < 40)
    expect(state.proposals.some((proposal) => proposal.taskId === lowTask?.id)).toBe(true)
    state.tasks[0].fields.title = 'Изменено'
    expect(createSeed().tasks[0].fields.title).not.toBe('Изменено')
  })

  it('сохраняет изменения, выбранные команды и баллы после повторной загрузки', () => {
    memoryStorage()
    const { state } = loadState()
    state.tasks[0].fields.title = 'Обновлённая карточка'
    const changed = confirmMilestone(updateProposalStatus(state, 'proposal-guide-steppe', 'accepted'), 'proposal-guide-steppe')
    expect(saveState(changed)).toBeNull()
    const reloaded = loadState()
    expect(reloaded.warning).toBeNull()
    expect(reloaded.state).toEqual(changed)
    expect(getTeamPoints(reloaded.state, 'team-steppe')).toBe(50)
  })

  it.each(['{broken', 'null', JSON.stringify({ version: 2, tasks: [], teams: [], proposals: [] })])('восстанавливает демо с предупреждением при повреждении %s', (raw) => {
    memoryStorage(raw)
    expect(loadState().warning).toBeTruthy()
    expect(loadState().state.tasks.length).toBeGreaterThanOrEqual(10)
  })

  it.each([
    (state: AppState) => { state.teams = []; state.proposals = [] },
    (state: AppState) => { state.proposals[0].taskId = 'missing-task' },
    (state: AppState) => { state.proposals[0].teamId = 'missing-team' },
    (state: AppState) => { state.tasks[1].id = state.tasks[0].id },
    (state: AppState) => { state.proposals[0].milestoneConfirmed = true },
    (state: AppState) => { state.proposals[0].prototypeUrl = 'javascript:alert(1)' },
    (state: AppState) => { state.tasks[0].published = false },
    (state: AppState) => { state.tasks[0].confirmedFields.push('bogus' as FieldKey) },
  ])('не загружает состояние с повреждёнными связями, статусами или полями', (mutate) => {
    const state = createSeed()
    mutate(state)
    memoryStorage(JSON.stringify(state))
    expect(loadState().warning).toBeTruthy()
  })

  it.each(['unknown', ['accepted'], null])('проверяет тип и значение статуса %j', (status) => {
    const state = createSeed()
    const corrupted = JSON.parse(JSON.stringify(state)) as { proposals: Array<{ status: unknown }> }
    corrupted.proposals[0].status = status
    memoryStorage(JSON.stringify(corrupted))
    expect(loadState().warning).toBeTruthy()
  })

  it('обрабатывает отказ браузера и переполненное хранилище без исключения', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Denied') },
      setItem: () => { throw new Error('Quota exceeded') },
    })
    expect(loadState().warning).toBeTruthy()
    expect(saveState(createSeed())).toBeTruthy()
  })
})

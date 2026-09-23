import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyFields, getRating } from './domain'
import type { AppState } from './domain'
import { createSeed } from './seed'
import {
  getRecoveryBackup, loadState, MAX_BACKUP_BYTES, parseState, readStoredSnapshot,
  saveState, serializeState, STORAGE_CONFLICT_MESSAGE, STORAGE_KEY, STORAGE_RECOVERY_MESSAGE,
} from './storage'

function memoryStorage(initial: string | null = null) {
  const data = new Map<string, string>()
  if (initial !== null) data.set(STORAGE_KEY, initial)
  const storage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value) }),
  }
  vi.stubGlobal('localStorage', storage)
  return { data, storage }
}

afterEach(() => vi.unstubAllGlobals())

describe('импорт и экспорт резервных копий', () => {
  it('проверяет seed и сохраняет весь сценарий без потери данных', () => {
    const state = createSeed()
    const raw = serializeState(state)
    expect(parseState(raw)).toEqual(state)
    const storage = memoryStorage()
    expect(saveState(state, null)).toBeNull()
    expect(storage.data.get(STORAGE_KEY)).toBe(raw)
    expect(loadState()).toMatchObject({ state, rawSnapshot: raw, warning: null, recoveryAvailable: false })
    expect(readStoredSnapshot()).toBe(raw)
  })

  it('не вводит минимальный рейтинг для подтверждённой опубликованной задачи', () => {
    const state = createSeed()
    state.tasks[0].fields = { ...emptyFields(), title: 'Короткая карточка', topic: 'Другое' }
    state.tasks[0].confirmedFields = ['title', 'topic']
    const imported = parseState(serializeState(state))
    expect(imported.tasks[0].published).toBe(true)
    expect(getRating(imported.tasks[0]).score).toBe(0)
    expect(imported.proposals.filter((proposal) => proposal.taskId === state.tasks[0].id)).toHaveLength(2)
  })

  it.each([
    ['неподтверждённый заголовок', (state: AppState) => { state.tasks[0].confirmedFields = state.tasks[0].confirmedFields.filter((key) => key !== 'title') }],
    ['неподтверждённый факт', (state: AppState) => { state.tasks[0].confirmedFields = state.tasks[0].confirmedFields.filter((key) => key !== 'result') }],
    ['невидимое название', (state: AppState) => { state.tasks[0].fields.title = '\u200B\uFEFF' }],
    ['пустая тема', (state: AppState) => { state.tasks[0].fields.topic = '' }],
    ['пустое подтверждение', (state: AppState) => { state.tasks[5].confirmedFields = ['data'] }],
    ['нет команды', (state: AppState) => { state.teams = []; state.proposals = [] }],
    ['повторяющийся ID команды', (state: AppState) => { state.teams[1].id = state.teams[0].id }],
    ['невидимый ID', (state: AppState) => { state.tasks[0].id = 'task-\u200B' }],
    ['некорректный цвет', (state: AppState) => { state.teams[0].color = 'var(--danger)' }],
    ['несуществующий день', (state: AppState) => { state.tasks[0].updatedAt = '2026-02-30T08:00:00.000Z' }],
    ['неправильное время', (state: AppState) => { state.tasks[0].updatedAt = '2026-09-23T25:00:00.000Z' }],
    ['редактирование до создания', (state: AppState) => { state.tasks[0].updatedAt = '2026-09-01T08:00:00.000Z' }],
    ['нет идеи', (state: AppState) => { state.proposals[0].idea = '\u200B \u2060' }],
    ['нет прототипа', (state: AppState) => { state.proposals[0].prototypeUrl = '' }],
    ['логин в URL', (state: AppState) => { state.proposals[0].prototypeUrl = 'https://user:secret@example.com' }],
    ['поле превышает размер UI', (state: AppState) => { state.tasks[0].fields.title = 'x'.repeat(161) }],
  ] as Array<[string, (state: AppState) => void]>)('отклоняет импорт: %s', (_label, mutate) => {
    const state = createSeed()
    mutate(state)
    expect(() => parseState(JSON.stringify(state))).toThrow(/структура/)
    expect(() => serializeState(state)).toThrow(/структура/)
  })

  it('проверяет точную схему и не импортирует посторонние скрытые поля', () => {
    const state = { ...createSeed(), secret: 'do-not-copy' }
    expect(() => parseState(JSON.stringify(state))).toThrow(/структура/)
    expect(() => serializeState(state)).toThrow(/структура/)
  })

  it('принимает настоящую високосную дату и явный часовой пояс', () => {
    const state = createSeed()
    state.tasks[0].createdAt = '2024-02-29T08:00:00+05:00'
    state.tasks[0].updatedAt = '2024-02-29T03:00:00Z'
    expect(parseState(JSON.stringify(state)).tasks[0]).toEqual(state.tasks[0])
  })

  it('проверяет лимит 5 МБ в байтах UTF-8 до чтения JSON', () => {
    expect(() => parseState(' '.repeat(MAX_BACKUP_BYTES + 1))).toThrow(/5 МБ/)
    expect(() => parseState('я'.repeat(MAX_BACKUP_BYTES / 2 + 1))).toThrow(/5 МБ/)
  })

  it('не экспортирует и не записывает состояние, превышающее общий лимит', () => {
    const original = serializeState(createSeed())
    const { storage, data } = memoryStorage(original)
    const state = createSeed()
    const draft = state.tasks.find((task) => !task.published)!
    state.tasks.push(...Array.from({ length: 140 }, (_, index) => ({ ...draft, id: `large-${index}`, source: 'я'.repeat(20_000) })))
    expect(() => serializeState(state)).toThrow(/5 МБ/)
    expect(saveState(state, original)).toMatch(/5 МБ/)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(data.get(STORAGE_KEY)).toBe(original)
  })

  it('не принимает разреженные массивы из памяти и не меняет источник при невалидном состоянии', () => {
    const raw = serializeState(createSeed())
    const { storage } = memoryStorage(raw)
    const state = createSeed()
    state.tasks = Array(1)
    expect(saveState(state, raw)).toMatch(/структура/)
    expect(storage.setItem).not.toHaveBeenCalled()
  })
})

describe('конфликты вкладок', () => {
  it('не перезаписывает новые данные устаревшей вкладкой', () => {
    const initial = serializeState(createSeed())
    const { storage, data } = memoryStorage(initial)
    const first = loadState()
    const second = loadState()
    second.state.tasks[0].fields.title = 'Изменения другой вкладки'
    expect(saveState(second.state, second.rawSnapshot)).toBeNull()
    const latest = serializeState(second.state)
    first.state.tasks[0].fields.title = 'Устаревшая локальная правка'
    storage.setItem.mockClear()
    expect(saveState(first.state, first.rawSnapshot)).toBe(STORAGE_CONFLICT_MESSAGE)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(data.get(STORAGE_KEY)).toBe(latest)
  })

  it('считает создание и удаление источника в другой вкладке конфликтом', () => {
    const { data } = memoryStorage()
    const state = createSeed()
    const initial = loadState()
    data.set(STORAGE_KEY, serializeState(state))
    expect(saveState(state, initial.rawSnapshot)).toBe(STORAGE_CONFLICT_MESSAGE)
    const stored = data.get(STORAGE_KEY)!
    data.delete(STORAGE_KEY)
    expect(saveState(state, stored)).toBe(STORAGE_CONFLICT_MESSAGE)
    expect(data.has(STORAGE_KEY)).toBe(false)
  })

  it('позволяет сохранить после явной загрузки нового baseline, сохраняя legacy API', () => {
    memoryStorage(serializeState(createSeed()))
    const state = createSeed()
    state.tasks[0].fields.title = 'Изменено'
    expect(saveState(state)).toBeNull()
    const loaded = loadState()
    loaded.state.tasks[0].fields.title = 'Изменено снова'
    expect(saveState(loaded.state, loaded.rawSnapshot)).toBeNull()
    expect(readStoredSnapshot()).toBe(serializeState(loaded.state))
  })
})

describe('восстановление повреждённых данных', () => {
  it.each(['{broken json', '', '{"version":99}'])('архивирует исходный файл перед возможной записью демо', (raw) => {
    const { data, storage } = memoryStorage(raw)
    const loaded = loadState()
    expect(loaded.warning).toBeTruthy()
    expect(loaded.rawSnapshot).toBe(raw)
    expect(loaded.recoveryAvailable).toBe(true)
    expect(getRecoveryBackup()).toBe(raw)
    expect(data.get(STORAGE_KEY)).toBe(raw)
    expect(storage.setItem).toHaveBeenCalledWith(`${STORAGE_KEY}-recovery`, raw)
    expect(storage.setItem).not.toHaveBeenCalledWith(STORAGE_KEY, expect.anything())
    expect(saveState(loaded.state, loaded.rawSnapshot)).toBeNull()
    expect(readStoredSnapshot()).toBe(serializeState(loaded.state))
    expect(getRecoveryBackup()).toBe(raw)
  })

  it('не трогает источник, если архив нельзя сохранить, даже при legacy saveState', () => {
    const raw = '{unreadable source'
    const { storage, data } = memoryStorage(raw)
    storage.setItem.mockImplementation((key, value) => {
      if (key === `${STORAGE_KEY}-recovery`) throw new Error('Quota exceeded')
      data.set(key, value)
    })
    const loaded = loadState()
    expect(loaded.rawSnapshot).toBe(raw)
    expect(loaded.recoveryAvailable).toBe(false)
    expect(loaded.warning).toContain(STORAGE_RECOVERY_MESSAGE)
    expect(saveState(loaded.state, raw)).toBe(STORAGE_RECOVERY_MESSAGE)
    expect(saveState(loaded.state)).toBe(STORAGE_RECOVERY_MESSAGE)
    expect(data.get(STORAGE_KEY)).toBe(raw)
    expect(storage.setItem).not.toHaveBeenCalledWith(STORAGE_KEY, expect.anything())
  })

  it('не переписывает текущие данные, если они изменились во время создания архива', () => {
    const original = '{broken'
    const { data, storage } = memoryStorage(original)
    const newer = createSeed()
    newer.tasks[0].fields.title = 'Вкладка успела восстановить данные'
    const latestRaw = serializeState(newer)
    storage.setItem.mockImplementation((key, value) => {
      data.set(key, value)
      if (key === `${STORAGE_KEY}-recovery`) data.set(STORAGE_KEY, latestRaw)
    })
    expect(saveState(createSeed(), original)).toBe(STORAGE_CONFLICT_MESSAGE)
    expect(data.get(STORAGE_KEY)).toBe(latestRaw)
    expect(getRecoveryBackup()).toBe(original)
  })

  it('при отказе записи сохраняет предыдущий источник и сообщает о риске потери памяти', () => {
    const raw = serializeState(createSeed())
    const { data, storage } = memoryStorage(raw)
    storage.setItem.mockImplementation(() => { throw new Error('Quota exceeded') })
    const changed = createSeed()
    changed.tasks[0].fields.title = 'Правка, оставшаяся в памяти'
    expect(saveState(changed, raw)).toMatch(/Скачайте резервную копию/)
    expect(data.get(STORAGE_KEY)).toBe(raw)
  })

  it('явно сообщает недоступность storage, сохраняя работоспособность демо', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Denied') }, setItem: () => { throw new Error('Denied') } })
    expect(() => readStoredSnapshot()).toThrow(/недоступно/)
    expect(loadState()).toMatchObject({ rawSnapshot: null, recoveryAvailable: false })
    expect(loadState().state.teams.length).toBeGreaterThan(0)
    expect(getRecoveryBackup()).toBeNull()
    expect(saveState(createSeed(), null)).toBeTruthy()
  })
})

import { FIELD_KEYS, hasContent, safeHttpUrl } from './domain'
import type { AppState, FieldKey, Proposal, Task, TaskFields, Team } from './domain'
import { createSeed } from './seed'

// Keep the original key so existing installations retain their data.
export const STORAGE_KEY = 'sana-mvp-v1'
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024
export const STORAGE_CONFLICT_MESSAGE = 'Данные изменились в другой вкладке. Ваши изменения не записаны. Скачайте свою копию и загрузите актуальные данные перед продолжением.'
export const STORAGE_RECOVERY_MESSAGE = 'Не удалось создать резервную копию повреждённых данных. Исходные данные не перезаписаны. Скачайте исходный файл перед восстановлением.'

const RECOVERY_KEY = `${STORAGE_KEY}-recovery`
const UNAVAILABLE = 'Локальное хранилище недоступно. Изменения будут доступны только до перезагрузки страницы.'
const INVALID = 'Сохранённые данные повреждены или имеют несовместимую версию. Загружены демонстрационные данные.'
const SAVE_FAILED = 'Не удалось сохранить изменения на устройстве. Возможно, хранилище заполнено или отключено. Скачайте резервную копию, чтобы не потерять текущую работу.'
const SCHEMA_ERROR = 'Неверная структура резервной копии: проверьте поля, подтверждения, даты, ссылки и связи задач, команд и предложений.'

export interface LoadedState {
  state: AppState
  warning: string | null
  /** Exact source for optimistic concurrency and downloading an unreadable original. */
  rawSnapshot: string | null
  recoveryAvailable: boolean
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

function string(value: unknown, max = 20_000): value is string {
  return typeof value === 'string' && value.length <= max
}

function content(value: unknown, max = 20_000): value is string {
  return string(value, max) && hasContent(value)
}

function id(value: unknown): value is string {
  return content(value, 200) && !/[\s\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u.test(value)
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 100 && Array.from(value).every((item) => content(item, 200))
}

function date(value: unknown): value is string {
  if (!string(value, 40)) return false
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!parts) return false
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = parts
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) return false
  if (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59)) return false
  return Number.isFinite(Date.parse(value))
}

function uniqueIds(items: Array<{ id: string }>): boolean {
  return new Set(items.map((item) => item.id)).size === items.length
}

function readTask(value: unknown): Task | null {
  if (!record(value) || !exactKeys(value, ['id', 'ownerId', 'company', 'fields', 'confirmedFields', 'published', 'createdAt', 'updatedAt', 'source'])
    || !id(value.id) || !id(value.ownerId) || !content(value.company, 200)
    || !record(value.fields) || !exactKeys(value.fields, FIELD_KEYS) || !strings(value.confirmedFields) || typeof value.published !== 'boolean'
    || !date(value.createdAt) || !date(value.updatedAt) || Date.parse(value.updatedAt) < Date.parse(value.createdAt) || !string(value.source)) return null
  const rawFields = value.fields
  if (!FIELD_KEYS.every((key) => string(rawFields[key], key === 'title' || key === 'topic' ? 160 : 20_000))) return null
  if (!value.confirmedFields.every((key) => FIELD_KEYS.includes(key as FieldKey))
    || new Set(value.confirmedFields).size !== value.confirmedFields.length) return null
  const fields = Object.fromEntries(FIELD_KEYS.map((key) => [key, rawFields[key]])) as TaskFields
  const confirmedFields = value.confirmedFields as FieldKey[]
  if (confirmedFields.some((key) => !hasContent(fields[key]))) return null
  if (value.published && (!hasContent(fields.title) || !hasContent(fields.topic)
    || FIELD_KEYS.some((key) => hasContent(fields[key]) && !confirmedFields.includes(key)))) return null
  return {
    id: value.id, ownerId: value.ownerId, company: value.company, fields,
    confirmedFields: [...confirmedFields], published: value.published,
    createdAt: value.createdAt, updatedAt: value.updatedAt, source: value.source,
  }
}

function readTeam(value: unknown): Team | null {
  if (!record(value) || !exactKeys(value, ['id', 'name', 'description', 'initials', 'color', 'interests', 'skills', 'technologies'])
    || !id(value.id) || !content(value.name, 200) || !string(value.description, 2000)
    || !content(value.initials, 8) || !string(value.color, 7) || !/^#[0-9a-f]{6}$/i.test(value.color)
    || !strings(value.interests) || !strings(value.skills) || !strings(value.technologies)) return null
  return {
    id: value.id, name: value.name, description: value.description, initials: value.initials,
    color: value.color, interests: [...value.interests], skills: [...value.skills], technologies: [...value.technologies],
  }
}

function readProposal(value: unknown): Proposal | null {
  if (!record(value) || !exactKeys(value, ['id', 'taskId', 'teamId', 'idea', 'plan', 'timeline', 'prototypeUrl', 'createdAt', 'status', 'milestoneConfirmed'])
    || !id(value.id) || !id(value.taskId) || !id(value.teamId)
    || !content(value.idea, 6000) || !content(value.plan, 8000) || !content(value.timeline, 200)
    || !string(value.prototypeUrl, 2000) || !safeHttpUrl(value.prototypeUrl)
    || !date(value.createdAt) || typeof value.status !== 'string' || !['pending', 'accepted', 'rejected'].includes(value.status)
    || typeof value.milestoneConfirmed !== 'boolean'
    || (value.milestoneConfirmed && value.status !== 'accepted')) return null
  return {
    id: value.id, taskId: value.taskId, teamId: value.teamId,
    idea: value.idea, plan: value.plan, timeline: value.timeline, prototypeUrl: value.prototypeUrl,
    createdAt: value.createdAt, status: value.status as Proposal['status'], milestoneConfirmed: value.milestoneConfirmed,
  }
}

function readState(value: unknown): AppState | null {
  if (!record(value) || !exactKeys(value, ['version', 'tasks', 'teams', 'proposals']) || value.version !== 1 || !Array.isArray(value.tasks)
    || !Array.isArray(value.teams) || !Array.isArray(value.proposals)
    || value.tasks.length > 10_000 || value.teams.length === 0 || value.teams.length > 10_000 || value.proposals.length > 50_000) return null
  const tasks = Array.from(value.tasks, readTask)
  const teams = Array.from(value.teams, readTeam)
  const proposals = Array.from(value.proposals, readProposal)
  if (tasks.some((item) => item === null) || teams.some((item) => item === null) || proposals.some((item) => item === null)) return null
  const validTasks = tasks as Task[]
  const validTeams = teams as Team[]
  const validProposals = proposals as Proposal[]
  if (!uniqueIds(validTasks) || !uniqueIds(validTeams) || !uniqueIds(validProposals)) return null
  const publishedTaskIds = new Set(validTasks.filter((item) => item.published).map((item) => item.id))
  const teamIds = new Set(validTeams.map((item) => item.id))
  if (validProposals.some((item) => !publishedTaskIds.has(item.taskId) || !teamIds.has(item.teamId))) return null
  return { version: 1, tasks: validTasks, teams: validTeams, proposals: validProposals }
}

function checkSize(raw: string): void {
  if (raw.length > MAX_BACKUP_BYTES || new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES) {
    throw new Error('Размер резервной копии превышает 5 МБ. Выберите файл меньшего размера.')
  }
}

/** The same validation is applied to imports, saved data and outgoing backups. */
export function parseState(raw: string): AppState {
  checkSize(raw)
  let value: unknown
  try {
    value = JSON.parse(raw) as unknown
  } catch {
    throw new Error('Не удалось прочитать JSON. Выберите резервную копию, экспортированную из приложения.')
  }
  if (record(value) && value.version !== 1) throw new Error('Версия резервной копии не поддерживается. Нужен файл версии 1.')
  const state = readState(value)
  if (!state) throw new Error(SCHEMA_ERROR)
  return state
}

export function serializeState(state: AppState): string {
  const validated = readState(state)
  if (!validated) throw new Error(SCHEMA_ERROR)
  const raw = JSON.stringify(validated)
  checkSize(raw)
  return raw
}

export function readStoredSnapshot(): string | null {
  try {
    return globalThis.localStorage.getItem(STORAGE_KEY)
  } catch {
    throw new Error(UNAVAILABLE)
  }
}

export function getRecoveryBackup(): string | null {
  try {
    return globalThis.localStorage.getItem(RECOVERY_KEY)
  } catch {
    return null
  }
}

function archiveUnreadable(raw: string): boolean {
  try {
    if (globalThis.localStorage.getItem(RECOVERY_KEY) !== raw) globalThis.localStorage.setItem(RECOVERY_KEY, raw)
    return globalThis.localStorage.getItem(RECOVERY_KEY) === raw
  } catch {
    return false
  }
}

export function loadState(): LoadedState {
  let raw: string | null
  try {
    raw = readStoredSnapshot()
  } catch {
    return { state: createSeed(), warning: UNAVAILABLE, rawSnapshot: null, recoveryAvailable: getRecoveryBackup() !== null }
  }
  if (raw === null) return { state: createSeed(), warning: null, rawSnapshot: null, recoveryAvailable: getRecoveryBackup() !== null }
  try {
    return { state: parseState(raw), warning: null, rawSnapshot: raw, recoveryAvailable: getRecoveryBackup() !== null }
  } catch {
    const archived = archiveUnreadable(raw)
    return {
      state: createSeed(),
      warning: `${INVALID} ${archived ? 'Исходный файл сохранён отдельно и доступен для скачивания.' : STORAGE_RECOVERY_MESSAGE}`,
      rawSnapshot: raw,
      recoveryAvailable: getRecoveryBackup() !== null,
    }
  }
}

/** With a baseline, refuse to overwrite changes from another tab. All failures retain the source. */
export function saveState(state: AppState, expectedRaw?: string | null): string | null {
  let serialized: string
  try {
    serialized = serializeState(state)
  } catch (error) {
    return error instanceof Error ? error.message : SCHEMA_ERROR
  }
  const compare = arguments.length >= 2
  try {
    const current = readStoredSnapshot()
    if (compare && current !== expectedRaw) return STORAGE_CONFLICT_MESSAGE
    if (current === serialized) return null
    if (current !== null) {
      try {
        parseState(current)
      } catch {
        if (!archiveUnreadable(current)) return STORAGE_RECOVERY_MESSAGE
      }
    }
    // Archiving can touch storage; check again before replacing the source.
    if (readStoredSnapshot() !== current) return STORAGE_CONFLICT_MESSAGE
    globalThis.localStorage.setItem(STORAGE_KEY, serialized)
    return null
  } catch {
    return SAVE_FAILED
  }
}

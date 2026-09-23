export type Role = 'business' | 'student'

export type FieldKey =
  | 'title'
  | 'topic'
  | 'context'
  | 'need'
  | 'users'
  | 'data'
  | 'constraints'
  | 'result'
  | 'success'
  | 'contact'
  | 'interaction'

export type TaskFields = Record<FieldKey, string>

export interface Task {
  id: string
  ownerId: string
  company: string
  fields: TaskFields
  confirmedFields: FieldKey[]
  published: boolean
  createdAt: string
  updatedAt: string
  source: string
}

export interface Team {
  id: string
  name: string
  description: string
  initials: string
  color: string
  interests: string[]
  skills: string[]
  technologies: string[]
}

export type ProposalStatus = 'pending' | 'accepted' | 'rejected'

export interface Proposal {
  id: string
  taskId: string
  teamId: string
  idea: string
  plan: string
  timeline: string
  prototypeUrl: string
  createdAt: string
  status: ProposalStatus
  milestoneConfirmed: boolean
}

export interface AppState {
  version: 1
  tasks: Task[]
  teams: Team[]
  proposals: Proposal[]
}

export type RatingLevel = 'clarify' | 'working' | 'ready' | 'priority'

export interface RatingCriterion {
  key: string
  label: string
  earned: number
  max: number
  missing: FieldKey[]
}

export interface Rating {
  score: number
  level: RatingLevel
  label: string
  criteria: RatingCriterion[]
}

export const BUSINESS_ID = 'demo-business'

export const FIELD_KEYS: FieldKey[] = [
  'title', 'topic', 'context', 'need', 'users', 'data',
  'constraints', 'result', 'success', 'contact', 'interaction',
]

export const FIELD_LABELS: Record<FieldKey, string> = {
  title: 'Название задачи',
  topic: 'Тема или отрасль',
  context: 'Контекст',
  need: 'Потребность или проблема',
  users: 'Целевые пользователи',
  data: 'Данные и материалы',
  constraints: 'Ограничения',
  result: 'Ожидаемый результат',
  success: 'Критерии успеха',
  contact: 'Контакт',
  interaction: 'Взаимодействие и обратная связь',
}

export function emptyFields(): TaskFields {
  return Object.fromEntries(FIELD_KEYS.map((key) => [key, ''])) as TaskFields
}

/** Ignore invisible formatting without removing ordinary line breaks from meaningful text. */
export function normalizeVisibleText(value: string): string {
  return value
    .replace(/[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu, '')
    .replace(/[\u0000-\u0008\u000E-\u001F\u007F-\u009F]/g, '')
    .trim()
}

export function hasContent(value: string): boolean {
  return normalizeVisibleText(value).length > 0
}

const CRITERIA: Array<{
  key: string
  label: string
  fields: Array<{ key: FieldKey; points: number }>
}> = [
  { key: 'context', label: 'Контекст и потребность', fields: [{ key: 'context', points: 10 }, { key: 'need', points: 10 }] },
  { key: 'data', label: 'Данные и материалы', fields: [{ key: 'data', points: 20 }] },
  { key: 'result', label: 'Ожидаемый результат', fields: [{ key: 'result', points: 15 }] },
  { key: 'success', label: 'Критерии успеха', fields: [{ key: 'success', points: 15 }] },
  { key: 'constraints', label: 'Ограничения', fields: [{ key: 'constraints', points: 10 }] },
  { key: 'users', label: 'Целевые пользователи', fields: [{ key: 'users', points: 10 }] },
  { key: 'contact', label: 'Связь с бизнесом', fields: [{ key: 'contact', points: 5 }, { key: 'interaction', points: 5 }] },
]

/** Presence is scored only after the business confirms it; AI text alone earns no points. */
export function getRating(task: Pick<Task, 'fields' | 'confirmedFields'> & Partial<Task>): Rating {
  const confirmed = new Set(task.confirmedFields)
  const criteria = CRITERIA.map(({ key, label, fields }): RatingCriterion => {
    const missing = fields
      .filter((field) => !confirmed.has(field.key) || !hasContent(task.fields[field.key]))
      .map((field) => field.key)
    return {
      key,
      label,
      max: fields.reduce((sum, field) => sum + field.points, 0),
      earned: fields.reduce((sum, field) => sum + (missing.includes(field.key) ? 0 : field.points), 0),
      missing,
    }
  })
  const score = criteria.reduce((sum, criterion) => sum + criterion.earned, 0)
  const level: RatingLevel = score >= 90 ? 'priority' : score >= 70 ? 'ready' : score >= 40 ? 'working' : 'clarify'
  const labels: Record<RatingLevel, string> = {
    clarify: 'Черновик',
    working: 'Рабочая',
    ready: 'Готовая',
    priority: 'Приоритетная',
  }
  return { score, level, label: labels[level], criteria }
}

export function getTeamPoints(state: AppState, teamId: string): number {
  return state.proposals.reduce(
    (sum, proposal) => sum + (proposal.teamId === teamId && proposal.status === 'accepted' && proposal.milestoneConfirmed ? 50 : 0),
    0,
  )
}

export function updateProposalStatus(state: AppState, id: string, status: ProposalStatus): AppState {
  if (!['pending', 'accepted', 'rejected'].includes(status)) return state
  const proposal = state.proposals.find((item) => item.id === id)
  if (!proposal || proposal.status === status) return state
  return {
    ...state,
    proposals: state.proposals.map((item) => item.id === id
      ? { ...item, status, milestoneConfirmed: status === 'accepted' && item.milestoneConfirmed }
      : item),
  }
}

export function confirmMilestone(state: AppState, id: string): AppState {
  const proposal = state.proposals.find((item) => item.id === id)
  if (!proposal || proposal.status !== 'accepted' || proposal.milestoneConfirmed) return state
  return {
    ...state,
    proposals: state.proposals.map((item) => item.id === id ? { ...item, milestoneConfirmed: true } : item),
  }
}

export function safeHttpUrl(value: string): boolean {
  // URL() silently normalizes control characters, backslashes and credentials.
  // Reject these before parsing so the link shown to the user is the link opened.
  if (value.length > 2000 || /[\p{Cc}\p{Cf}\\]/u.test(value)) return false
  const candidate = value.trim()
  if (!/^https?:\/\/[^/\s]/i.test(candidate) || /\s/u.test(candidate)) return false
  try {
    const url = new URL(candidate)
    const authority = candidate.slice(candidate.indexOf('://') + 3).split(/[/?#]/, 1)[0]
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname)
      && !url.username && !url.password && !authority.includes('@')
  } catch {
    return false
  }
}

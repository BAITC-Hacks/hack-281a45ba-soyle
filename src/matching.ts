import { normalizeVisibleText, type FieldKey, type Task, type Team } from './domain'

export interface SkillMention {
  label: string
  evidence: string
  field: FieldKey
}

export interface TaskMatch {
  interest: string | null
  mentions: SkillMention[]
  hasMatch: boolean
}

// Only explicit terminology and a few spelling/inflection variants are matched.
// In particular, a web prototype does not imply React or any other required stack.
const aliases: Record<string, string[]> = {
  'ai / ml': ['AI', 'ML', 'ИИ', 'искусственный интеллект', 'машинное обучение'],
  'карты': ['карта', 'карты', 'карту', 'картой'],
  'прототипирование': ['прототипирование', 'прототип', 'прототипа', 'прототипом', 'прототипу'],
  'аналитика': ['аналитика', 'аналитики', 'аналитику', 'аналитикой'],
  'визуализация': ['визуализация', 'визуализации', 'визуализацию'],
  'алгоритмы': ['алгоритм', 'алгоритмы', 'алгоритма', 'алгоритмом'],
}

const searchableFields: FieldKey[] = ['title', 'topic', 'need', 'result', 'context', 'data', 'users', 'success']
const normalize = (value: string) => normalizeVisibleText(value).normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function findMention(task: Task, label: string): SkillMention | undefined {
  const key = normalize(label)
  const terms = [...new Set([key, ...(aliases[key] ?? []).map(normalize)])].filter(Boolean)
  if (!terms.length) return undefined
  // Technology punctuation is significant: C, C++ and C# are distinct skills.
  const expression = new RegExp(`(?<![\\p{L}\\p{N}_+#])(?:${terms.sort((a, b) => b.length - a.length).map(escapeRegex).join('|')})(?![\\p{L}\\p{N}_+#])`, 'iu')
  for (const field of searchableFields) {
    const text = normalizeVisibleText(task.fields[field]).normalize('NFKC').replace(/ё/g, 'е').replace(/Ё/g, 'Е').replace(/\s+/g, ' ').trim()
    const match = text.match(expression)
    if (match) return { label: label.trim(), evidence: match[0], field }
  }
  return undefined
}

/** A transparent text comparison, not a prediction of the team's ability to deliver. */
export function getTaskMatch(task: Task, team: Team): TaskMatch {
  const topic = normalize(task.fields.topic)
  const interest = topic ? team.interests.find(value => normalize(value) === topic)?.trim() ?? null : null
  const seen = new Set<string>()
  const mentions: SkillMention[] = []
  for (const label of [...team.skills, ...team.technologies]) {
    const key = normalize(label)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const mention = findMention(task, label)
    if (mention) mentions.push(mention)
  }
  return { interest, mentions, hasMatch: Boolean(interest || mentions.length) }
}

/** An exact topic match comes first, then the number of distinct mentioned skills. */
export function compareTaskMatches(a: TaskMatch, b: TaskMatch): number {
  return Number(Boolean(b.interest)) - Number(Boolean(a.interest)) || b.mentions.length - a.mentions.length
}

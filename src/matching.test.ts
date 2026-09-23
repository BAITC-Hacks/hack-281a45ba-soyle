import { describe, expect, it } from 'vitest'
import { emptyFields, type Task, type Team } from './domain'
import { compareTaskMatches, getTaskMatch } from './matching'
import { createSeed } from './seed'

const task = (fields: Partial<Task['fields']>): Task => ({
  id: 'task', ownerId: 'business', company: 'Компания', fields: { ...emptyFields(), ...fields },
  confirmedFields: [], published: true, source: '', createdAt: '', updatedAt: '',
})
const team = (profile: Partial<Team>): Team => ({
  id: 'team', name: 'Команда', description: '', initials: 'К', color: '',
  interests: [], skills: [], technologies: [], ...profile,
})

describe('объяснимый подбор задач', () => {
  it('находит направление и подтверждает навык фрагментом реальной задачи', () => {
    const seed = createSeed()
    const result = getTaskMatch(seed.tasks[0], seed.teams[0])
    expect(result.interest).toBe('Туризм и культура')
    expect(result.mentions).toEqual([{ label: 'AI / ML', evidence: 'AI', field: 'title' }])
    expect(result.hasMatch).toBe(true)
  })

  it('нормализует регистр, пробелы и ё, но не выдаёт частичное направление за совпадение', () => {
    const profile = team({ interests: ['  Зелёная   энергетика  '] })
    expect(getTaskMatch(task({ topic: 'ЗЕЛЕНАЯ энергетика' }), profile).interest).toBe('Зелёная   энергетика')
    expect(getTaskMatch(task({ topic: 'Зелёная энергетика и транспорт' }), profile).hasMatch).toBe(false)
  })

  it('не находит короткие названия внутри чужих слов', () => {
    const profile = team({ technologies: ['AI', 'SQL', 'R', 'Java'] })
    expect(getTaskMatch(task({ result: 'Retail: NoSQL, Ruby и JavaScript' }), profile).mentions).toEqual([])
    expect(getTaskMatch(task({ result: 'SQL, R и Java; AI-гид' }), profile).mentions.map(item => item.label)).toEqual(['AI', 'SQL', 'R', 'Java'])
  })

  it('различает технологии со значимой пунктуацией и экранирует регулярные выражения', () => {
    const profile = team({ technologies: ['C', 'C++', 'C#', 'Node.js', 'a[b'] })
    const result = getTaskMatch(task({ result: 'C++, C# и Node.js; a[b' }), profile)
    expect(result.mentions.map(item => item.label)).toEqual(['C++', 'C#', 'Node.js', 'a[b'])
  })

  it('считает повторяющийся навык только один раз, независимо от регистра', () => {
    const result = getTaskMatch(task({ title: 'Python + Python', result: 'PYTHON' }), team({ skills: ['Python'], technologies: ['python', ' PYTHON '] }))
    expect(result.mentions).toEqual([{ label: 'Python', evidence: 'Python', field: 'title' }])
  })

  it('не выводит стек из вида продукта и не учитывает контакты и исходный черновик', () => {
    const input = { ...task({ result: 'Веб-прототип с дашбордом', contact: 'react@example.com', constraints: 'Python не нужен' }), source: 'React', company: 'React' }
    expect(getTaskMatch(input, team({ technologies: ['React', 'Python', 'Pandas'] })).hasMatch).toBe(false)
  })

  it('обрабатывает пустые и невидимые значения без случайных совпадений', () => {
    const result = getTaskMatch(task({ title: 'Любая задача' }), team({ interests: ['', ' '], skills: [' ', '\u200B'], technologies: [] }))
    expect(result).toEqual({ interest: null, mentions: [], hasMatch: false })
  })

  it('при смене команды меняет наиболее подходящую задачу и не меняет исходные объекты', () => {
    const seed = createSeed()
    const snapshot = JSON.stringify(seed)
    for (const [teamId, taskId] of [['team-qadam', 'task-access'], ['team-nomad', 'task-retail']]) {
      const profile = seed.teams.find(item => item.id === teamId)!
      const ranked = seed.tasks.filter(item => item.published).sort((a, b) => compareTaskMatches(getTaskMatch(a, profile), getTaskMatch(b, profile)))
      expect(ranked[0].id).toBe(taskId)
    }
    expect(JSON.stringify(seed)).toBe(snapshot)
  })

  it('ранжирует сначала направление, затем число навыков и оставляет ничью вызывающему коду', () => {
    const profile = team({ interests: ['Образование'], technologies: ['Python', 'SQL'] })
    const direction = getTaskMatch(task({ topic: 'Образование' }), profile)
    const twoSkills = getTaskMatch(task({ result: 'Python и SQL' }), profile)
    const oneSkill = getTaskMatch(task({ result: 'Python' }), profile)
    expect(compareTaskMatches(direction, twoSkills)).toBeLessThan(0)
    expect(compareTaskMatches(twoSkills, oneSkill)).toBeLessThan(0)
    expect(compareTaskMatches(oneSkill, oneSkill)).toBe(0)
  })
})

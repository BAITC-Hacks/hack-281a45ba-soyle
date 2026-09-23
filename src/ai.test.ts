import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AI_REQUEST_TIMEOUT_MS, AI_SCHEMAS, CARD_KEYS, analyzeTask, cardToFields, createMockResponse,
  generateTaskCard, getAnswerExample, validateAIRequest, validateAnalysis, validateCardResult,
  type AIRequest, type Answer, type Card,
} from './ai'
import { FIELD_KEYS, emptyFields, type TaskFields } from './domain'

function request(stage: AIRequest['stage'] = 'questions', description = 'У нас небольшой магазин.'): AIRequest {
  return { stage, description, fields: emptyFields(), answers: [] }
}

function answer(field: Answer['field'], text: string, id = 'q1'): Answer {
  return { id, field, question: 'Какие сведения вы можете добавить?', answer: text }
}

function questions(input = request()) {
  return validateAnalysis(createMockResponse(input))
}

function card(input = request('card')) {
  return validateCardResult(createMockResponse(input))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('два этапа серверного mock', () => {
  it('берёт явное название из ответа вместо предварительного заголовка', () => {
    const input = request('card', 'Описание '.repeat(30))
    input.answers = [answer('title', 'Панель обращений')]
    expect(card(input).card.title).toBe('Панель обращений')
    expect(card(request('card', 'я'.repeat(200))).card.title).toHaveLength(160)
  })

  it('объясняет переполнение объединённого поля, не обрезая введённые сведения', () => {
    const input = request('card')
    input.fields.data = 'а'.repeat(20_000)
    input.answers = [answer('data', 'Дополнительные сведения')]
    expect(() => card(input)).toThrow('Данные и материалы» после объединения превышает 20000')
    expect(input.fields.data).toHaveLength(20_000)
    expect(input.answers[0].answer).toBe('Дополнительные сведения')
  })

  it('задает минимум три вопроса о пропусках и не повторяет явно указанный результат', () => {
    const input = request('questions', 'Нам нужен сайт для магазина.')
    const result = questions(input)
    expect(result.mode).toBe('mock')
    expect(result.questions.length).toBeGreaterThanOrEqual(3)
    expect(new Set(result.questions.map((question) => question.id)).size).toBe(result.questions.length)
    expect(result.questions.every((question) => question.question.includes(input.description))).toBe(true)
    expect(result.questions.some((question) => question.field === 'expected_result')).toBe(false)
    expect(result.missing_information).not.toContain('expected_result')
    expect(result).not.toHaveProperty('card')
    expect(result).not.toHaveProperty('score')
    expect(input.fields).toEqual(emptyFields())
  })

  it('находит сведения в свободных предложениях и маркированных полях до выбора вопросов', () => {
    const input = request('questions', 'У нас небольшой магазин.\nПользователи: менеджеры магазина\nДанные: обезличенный CSV с товарами\nНужен сайт каталога.')
    const result = questions(input)
    expect(result.questions.some((question) => question.field === 'users' || question.field === 'data')).toBe(false)
    expect(result.missing_information).not.toContain('context')
    expect(card({ ...input, stage: 'card' }).card).toMatchObject({ users: 'менеджеры магазина', data: 'обезличенный CSV с товарами', expected_result: 'Нужен сайт каталога.' })
  })

  it('нейтральный ручной процесс не выдается за придуманную проблему', () => {
    const input = request('questions', 'У нас небольшой магазин. Остатки учитываем вручную.')
    expect(questions(input).questions.some((question) => question.field === 'need')).toBe(true)
    expect(card({ ...input, stage: 'card' }).card).toMatchObject({ context: input.description, need: null })
  })

  it('для заполненной карточки уточняет новые детали, а не просит повторить известное', () => {
    const input = request()
    input.fields = Object.fromEntries(FIELD_KEYS.map((key) => [key, 'Сведения уже предоставлены бизнесом'])) as TaskFields
    const result = questions(input)
    expect(result.questions).toHaveLength(3)
    expect(result.missing_information).toEqual([])
    expect(result.questions.every((question) => !/подтвердите|повторите/iu.test(question.question))).toBe(true)
    expect(result.questions.some((question) => /доступ|срок|сценари/iu.test(question.question))).toBe(true)
  })

  it('формирует карточку из описания и буквальных ответов, оставляя остальные поля неизвестными', () => {
    const input = request('card')
    input.answers = [answer('need', 'Не успеваем обновлять остатки.'), answer('users', 'Менеджеры магазина.', 'q2'), answer('data', '', 'q3')]
    const result = card(input)
    expect(result.card).toMatchObject({ context: input.description, need: input.answers[0].answer, users: input.answers[1].answer, data: null, contact: null, constraints: null })
    expect(result.missing_information).toEqual(CARD_KEYS.filter((key) => result.card[key] === null))
    const sources = [input.description, ...Object.values(input.fields), ...input.answers.map((item) => item.answer)]
    for (const value of Object.values(result.card)) {
      if (value !== null) for (const line of value.split('\n')) expect(sources.some((source) => source.includes(line))).toBe(true)
    }
  })

  it('сохраняет ручные поля и добавляет новый ответ отдельной строкой без подмены', () => {
    const input = request('card', 'Нужен сайт каталога магазина.')
    input.fields.result = 'Согласованный вручную интерактивный макет.'
    input.answers = [answer('expected_result', 'Передать ссылку на репозиторий.')]
    expect(card(input).card.expected_result).toBe('Согласованный вручную интерактивный макет.\nПередать ссылку на репозиторий.')
    expect(input.fields.result).toBe('Согласованный вручную интерактивный макет.')
  })

  it.each(['не знаю', 'пока неизвестно', 'уточним позже', '\u200b\u2060'])('сохраняет неизвестное поле null при ответе «%s»', (value) => {
    const input = request('card')
    input.answers = [answer('data', value)]
    expect(card(input).card.data).toBeNull()
    expect(card(input).missing_information).toContain('data')
  })

  it('сохраняет явно сообщенное отсутствие данных как факт бизнеса', () => {
    const input = request('card')
    input.answers = [answer('data', 'Данных нет; подготовим синтетические примеры.')]
    expect(card(input).card.data).toBe(input.answers[0].answer)
  })

  it('не переносит примеры и текст вопроса в факты карточки', () => {
    const input = request('card')
    input.answers = [{ ...answer('data', ''), question: 'Пример: бюджет 999999, контакт invented@example.com, срок три дня.' }]
    const result = card(input)
    expect(result.card.data).toBeNull()
    expect(JSON.stringify(result.card)).not.toMatch(/999999|invented|три дня/)
  })

  it('адаптирует канонические поля к существующей модели без выдумывания темы', () => {
    const value = { ...card().card, expected_result: 'Прототип.', success_criteria: 'Проверочный сценарий.', interaction_format: 'Раз в неделю.' }
    expect(cardToFields(value, 'Ритейл')).toMatchObject({ result: 'Прототип.', success: 'Проверочный сценарий.', interaction: 'Раз в неделю.', data: '', topic: 'Ритейл' })
    expect(cardToFields(value).topic).toBe('')
  })
})

describe('иллюстративные примеры отдельно от фактов', () => {
  it.each([
    ['Помощник магазина', 'возврат'], ['Помощник для школы', 'участник'],
    ['Контроль доставки', 'заказ'], ['Разбор обращений', 'категори'],
  ])('дает примеры для всех полей: %s', (description, marker) => {
    const fields = emptyFields()
    for (const key of FIELD_KEYS) expect(getAnswerExample(key, description, fields).trim().length).toBeGreaterThan(3)
    expect(getAnswerExample('success', description, fields)).toContain(marker)
    expect(getAnswerExample('contact', description, fields)).toContain('@example.com')
    expect(fields).toEqual(emptyFields())
  })

  it('учитывает явную тему перед описанием и отделяет пример от mock-карточки', () => {
    const fields = { ...emptyFields(), topic: 'Ритейл' }
    expect(getAnswerExample('topic', 'Доставка для школы', fields)).toBe('Ритейл')
    const input = { ...request(), fields }
    for (const question of questions(input).questions) expect(Object.values(card({ ...input, stage: 'card' }).card)).not.toContain(question.example)
  })
})

describe('контракты и ограничения', () => {
  it('отвергает короткий/невидимый ввод и ограничивает длины описания, названия и ответов', () => {
    expect(() => validateAIRequest({ ...request(), description: 'Коротко\u200b\u200b\u200b' })).toThrow('10 видимых')
    expect(() => validateAIRequest({ ...request(), description: '\u200b' })).toThrow('не должен быть пустым')
    expect(() => validateAIRequest({ ...request(), description: 'а'.repeat(20_001) })).toThrow('20000')
    expect(() => validateAIRequest({ ...request(), fields: { ...emptyFields(), title: 'а'.repeat(161) } })).toThrow('160')
    expect(() => validateAIRequest({ ...request('card'), answers: [answer('title', 'а'.repeat(161))] })).toThrow('160')
  })

  it('ограничивает суммарный запрос и проверяет структуру ответов', () => {
    const input = request('card', 'а'.repeat(20_000))
    input.fields = Object.fromEntries(FIELD_KEYS.map((key) => [key, key === 'title' || key === 'topic' ? 'Короткий текст' : 'б'.repeat(20_000)])) as TaskFields
    expect(() => validateAIRequest(input)).toThrow('слишком большой')
    expect(() => validateAIRequest({ ...request('card'), answers: Array.from({ length: 11 }, (_, i) => answer('data', 'Ответ', `q${i + 1}`)) })).toThrow('10 ответов')
    expect(() => validateAIRequest({ ...request('card'), answers: [answer('data', 'Ответ'), answer('need', 'Ответ')] })).toThrow('повторяться')
    expect(() => validateAIRequest({ ...request(), answers: [answer('data', 'Ответ')] })).toThrow('Первичный анализ')
    expect(() => validateAIRequest({ ...request(), stage: 'publish' })).toThrow('Неизвестный этап')
  })

  it('отвергает неизвестные поля, неполную карточку и несогласованный список пропусков', () => {
    const result = card()
    const { contact: _contact, ...incomplete } = result.card
    expect(() => validateCardResult({ ...result, card: incomplete })).toThrow('обязательные поля')
    expect(() => validateCardResult({ ...result, score: 100 })).toThrow('неизвестные свойства')
    expect(() => validateCardResult({ ...result, card: { ...result.card, budget: 'Выдуманный бюджет' } })).toThrow('неизвестные свойства')
    expect(() => validateCardResult({ ...result, missing_information: [] })).toThrow('не соответствует')
    expect(() => validateCardResult({ ...result, card: { ...result.card, title: 'а'.repeat(161) } })).toThrow('160')
    expect(() => validateCardResult({ ...result, mode: 'demo' })).toThrow('режим')
  })

  it('не принимает пустой пример, повторные id и меньше трех вопросов', () => {
    const result = questions()
    expect(() => validateAnalysis({ ...result, questions: result.questions.slice(0, 2) })).toThrow('от 3 до 10')
    expect(() => validateAnalysis({ ...result, questions: [result.questions[0], result.questions[0], result.questions[1]] })).toThrow('повторяться')
    expect(() => validateAnalysis({ ...result, questions: [{ ...result.questions[0], example: '\u200b' }, ...result.questions.slice(1)] })).toThrow('Пример ответа')
    expect(() => validateAnalysis({ ...result, questions: [{ ...result.questions[0], field: 'budget' }, ...result.questions.slice(1)] })).toThrow('Неизвестное поле')
  })

  it('нормализует пустые значения карточки и публикует строгие схемы без mode и score', () => {
    const result = card()
    expect(validateCardResult({ ...result, card: { ...result.card, data: '\u200b' } }).card.data).toBeNull()
    expect(AI_SCHEMAS.card.properties.card.required).toEqual([...CARD_KEYS])
    expect(AI_SCHEMAS.card.additionalProperties).toBe(false)
    expect(AI_SCHEMAS.questions.properties).not.toHaveProperty('mode')
    expect(AI_SCHEMAS.card.properties).not.toHaveProperty('score')
  })
})

describe('HTTP-клиент существующего AI-модуля', () => {
  it('отправляет два явных этапа через /api/ai и возвращает проверенный результат', async () => {
    const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
      const input = validateAIRequest(JSON.parse(String(options.body)))
      return new Response(JSON.stringify(createMockResponse(input)), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const fields = emptyFields()
    const first = await analyzeTask('У нас небольшой магазин.', fields)
    const answers = [answer('need', 'Не успеваем разбирать обращения.')]
    const second = await generateTaskCard('У нас небольшой магазин.', fields, answers)
    expect(first.stage).toBe('questions')
    expect(second.card.need).toBe(answers[0].answer)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const sent = JSON.parse(String(fetchMock.mock.calls[1][1].body)) as AIRequest
    expect(fetchMock.mock.calls[0][0]).toBe('/api/ai')
    expect(sent).toMatchObject({ stage: 'card', answers })
    expect(JSON.stringify(sent)).not.toContain('example')
    expect(fields).toEqual(emptyFields())
  })

  it.each([['', 'пустой ответ'], ['<html>bad gateway</html>', 'невалидный JSON'], ['{}', 'обязательные поля']])('обрабатывает поврежденный ответ без подмены mock: %s', async (body, message) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(analyzeTask('У нас небольшой магазин.', emptyFields())).rejects.toThrow(message)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('сохраняет безопасную ошибку сервера и не раскрывает HTML или сетевые детали', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Сократите описание и ответы.' }), { status: 413 })))
    await expect(analyzeTask('У нас небольшой магазин.', emptyFields())).rejects.toThrow('Сократите описание')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>upstream secret</html>', { status: 503 })))
    await expect(analyzeTask('У нас небольшой магазин.', emptyFields())).rejects.toThrow('временно недоступен')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('provider-key-secret')))
    await expect(analyzeTask('У нас небольшой магазин.', emptyFields())).rejects.toThrow('Не удалось связаться')
  })

  it('прерывает зависший запрос по timeout и разрешает повторную попытку', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    const pending = analyzeTask('У нас небольшой магазин.', emptyFields())
    const assertion = expect(pending).rejects.toThrow('30 секунд')
    await vi.advanceTimersByTimeAsync(AI_REQUEST_TIMEOUT_MS)
    await assertion
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(questions()), { status: 200 })))
    await expect(analyzeTask('У нас небольшой магазин.', emptyFields())).resolves.toMatchObject({ stage: 'questions' })
  })

  it('отбрасывает неполную карточку второго этапа, сохраняя исходные ответы', async () => {
    const inputAnswers = [answer('need', 'Нужно быстрее находить обращения.')]
    const corrupted = { ...card(), card: { title: 'Неполная карточка' } as Card }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(corrupted), { status: 200 })))
    await expect(generateTaskCard('У нас небольшой магазин.', emptyFields(), inputAnswers)).rejects.toThrow('обязательные поля')
    expect(inputAnswers[0].answer).toBe('Нужно быстрее находить обращения.')
  })
})

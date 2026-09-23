import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApiHandler, getAIStatus, MAX_REQUEST_BYTES, requestAI, type ApiConfig } from './api'
import { CARD_KEYS, createMockResponse, type AIRequest, type CardResult } from '../src/ai'
import { emptyFields, FIELD_KEYS, getRating } from '../src/domain'

const mockConfig: ApiConfig = { mode: 'mock', apiKey: '', model: 'gpt-4o-mini' }
const openaiConfig: ApiConfig = { ...mockConfig, mode: 'openai', apiKey: 'test-server-secret' }
function input(stage: AIRequest['stage'] = 'questions'): AIRequest {
  return { stage, description: 'Нам нужен сайт для магазина.', fields: emptyFields(), answers: [] }
}
function providerText(text: string) {
  return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] }), { status: 200 })
}
function fakeFetch(response: Response) { return vi.fn<typeof fetch>().mockResolvedValue(response) }

describe('серверный AI adapter', () => {
  it('mock не вызывает внешнюю сеть и возвращает обе стадии', async () => {
    const network = vi.fn<typeof fetch>()
    expect((await requestAI(input(), mockConfig, network)).stage).toBe('questions')
    const result = await requestAI(input('card'), mockConfig, network)
    expect(result.stage).toBe('card')
    expect(network).not.toHaveBeenCalled()
  })

  it('использует Responses structured output и держит секрет только в server request', async () => {
    const fixture = createMockResponse(input())
    const { mode: _, ...modelOutput } = fixture
    const network = fakeFetch(providerText(JSON.stringify(modelOutput)))
    const result = await requestAI(input(), openaiConfig, network)
    expect(result.mode).toBe('openai')
    const [url, options] = network.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer test-server-secret' })
    const body = JSON.parse(options?.body as string)
    expect(body.store).toBe(false)
    expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true })
    expect(JSON.stringify(result)).not.toContain('test-server-secret')
  })

  it.each([
    ['broken JSON', () => new Response('not JSON')],
    ['empty message', () => providerText('')],
    ['empty object', () => providerText('{}')],
    ['invalid model JSON', () => providerText('{bad')],
    ['incomplete', () => new Response(JSON.stringify({ status: 'incomplete', output: [] }))],
    ['provider failure', () => new Response('secret upstream detail', { status: 500 })],
    ['provider limit', () => new Response('secret upstream detail', { status: 429 })],
  ])('отклоняет %s без утечки тела провайдера', async (_, fixture) => {
    const request = requestAI(input(), openaiConfig, fakeFetch(fixture()))
    await expect(request).rejects.toThrow(/AI/)
    await expect(request).rejects.not.toThrow('secret upstream detail')
  })

  it('не подменяет ошибку подключения успешным mock', async () => {
    await expect(requestAI(input(), openaiConfig, vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')))).rejects.toThrow('связаться')
    await expect(requestAI(input(), { ...openaiConfig, apiKey: '' })).rejects.toThrow('OPENAI_API_KEY')
    await expect(requestAI(input(), { ...mockConfig, mode: 'typo' })).rejects.toThrow('AI_MODE')
  })

  it('не использует ID организации или проекта как API-ключ и не вызывает сеть', async () => {
    const network = vi.fn<typeof fetch>()
    for (const apiKey of ['org-example', 'proj_example']) {
      await expect(requestAI(input(), { ...openaiConfig, apiKey }, network)).rejects.toThrow('идентификатор')
    }
    expect(network).not.toHaveBeenCalled()
    expect(getAIStatus({ ...openaiConfig, apiKey: '', organization: 'org-example' })).toMatchObject({ configured: false })
  })

  it('передаёт организацию и проект отдельными заголовками без раскрытия в статусе', async () => {
    const config = { ...openaiConfig, apiKey: ' test-server-secret ', organization: ' org-example ', project: ' proj_example ' }
    const network = fakeFetch(providerText(JSON.stringify(createMockResponse(input()))))
    await requestAI(input(), config, network)
    expect(network.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer test-server-secret', 'OpenAI-Organization': 'org-example', 'OpenAI-Project': 'proj_example',
    })
    const status = JSON.stringify(getAIStatus(config))
    expect(status).not.toContain('test-server-secret')
    expect(status).not.toContain('org-example')
    expect(status).not.toContain('proj_example')
    expect(getAIStatus(config).message).toContain('будет проверен')
  })

  it.each([[401, 'API-ключ'], [403, 'Нет доступа'], [404, 'Модель'], [400, 'не принял запрос']])('объясняет ошибку OpenAI %s без тела провайдера', async (status, message) => {
    const pending = requestAI(input(), openaiConfig, fakeFetch(new Response('private upstream detail', { status })))
    await expect(pending).rejects.toThrow(message)
    await expect(pending).rejects.not.toThrow('private upstream detail')
  })

  it('проверяет пустую модель и пробелы в ключе до сетевого запроса', async () => {
    const network = vi.fn<typeof fetch>()
    await expect(requestAI(input(), { ...openaiConfig, model: ' ' }, network)).rejects.toThrow('OPENAI_MODEL')
    await expect(requestAI(input(), { ...openaiConfig, apiKey: 'key\nvalue' }, network)).rejects.toThrow('пробелов')
    expect(network).not.toHaveBeenCalled()
  })

  it('прерывает зависший вызов по timeout', async () => {
    const network = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    await expect(requestAI(input(), openaiConfig, network, 5)).rejects.toThrow('вовремя')
    expect(network.mock.calls[0][1]?.signal?.aborted).toBe(true)
  })

  it('проверяет факты карточки по исходному тексту и ответам, исключая формулировки вопросов', async () => {
    const request = input('card')
    request.answers = [{ id: 'q1', field: 'data', question: 'Есть CSV с 10000 клиентами?', answer: 'Обезличенный CSV.' }]
    const fixture = createMockResponse(request) as CardResult
    const network = fakeFetch(providerText(JSON.stringify(fixture)))
    const result = await requestAI(request, openaiConfig, network) as CardResult
    expect(result.card.data).toBe('Обезличенный CSV.')
    const invented = { ...fixture, card: { ...fixture.card, users: '10000 клиентами' } }
    invented.missing_information = invented.missing_information.filter(key => key !== 'users')
    await expect(requestAI(request, openaiConfig, fakeFetch(providerText(JSON.stringify(invented))))).rejects.toThrow('которых нет')
  })

  it('отклоняет пропущенный обязательный ключ карточки', async () => {
    const card = Object.fromEntries(CARD_KEYS.filter(key => key !== 'contact').map(key => [key, null]))
    await expect(requestAI(input('card'), openaiConfig, fakeFetch(providerText(JSON.stringify({ stage: 'card', card, missing_information: [] }))))).rejects.toThrow('обязательные поля')
  })
})

describe('HTTP API подтверждения и публикации', () => {
  let server: Server
  let base: string
  beforeAll(async () => {
    const handler = createApiHandler(mockConfig)
    server = createServer((req, res) => { void handler(req, res, () => { res.statusCode = 404; res.end() }) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) })
  function post(path: string, body: unknown, headers: Record<string, string> = {}) {
    return fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
  }

  it('реальный HTTP проходит обе AI стадии', async () => {
    const questions = await post('/api/ai', input())
    expect(questions.status).toBe(200)
    expect((await questions.json()).questions.length).toBeGreaterThanOrEqual(3)
    const card = await post('/api/ai', input('card'))
    expect(card.status).toBe(200)
    expect(Object.keys((await card.json()).card)).toHaveLength(10)
  })

  it('сообщает режим конфигурации до первого AI-запроса', async () => {
    const response = await fetch(base + '/api/health')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({ ai: { mode: 'mock', configured: true } })
    expect((await post('/api/health', {})).status).toBe(405)
    expect((await fetch(base + '/api/health', { headers: { Origin: 'https://foreign.example' } })).status).toBe(403)
  })

  it('объясняет переполнение объединённого поля mock по HTTP', async () => {
    const request = input('card')
    request.fields.data = 'а'.repeat(20_000)
    request.answers = [{ id: 'q1', field: 'data', question: 'Какие данные доступны?', answer: 'Ещё один файл' }]
    const response = await post('/api/ai', request)
    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('после объединения превышает')
  })

  it('подтверждает заполненные поля и пересчитывает фиксированную формулу после правок', async () => {
    const fields = { ...emptyFields(), title: 'Задача', topic: 'Магазин', context: 'Текущий процесс', need: 'Потребность' }
    const response = await post('/api/tasks/confirm', { fields, score: 100 })
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result.rating.score).toBe(20)
    expect(result.rating.label).toBe('Черновик')
    const complete = Object.fromEntries(FIELD_KEYS.map(key => [key, key]))
    const second = await post('/api/tasks/confirm', { fields: complete })
    expect((await second.json()).rating.score).toBe(100)
    const third = await post('/api/tasks/confirm', { fields: { ...complete, data: '' } })
    expect((await third.json()).rating.score).toBe(80)
  })

  it('не публикует без подтверждения и допускает даже нулевой рейтинг', async () => {
    const fields = { ...emptyFields(), title: 'Задача', topic: 'Магазин' }
    const rejected = await post('/api/tasks/publish', { fields, confirmedFields: [] })
    expect(rejected.status).toBe(409)
    const response = await post('/api/tasks/publish', { fields, confirmedFields: ['title', 'topic'] })
    expect(response.status).toBe(200)
    expect((await response.json()).rating).toEqual(getRating({ fields, confirmedFields: ['title', 'topic'] }))
  })

  it('валидирует поля, подтверждения и невидимый текст на сервере', async () => {
    expect((await post('/api/tasks/confirm', { fields: emptyFields() })).status).toBe(400)
    expect((await post('/api/tasks/confirm', { fields: { ...emptyFields(), title: 'x'.repeat(161) } })).status).toBe(400)
    expect((await post('/api/tasks/publish', { fields: { ...emptyFields(), title: '\u200b', topic: 'Тема' }, confirmedFields: ['topic'] })).status).toBe(400)
    expect((await post('/api/tasks/publish', { fields: emptyFields(), confirmedFields: ['foreign'] })).status).toBe(400)
  })

  it('возвращает безопасные ошибки для формата, размера и чужого origin', async () => {
    expect((await post('/api/ai', input(), { Origin: 'https://foreign.example' })).status).toBe(403)
    expect((await fetch(base + '/api/ai')).status).toBe(405)
    expect((await post('/api/ai', input(), { 'Content-Type': 'text/plain' })).status).toBe(415)
    expect((await post('/api/ai', input(), { 'Content-Type': 'application/json-invalid' })).status).toBe(415)
    expect((await post('/api/ai', { ...input(), description: 'x'.repeat(20_001) })).status).toBe(400)
    expect((await post('/api/ai', { text: 'x'.repeat(MAX_REQUEST_BYTES) })).status).toBe(413)
    const invalid = await fetch(base + '/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' })
    expect(invalid.status).toBe(400)
    expect((await invalid.json()).error).toContain('JSON')
  })
})

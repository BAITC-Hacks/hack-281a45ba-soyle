import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { AI_PROMPT, AI_SCHEMAS, CARD_KEYS, CARD_TO_FIELD, createMockResponse, validateAIRequest, validateAnalysis, validateCardResult, type AIRequest, type CardResult } from '../src/ai'
import { FIELD_KEYS, getRating, hasContent, normalizeVisibleText, type FieldKey, type TaskFields } from '../src/domain'

export interface ApiConfig { mode: string; apiKey: string; model: string }
export const MAX_REQUEST_BYTES = 512 * 1024
const MAX_RESPONSE_BYTES = 512 * 1024
const PROVIDER_TIMEOUT_MS = 25_000

class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  response.end(JSON.stringify(body))
}

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    let excessive = false
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_REQUEST_BYTES) {
        if (!excessive) reject(new ApiError(413, 'Запрос слишком большой. Сократите описание и ответы.'))
        excessive = true
        chunks.length = 0
      } else if (!excessive) chunks.push(chunk)
    })
    request.on('end', () => {
      if (excessive) return
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(new ApiError(400, 'Ожидается непустой JSON-запрос.')) }
    })
    request.on('error', () => reject(new ApiError(400, 'Не удалось прочитать запрос. Повторите попытку.')))
    request.on('aborted', () => reject(new ApiError(400, 'Запрос был прерван.')))
  })
}

function readFields(value: unknown): TaskFields {
  if (!record(value) || Object.keys(value).length !== FIELD_KEYS.length
    || !FIELD_KEYS.every(key => Object.hasOwn(value, key) && typeof value[key] === 'string'
      && value[key].length <= (key === 'title' || key === 'topic' ? 160 : 20_000))) {
    throw new ApiError(400, 'Проверьте поля карточки и допустимую длину текста.')
  }
  return Object.fromEntries(FIELD_KEYS.map(key => [key, value[key]])) as TaskFields
}

function readConfirmed(value: unknown, fields: TaskFields): FieldKey[] {
  if (!Array.isArray(value) || value.length > FIELD_KEYS.length || new Set(value).size !== value.length
    || !value.every(key => FIELD_KEYS.includes(key as FieldKey) && hasContent(fields[key as FieldKey]))) {
    throw new ApiError(400, 'Некорректное подтверждение карточки.')
  }
  return value as FieldKey[]
}

/** Conservative extraction: examples and question wording cannot become business facts. */
export function assertGroundedCard(result: CardResult, input: AIRequest): void {
  const normalize = (text: string) => normalizeVisibleText(text).replace(/\s+/gu, ' ')
  const sources = [input.description, ...Object.values(input.fields), ...input.answers.map(answer => answer.answer)].map(normalize)
  for (const key of CARD_KEYS) {
    const manual = normalize(input.fields[CARD_TO_FIELD[key]])
    if (manual && !normalize(result.card[key] ?? '').includes(manual)) {
      throw new ApiError(502, 'AI изменил уже заполненные сведения. Ответ отклонён; ваша карточка сохранена в форме.')
    }
  }
  for (const value of Object.values(result.card)) {
    if (!value || !hasContent(value)) continue
    const fragments = value.split(/\r?\n/u).map(normalize).filter(Boolean)
    if (!fragments.every(fragment => sources.some(source => source.includes(fragment)))) {
      throw new ApiError(502, 'AI добавил сведения, которых нет в вашем вводе. Ответ отклонён. Повторите попытку или заполните карточку вручную.')
    }
  }
}

async function boundedResponse(response: Response): Promise<string> {
  if (!response.body) throw new ApiError(502, 'AI вернул пустой ответ. Повторите попытку.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        throw new ApiError(502, 'Ответ AI слишком большой. Сократите описание и повторите попытку.')
      }
      chunks.push(chunk.value)
    }
    return Buffer.concat(chunks).toString('utf8')
  } finally { reader.releaseLock() }
}

export async function requestAI(input: AIRequest, config: ApiConfig, fetchProvider: typeof fetch = fetch, timeoutMs = PROVIDER_TIMEOUT_MS) {
  if (config.mode === 'mock') return createMockResponse(input)
  if (config.mode !== 'openai') throw new ApiError(503, 'Проверьте AI_MODE на сервере: допустимы mock и openai.')
  if (!config.apiKey.trim()) throw new ApiError(503, 'AI не настроен: добавьте OPENAI_API_KEY на сервере или включите AI_MODE=mock.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchProvider('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model, store: false, max_output_tokens: 6000,
        instructions: AI_PROMPT,
        input: JSON.stringify(input),
        text: { format: { type: 'json_schema', name: `soyle_${input.stage}`, strict: true, schema: AI_SCHEMAS[input.stage] } },
      }),
    })
    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 429) throw new ApiError(503, 'Лимит AI API исчерпан. Повторите позже или включите деморежим на сервере.')
      throw new ApiError(502, 'AI API недоступен. Проверьте настройки сервера и повторите попытку.')
    }
    let envelope: unknown
    try { envelope = JSON.parse(await boundedResponse(response)) }
    catch (error) { if (error instanceof ApiError || controller.signal.aborted) throw error; throw new ApiError(502, 'AI API вернул некорректный JSON. Повторите попытку.') }
    if (!record(envelope) || envelope.status !== 'completed' || !Array.isArray(envelope.output)) {
      throw new ApiError(502, 'AI не завершил ответ. Сократите описание и повторите попытку.')
    }
    const texts: string[] = []
    for (const item of envelope.output) {
      if (!record(item) || item.type !== 'message' || !Array.isArray(item.content)) continue
      for (const content of item.content) {
        if (record(content) && content.type === 'output_text' && typeof content.text === 'string') texts.push(content.text)
      }
    }
    const output = texts.join('')
    if (!hasContent(output)) throw new ApiError(502, 'AI вернул пустой ответ. Повторите попытку или заполните карточку вручную.')
    try {
      const parsed: unknown = JSON.parse(output)
      if (!record(parsed)) throw new Error('object required')
      const value = { ...parsed, mode: 'openai' }
      if (input.stage === 'questions') return validateAnalysis(value)
      const result = validateCardResult(value)
      assertGroundedCard(result, input)
      return result
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw new ApiError(502, 'AI вернул некорректную структуру или пропустил обязательные поля. Ваш ввод сохранён; повторите попытку.')
    }
  } catch (error) {
    if (controller.signal.aborted) throw new ApiError(504, 'AI не ответил вовремя. Ваш ввод сохранён; повторите попытку.')
    if (error instanceof ApiError) throw error
    throw new ApiError(502, 'Не удалось связаться с AI API. Повторите попытку позже.')
  } finally { clearTimeout(timer) }
}

export function createApiHandler(config: ApiConfig, fetchProvider: typeof fetch = fetch) {
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const path = request.url?.split('?', 1)[0] || ''
    if (!path.startsWith('/api/')) { next(); return }
    try {
      if (!['/api/ai', '/api/tasks/confirm', '/api/tasks/publish'].includes(path)) throw new ApiError(404, 'Такого API-маршрута нет.')
      if (request.method !== 'POST') throw new ApiError(405, 'Используйте POST-запрос.')
      if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new ApiError(415, 'Ожидается Content-Type: application/json.')
      // This local MVP API is used by the same app origin; no cross-site use of the server key.
      if (request.headers.origin) {
        let origin: URL
        try { origin = new URL(request.headers.origin) } catch { throw new ApiError(403, 'Недопустимый источник запроса.') }
        if (origin.host !== request.headers.host || !['http:', 'https:'].includes(origin.protocol)) throw new ApiError(403, 'Недопустимый источник запроса.')
      }
      const value = await readBody(request)
      if (path === '/api/ai') {
        let input: AIRequest
        try { input = validateAIRequest(value) }
        catch (error) { throw new ApiError(400, error instanceof Error ? error.message : 'Некорректный AI-запрос.') }
        json(response, 200, await requestAI(input, config, fetchProvider))
        return
      }
      if (!record(value)) throw new ApiError(400, 'Ожидается карточка задачи.')
      const fields = readFields(value.fields)
      if (path === '/api/tasks/confirm') {
        const confirmedFields = FIELD_KEYS.filter(key => hasContent(fields[key]))
        if (!confirmedFields.length) throw new ApiError(400, 'Заполните хотя бы одно поле перед подтверждением.')
        json(response, 200, { confirmedFields, rating: getRating({ fields, confirmedFields }) })
        return
      }
      const confirmedFields = readConfirmed(value.confirmedFields, fields)
      if (!hasContent(fields.title) || !hasContent(fields.topic)) throw new ApiError(400, 'Для публикации заполните название и тему задачи.')
      if (FIELD_KEYS.some(key => hasContent(fields[key]) && !confirmedFields.includes(key))) throw new ApiError(409, 'Проверьте карточку и подтвердите сведения перед публикацией.')
      json(response, 200, { rating: getRating({ fields, confirmedFields }) })
    } catch (error) {
      if (!response.headersSent && !response.destroyed) json(response, error instanceof ApiError ? error.status : 500,
        { error: error instanceof ApiError ? error.message : 'Не удалось обработать запрос. Повторите попытку.' })
    }
  }
}

export function soyleApiPlugin(config: ApiConfig): Plugin {
  return {
    name: 'soyle-api',
    configureServer(server) { server.middlewares.use(createApiHandler(config)) },
    configurePreviewServer(server) { server.middlewares.use(createApiHandler(config)) },
  }
}

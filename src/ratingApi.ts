import { FIELD_KEYS, getRating, hasContent, type FieldKey, type Rating, type TaskFields } from './domain'

async function requestRating(path: string, fields: TaskFields, confirmedFields?: FieldKey[]) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields, ...(confirmedFields ? { confirmedFields } : {}) }),
      signal: controller.signal,
    })
    let value: unknown
    try { value = await response.json() } catch { throw new Error('Сервер вернул некорректный ответ. Проверьте запуск Soyle и повторите попытку.') }
    if (!response.ok) {
      const message = value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' ? value.error : 'Не удалось рассчитать рейтинг на сервере.'
      throw new Error(message)
    }
    const expectedConfirmed = confirmedFields ?? FIELD_KEYS.filter(key => hasContent(fields[key]))
    const expectedRating = getRating({ fields, confirmedFields: expectedConfirmed })
    if (!value || typeof value !== 'object' || !('rating' in value)
      || JSON.stringify(value.rating) !== JSON.stringify(expectedRating)) {
      throw new Error('Сервер вернул некорректный рейтинг. Подтверждение не сохранено, повторите попытку.')
    }
    if (!confirmedFields && (!('confirmedFields' in value) || JSON.stringify(value.confirmedFields) !== JSON.stringify(expectedConfirmed))) {
      throw new Error('Сервер не подтвердил сведения. Повторите попытку.')
    }
    return { confirmedFields: expectedConfirmed, rating: value.rating as Rating }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Сервер не ответил вовремя. Сведения сохранены в форме; повторите попытку.')
    if (error instanceof TypeError) throw new Error('Сервер недоступен. Запустите Soyle командой npm run dev и повторите попытку.')
    throw error
  } finally { clearTimeout(timer) }
}

export function confirmTask(fields: TaskFields): Promise<{ confirmedFields: FieldKey[]; rating: Rating }> {
  return requestRating('/api/tasks/confirm', fields)
}

export async function validatePublication(fields: TaskFields, confirmedFields: FieldKey[]): Promise<Rating> {
  return (await requestRating('/api/tasks/publish', fields, confirmedFields)).rating
}

import { useEffect, useState } from 'react'

type Status = { configured: boolean; message: string }

export default function AIConnectionStatus() {
  const [status, setStatus] = useState<Status | null>(null)

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5_000)
    async function check() {
      try {
        const response = await fetch('/api/health', { signal: controller.signal })
        if (!response.ok) throw new Error('status unavailable')
        const value = await response.json()
        if (!value?.ai || typeof value.ai.configured !== 'boolean' || typeof value.ai.message !== 'string') throw new Error('invalid status')
        if (active) setStatus(value.ai)
      } catch {
        if (active) setStatus({ configured: false, message: 'Не удалось проверить AI-помощника. Проверьте запуск сервера; карточку можно заполнить вручную.' })
      } finally { clearTimeout(timer) }
    }
    void check()
    return () => { active = false; clearTimeout(timer); controller.abort() }
  }, [])

  return <p className={status?.configured === false ? 'form-error' : 'editor-field-hint'} role="status">
    {status?.message ?? 'Проверяем настройки AI-помощника…'}
  </p>
}

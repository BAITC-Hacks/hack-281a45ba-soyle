import { useEffect, useRef, useState } from 'react';
import type { AppState } from './domain';
import { MAX_BACKUP_BYTES, parseState } from './storage';
import { Icon } from './components';

export default function DataTools({ onExport, onImport, onReset, onRecovery }: {
  onExport: () => void;
  onImport: (state: AppState) => boolean;
  onReset: () => void;
  onRecovery?: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  useEffect(() => () => { requestId.current += 1; }, []);

  async function importFile(file?: File) {
    if (!file) return;
    const currentRequest = ++requestId.current;
    setError('');
    setBusy(true);
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('Файл слишком большой. Максимальный размер — 5 МБ.');
      const raw = await file.text();
      if (requestId.current !== currentRequest) return;
      const next = parseState(raw);
      if (!window.confirm(`В копии ${next.tasks.length} задач, ${next.teams.length} команд и ${next.proposals.length} откликов. Заменить текущие данные? Сначала скачайте свою копию, если хотите сохранить её.`)) return;
      if (!onImport(next)) setError('Копия не загружена: замена данных отменена или сохранение отклонено. Текущие данные не заменены.');
    } catch (reason) {
      if (requestId.current === currentRequest) setError(reason instanceof Error ? reason.message : 'Не удалось прочитать файл. Выберите резервную копию Soyle в формате JSON.');
    } finally {
      if (requestId.current === currentRequest) {
        setBusy(false);
        if (fileInput.current) fileInput.current.value = '';
      }
    }
  }

  return <section className="panel data-tools" aria-labelledby="data-tools-title">
    <div><div className="eyebrow"><Icon name="shield" size={17}/> ВАШИ ДАННЫЕ</div><h2 id="data-tools-title">Сохраните свою работу</h2><p>Скачайте копию перед защитой или переносом на другое устройство. Она содержит задачи, отклики и прогресс команд. Храните её там, где доступны только нужные вам люди.</p></div>
    <div className="data-tool-actions"><button className="btn btn-secondary" onClick={onExport}><Icon name="folder" size={17}/>Скачать копию</button><button className="btn btn-secondary" disabled={busy} onClick={() => fileInput.current?.click()}><Icon name="up" size={17}/>{busy ? 'Проверяем файл…' : 'Загрузить копию'}</button><input ref={fileInput} type="file" accept=".json,application/json" aria-label="Файл резервной копии" className="visually-hidden" disabled={busy} onChange={event => void importFile(event.target.files?.[0])}/><button className="btn btn-ghost" onClick={onReset} disabled={busy}><Icon name="reset" size={17}/>Восстановить демоданные</button></div>
    {onRecovery && <div className="recovery-access"><p>Сохранён исходный файл, который приложение не смогло прочитать. Его можно скачать для ручного восстановления сведений.</p><button className="text-button" onClick={onRecovery}>Скачать исходное сохранение</button></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}

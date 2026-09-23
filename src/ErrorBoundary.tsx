import { Component, type ReactNode } from 'react';
import { downloadText, backupFilename } from './download';
import { readStoredSnapshot } from './storage';

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; message: string }> {
  state = { failed: false, message: '' };

  static getDerivedStateFromError() {
    return { failed: true, message: '' };
  }

  exportBackup = () => {
    try {
      const raw = readStoredSnapshot();
      if (!raw) throw new Error('Сохранённой копии пока нет.');
      downloadText(raw, backupFilename('soyle-recovery'));
      this.setState({ message: 'Копия скачана. Теперь можно перезагрузить страницу.' });
    } catch {
      this.setState({ message: 'Не удалось прочитать сохранение. Хранилище может быть недоступно или ещё не содержать данных.' });
    }
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="app-failure panel"><span className="eyebrow">SOYLE</span><h1>Не удалось показать страницу</h1><p>Перезагрузите приложение. Перед этим можно скачать данные, которые уже сохранены в браузере. Перезагрузка не удаляет сохранение.</p><div className="data-tool-actions"><button className="btn btn-primary" onClick={() => window.location.reload()}>Перезагрузить</button><button className="btn btn-secondary" onClick={this.exportBackup}>Скачать сохранение</button></div>{this.state.message && <p role="status">{this.state.message}</p>}</main>;
  }
}

export function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function backupFilename(prefix = 'soyle-backup') {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
}

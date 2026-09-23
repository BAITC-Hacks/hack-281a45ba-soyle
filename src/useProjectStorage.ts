import { useEffect, useRef, useState } from 'react';
import type { AppState } from './domain';
import { getRecoveryBackup, loadState, readStoredSnapshot, saveState, serializeState, STORAGE_CONFLICT_MESSAGE, STORAGE_KEY } from './storage';

export type CommitResult = 'stored' | 'memory' | 'conflict' | 'blocked';

/** Saves at the action boundary, so success messages reflect the actual outcome. */
export function useProjectStorage() {
  const [initial] = useState(loadState);
  const [state, setState] = useState(initial.state);
  const [notice, setNotice] = useState(initial.warning);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [hasRecovery, setHasRecovery] = useState(initial.recoveryAvailable || Boolean(initial.warning && initial.rawSnapshot !== null));
  const current = useRef(initial.state);
  const recoverySource = useRef(initial.warning && initial.rawSnapshot !== null ? initial.rawSnapshot : getRecoveryBackup());
  const baseline = useRef(initial.rawSnapshot);
  const pendingExport = useRef<AppState | null>(null);
  const memoryOnly = useRef(false);
  const initialized = useRef(false);

  function write(next: AppState): CommitResult {
    // Validation happens before changing the UI, even for a storage-only failure.
    let raw: string;
    try { raw = serializeState(next); }
    catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось проверить данные перед сохранением.');
      return 'blocked';
    }
    const warning = saveState(next, baseline.current);
    if (warning === STORAGE_CONFLICT_MESSAGE) {
      pendingExport.current = next;
      setConflict(true);
      setError(warning);
      return 'conflict';
    }
    current.current = next;
    pendingExport.current = null;
    setState(next);
    setError(warning);
    setConflict(false);
    memoryOnly.current = Boolean(warning);
    setHasUnsaved(Boolean(warning));
    if (!warning) baseline.current = raw;
    return warning ? 'memory' : 'stored';
  }

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    // Existing valid data are not rewritten just because another tab was opened.
    if (initial.rawSnapshot === null || initial.warning) write(initial.state);
    // Initialization uses the exact snapshot read by this hook.
  }, []);

  useEffect(() => {
    const inspect = () => {
      try {
        const changed = readStoredSnapshot() !== baseline.current;
        setConflict(changed);
        if (changed) setError(STORAGE_CONFLICT_MESSAGE);
        else setError(previous => previous === STORAGE_CONFLICT_MESSAGE ? null : previous);
      } catch {
        // A future write reports storage unavailability; no user data are discarded.
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) inspect();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', inspect);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', inspect);
    };
  }, []);

  function commit(updater: AppState | ((current: AppState) => AppState)): CommitResult {
    const next = typeof updater === 'function' ? updater(current.current) : updater;
    if (next === current.current) return memoryOnly.current ? 'memory' : 'stored';
    return write(next);
  }

  function loadLatest() {
    const fresh = loadState();
    recoverySource.current = fresh.warning && fresh.rawSnapshot !== null ? fresh.rawSnapshot : getRecoveryBackup() ?? recoverySource.current;
    current.current = fresh.state;
    baseline.current = fresh.rawSnapshot;
    pendingExport.current = null;
    setState(fresh.state);
    setNotice(fresh.warning);
    setHasRecovery(fresh.recoveryAvailable || Boolean(fresh.warning && fresh.rawSnapshot !== null));
    setError(null);
    setConflict(false);
    memoryOnly.current = false;
    setHasUnsaved(false);
    if (fresh.rawSnapshot === null || fresh.warning) write(fresh.state);
    return fresh.state;
  }

  return {
    state, notice, error, conflict, hasUnsaved, hasRecovery,
    commit, loadLatest,
    retry: () => write(current.current),
    dismissNotice: () => setNotice(null),
    exportSnapshot: () => serializeState(pendingExport.current ?? current.current),
    exportRecovery: () => recoverySource.current ?? getRecoveryBackup(),
  };
}

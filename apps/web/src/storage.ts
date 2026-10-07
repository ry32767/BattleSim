import type { Replay } from '@battle/contracts';
import { serializeReplay } from '@battle/replay';
const NAME = 'closed-battle-local';
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('records', { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(new Error('ブラウザの保存領域を開けません。JSON保存を利用してください。'));
  });
}
export type SavedRecord = { id: string; savedAt: number; label: string; replay: Replay };
export async function saveReplay(replay: Replay): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    tx.objectStore('records').put({ id: 'latest', savedAt: Date.now(), label: `${replay.manifest.stage} / ${replay.turns.length}ターン`, replay } satisfies SavedRecord);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(new Error('記録を保存できません。JSONをダウンロードしてください。'));
  }); db.close();
}
export async function loadReplay(): Promise<SavedRecord | null> {
  const db = await database();
  const result = await new Promise<SavedRecord | null>((resolve, reject) => { const r = db.transaction('records').objectStore('records').get('latest'); r.onsuccess = () => resolve(r.result ?? null); r.onerror = () => reject(new Error('記録を読み込めません。')); });
  db.close(); return result;
}
export function downloadReplay(replay: Replay) {
  const url = URL.createObjectURL(new Blob([serializeReplay(replay)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `closed-battle-${replay.manifest.stage}-${replay.turns.length}turns.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

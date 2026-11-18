// Keeps the project in the browser (IndexedDB) so a refresh or an app switch on
// the phone never loses photos or paid-for clips.
import { createStore, del, get, set } from "idb-keyval";

const db = typeof indexedDB !== "undefined" ? createStore("reel-estate", "v1") : undefined;

export async function load<T>(key: string): Promise<T | undefined> {
  if (!db) return undefined;
  try {
    return await get<T>(key, db);
  } catch {
    return undefined;
  }
}

export async function save(key: string, value: unknown) {
  if (!db) return;
  try {
    await set(key, value, db);
  } catch {
    /* storage full or blocked: the session still works */
  }
}

export async function remove(key: string) {
  if (!db) return;
  try {
    await del(key, db);
  } catch {}
}

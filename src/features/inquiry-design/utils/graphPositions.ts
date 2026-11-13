// LocalStorage-backed node position cache for the inquiry graph canvas.
// Key = student × KG version signature, so a student's manually arranged map
// survives page reloads but resets naturally when a new KG version lands.
// Preview-scope nodes are never persisted (they're ephemeral per analysis).

export interface StoredPositions {
  [nodeId: string]: { x: number; y: number };
}

const PREFIX = 'inquiry-graph-pos:v1:';
const INDEX_KEY = 'inquiry-graph-pos:v1:__index__';
// Teachers browse many students; cap stored maps LRU-style so the cache can't
// grow unbounded across student × version combinations.
const MAX_ENTRIES = 30;

export function positionsStorageKey(signature: string): string {
  return PREFIX + signature;
}

export function loadGraphPositions(key: string): StoredPositions | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as StoredPositions;
  } catch {
    return null;
  }
}

export function saveGraphPositions(key: string, positions: StoredPositions): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(positions));
    touchIndex(key);
  } catch {
    // Quota exceeded / privacy mode — position memory is a nicety, never fatal.
  }
}

function touchIndex(key: string): void {
  try {
    const raw = window.localStorage.getItem(INDEX_KEY);
    let keys: string[] = [];
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) keys = parsed.filter((k): k is string => typeof k === 'string');
    }
    keys = keys.filter((k) => k !== key);
    keys.push(key);
    while (keys.length > MAX_ENTRIES) {
      const evicted = keys.shift();
      if (evicted) window.localStorage.removeItem(evicted);
    }
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(keys));
  } catch {
    // ignore — index is best-effort bookkeeping
  }
}

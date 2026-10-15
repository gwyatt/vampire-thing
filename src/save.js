// Persistent meta-progress (gold + bought power-ups). localStorage can be
// unavailable (private mode, blocked storage) so every access is guarded.

const KEY = 'vampire-thing-save-v1';

const DEFAULT = { gold: 0, powerups: {}, best: { time: 0, kills: 0, level: 0 }, muted: false };

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    return { ...structuredClone(DEFAULT), ...JSON.parse(raw) };
  } catch {
    return structuredClone(DEFAULT);
  }
}

export function writeSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // ignore: progress just won't persist
  }
}

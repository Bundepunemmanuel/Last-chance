import type { GraphicsQuality, SaveData } from './types';

const STORAGE_KEY = 'last_chance_save_v1';
const CURRENT_SAVE_VERSION = 1;

const DEFAULT_SAVE: SaveData = {
  version: CURRENT_SAVE_VERSION,
  unlockedSector: 1,
  selectedSector: 1,
  clearedSectors: [],
  bestTimeMs: null,
  totalDeaths: 0,
  totalRuns: 0,
  graphicsQuality: 'medium',
  soundEnabled: true,
  target30Fps: true,
  checkpointReached: false,
  sisterRescuedCount: 0,
};

export function loadSaveData(): SaveData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SAVE };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const validQuality: GraphicsQuality =
      parsed.graphicsQuality === 'low' ||
      parsed.graphicsQuality === 'medium' ||
      parsed.graphicsQuality === 'high'
        ? parsed.graphicsQuality
        : DEFAULT_SAVE.graphicsQuality;

    const cleared = Array.isArray(parsed.clearedSectors)
      ? parsed.clearedSectors.filter((n): n is number => typeof n === 'number' && n >= 1 && n <= 5)
      : [];

    return {
      version: CURRENT_SAVE_VERSION,
      unlockedSector: typeof parsed.unlockedSector === 'number' ? Math.min(5, Math.max(1, parsed.unlockedSector)) : 1,
      selectedSector: typeof parsed.selectedSector === 'number' ? Math.min(5, Math.max(1, parsed.selectedSector)) : 1,
      clearedSectors: cleared,
      bestTimeMs: typeof parsed.bestTimeMs === 'number' ? parsed.bestTimeMs : null,
      totalDeaths: typeof parsed.totalDeaths === 'number' ? Math.max(0, parsed.totalDeaths) : 0,
      totalRuns: typeof parsed.totalRuns === 'number' ? Math.max(0, parsed.totalRuns) : 0,
      graphicsQuality: validQuality,
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
      target30Fps: typeof parsed.target30Fps === 'boolean' ? parsed.target30Fps : true,
      checkpointReached: Boolean(parsed.checkpointReached),
      sisterRescuedCount: typeof parsed.sisterRescuedCount === 'number' ? Math.max(0, parsed.sisterRescuedCount) : 0,
    };
  } catch {
    return { ...DEFAULT_SAVE };
  }
}

export function writeSaveData(data: SaveData): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, version: CURRENT_SAVE_VERSION }));
  } catch {
    // Storage quota or private mode fallback; game continues gracefully
  }
}

export function updateSaveData(patch: Partial<SaveData>): SaveData {
  const next = { ...loadSaveData(), ...patch };
  writeSaveData(next);
  return next;
}

export function resetProgressSave(): SaveData {
  const current = loadSaveData();
  const next: SaveData = {
    ...DEFAULT_SAVE,
    graphicsQuality: current.graphicsQuality,
    soundEnabled: current.soundEnabled,
    target30Fps: current.target30Fps,
  };
  writeSaveData(next);
  return next;
}

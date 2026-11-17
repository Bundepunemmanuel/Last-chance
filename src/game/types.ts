export type GraphicsQuality = 'low' | 'medium' | 'high';

export type GamePhase = 'title' | 'playing' | 'paused' | 'dead' | 'victory';

export type MovementMode = 'idle' | 'walk' | 'run' | 'air';

export interface SaveData {
  version: number;
  unlockedSector: number;
  bestTimeMs: number | null;
  totalDeaths: number;
  totalRuns: number;
  graphicsQuality: GraphicsQuality;
  soundEnabled: boolean;
  target30Fps: boolean;
  checkpointReached: boolean;
  sisterRescuedCount: number;
}

export interface HudState {
  phase: GamePhase;
  elapsedMs: number;
  deaths: number;
  checkpointActive: boolean;
  fakeExitTriggered: boolean;
  objectiveText: string;
  trapBannerText: string | null;
  deathReason: string | null;
  movementMode: MovementMode;
  fps: number;
  bestTimeMs: number | null;
}

export interface VirtualInputState {
  moveX: number; // -1..1 (right/left)
  moveY: number; // -1..1 (forward is +1, backward is -1)
  jumpPressed: boolean;
  walkModifier: boolean;
}

import { useEffect, useRef, useState } from 'react';
import { Pause, RotateCcw, Volume2, VolumeX, Play, Flag, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { mountGameEngine, type GameEngineHandle } from './game/engine';
import { loadSaveData, resetProgressSave } from './game/storage';
import type { GraphicsQuality, HudState, SaveData, VirtualInputState } from './game/types';
import { TouchControls } from './components/TouchControls';

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((totalSeconds * 10) % 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export default function App() {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngineHandle | null>(null);

  const virtualInputRef = useRef<VirtualInputState>({
    moveX: 0,
    moveY: 0,
    jumpPressed: false,
    walkModifier: false,
  });

  const [save, setSave] = useState<SaveData>(() => loadSaveData());
  const [hud, setHud] = useState<HudState>(() => ({
    phase: 'title',
    elapsedMs: 0,
    deaths: 0,
    checkpointActive: loadSaveData().checkpointReached,
    fakeExitTriggered: false,
    objectiveText: 'Cross the containment corridor — reach the exit.',
    trapBannerText: null,
    deathReason: null,
    movementMode: 'idle',
    fps: 30,
    bestTimeMs: loadSaveData().bestTimeMs,
  }));

  const [engineReady, setEngineReady] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [isPortraitMobile, setIsPortraitMobile] = useState(false);

  // Enforce landscape orientation on native Capacitor Android & monitor viewport aspect
  useEffect(() => {
    void (async () => {
      try {
        await ScreenOrientation.lock({ orientation: 'landscape' });
      } catch {
        // Browser desktop / non-native fallback
      }
      try {
        const orientationApi = screen.orientation as ScreenOrientation & {
          lock?: (orientation: string) => Promise<void>;
        };
        if (orientationApi?.lock) {
          await orientationApi.lock('landscape');
        }
      } catch {
        // Ignore browser fullscreen restriction
      }
    })();

    const checkAspect = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsPortraitMobile(h > w && w < 720);
    };
    checkAspect();
    window.addEventListener('resize', checkAspect);
    return () => window.removeEventListener('resize', checkAspect);
  }, []);

  // Initialize Three.js + Rapier 3D Engine once
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    let cancelled = false;
    let handle: GameEngineHandle | null = null;

    void mountGameEngine(
      host,
      virtualInputRef,
      (nextHud) => {
        if (!cancelled) {
          setHud(nextHud);
        }
      },
      (lost) => {
        if (!cancelled) {
          setContextLost(lost);
        }
      },
    ).then((mounted) => {
      if (cancelled) {
        mounted.dispose();
        return;
      }
      handle = mounted;
      engineRef.current = mounted;
      setEngineReady(true);
    });

    return () => {
      cancelled = true;
      if (handle) {
        handle.dispose();
      }
      engineRef.current = null;
    };
  }, []);

  const handleQualityChange = (q: GraphicsQuality) => {
    setSave((prev) => ({ ...prev, graphicsQuality: q }));
    engineRef.current?.applyGraphicsQuality(q);
  };

  const handleToggle30Fps = () => {
    const next = !save.target30Fps;
    setSave((prev) => ({ ...prev, target30Fps: next }));
    engineRef.current?.applyTarget30Fps(next);
  };

  const handleToggleSound = () => {
    const next = !save.soundEnabled;
    setSave((prev) => ({ ...prev, soundEnabled: next }));
    engineRef.current?.applySoundEnabled(next);
  };

  const handleStartNew = () => {
    engineRef.current?.startNewRun(false);
    setSave(loadSaveData());
  };

  const handleContinueCheckpoint = () => {
    engineRef.current?.startNewRun(true);
    setSave(loadSaveData());
  };

  const handleResetProgress = () => {
    const fresh = resetProgressSave();
    setSave(fresh);
    engineRef.current?.returnToTitle();
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#090b0f] text-slate-100">
      {/* Dedicated WebGL Canvas Container */}
      <div ref={canvasHostRef} className="fixed inset-0 z-0 h-full w-full" />

      {/* Subtle Loading Scrim until Rapier WASM + Three.js Scene mount */}
      {!engineReady && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#090b0f] px-6 text-center">
          <h1 className="font-display text-4xl font-bold tracking-wider text-slate-100">LAST CHANCE</h1>
          <p className="mt-2 text-sm text-slate-400">Initializing physics and containment sector...</p>
        </div>
      )}

      {/* WebGL Context Lost Recovery Banner */}
      {contextLost && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#090b0f]/95 px-6 text-center">
          <p className="font-display text-xl font-bold text-amber-400">Graphics Context Interrupted</p>
          <p className="mt-2 max-w-md text-sm text-slate-300">
            Restoring hardware rendering surface. Progress is saved locally.
          </p>
        </div>
      )}

      {/* Portrait Mobile Orientation Prompt */}
      {isPortraitMobile && (
        <div className="fixed inset-x-4 top-4 z-40 rounded-lg border border-amber-500/40 bg-[#111722]/95 px-4 py-2.5 text-center text-xs text-amber-200">
          Rotate device to landscape for optimal visibility and dual-thumb controls.
        </div>
      )}

      {/* Active Gameplay Top HUD (Minimal, Zero Center Occlusion) */}
      {(hud.phase === 'playing' || hud.phase === 'dead') && (
        <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-start justify-between px-4 pt-3 sm:px-6 sm:pt-4">
          {/* Left Mission & Telemetry Readout (Clean unboxed typography) */}
          <div className="pointer-events-auto rounded-lg border border-slate-700/60 bg-[#0c1118]/85 px-3.5 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span className="font-display font-bold tracking-wide text-slate-100">Sector 01</span>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span className="font-mono-tabular font-semibold text-amber-300">{formatTime(hud.elapsedMs)}</span>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span className="font-mono-tabular text-slate-300">Deaths {hud.deaths}</span>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span className={hud.checkpointActive ? 'font-medium text-emerald-400' : 'text-slate-400'}>
                {hud.checkpointActive ? 'Checkpoint Secured' : 'No Checkpoint'}
              </span>
              <span aria-hidden="true" className="hidden text-slate-500 sm:inline">·</span>
              <span className="font-mono-tabular hidden text-slate-400 sm:inline">{hud.fps} FPS</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">{hud.objectiveText}</p>
          </div>

          {/* Right Quick Actions */}
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleSound}
              aria-label={save.soundEnabled ? 'Mute Audio' : 'Enable Audio'}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700/70 bg-[#0c1118]/85 text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
            >
              {save.soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-slate-400" />}
            </button>

            <button
              type="button"
              onClick={() => engineRef.current?.restartFromCheckpoint()}
              aria-label="Restart from Checkpoint"
              className="flex h-11 items-center gap-1.5 rounded-lg border border-slate-700/70 bg-[#0c1118]/85 px-3 text-xs font-medium text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Retry</span>
            </button>

            <button
              type="button"
              onClick={() => engineRef.current?.setPaused(true)}
              aria-label="Pause Game"
              className="flex h-11 items-center gap-1.5 rounded-lg border border-slate-700/70 bg-[#0c1118]/85 px-3 text-xs font-medium text-slate-200 transition-colors hover:border-amber-400/70 hover:text-amber-300"
            >
              <Pause className="h-4 w-4" />
              <span className="hidden sm:inline">Pause</span>
            </button>
          </div>
        </header>
      )}

      {/* Trap / Checkpoint Alert Banner */}
      {hud.phase === 'playing' && hud.trapBannerText && (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-20 flex justify-center px-4">
          <div
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-semibold tracking-wide ${
              hud.fakeExitTriggered
                ? 'border-red-500/80 bg-[#2a0c0c]/95 text-red-200'
                : 'border-emerald-500/70 bg-[#0b241c]/95 text-emerald-200'
            }`}
          >
            {hud.fakeExitTriggered ? <ShieldAlert className="h-4 w-4 text-red-400" /> : <Flag className="h-4 w-4 text-emerald-400" />}
            <span>{hud.trapBannerText}</span>
          </div>
        </div>
      )}

      {/* Death Overlay Flash */}
      {hud.phase === 'dead' && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-red-950/35">
          <div className="rounded-xl border border-red-500/60 bg-[#17090b]/95 px-6 py-4 text-center">
            <p className="font-display text-2xl font-bold tracking-wider text-red-400">SIGNAL LOST</p>
            <p className="mt-1 text-sm text-slate-200">{hud.deathReason ?? 'Hazard triggered'}</p>
            <p className="mt-1 text-xs text-slate-400">
              {hud.checkpointActive ? 'Respawning at checkpoint...' : 'Restarting sector...'}
            </p>
          </div>
        </div>
      )}

      {/* Mobile Dual-Thumb Virtual Joystick & Jump Button during play */}
      {hud.phase === 'playing' && (
        <TouchControls inputRef={virtualInputRef} movementMode={hud.movementMode} />
      )}

      {/* Title Screen Overlay */}
      {hud.phase === 'title' && engineReady && (
        <div className="fixed inset-0 z-30 flex items-center justify-between bg-gradient-to-r from-[#090b0f]/95 via-[#090b0f]/70 to-transparent px-6 py-6 sm:px-12">
          <div className="max-w-lg">
            <p className="text-xs font-semibold tracking-widest text-amber-400">OFFLINE PRECISION PLATFORMER</p>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-wider text-white sm:text-6xl">
              LAST CHANCE
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Your younger sister is trapped inside the decommissioned Bio-Containment Wing. Cross the facility corridor—watch every floor seam, catwalk plate, and even the exit signs.
            </p>

            {/* Primary Actions */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleStartNew}
                className="flex h-12 items-center gap-2 rounded-lg bg-amber-500 px-6 font-display text-sm font-bold tracking-wider text-slate-950 transition-colors hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-amber-300"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>START MISSION</span>
              </button>

              {save.checkpointReached && (
                <button
                  type="button"
                  onClick={handleContinueCheckpoint}
                  className="flex h-12 items-center gap-2 rounded-lg border border-emerald-500/60 bg-emerald-950/60 px-5 text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-900/70"
                >
                  <Flag className="h-4 w-4" />
                  <span>Resume Checkpoint</span>
                </button>
              )}
            </div>

            {/* Compact Offline Save Record + Graphics Tier Bar */}
            <div className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#0d121a]/90 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                <span>
                  Best Clear:{' '}
                  <strong className="font-mono-tabular text-slate-200">
                    {save.bestTimeMs !== null ? formatTime(save.bestTimeMs) : '--:--.-'}
                  </strong>
                </span>
                <span>
                  Total Deaths: <strong className="font-mono-tabular text-slate-200">{save.totalDeaths}</strong>
                </span>
                <span>
                  Rescues: <strong className="font-mono-tabular text-slate-200">{save.sisterRescuedCount}</strong>
                </span>
              </div>

              <div className="h-px bg-slate-800" />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 rounded-lg bg-[#080b10] p-1">
                  {(['low', 'medium', 'high'] as GraphicsQuality[]).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => handleQualityChange(tier)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                        save.graphicsQuality === tier
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggle30Fps}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      save.target30Fps
                        ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                        : 'border-slate-700 bg-slate-900 text-slate-300'
                    }`}
                  >
                    {save.target30Fps ? '30 FPS Cap' : '60 FPS'}
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleSound}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500"
                  >
                    {save.soundEnabled ? 'Audio On' : 'Audio Off'}
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                Desktop: WASD / Arrows to move · Shift to walk · Space to jump · R to retry. Mobile: Left joystick + Jump button.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pause & Settings Overlay */}
      {hud.phase === 'paused' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#07090d]/85 px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700/80 bg-[#101620] p-6">
            <h2 className="font-display text-2xl font-bold tracking-wide text-white">MISSION PAUSED</h2>
            <p className="mt-1 text-xs text-slate-400">Sector 01 · Offline Save Active</p>

            <div className="mt-5 space-y-4">
              <div>
                <p className="mb-2 text-xs font-semibold text-slate-300">Graphics Quality</p>
                <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-[#080b10] p-1">
                  {(['low', 'medium', 'high'] as GraphicsQuality[]).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => handleQualityChange(tier)}
                      className={`rounded-md py-2 text-xs font-semibold capitalize transition-colors ${
                        save.graphicsQuality === tier
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleToggle30Fps}
                  className={`flex-1 rounded-lg border py-2.5 text-xs font-semibold ${
                    save.target30Fps
                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                      : 'border-slate-700 bg-slate-900 text-slate-300'
                  }`}
                >
                  Frame Cap: {save.target30Fps ? '30 FPS (Battery)' : '60 FPS'}
                </button>
                <button
                  type="button"
                  onClick={handleToggleSound}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-900 py-2.5 text-xs font-semibold text-slate-200"
                >
                  Sound: {save.soundEnabled ? 'Enabled' : 'Muted'}
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => engineRef.current?.setPaused(false)}
                className="h-11 rounded-lg bg-amber-500 font-display text-sm font-bold tracking-wider text-slate-950 hover:bg-amber-400"
              >
                RESUME
              </button>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => engineRef.current?.restartFromCheckpoint()}
                  className="h-11 rounded-lg border border-slate-700 bg-slate-800/80 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                >
                  Restart Checkpoint
                </button>
                <button
                  type="button"
                  onClick={() => engineRef.current?.restartFullLevel()}
                  className="h-11 rounded-lg border border-slate-700 bg-slate-800/80 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                >
                  Restart Sector
                </button>
              </div>
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => engineRef.current?.returnToTitle()}
                  className="text-xs font-medium text-slate-400 hover:text-slate-200"
                >
                  Exit to Title
                </button>
                <button
                  type="button"
                  onClick={handleResetProgress}
                  className="text-xs font-medium text-red-400 hover:text-red-300"
                >
                  Reset Save Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Level Victory Overlay */}
      {hud.phase === 'victory' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#060a0e]/88 px-4">
          <div className="w-full max-w-md rounded-xl border border-emerald-500/50 bg-[#0d171c] p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-wider text-white">SECTOR 01 CLEARED</h2>
            <p className="mt-2 text-sm text-slate-300">
              You saw through the decoy bulkhead and reached Airlock B-2. Your sister is safe for now—deeper sectors await ahead.
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2 rounded-lg border border-slate-700/60 bg-[#091015] p-3">
              <div>
                <p className="text-[11px] text-slate-400">Clear Time</p>
                <p className="font-mono-tabular mt-0.5 text-sm font-bold text-emerald-300">
                  {formatTime(hud.elapsedMs)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400">Deaths</p>
                <p className="font-mono-tabular mt-0.5 text-sm font-bold text-slate-100">{hud.deaths}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400">Best Time</p>
                <p className="font-mono-tabular mt-0.5 text-sm font-bold text-amber-300">
                  {hud.bestTimeMs !== null ? formatTime(hud.bestTimeMs) : formatTime(hud.elapsedMs)}
                </p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleStartNew}
                className="h-11 flex-1 rounded-lg bg-emerald-500 font-display text-sm font-bold tracking-wider text-slate-950 hover:bg-emerald-400"
              >
                PLAY AGAIN
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.returnToTitle()}
                className="h-11 flex-1 rounded-lg border border-slate-600 bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700"
              >
                MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

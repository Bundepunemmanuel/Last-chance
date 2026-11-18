import { useEffect, useRef, useState } from 'react';
import {
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Play,
  Flag,
  ShieldAlert,
  CheckCircle2,
  Download,
  X,
  Settings,
} from 'lucide-react';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { mountGameEngine, type GameEngineHandle } from './game/engine';
import { loadSaveData, resetProgressSave } from './game/storage';
import { useAppUpdater } from './game/updater';
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
    introSubtitle: null,
    trapBannerText: null,
    deathReason: null,
    movementMode: 'idle',
    fps: 30,
    bestTimeMs: loadSaveData().bestTimeMs,
  }));

  const [engineReady, setEngineReady] = useState(false);
  const [showOsayemeSplash, setShowOsayemeSplash] = useState(true);
  const [contextLost, setContextLost] = useState(false);
  const [isPortraitMobile, setIsPortraitMobile] = useState(false);
  const [showTitleSettings, setShowTitleSettings] = useState(false);
  const [objectiveVisible, setObjectiveVisible] = useState(true);
  const lastObjectiveRef = useRef<string>('');

  // Hold OSAYEME studio intro briefly so users clearly see the studio intro on launch
  useEffect(() => {
    if (!engineReady) return;
    const timer = window.setTimeout(() => {
      setShowOsayemeSplash(false);
    }, 1700);
    return () => window.clearTimeout(timer);
  }, [engineReady]);

  const {
    appUpdateInfo,
    isDownloadingUpdate,
    triggerOneTapUpdate,
    dismissUpdateBanner,
  } = useAppUpdater();

  // Auto-fade objective hint after 3.5s so the 3D viewport stays unobstructed
  useEffect(() => {
    if (hud.phase !== 'playing') {
      lastObjectiveRef.current = '';
      setObjectiveVisible(true);
      return;
    }
    if (hud.objectiveText !== lastObjectiveRef.current) {
      lastObjectiveRef.current = hud.objectiveText;
      setObjectiveVisible(true);
      const timer = window.setTimeout(() => {
        setObjectiveVisible(false);
      }, 3600);
      return () => window.clearTimeout(timer);
    }
  }, [hud.phase, hud.objectiveText]);

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
    setShowTitleSettings(false);
    engineRef.current?.startNewRun(false);
    setSave(loadSaveData());
  };

  const handleContinueCheckpoint = () => {
    setShowTitleSettings(false);
    engineRef.current?.startNewRun(true);
    setSave(loadSaveData());
  };

  const handleResetProgress = () => {
    const fresh = resetProgressSave();
    setSave(fresh);
    setShowTitleSettings(false);
    engineRef.current?.returnToTitle();
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#090b0f] text-slate-100">
      {/* Dedicated WebGL Canvas Container */}
      <div ref={canvasHostRef} className="fixed inset-0 z-0 h-full w-full" />

      {/* OSAYEME Studio Boot Intro (replaces initializing screen) */}
      {(!engineReady || showOsayemeSplash) && (
        <button
          type="button"
          onClick={() => {
            if (engineReady) setShowOsayemeSplash(false);
          }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#090b0f] px-6 text-center focus:outline-none"
        >
          <span className="font-display text-4xl font-bold tracking-[0.28em] text-white sm:text-5xl">
            OSAYEME
          </span>
          <span className="mt-3 h-0.5 w-20 bg-amber-500/85" />
          <p className="mt-3 text-[11px] font-semibold tracking-[0.34em] text-amber-400/90">
            PRESENTS
          </p>
          {engineReady && (
            <span className="mt-6 text-[11px] tracking-wider text-slate-500">Tap to continue</span>
          )}
        </button>
      )}

      {/* WebGL Context Lost Recovery */}
      {contextLost && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#090b0f]/95 px-6 text-center">
          <p className="font-display text-xl font-bold text-amber-400">Graphics Context Interrupted</p>
          <p className="mt-2 max-w-md text-sm text-slate-300">
            Restoring rendering surface. Progress is saved locally.
          </p>
        </div>
      )}

      {/* Portrait Mobile Orientation Prompt */}
      {isPortraitMobile && (
        <div className="fixed inset-x-4 top-4 z-40 rounded-lg border border-amber-500/50 bg-[#111722]/95 px-4 py-2.5 text-center text-xs font-medium text-amber-200">
          Rotate device to landscape for dual-thumb controls.
        </div>
      )}

      {/* Active Gameplay Borderless Top HUD (Safe-Area Aware) */}
      {(hud.phase === 'playing' || hud.phase === 'dead') && (
        <header className="safe-hud-top pointer-events-none fixed inset-x-0 top-0 z-20 flex items-start justify-between">
          {/* Borderless high-contrast telemetry + auto-fading objective */}
          <div className="hud-text-shadow flex flex-col gap-1">
            <div className="flex items-center gap-2.5 text-sm">
              <span className="font-mono-tabular text-base font-bold text-amber-300">
                {formatTime(hud.elapsedMs)}
              </span>
              <span aria-hidden="true" className="text-slate-400/70">·</span>
              <span className="font-mono-tabular text-xs font-semibold text-slate-100">
                Deaths {hud.deaths}
              </span>
              {hud.checkpointActive && (
                <>
                  <span aria-hidden="true" className="text-slate-400/70">·</span>
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                    <Flag className="h-3.5 w-3.5" />
                    <span>Checkpoint</span>
                  </span>
                </>
              )}
              <span className="font-mono-tabular hidden text-xs text-slate-300/80 sm:inline">
                · {hud.fps} FPS
              </span>
            </div>

            {objectiveVisible && (
              <p className="max-w-xs text-xs font-medium text-slate-200/95 sm:max-w-md">
                {hud.objectiveText}
              </p>
            )}
          </div>

          {/* Right Compact Quick Actions (44px+ touch targets) */}
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => engineRef.current?.restartFromCheckpoint()}
              aria-label="Restart from Checkpoint"
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-600/60 bg-[#0b1017]/75 text-slate-200 transition-colors hover:border-slate-400 hover:text-white"
            >
              <RotateCcw className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => engineRef.current?.setPaused(true)}
              aria-label="Pause Game"
              className="flex h-11 items-center gap-1.5 rounded-lg border border-slate-600/60 bg-[#0b1017]/75 px-3.5 text-xs font-semibold text-slate-100 transition-colors hover:border-amber-400/80 hover:text-amber-300"
            >
              <Pause className="h-4 w-4" />
              <span className="hidden sm:inline">Pause</span>
            </button>
          </div>
        </header>
      )}

      {/* Trap / Checkpoint Alert Banner */}
      {hud.phase === 'playing' && hud.trapBannerText && (
        <div className="pointer-events-none fixed inset-x-0 top-14 z-20 flex justify-center px-4 sm:top-16">
          <div
            className={`flex items-center gap-2 rounded-lg border px-4 py-1.5 text-xs font-semibold tracking-wide ${
              hud.fakeExitTriggered
                ? 'border-red-500/80 bg-[#2a0c0c]/95 text-red-100'
                : 'border-emerald-500/70 bg-[#0b241c]/95 text-emerald-100'
            }`}
          >
            {hud.fakeExitTriggered ? (
              <ShieldAlert className="h-4 w-4 text-red-400" />
            ) : (
              <Flag className="h-4 w-4 text-emerald-400" />
            )}
            <span>{hud.trapBannerText}</span>
          </div>
        </div>
      )}

      {/* Death Edge Vignette + Instant Tap-to-Retry */}
      {hud.phase === 'dead' && (
        <button
          type="button"
          onClick={() => engineRef.current?.restartFromCheckpoint()}
          className="fixed inset-0 z-30 flex items-center justify-center bg-red-950/25 shadow-[inset_0_0_96px_rgba(220,38,38,0.68)] focus:outline-none"
        >
          <div className="rounded-xl border border-red-500/60 bg-[#14080a]/92 px-6 py-3.5 text-center">
            <p className="font-display text-xl font-bold tracking-wider text-red-400 sm:text-2xl">
              {hud.deathReason ?? 'TRAP TRIGGERED'}
            </p>
            <p className="mt-1 text-xs text-slate-300">
              {hud.checkpointActive ? 'Tap anywhere to respawn at checkpoint' : 'Tap anywhere to retry'}
            </p>
          </div>
        </button>
      )}

      {/* Floating Left-Zone Joystick & Right Jump Button */}
      {hud.phase === 'playing' && (
        <TouchControls inputRef={virtualInputRef} movementMode={hud.movementMode} />
      )}

      {/* 3D Story Intro Cutscene Overlay (Subtitles + Skip Intro) */}
      {hud.phase === 'intro' && (
        <div className="pointer-events-none fixed inset-0 z-30 flex flex-col justify-between">
          <div className="safe-hud-top flex items-center justify-between bg-gradient-to-b from-[#06080c]/95 to-transparent pb-6">
            <span className="text-[11px] font-semibold tracking-[0.24em] text-amber-400">
              OSAYEME · SECTOR 01 PROLOGUE
            </span>
          </div>

          <div className="safe-controls-bottom flex items-end justify-between gap-4 bg-gradient-to-t from-[#06080c]/95 via-[#06080c]/75 to-transparent pt-8">
            <p className="hud-text-shadow max-w-xl text-sm font-medium text-slate-100 sm:text-base">
              {hud.introSubtitle}
            </p>
            <button
              type="button"
              onClick={() => engineRef.current?.skipIntro()}
              className="pointer-events-auto flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-amber-500/60 bg-[#0b1017]/90 px-4 text-xs font-bold tracking-wider text-amber-300 transition-colors hover:bg-amber-500 hover:text-slate-950"
            >
              <span>SKIP INTRO</span>
            </button>
          </div>
        </div>
      )}

      {/* Landscape-Optimized Title Screen (Fits 360px+ height cleanly) */}
      {hud.phase === 'title' && engineReady && !showOsayemeSplash && !showTitleSettings && (
        <div className="safe-screen-pad fixed inset-0 z-30 flex flex-col justify-between bg-gradient-to-r from-[#090b0f]/94 via-[#090b0f]/68 to-transparent">
          {/* Top Bar: Sector Context + Update Banner / Settings Button */}
          <div className="flex items-start justify-between gap-4">
            <p className="text-[11px] font-semibold tracking-widest text-amber-400">
              SECTOR 01 · BIO-CONTAINMENT WING
            </p>

            <div className="flex items-center gap-2">
              {appUpdateInfo?.hasUpdate && (
                <div className="flex items-center gap-2 rounded-lg border border-sky-500/60 bg-[#0b1824]/95 px-3 py-1.5">
                  <Download className="h-4 w-4 shrink-0 text-sky-400" />
                  <span className="text-xs font-semibold text-sky-100">
                    New version available! ({appUpdateInfo.latestVersionName})
                  </span>
                  <button
                    type="button"
                    onClick={triggerOneTapUpdate}
                    disabled={isDownloadingUpdate}
                    className="rounded-md bg-sky-500 px-2.5 py-1 text-xs font-bold text-slate-950 hover:bg-sky-400 disabled:opacity-60"
                  >
                    {isDownloadingUpdate ? 'Updating...' : 'Update'}
                  </button>
                  <button
                    type="button"
                    onClick={dismissUpdateBanner}
                    aria-label="Dismiss update banner"
                    className="rounded p-1 text-slate-400 hover:text-slate-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowTitleSettings(true)}
                aria-label="Settings"
                className="flex h-11 items-center gap-2 rounded-lg border border-slate-700/80 bg-[#0e141d]/90 px-3.5 text-xs font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
              >
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </button>
            </div>
          </div>

          {/* Center-Left Hero Title & Primary Action */}
          <div className="my-auto max-w-md py-2">
            <h1 className="font-display text-4xl font-bold tracking-wider text-white sm:text-6xl">
              LAST CHANCE
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-slate-300 sm:text-sm">
              Your younger sister is trapped beyond the containment corridor. Watch every floor seam, catwalk plate, and exit sign.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2.5 sm:mt-5">
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
                  className="flex h-12 items-center gap-2 rounded-lg border border-emerald-500/60 bg-emerald-950/70 px-4 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-900/75 sm:text-sm"
                >
                  <Flag className="h-4 w-4" />
                  <span>Resume Checkpoint</span>
                </button>
              )}
            </div>
          </div>

          {/* Bottom Inline Record & Fine-Pointer Hint */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <div className="flex flex-wrap items-center gap-2.5">
              <span>
                Best Clear{' '}
                <strong className="font-mono-tabular text-slate-200">
                  {save.bestTimeMs !== null ? formatTime(save.bestTimeMs) : '--:--.-'}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Deaths <strong className="font-mono-tabular text-slate-200">{save.totalDeaths}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Rescues <strong className="font-mono-tabular text-slate-200">{save.sisterRescuedCount}</strong>
              </span>
            </div>

            <span className="hidden text-[11px] text-slate-400 [@media(hover:hover)_and_(pointer:fine)]:inline">
              WASD / Arrows move · Shift walk · Space jump · R retry
            </span>
          </div>
        </div>
      )}

      {/* Title Settings 2-Column Landscape Modal */}
      {hud.phase === 'title' && showTitleSettings && (
        <div className="safe-screen-pad fixed inset-0 z-40 flex items-center justify-center bg-[#07090d]/85">
          <div className="grid w-full max-w-xl grid-cols-1 gap-4 rounded-xl border border-slate-700/80 bg-[#101620] p-4 sm:grid-cols-2 sm:gap-6 sm:p-5">
            <div className="space-y-3">
              <div>
                <h2 className="font-display text-xl font-bold tracking-wide text-white">SETTINGS</h2>
                <p className="text-xs text-slate-400">Saved offline on this device</p>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold text-slate-300">Graphics Quality</p>
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-[#080b10] p-1">
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
            </div>

            <div className="flex flex-col justify-between gap-3">
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={handleToggle30Fps}
                  className={`flex h-11 w-full items-center justify-between rounded-lg border px-3.5 text-xs font-semibold ${
                    save.target30Fps
                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                      : 'border-slate-700 bg-slate-900 text-slate-300'
                  }`}
                >
                  <span>Frame Rate Cap</span>
                  <span>{save.target30Fps ? '30 FPS (Battery)' : '60 FPS'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleSound}
                  className="flex h-11 w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-3.5 text-xs font-semibold text-slate-200"
                >
                  <span className="flex items-center gap-2">
                    {save.soundEnabled ? <Volume2 className="h-4 w-4 text-amber-400" /> : <VolumeX className="h-4 w-4 text-slate-400" />}
                    <span>Audio</span>
                  </span>
                  <span>{save.soundEnabled ? 'On' : 'Muted'}</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleResetProgress}
                  className="text-xs font-medium text-red-400 hover:text-red-300"
                >
                  Reset Save Data
                </button>
                <button
                  type="button"
                  onClick={() => setShowTitleSettings(false)}
                  className="h-10 rounded-lg bg-amber-500 px-5 font-display text-xs font-bold tracking-wider text-slate-950 hover:bg-amber-400"
                >
                  DONE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2-Column Landscape Pause Modal (Fits 360px height cleanly) */}
      {hud.phase === 'paused' && (
        <div className="safe-screen-pad fixed inset-0 z-40 flex items-center justify-center bg-[#07090d]/85">
          <div className="grid w-full max-w-xl grid-cols-1 gap-4 rounded-xl border border-slate-700/80 bg-[#101620] p-4 sm:grid-cols-2 sm:gap-6 sm:p-5">
            {/* Left: Settings */}
            <div className="space-y-3">
              <div>
                <h2 className="font-display text-xl font-bold tracking-wide text-white">PAUSED</h2>
                <p className="text-xs text-slate-400">Sector 01 · {formatTime(hud.elapsedMs)}</p>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold text-slate-300">Graphics Quality</p>
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-[#080b10] p-1">
                  {(['low', 'medium', 'high'] as GraphicsQuality[]).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => handleQualityChange(tier)}
                      className={`rounded-md py-1.5 text-xs font-semibold capitalize transition-colors ${
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

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleToggle30Fps}
                  className={`h-10 rounded-lg border text-xs font-semibold ${
                    save.target30Fps
                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                      : 'border-slate-700 bg-slate-900 text-slate-300'
                  }`}
                >
                  {save.target30Fps ? '30 FPS' : '60 FPS'}
                </button>
                <button
                  type="button"
                  onClick={handleToggleSound}
                  className="h-10 rounded-lg border border-slate-700 bg-slate-900 text-xs font-semibold text-slate-200"
                >
                  {save.soundEnabled ? 'Audio On' : 'Muted'}
                </button>
              </div>
            </div>

            {/* Right: Mission Actions */}
            <div className="flex flex-col justify-center gap-2">
              <button
                type="button"
                onClick={() => engineRef.current?.setPaused(false)}
                className="h-11 rounded-lg bg-amber-500 font-display text-sm font-bold tracking-wider text-slate-950 hover:bg-amber-400"
              >
                RESUME
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.restartFromCheckpoint()}
                className="h-10 rounded-lg border border-slate-700 bg-slate-800/80 text-xs font-semibold text-slate-200 hover:bg-slate-800"
              >
                Restart Checkpoint
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => engineRef.current?.restartFullLevel()}
                  className="h-10 rounded-lg border border-slate-700 bg-slate-800/80 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                >
                  Restart Sector
                </button>
                <button
                  type="button"
                  onClick={() => engineRef.current?.returnToTitle()}
                  className="h-10 rounded-lg border border-slate-700 bg-slate-900 text-xs font-semibold text-slate-300 hover:text-white"
                >
                  Main Menu
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2-Column Landscape Victory Modal */}
      {hud.phase === 'victory' && (
        <div className="safe-screen-pad fixed inset-0 z-40 flex items-center justify-center bg-[#060a0e]/88">
          <div className="grid w-full max-w-xl grid-cols-1 items-center gap-4 rounded-xl border border-emerald-500/50 bg-[#0d171c] p-4 sm:grid-cols-2 sm:gap-6 sm:p-5">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="font-display text-2xl font-bold tracking-wider text-white">SECTOR 01 CLEARED</h2>
                  <p className="text-xs text-emerald-300">Airlock B-2 Reached</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-300">
                You bypassed the decoy bulkhead and reached your sister at Airlock B-2. Deeper sectors await ahead.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-700/60 bg-[#091015] p-3 text-center">
                <div>
                  <p className="text-[11px] text-slate-400">Time</p>
                  <p className="font-mono-tabular mt-0.5 text-sm font-bold text-emerald-300">
                    {formatTime(hud.elapsedMs)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400">Deaths</p>
                  <p className="font-mono-tabular mt-0.5 text-sm font-bold text-slate-100">{hud.deaths}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400">Best</p>
                  <p className="font-mono-tabular mt-0.5 text-sm font-bold text-amber-300">
                    {hud.bestTimeMs !== null ? formatTime(hud.bestTimeMs) : formatTime(hud.elapsedMs)}
                  </p>
                </div>
              </div>

              <div className="flex gap-2.5">
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
        </div>
      )}
    </div>
  );
}

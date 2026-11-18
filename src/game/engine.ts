import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { createFacilityTextures, type FacilityTextures } from './textures';
import { createMaleProtagonist, type PlayerRig } from './character';
import { type LevelInstance } from './levelOne';
import { buildSectorLevel, getSectorMeta, SECTORS } from './levels';
import { soundEngine } from './audio';
import { loadSaveData, updateSaveData } from './storage';
import type { GamePhase, GraphicsQuality, HudState, MovementMode, VirtualInputState } from './types';

// Pre-allocated math helpers (zero GC inside animation loop)
const _desiredCamPos = new THREE.Vector3();
const _desiredLookAt = new THREE.Vector3();
const _currentLookAt = new THREE.Vector3(0, 1.2, -3);
const _playerPos = new THREE.Vector3();
const _moveDir = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export interface GameEngineHandle {
  startNewRun: (fromCheckpoint?: boolean) => void;
  selectSector: (sectorId: number) => void;
  playNextSector: () => void;
  skipIntro: () => void;
  restartFromCheckpoint: () => void;
  restartFullLevel: () => void;
  setPaused: (paused: boolean) => void;
  returnToTitle: () => void;
  applyGraphicsQuality: (q: GraphicsQuality) => void;
  applyTarget30Fps: (enabled: boolean) => void;
  applySoundEnabled: (enabled: boolean) => void;
  dispose: () => void;
}

export async function mountGameEngine(
  container: HTMLElement,
  virtualInputRef: { current: VirtualInputState },
  onHudUpdate: (hud: HudState) => void,
  onContextLost: (lost: boolean) => void,
): Promise<GameEngineHandle> {
  await RAPIER.init();

  const initialSave = loadSaveData();
  soundEngine.setEnabled(initialSave.soundEnabled);
  soundEngine.preload();

  const isSoftwareGl = detectSoftwareWebGL();
  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);

  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.appendChild(canvas);

  const handleContextLost = (e: Event) => {
    e.preventDefault();
    onContextLost(true);
  };
  const handleContextRestored = () => {
    onContextLost(false);
  };
  canvas.addEventListener('webglcontextlost', handleContextLost);
  canvas.addEventListener('webglcontextrestored', handleContextRestored);

  const scene = new THREE.Scene();
  const fogColor = 0x0c1118;
  scene.background = new THREE.Color(fogColor);
  scene.fog = new THREE.FogExp2(fogColor, 0.026);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  pmremGenerator.dispose();

  const camera = new THREE.PerspectiveCamera(
    54,
    (container.clientWidth || window.innerWidth) / Math.max(1, container.clientHeight || window.innerHeight),
    0.1,
    140,
  );
  camera.position.set(3.2, 3.2, 6.8);

  // Balanced 3-Point Facility Lighting (1 shadow-casting directional key + cool/warm hemisphere + rim)
  const hemiLight = new THREE.HemisphereLight(0x88b4e6, 0x2a1d17, 0.85);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xffe4c4, 1.85);
  keyLight.position.set(10, 18, 12);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 55;
  keyLight.shadow.camera.left = -16;
  keyLight.shadow.camera.right = 16;
  keyLight.shadow.camera.top = 16;
  keyLight.shadow.camera.bottom = -16;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight);
  scene.add(keyLight.target);

  const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.65);
  rimLight.position.set(-12, 8, -22);
  scene.add(rimLight);

  // Atmospheric facility dust particles (Points, pre-allocated buffer)
  const dustCount = 240;
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = (Math.random() - 0.5) * 14;
    dustPositions[i * 3 + 1] = Math.random() * 6.5;
    dustPositions[i * 3 + 2] = 4 - Math.random() * 82;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0x94a3b8,
    size: 0.06,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  scene.add(dustPoints);

  // Build procedural PBR textures, protagonist, and level
  const textures: FacilityTextures = createFacilityTextures(renderer.capabilities.getMaxAnisotropy());
  const playerRig: PlayerRig = createMaleProtagonist(textures.contactShadowTex, textures.jacketFabricColor);
  scene.add(playerRig.root);
  scene.add(playerRig.contactShadow);

  // Rapier Physics World & Active Sector Level
  let currentSector = Math.min(SECTORS.length, Math.max(1, initialSave.selectedSector));
  let world!: RAPIER.World;
  let level!: LevelInstance;
  let playerBody!: RAPIER.RigidBody;
  let playerCollider!: RAPIER.Collider;
  let characterController!: RAPIER.KinematicCharacterController;

  const playerRadius = 0.3;
  const playerHalfHeight = 0.55; // Total capsule height = 1.70m; center at +0.85 above feet

  const applySectorAtmosphere = (lvl: LevelInstance) => {
    const fogHex = lvl.atmosphere?.fogHex ?? 0x0c1118;
    const keyHex = lvl.atmosphere?.keyHex ?? 0xffe4c4;
    const rimHex = lvl.atmosphere?.rimHex ?? 0x38bdf8;
    scene.background = new THREE.Color(fogHex);
    scene.fog = new THREE.FogExp2(fogHex, 0.025);
    keyLight.color.setHex(keyHex);
    rimLight.color.setHex(rimHex);
  };

  const buildWorldAndSector = (sectorId: number) => {
    if (characterController) characterController.free();
    if (world) world.free();
    if (level) {
      scene.remove(level.group);
      level.dispose();
    }

    world = new RAPIER.World({ x: 0, y: -22.0, z: 0 });
    level = buildSectorLevel(sectorId, RAPIER, world, textures);
    scene.add(level.group);
    applySectorAtmosphere(level);

    playerBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(level.spawnPos.x, level.spawnPos.y, level.spawnPos.z),
    );
    playerCollider = world.createCollider(
      RAPIER.ColliderDesc.capsule(playerHalfHeight, playerRadius),
      playerBody,
    );
    characterController = world.createCharacterController(0.04);
    characterController.enableAutostep(0.32, 0.14, true);
    characterController.enableSnapToGround(0.24);
    characterController.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    characterController.setMinSlopeSlideAngle((52 * Math.PI) / 180);
    characterController.setSlideEnabled(true);
  };

  buildWorldAndSector(currentSector);

  // Quality & Performance configuration
  let currentQuality: GraphicsQuality = initialSave.graphicsQuality;
  let target30Fps = initialSave.target30Fps;

  const applyGraphicsQuality = (q: GraphicsQuality) => {
    currentQuality = q;
    updateSaveData({ graphicsQuality: q });

    if (q === 'low') {
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 0.85));
      renderer.shadowMap.enabled = false;
      keyLight.castShadow = false;
      playerRig.headlamp.intensity = 0;
      dustPoints.visible = false;
      for (const el of level.emergencyLights) el.intensity = 0.7;
    } else if (q === 'medium') {
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.15));
      renderer.shadowMap.enabled = !isSoftwareGl;
      keyLight.castShadow = !isSoftwareGl;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.map?.dispose();
      keyLight.shadow.map = null;
      playerRig.headlamp.intensity = 2.0;
      dustPoints.visible = true;
      for (const el of level.emergencyLights) el.intensity = 1.9;
    } else {
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2.0));
      renderer.shadowMap.enabled = !isSoftwareGl;
      keyLight.castShadow = !isSoftwareGl;
      keyLight.shadow.mapSize.set(2048, 2048);
      keyLight.shadow.map?.dispose();
      keyLight.shadow.map = null;
      playerRig.headlamp.intensity = 2.8;
      dustPoints.visible = true;
      for (const el of level.emergencyLights) el.intensity = 2.6;
    }
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  };

  applyGraphicsQuality(currentQuality);

  if (!isSoftwareGl) {
    renderer.compile(scene, camera);
  }

  // Gameplay Runtime State
  let phase: GamePhase = 'title';
  let elapsedRunMs = 0;
  let runDeaths = 0;
  let totalLifetimeDeaths = initialSave.totalDeaths;
  let bestTimeMs = initialSave.bestTimeMs;
  let checkpointActive = initialSave.checkpointReached;
  if (checkpointActive) {
    level.activateCheckpointVisuals();
  }

  let velocityY = 0;
  let coyoteTimer = 0;
  let jumpBufferTimer = 0;
  let prevJumpPressed = false;
  let grounded = true;
  let lastGroundedHandle: number | null = null;
  let facingYaw = 0; // 0 faces -Z
  let deathTimer = 0;
  let deathReason: string | null = null;
  let trapBannerText: string | null = null;
  let trapBannerTimer = 0;
  let introTimer = 0;
  let introBeepTriggered = false;
  let introSubtitle: string | null = null;
  let footstepTimer = 0;
  let movementMode: MovementMode = 'idle';
  let shakeIntensity = 0;

  // Keyboard tracking
  const keys = new Set<string>();
  const onKeyDown = (e: KeyboardEvent) => {
    keys.add(e.code);
    if (phase === 'intro' && (e.code === 'Space' || e.code === 'Enter')) {
      skipIntro();
      return;
    }
    if (e.code === 'KeyR' && (phase === 'playing' || phase === 'dead')) {
      restartFromCheckpoint();
    } else if ((e.code === 'Escape' || e.code === 'KeyP') && (phase === 'playing' || phase === 'paused')) {
      setPaused(phase === 'playing');
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  const onResize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = Math.max(1, container.clientHeight || window.innerHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  const pushHud = (fpsValue: number) => {
    const meta = getSectorMeta(currentSector);
    let objective = `Cross ${meta.shortName} — reach the exit.`;
    if (level.fakeExitTriggered) {
      objective = `TRAP! Reach ${meta.airlockLabel} to save your sister!`;
    } else if (checkpointActive) {
      objective = `Navigate the machinery gauntlet to ${meta.airlockLabel}.`;
    }
    onHudUpdate({
      phase,
      currentSector,
      totalSectors: SECTORS.length,
      sectorTitle: meta.title,
      elapsedMs: elapsedRunMs,
      deaths: runDeaths,
      checkpointActive,
      fakeExitTriggered: level.fakeExitTriggered,
      objectiveText: objective,
      introSubtitle,
      sisterQuote: phase === 'victory' ? 'Why the fuck did you take so long to rescue me?!' : null,
      trapBannerText,
      deathReason,
      movementMode,
      fps: fpsValue,
      bestTimeMs,
    });
  };

  const placePlayerAt = (pos: THREE.Vector3) => {
    playerBody.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    playerBody.setNextKinematicTranslation({ x: pos.x, y: pos.y, z: pos.z });
    velocityY = 0;
    coyoteTimer = 0;
    jumpBufferTimer = 0;
    facingYaw = 0;
    playerRig.root.position.set(pos.x, pos.y - 0.85, pos.z);
    playerRig.root.rotation.y = 0;
    _playerPos.copy(playerRig.root.position);
  };

  const triggerDeath = (reason: string) => {
    if (phase !== 'playing') return;
    phase = 'dead';
    deathTimer = 0;
    shakeIntensity = 0.28;
    deathReason = reason;
    runDeaths += 1;
    totalLifetimeDeaths += 1;
    updateSaveData({ totalDeaths: totalLifetimeDeaths });
    soundEngine.playDeath();
    pushHud(currentFps);
  };

  const skipIntro = () => {
    if (phase !== 'intro') return;
    introSubtitle = null;
    level.setShutterProgress(1);
    camera.position.set(_playerPos.x * 0.72, Math.max(1.2, _playerPos.y + 3.45), _playerPos.z + 6.3);
    _currentLookAt.set(_playerPos.x * 0.85, _playerPos.y + 1.05, _playerPos.z - 2.6);
    camera.lookAt(_currentLookAt);
    phase = 'playing';
    pushHud(currentFps);
  };

  const startNewRun = (fromCheckpoint = false) => {
    soundEngine.unlock();
    level.resetTraps();
    deathReason = null;
    trapBannerText = null;
    trapBannerTimer = 0;
    if (!fromCheckpoint) {
      checkpointActive = false;
      elapsedRunMs = 0;
      runDeaths = 0;
      updateSaveData({ checkpointReached: false, totalRuns: loadSaveData().totalRuns + 1 });
      placePlayerAt(level.spawnPos);
      introTimer = 0;
      introBeepTriggered = false;
      introSubtitle = "Stay behind the glass — I'm coming to get you!";
      phase = 'intro';
    } else {
      introSubtitle = null;
      placePlayerAt(checkpointActive ? level.checkpointPos : level.spawnPos);
      phase = 'playing';
    }
    pushHud(currentFps);
  };

  const restartFromCheckpoint = () => {
    soundEngine.unlock();
    level.resetTraps();
    placePlayerAt(checkpointActive ? level.checkpointPos : level.spawnPos);
    deathReason = null;
    trapBannerText = null;
    trapBannerTimer = 0;
    introSubtitle = null;
    phase = 'playing';
    pushHud(currentFps);
  };

  const restartFullLevel = () => {
    soundEngine.unlock();
    level.resetTraps();
    checkpointActive = false;
    elapsedRunMs = 0;
    runDeaths = 0;
    updateSaveData({ checkpointReached: false, totalRuns: loadSaveData().totalRuns + 1 });
    placePlayerAt(level.spawnPos);
    deathReason = null;
    trapBannerText = null;
    trapBannerTimer = 0;
    introSubtitle = null;
    phase = 'playing';
    pushHud(currentFps);
  };

  const setPaused = (paused: boolean) => {
    if (phase === 'playing' && paused) {
      phase = 'paused';
      pushHud(currentFps);
    } else if (phase === 'paused' && !paused) {
      phase = 'playing';
      pushHud(currentFps);
    }
  };

  const selectSector = (sectorId: number) => {
    const clamped = Math.min(SECTORS.length, Math.max(1, sectorId));
    if (clamped !== currentSector) {
      currentSector = clamped;
      checkpointActive = false;
      updateSaveData({ selectedSector: clamped, checkpointReached: false });
      buildWorldAndSector(currentSector);
      applyGraphicsQuality(currentQuality);
    } else {
      level.resetTraps();
    }
    elapsedRunMs = 0;
    runDeaths = 0;
    lastGroundedHandle = null;
    deathReason = null;
    trapBannerText = null;
    trapBannerTimer = 0;
    introSubtitle = null;
    placePlayerAt(level.spawnPos);
    phase = 'title';
    pushHud(currentFps);
  };

  const playNextSector = () => {
    const nextId = currentSector < SECTORS.length ? currentSector + 1 : 1;
    selectSector(nextId);
    startNewRun(false);
  };

  const returnToTitle = () => {
    level.resetTraps();
    lastGroundedHandle = null;
    placePlayerAt(level.spawnPos);
    phase = 'title';
    pushHud(currentFps);
  };

  const applyTarget30Fps = (enabled: boolean) => {
    target30Fps = enabled;
    updateSaveData({ target30Fps: enabled });
  };

  const applySoundEnabled = (enabled: boolean) => {
    soundEngine.setEnabled(enabled);
    updateSaveData({ soundEnabled: enabled });
  };

  // Place player initially at spawn
  placePlayerAt(level.spawnPos);

  // Main Animation & Fixed-Timestep Physics Loop
  let disposed = false;
  let frameId = 0;
  let lastPerfTime = performance.now();
  let totalElapsed = 0;
  let physicsAccumulator = 0;
  const fixedDt = 1 / 60;

  let fpsFrames = 0;
  let fpsTimer = 0;
  let currentFps = 30;
  let hudSyncTimer = 0;

  // Software-WebGL frame pacing helper per Three.js skill
  const afterDraw = (cb: () => void) => {
    if (disposed) return;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    } else {
      frameId = window.setTimeout(cb, 80);
    }
  };

  const stepSimulation = (dt: number) => {
    totalElapsed += dt;

    if (trapBannerTimer > 0) {
      trapBannerTimer -= dt;
      if (trapBannerTimer <= 0) {
        trapBannerText = null;
      }
    }

    if (phase === 'title') {
      // Gentle atmospheric orbit framing both protagonist & sister inside observation bay
      playerRig.updateAnimation(dt, 0, 6.6, true, 0, false);
      level.updateAmbient(dt);
      _desiredCamPos.set(1.6 + Math.sin(totalElapsed * 0.35) * 1.4, 2.35, 6.0);
      _desiredLookAt.set(-1.1, 1.15, -1.8);
      camera.position.x = THREE.MathUtils.damp(camera.position.x, _desiredCamPos.x, 4, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, _desiredCamPos.y, 4, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, _desiredCamPos.z, 4, dt);
      _currentLookAt.lerp(_desiredLookAt, 1 - Math.exp(-5 * dt));
      camera.lookAt(_currentLookAt);
      return;
    }

    if (phase === 'intro') {
      introTimer += dt;
      playerRig.updateAnimation(dt, 0, 6.6, true, 0, false);
      level.updateAmbient(dt);

      const meta = getSectorMeta(currentSector);
      if (introTimer < 2.3) {
        introSubtitle = "Wait behind the glass — I'm coming to get you!";
        _desiredCamPos.set(-1.6, 1.55, 0.2 - introTimer * 0.55);
        _desiredLookAt.set(-4.65, 1.25, -1.6);
      } else if (introTimer < 4.4) {
        if (!introBeepTriggered) {
          introBeepTriggered = true;
          soundEngine.playIntroLockdown();
        }
        level.setShutterProgress((introTimer - 2.3) / 1.5);
        introSubtitle = meta.introLockdownLine;
        _desiredCamPos.set(0.85, 2.25, 2.6);
        _desiredLookAt.set(-1.1, 1.2, -0.4);
      } else {
        level.setShutterProgress(1);
        introSubtitle = meta.introFinalLine;
        _desiredCamPos.set(_playerPos.x * 0.72, Math.max(1.2, _playerPos.y + 3.45), _playerPos.z + 6.3);
        _desiredLookAt.set(_playerPos.x * 0.85, _playerPos.y + 1.05, _playerPos.z - 2.6);
      }

      camera.position.x = THREE.MathUtils.damp(camera.position.x, _desiredCamPos.x, 4.5, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, _desiredCamPos.y, 4.5, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, _desiredCamPos.z, 4.5, dt);
      _currentLookAt.lerp(_desiredLookAt, 1 - Math.exp(-5.5 * dt));
      camera.lookAt(_currentLookAt);

      if (introTimer >= 6.2) {
        skipIntro();
      }
      return;
    }

    if (phase === 'paused' || phase === 'victory') {
      level.updateAmbient(dt);
      return;
    }

    if (phase === 'dead') {
      deathTimer += dt;
      playerRig.updateAnimation(dt, 0, 6.6, true, 0, true);
      if (shakeIntensity > 0.001) {
        shakeIntensity = Math.max(0, shakeIntensity - dt * 1.1);
        camera.position.x += (Math.random() - 0.5) * shakeIntensity;
        camera.position.y += (Math.random() - 0.5) * shakeIntensity;
      }
      const skipRequested =
        deathTimer >= 0.16 &&
        (keys.has('Space') || keys.has('KeyR') || virtualInputRef.current.jumpPressed);
      if (deathTimer >= 0.65 || skipRequested) {
        restartFromCheckpoint();
      }
      return;
    }

    // phase === 'playing'
    elapsedRunMs += dt * 1000;

    // 1. Gather Movement Input (Keyboard + Mobile Virtual Joystick)
    let inputX = virtualInputRef.current.moveX;
    let inputY = virtualInputRef.current.moveY; // +1 forward (-Z), -1 backward (+Z)

    const kbX = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const kbY = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);

    if (Math.abs(kbX) > 0.05 || Math.abs(kbY) > 0.05) {
      inputX = kbX;
      inputY = kbY;
    }

    const rawMag = Math.hypot(inputX, inputY);
    const clampedMag = Math.min(1, rawMag);
    if (rawMag > 1) {
      inputX /= rawMag;
      inputY /= rawMag;
    }

    const walkOnly = keys.has('ShiftLeft') || keys.has('ShiftRight') || virtualInputRef.current.walkModifier;
    const isWalkingSpeed = walkOnly || (clampedMag > 0.12 && clampedMag < 0.56);
    const targetSpeed =
      clampedMag < 0.12 ? 0 : isWalkingSpeed ? 3.2 * Math.min(1, clampedMag / 0.5) : 6.6 * clampedMag;

    _moveDir.set(inputX, 0, -inputY);
    if (_moveDir.lengthSq() > 0.0001) {
      _moveDir.normalize();
      const targetYaw = Math.atan2(-_moveDir.x, -_moveDir.z);
      let angleDiff = targetYaw - facingYaw;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      facingYaw += angleDiff * (1 - Math.exp(-14 * dt));
    }

    const jumpDown =
      keys.has('Space') || keys.has('KeyJ') || virtualInputRef.current.jumpPressed;
    const jumpJustPressed = jumpDown && !prevJumpPressed;
    prevJumpPressed = jumpDown;

    if (jumpJustPressed) {
      jumpBufferTimer = 0.13;
    } else if (jumpBufferTimer > 0) {
      jumpBufferTimer -= dt;
    }

    if (grounded) {
      coyoteTimer = 0.11;
    } else if (coyoteTimer > 0) {
      coyoteTimer -= dt;
    }

    if (jumpBufferTimer > 0 && coyoteTimer > 0) {
      velocityY = 8.9;
      grounded = false;
      coyoteTimer = 0;
      jumpBufferTimer = 0;
      soundEngine.playJump();
    }

    // 2. Fixed-step Rapier Physics Integration
    physicsAccumulator = Math.min(0.1, physicsAccumulator + dt);
    let groundedHandle: number | null = null;
    let carryAppliedThisFrame = false;

    while (physicsAccumulator >= fixedDt) {
      physicsAccumulator -= fixedDt;

      // Apply gravity
      if (!grounded) {
        velocityY = Math.max(-24, velocityY - 22.0 * fixedDt);
      } else if (velocityY < 0) {
        velocityY = -2.2; // Gentle downward snap to stay glued to moving/stepped platforms
      }

      let desiredX = _moveDir.x * targetSpeed * fixedDt;
      let desiredZ = _moveDir.z * targetSpeed * fixedDt;
      let desiredY = velocityY * fixedDt;

      if (!carryAppliedThisFrame && lastGroundedHandle !== null) {
        const carry = level.getPlatformDelta?.(lastGroundedHandle);
        if (carry) {
          desiredX += carry.x;
          desiredY += carry.y;
          desiredZ += carry.z;
        }
        carryAppliedThisFrame = true;
      }

      characterController.computeColliderMovement(
        playerCollider,
        { x: desiredX, y: desiredY, z: desiredZ },
        undefined,
        undefined,
        (col) => col.handle !== playerCollider.handle && !col.isSensor(),
      );

      const wasGrounded = grounded;
      grounded = characterController.computedGrounded();
      if (!wasGrounded && grounded && velocityY < -4.5) {
        soundEngine.playLand();
      }
      if (grounded && velocityY < 0) {
        velocityY = 0;
      }

      // Check collisions against moving machinery hazards or collapsing/moving platforms
      groundedHandle = null;
      const numCols = characterController.numComputedCollisions();
      for (let i = 0; i < numCols; i++) {
        const colInfo = characterController.computedCollision(i);
        const hitCol = colInfo?.collider;
        if (!hitCol) continue;
        if (level.hazardColliderHandles.has(hitCol.handle)) {
          triggerDeath('Crushed by facility machinery');
          break;
        }
        if (colInfo.normal1 && colInfo.normal1.y > 0.5) {
          groundedHandle = hitCol.handle;
        }
      }
      lastGroundedHandle = grounded ? groundedHandle : null;

      const moved = characterController.computedMovement();
      const cur = playerBody.translation();
      playerBody.setNextKinematicTranslation({
        x: cur.x + moved.x,
        y: cur.y + moved.y,
        z: cur.z + moved.z,
      });

      world.step();
    }

    // Sync visual protagonist mesh to physics body
    const bodyPos = playerBody.translation();
    playerRig.root.position.set(bodyPos.x, bodyPos.y - 0.85, bodyPos.z);
    playerRig.root.rotation.y = facingYaw;
    _playerPos.copy(playerRig.root.position);

    // Position contact shadow right under feet (tracks platform surface or hides over abyss)
    playerRig.contactShadow.position.set(bodyPos.x, bodyPos.y - 0.83, bodyPos.z);
    playerRig.contactShadow.visible = grounded;

    // Keep shadow camera centered around protagonist for crisp local shadows
    keyLight.position.set(bodyPos.x + 10, bodyPos.y + 18, bodyPos.z + 12);
    keyLight.target.position.set(bodyPos.x, bodyPos.y, bodyPos.z - 2);

    // Movement mode & footstep audio
    if (!grounded) {
      movementMode = 'air';
    } else if (targetSpeed < 0.2) {
      movementMode = 'idle';
    } else if (isWalkingSpeed) {
      movementMode = 'walk';
    } else {
      movementMode = 'run';
    }

    if (grounded && targetSpeed > 0.5) {
      footstepTimer -= dt;
      if (footstepTimer <= 0) {
        const running = movementMode === 'run';
        soundEngine.playFootstep(running);
        footstepTimer = running ? 0.28 : 0.46;
      }
    } else {
      footstepTimer = 0.08;
    }

    playerRig.updateAnimation(dt, targetSpeed, 6.6, grounded, velocityY, false);

    // 3. Level Traps, Checkpoint & Victory
    level.update(
      dt,
      totalElapsed,
      _playerPos,
      groundedHandle,
      (msg) => {
        trapBannerText = msg;
        trapBannerTimer = 2.6;
        if (msg.includes('DECOY')) {
          shakeIntensity = 0.16;
        }
      },
      () => {
        checkpointActive = true;
        updateSaveData({ checkpointReached: true });
      },
      () => {
        phase = 'victory';
        const isBest = bestTimeMs === null || elapsedRunMs < bestTimeMs;
        if (isBest) {
          bestTimeMs = elapsedRunMs;
        }
        const prev = loadSaveData();
        const cleared = prev.clearedSectors.includes(currentSector)
          ? prev.clearedSectors
          : [...prev.clearedSectors, currentSector];
        updateSaveData({
          bestTimeMs,
          unlockedSector: Math.max(prev.unlockedSector, Math.min(SECTORS.length, currentSector + 1)),
          clearedSectors: cleared,
          checkpointReached: false,
          sisterRescuedCount: prev.sisterRescuedCount + 1,
        });
        pushHud(currentFps);
      },
      (reason) => {
        triggerDeath(reason);
      },
    );

    // Abyss fall check
    if (phase === 'playing' && _playerPos.y < level.abyssY) {
      triggerDeath('Fell into reactor chasm');
    }

    // 4. Smooth Third-Person Follow Camera
    _desiredCamPos.set(
      _playerPos.x * 0.72,
      Math.max(1.2, _playerPos.y + 3.45),
      _playerPos.z + 6.3,
    );
    _desiredLookAt.set(_playerPos.x * 0.85, _playerPos.y + 1.05, _playerPos.z - 2.6);

    camera.position.x = THREE.MathUtils.damp(camera.position.x, _desiredCamPos.x, 7.5, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, _desiredCamPos.y, 6.5, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, _desiredCamPos.z, 8.5, dt);
    if (shakeIntensity > 0.001) {
      shakeIntensity = Math.max(0, shakeIntensity - dt * 0.9);
      camera.position.x += (Math.random() - 0.5) * shakeIntensity;
      camera.position.y += (Math.random() - 0.5) * shakeIntensity;
    }
    _currentLookAt.lerp(_desiredLookAt, 1 - Math.exp(-9.0 * dt));
    camera.lookAt(_currentLookAt);
  };

  const tick = () => {
    if (disposed) return;

    const now = performance.now();
    const rawDt = (now - lastPerfTime) / 1000;

    // 30 FPS pacing mode for entry-level Android battery/thermal optimization (real GPUs)
    if (!isSoftwareGl && target30Fps && rawDt < 0.030) {
      frameId = requestAnimationFrame(tick);
      return;
    }

    lastPerfTime = now;
    const dt = Math.min(0.05, Math.max(0.001, rawDt));

    stepSimulation(dt);
    renderer.render(scene, camera);

    // FPS & HUD telemetry sync (~10Hz to keep React tree super light)
    fpsFrames += 1;
    fpsTimer += rawDt;
    if (fpsTimer >= 0.5) {
      currentFps = Math.round(fpsFrames / fpsTimer);
      fpsFrames = 0;
      fpsTimer = 0;
    }

    hudSyncTimer += dt;
    if (hudSyncTimer >= 0.09) {
      hudSyncTimer = 0;
      pushHud(currentFps);
    }

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }
  };

  // Start initial render & loop
  pushHud(currentFps);
  tick();

  return {
    startNewRun,
    selectSector,
    playNextSector,
    skipIntro,
    restartFromCheckpoint,
    restartFullLevel,
    setPaused,
    returnToTitle,
    applyGraphicsQuality,
    applyTarget30Fps,
    applySoundEnabled,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);

      characterController.free();
      world.free();
      level.dispose();
      playerRig.dispose();
      textures.dispose();
      dustGeo.dispose();
      dustMat.dispose();
      envRT.dispose();
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    },
  };
}

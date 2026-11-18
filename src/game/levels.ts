import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { FacilityTextures } from './textures';
import { createSisterModel } from './character';
import { soundEngine } from './audio';
import {
  buildSectorOneLevel,
  type CollapsingPlatform,
  type LevelInstance,
  type MovingHazard,
  type SpikeTrap,
} from './levelOne';

export interface SectorMeta {
  id: number;
  code: string;
  shortName: string;
  title: string;
  airlockLabel: string;
  introLockdownLine: string;
  introFinalLine: string;
  victorySummary: string;
}

export const SECTORS: SectorMeta[] = [
  {
    id: 1,
    code: '01',
    shortName: 'Bio Wing',
    title: 'BIO-CONTAINMENT WING',
    airlockLabel: 'Airlock B-2',
    introLockdownLine: 'Containment lockdown triggered — the blast door is sealing!',
    introFinalLine: "Don't trust a single floor plate. Reach Airlock B-2!",
    victorySummary: 'You bypassed the decoy bulkhead and reached your sister at Airlock B-2.',
  },
  {
    id: 2,
    code: '02',
    shortName: 'Cryo Bay',
    title: 'CRYO-TURBINE CATWALKS',
    airlockLabel: 'Cryo Dock C-4',
    introLockdownLine: 'Cryo turbines spinning up — catwalk bridges destabilizing!',
    introFinalLine: 'Time the shuttle ferries and reach Cryo Dock C-4!',
    victorySummary: 'You crossed the sub-zero turbine chasm and reached Cryo Dock C-4.',
  },
  {
    id: 3,
    code: '03',
    shortName: 'Core',
    title: 'REACTOR CORE GAUNTLET',
    airlockLabel: 'Escape Hatch D-1',
    introLockdownLine: 'Thermal vents open — emergency grates armed!',
    introFinalLine: 'Weave through the pistons and reach Escape Hatch D-1!',
    victorySummary: 'You survived the reactor core crushers and reached Escape Hatch D-1.',
  },
  {
    id: 4,
    code: '04',
    shortName: 'Shaft',
    title: 'HIGH-VOLTAGE CRUSHER SHAFT',
    airlockLabel: 'Crane Airlock E-7',
    introLockdownLine: 'Upper shaft lifts engaged — high-voltage traps active!',
    introFinalLine: 'Ride the shaft elevators up to Crane Airlock E-7!',
    victorySummary: 'You scaled the crusher shaft and reached Crane Airlock E-7.',
  },
  {
    id: 5,
    code: '05',
    shortName: 'Spire',
    title: 'LOCKDOWN EXTRACTION SPIRE',
    airlockLabel: 'Spire Pod F-9',
    introLockdownLine: 'Final facility purge initiated — all sectors locked down!',
    introFinalLine: 'One last sprint through the spire traps. Reach Spire Pod F-9!',
    victorySummary: 'You conquered the Spire Purge and extracted your sister from Spire Pod F-9.',
  },
];

export function getSectorMeta(sectorId: number): SectorMeta {
  return SECTORS.find((s) => s.id === sectorId) ?? SECTORS[0];
}

interface MovingPlatform {
  mesh: THREE.Group;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  basePos: THREE.Vector3;
  axis: 'x' | 'y' | 'z';
  amplitude: number;
  speed: number;
  phase: number;
  lastPos: THREE.Vector3;
}

interface SectorTheme {
  fogHex: number;
  keyHex: number;
  rimHex: number;
  concreteTint: number;
  wallTint: number;
  accentHex: number;
  fluoroHex: number;
  lightHex: number;
}

const SECTOR_THEMES: Record<number, SectorTheme> = {
  2: {
    fogHex: 0x07131f,
    keyHex: 0xdbeafe,
    rimHex: 0x38bdf8,
    concreteTint: 0xcbe4f5,
    wallTint: 0x9fc2dc,
    accentHex: 0x0284c7,
    fluoroHex: 0xbae6fd,
    lightHex: 0x38bdf8,
  },
  3: {
    fogHex: 0x170b06,
    keyHex: 0xfed7aa,
    rimHex: 0xf97316,
    concreteTint: 0xdfb8a2,
    wallTint: 0xc89378,
    accentHex: 0xea580c,
    fluoroHex: 0xfdba74,
    lightHex: 0xf97316,
  },
  4: {
    fogHex: 0x071411,
    keyHex: 0xd1fae5,
    rimHex: 0x10b981,
    concreteTint: 0xbfe2d5,
    wallTint: 0x89bba9,
    accentHex: 0x059669,
    fluoroHex: 0x6ee7b7,
    lightHex: 0x10b981,
  },
  5: {
    fogHex: 0x16070c,
    keyHex: 0xfecdd3,
    rimHex: 0xf43f5e,
    concreteTint: 0xdcc0c8,
    wallTint: 0xb98594,
    accentHex: 0xe11d48,
    fluoroHex: 0xfda4af,
    lightHex: 0xf43f5e,
  },
};

function buildCustomSectorLevel(
  sectorId: number,
  rapier: typeof RAPIER,
  world: RAPIER.World,
  textures: FacilityTextures,
): LevelInstance {
  const theme = SECTOR_THEMES[sectorId] ?? SECTOR_THEMES[2];
  const meta = getSectorMeta(sectorId);

  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Shared themed PBR materials
  const concreteMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: theme.concreteTint,
      map: textures.concreteColor,
      roughnessMap: textures.concreteRoughness,
      bumpMap: textures.concreteBump,
      bumpScale: 0.045,
      roughness: 0.86,
      metalness: 0.08,
    }),
  );
  const darkSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x222934,
      roughness: 0.38,
      metalness: 0.84,
    }),
  );
  const chromeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.16,
      metalness: 0.94,
    }),
  );
  const rustBeamMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5c3726,
      roughness: 0.7,
      metalness: 0.5,
    }),
  );
  const wallMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: theme.wallTint,
      map: textures.wallPanelColor,
      bumpMap: textures.wallPanelBump,
      bumpScale: 0.06,
      roughness: 0.74,
      metalness: 0.22,
    }),
  );
  const gratingMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.gratingColor,
      color: theme.concreteTint,
      roughness: 0.46,
      metalness: 0.7,
    }),
  );
  const hazardMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.hazardStripeColor,
      roughness: 0.5,
      metalness: 0.28,
    }),
  );
  const drumMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.drumColor,
      roughness: 0.58,
      metalness: 0.45,
    }),
  );
  const terminalScreenMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.terminalScreenColor,
      emissiveMap: textures.terminalScreenColor,
      emissive: 0xffffff,
      emissiveIntensity: 0.95,
      roughness: 0.25,
      metalness: 0.1,
    }),
  );
  const glassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.26,
      roughness: 0.12,
      metalness: 0.15,
      depthWrite: false,
    }),
  );
  const fluoroMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: theme.fluoroHex,
      emissiveIntensity: 2.1,
      roughness: 0.2,
    }),
  );
  const spikeSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdbe4ee,
      roughness: 0.2,
      metalness: 0.92,
    }),
  );
  const spikeTipMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      roughness: 0.35,
      metalness: 0.45,
    }),
  );

  const hazardColliderHandles = new Set<number>();
  const collapsingColliderMap = new Map<number, CollapsingPlatform>();
  const emergencyLights: THREE.PointLight[] = [];
  const spikeTraps: SpikeTrap[] = [];
  const collapsingPlatforms: CollapsingPlatform[] = [];
  const movingHazards: MovingHazard[] = [];
  const movingPlatforms: MovingPlatform[] = [];
  const platformDeltaMap = new Map<number, { x: number; y: number; z: number }>();

  const addStaticPlatform = (
    cx: number,
    topY: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material = concreteMat,
    addTrim = true,
  ) => {
    const cy = topY - h / 2;
    const mesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, h, d)), mat);
    mesh.position.set(cx, cy, cz);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    group.add(mesh);

    if (addTrim) {
      const trim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w + 0.08, 0.12, d + 0.08)), hazardMat);
      trim.position.set(cx, topY - 0.07, cz);
      trim.receiveShadow = true;
      group.add(trim);
    }

    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(cx, cy, cz));
    world.createCollider(rapier.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setFriction(0.85), body);
  };

  const createHiddenSpikeTrap = (id: string, cx: number, topY: number, cz: number, plateW = 3.6, plateD = 1.45) => {
    const baseGroup = new THREE.Group();
    baseGroup.position.set(cx, topY + 0.01, cz);

    const pitBorder = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(plateW + 0.22, 0.06, plateD + 0.22)), darkSteelMat);
    pitBorder.position.y = -0.01;
    pitBorder.receiveShadow = true;
    baseGroup.add(pitBorder);

    const indicatorMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b424d,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.42,
        metalness: 0.72,
      }),
    );
    const seamPlate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(plateW, 0.05, plateD)), indicatorMat);
    seamPlate.receiveShadow = true;
    baseGroup.add(seamPlate);

    const spikesGroup = new THREE.Group();
    spikesGroup.position.y = -0.95;
    baseGroup.add(spikesGroup);

    const spikeConeGeo = trackGeo(new THREE.ConeGeometry(0.11, 0.92, 6));
    const tipGeo = trackGeo(new THREE.ConeGeometry(0.055, 0.32, 6));
    const collarGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 6));
    for (let ix = -1; ix <= 1; ix++) {
      for (let iz = -1; iz <= 1; iz++) {
        const sx = ix * (plateW * 0.3);
        const sz = iz * (plateD * 0.29);
        const collar = new THREE.Mesh(collarGeo, darkSteelMat);
        collar.position.set(sx, 0.03, sz);
        spikesGroup.add(collar);

        const cone = new THREE.Mesh(spikeConeGeo, spikeSteelMat);
        cone.position.set(sx, 0.46, sz);
        cone.castShadow = true;
        spikesGroup.add(cone);

        const tip = new THREE.Mesh(tipGeo, spikeTipMat);
        tip.position.set(sx, 0.78, sz);
        spikesGroup.add(tip);
      }
    }

    group.add(baseGroup);

    spikeTraps.push({
      id,
      triggerCenter: new THREE.Vector3(cx, topY, cz),
      triggerRadius: 2.35,
      spikesGroup,
      indicatorMat,
      state: 'armed',
      timer: 0,
      extension: 0,
      hazardBoxMin: new THREE.Vector3(cx - plateW * 0.48, topY - 0.1, cz - plateD * 0.44),
      hazardBoxMax: new THREE.Vector3(cx + plateW * 0.48, topY + 0.95, cz + plateD * 0.44),
    });
  };

  const createCollapsingPlatform = (id: string, x: number, topY: number, z: number, w: number, d: number) => {
    const h = 0.36;
    const cy = topY - h / 2;
    const platGroup = new THREE.Group();
    platGroup.position.set(x, cy, z);

    const mat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.gratingColor,
        color: theme.concreteTint,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.46,
        metalness: 0.7,
      }),
    );

    const deck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, h, d)), mat);
    deck.castShadow = true;
    deck.receiveShadow = true;
    platGroup.add(deck);

    const railEdge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w + 0.1, 0.09, d + 0.1)), hazardMat);
    railEdge.position.y = h * 0.38;
    platGroup.add(railEdge);

    group.add(platGroup);

    const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(x, cy, z));
    const collider = world.createCollider(rapier.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setFriction(0.9), body);

    const cp: CollapsingPlatform = {
      id,
      mesh: platGroup,
      body,
      collider,
      basePos: new THREE.Vector3(x, cy, z),
      halfSize: new THREE.Vector3(w / 2, h / 2, d / 2),
      state: 'idle',
      timer: 0,
      fallVel: 0,
      mat,
    };
    collapsingPlatforms.push(cp);
    collapsingColliderMap.set(collider.handle, cp);
  };

  const createMovingPlatform = (
    x: number,
    topY: number,
    z: number,
    w: number,
    d: number,
    axis: 'x' | 'y' | 'z',
    amplitude: number,
    speed: number,
    phase = 0,
  ) => {
    const h = 0.42;
    const cy = topY - h / 2;
    const platGroup = new THREE.Group();
    platGroup.position.set(x, cy, z);

    const deck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, h, d)), gratingMat);
    deck.receiveShadow = true;
    deck.castShadow = true;
    platGroup.add(deck);

    const accentMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: theme.accentHex,
        emissive: theme.accentHex,
        emissiveIntensity: 1.15,
        roughness: 0.25,
      }),
    );
    const rail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w + 0.12, 0.1, d + 0.12)), accentMat);
    rail.position.y = h * 0.32;
    platGroup.add(rail);

    group.add(platGroup);

    const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(x, cy, z));
    const collider = world.createCollider(rapier.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setFriction(0.95), body);

    const basePos = new THREE.Vector3(x, cy, z);
    movingPlatforms.push({
      mesh: platGroup,
      body,
      collider,
      basePos,
      axis,
      amplitude,
      speed,
      phase,
      lastPos: basePos.clone(),
    });
    platformDeltaMap.set(collider.handle, { x: 0, y: 0, z: 0 });
  };

  const createHydraulicPiston = (
    id: string,
    cx: number,
    topY: number,
    zPos: number,
    amplitude: number,
    speed: number,
    phase: number,
  ) => {
    const py = topY + 0.75;
    const pGroup = new THREE.Group();
    pGroup.position.set(cx, py, zPos);

    const ramBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.45, 1.32, 1.08)), rustBeamMat);
    ramBody.castShadow = true;
    pGroup.add(ramBody);

    const ramFace = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.52, 1.12, 1.14)), hazardMat);
    pGroup.add(ramFace);

    const rodGeo = trackGeo(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 8));
    for (const ry of [-0.32, 0.32]) {
      const rod = new THREE.Mesh(rodGeo, chromeMat);
      rod.rotation.z = Math.PI / 2;
      rod.position.y = ry;
      pGroup.add(rod);
    }

    group.add(pGroup);

    const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(cx, py, zPos));
    const collider = world.createCollider(rapier.ColliderDesc.cuboid(0.75, 0.66, 0.55), body);
    hazardColliderHandles.add(collider.handle);

    movingHazards.push({
      id,
      kind: 'piston',
      mesh: pGroup,
      body,
      collider,
      basePos: new THREE.Vector3(cx, py, zPos),
      amplitude,
      speed,
      phase,
      halfExtents: new THREE.Vector3(0.75, 0.66, 0.55),
    });
  };

  const createPendulumSaw = (
    id: string,
    cx: number,
    topY: number,
    zPos: number,
    amplitude: number,
    speed: number,
    phase: number,
  ) => {
    const py = topY + 0.9;
    const pendGroup = new THREE.Group();
    pendGroup.position.set(cx, py, zPos);

    const sawDisc = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.86, 0.86, 0.12, 18)), chromeMat);
    sawDisc.rotation.x = Math.PI / 2;
    sawDisc.castShadow = true;
    pendGroup.add(sawDisc);

    const sawHub = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.46, 0.46, 0.18, 12)), hazardMat);
    sawHub.rotation.x = Math.PI / 2;
    pendGroup.add(sawHub);

    const toothGeo = trackGeo(new THREE.ConeGeometry(0.11, 0.24, 4));
    for (let t = 0; t < 10; t++) {
      const angle = (t / 10) * Math.PI * 2;
      const tooth = new THREE.Mesh(toothGeo, spikeTipMat);
      tooth.position.set(Math.cos(angle) * 0.86, Math.sin(angle) * 0.86, 0);
      tooth.rotation.z = angle - Math.PI / 2;
      pendGroup.add(tooth);
    }

    const pivotArm = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.09, 0.11, 3.8, 8)), darkSteelMat);
    pivotArm.position.y = 1.95;
    pendGroup.add(pivotArm);

    group.add(pendGroup);

    const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(cx, py, zPos));
    const collider = world.createCollider(rapier.ColliderDesc.cuboid(0.84, 0.6, 0.18), body);
    hazardColliderHandles.add(collider.handle);

    movingHazards.push({
      id,
      kind: 'pendulum',
      mesh: pendGroup,
      body,
      collider,
      basePos: new THREE.Vector3(cx, py, zPos),
      amplitude,
      speed,
      phase,
      halfExtents: new THREE.Vector3(0.84, 0.6, 0.18),
    });
  };

  // =========================================================================
  // ENTRY CONTAINMENT BAY (Shared Intro Staging with Sector-Themed Lighting)
  // =========================================================================
  addStaticPlatform(0, 0, -0.25, 6.2, 1.2, 9.5, concreteMat, true);

  const backWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.6, 5.4, 0.65)), wallMat);
  backWall.position.set(0, 2.5, 4.8);
  backWall.receiveShadow = true;
  group.add(backWall);
  const backBody = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(0, 2.5, 4.8));
  world.createCollider(rapier.ColliderDesc.cuboid(3.8, 2.7, 0.32), backBody);

  const obsFloor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.2, 1.0, 4.2)), concreteMat);
  obsFloor.position.set(-4.8, -0.25, -1.6);
  group.add(obsFloor);
  const obsBackWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.4, 4.4, 4.4)), wallMat);
  obsBackWall.position.set(-6.3, 2.2, -1.6);
  group.add(obsBackWall);
  for (const wz of [-3.7, 0.5]) {
    const sideW = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.2, 4.4, 0.35)), wallMat);
    sideW.position.set(-4.8, 2.2, wz);
    group.add(sideW);
  }
  const obsRoof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.5, 0.4, 4.4)), darkSteelMat);
  obsRoof.position.set(-4.8, 4.3, -1.6);
  group.add(obsRoof);

  const obsLedge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.95, 4.1)), darkSteelMat);
  obsLedge.position.set(-3.15, 0.47, -1.6);
  group.add(obsLedge);
  const obsGlass = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(3.75, 2.65)), glassMat);
  obsGlass.rotation.y = Math.PI / 2;
  obsGlass.position.set(-3.15, 2.25, -1.6);
  group.add(obsGlass);

  const obsBarrierBody = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(-3.15, 1.8, -1.6));
  world.createCollider(rapier.ColliderDesc.cuboid(0.2, 1.8, 2.1), obsBarrierBody);

  const blastShutter = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 2.7, 3.8)), wallMat);
  const shutterOpenY = 5.05;
  const shutterClosedY = 2.25;
  blastShutter.position.set(-3.26, shutterOpenY, -1.6);
  group.add(blastShutter);

  const obsLight = new THREE.PointLight(theme.lightHex, 2.4, 8, 2);
  obsLight.position.set(-4.7, 3.6, -1.6);
  group.add(obsLight);
  emergencyLights.push(obsLight);

  const introSisterRig = createSisterModel();
  introSisterRig.root.position.set(-4.65, 0.25, -1.6);
  introSisterRig.root.rotation.y = Math.PI * 0.36;
  group.add(introSisterRig.root);

  // Entry drums
  const drumGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.32, 0.92, 10));
  for (const [dx, dy, dz] of [
    [2.35, 0.46, 3.6],
    [-2.4, 0.46, 3.7],
  ]) {
    const drum = new THREE.Mesh(drumGeo, drumMat);
    drum.position.set(dx, dy, dz);
    drum.castShadow = true;
    group.add(drum);
  }

  // =========================================================================
  // SECTOR-SPECIFIC LEVEL GEOMETRY (Sectors 2, 3, 4, 5)
  // =========================================================================
  let cpCenter = new THREE.Vector3(0, 0, -34);
  let cpSpawnPos = new THREE.Vector3(0, 1.0, -34);
  let fakeTriggerZ = -60;
  let fakeTriggerX = 0;
  let fakeDoorX = 0;
  let fakeDoorY = 0;
  let fakeDoorZ = -67;
  let gantryX = 4.2;
  let gantryStartY = -4.5;
  let gantryRaisedY = 1.0;
  let gantryZ = -68;
  let gantryLen = 13.0;
  let victoryX = 4.2;
  let victoryY = 1.4;
  let victoryZ = -74;

  if (sectorId === 2) {
    // SECTOR 02: CRYO-TURBINE CATWALKS (Horizontal Ferries + Cryo Lift + Left Decoy)
    addStaticPlatform(0, 0, -9.2, 4.4, 1.0, 6.8);
    createHiddenSpikeTrap('s2_spike_1', 0, 0, -9.2, 3.6, 1.4);

    // Moving shuttle ferry across chasm (z: -12.6 to -21.0)
    createMovingPlatform(0, 0.15, -16.8, 3.4, 3.6, 'x', 2.4, 1.45, 0);

    addStaticPlatform(0, 0.35, -24.0, 4.6, 1.0, 5.2);
    createCollapsingPlatform('s2_col_1', -0.7, 0.55, -29.2, 2.8, 2.8);
    createCollapsingPlatform('s2_col_2', 0.7, 0.75, -33.4, 2.8, 2.8);

    // Checkpoint Platform
    cpCenter = new THREE.Vector3(0, 0.9, -39.2);
    cpSpawnPos = new THREE.Vector3(0, 1.85, -39.2);
    addStaticPlatform(0, 0.9, -39.2, 6.0, 1.1, 6.0);

    // Vertical Cryo Elevator lifting up to turbine bridge
    createMovingPlatform(0, 1.8, -44.6, 3.4, 3.4, 'y', 0.95, 1.75, 0);

    // Turbine Saw Bridge (topY = 2.6)
    addStaticPlatform(0, 2.6, -53.8, 4.2, 1.1, 13.0);
    createPendulumSaw('s2_saw_1', 0, 2.6, -50.2, 2.1, 2.4, 0.2);
    createHiddenSpikeTrap('s2_spike_2', 0, 2.6, -53.8, 3.5, 1.35);
    createPendulumSaw('s2_saw_2', 0, 2.6, -57.2, 2.1, 2.6, Math.PI);

    // Fake Exit straight ahead vs Left Emergency Cryo Catwalk!
    fakeTriggerZ = -62.5;
    fakeTriggerX = 0;
    fakeDoorX = 0;
    fakeDoorY = 2.6;
    fakeDoorZ = -69.0;
    gantryX = -4.2;
    gantryStartY = -4.5;
    gantryRaisedY = 2.75;
    gantryZ = -69.5;
    gantryLen = 12.0;
    victoryX = -4.2;
    victoryY = 3.0;
    victoryZ = -75.0;
  } else if (sectorId === 3) {
    // SECTOR 03: REACTOR CORE GAUNTLET (Zig-Zag Collapsing + Triple Pistons + Side Ferry)
    addStaticPlatform(0, 0, -8.8, 4.4, 1.0, 6.2);
    createHiddenSpikeTrap('s3_spike_1', 0, 0, -8.8, 3.7, 1.45);

    // Zig-zag collapsing steps
    createCollapsingPlatform('s3_col_1', -1.4, 0.35, -14.2, 2.7, 2.7);
    createCollapsingPlatform('s3_col_2', 1.4, 0.65, -18.2, 2.7, 2.7);
    createCollapsingPlatform('s3_col_3', -1.2, 0.95, -22.2, 2.7, 2.7);

    // Piston Furnace Runway
    addStaticPlatform(0, 1.0, -29.0, 4.2, 1.1, 8.8);
    createHydraulicPiston('s3_pis_1', 0, 1.0, -26.8, 1.75, 2.4, 0);
    createHydraulicPiston('s3_pis_2', 0, 1.0, -30.8, 1.75, 2.6, Math.PI);

    // Checkpoint Platform
    cpCenter = new THREE.Vector3(0, 1.0, -37.2);
    cpSpawnPos = new THREE.Vector3(0, 1.95, -37.2);
    addStaticPlatform(0, 1.0, -37.2, 6.2, 1.2, 6.0);

    // Moving Ferry + Dual Ambush Bridge
    createMovingPlatform(0, 1.2, -43.0, 3.3, 3.4, 'x', 2.6, 1.7, 0.5);
    addStaticPlatform(0, 1.4, -52.2, 4.2, 1.1, 12.2);
    createHiddenSpikeTrap('s3_spike_2', 0, 1.4, -49.2, 3.6, 1.35);
    createPendulumSaw('s3_saw_1', 0, 1.4, -52.8, 2.2, 2.8, 0);
    createHydraulicPiston('s3_pis_3', 0, 1.4, -56.4, 1.75, 2.8, 1.4);

    fakeTriggerZ = -60.5;
    fakeTriggerX = 0;
    fakeDoorX = 0;
    fakeDoorY = 1.4;
    fakeDoorZ = -67.2;
    gantryX = 4.3;
    gantryStartY = -4.5;
    gantryRaisedY = 1.55;
    gantryZ = -68.2;
    gantryLen = 13.0;
    victoryX = 4.3;
    victoryY = 1.8;
    victoryZ = -74.0;
  } else if (sectorId === 4) {
    // SECTOR 04: HIGH-VOLTAGE CRUSHER SHAFT (2-Stage Vertical Ascent + Upper Trusses)
    addStaticPlatform(0, 0, -9.0, 4.4, 1.0, 6.4);
    createHiddenSpikeTrap('s4_spike_1', 0, 0, -9.0, 3.6, 1.4);

    // First Vertical Lift (y: 0.4 -> 2.4)
    createMovingPlatform(0, 1.4, -14.8, 3.5, 3.4, 'y', 1.0, 1.65, 0);
    addStaticPlatform(0, 2.3, -20.5, 4.4, 1.1, 5.2);
    createHiddenSpikeTrap('s4_spike_2', 0, 2.3, -20.5, 3.6, 1.35);

    // Second Vertical Lift (y: 2.5 -> 4.3)
    createMovingPlatform(0, 3.4, -26.0, 3.5, 3.4, 'y', 0.9, 1.85, Math.PI * 0.5);

    // Upper Shaft Checkpoint (topY = 4.2)
    cpCenter = new THREE.Vector3(0, 4.2, -32.2);
    cpSpawnPos = new THREE.Vector3(0, 5.15, -32.2);
    addStaticPlatform(0, 4.2, -32.2, 6.2, 1.2, 6.2);

    // High-altitude Crusher Span
    createCollapsingPlatform('s4_col_1', -0.9, 4.2, -38.0, 2.8, 2.9);
    createCollapsingPlatform('s4_col_2', 0.9, 4.2, -42.2, 2.8, 2.9);

    addStaticPlatform(0, 4.2, -50.6, 4.2, 1.1, 11.2);
    createPendulumSaw('s4_saw_1', 0, 4.2, -47.2, 2.2, 2.75, 0);
    createHydraulicPiston('s4_pis_1', 0, 4.2, -50.8, 1.75, 2.8, Math.PI);
    createPendulumSaw('s4_saw_2', 0, 4.2, -54.2, 2.2, 2.95, 1.2);

    // Shuttle Ferry before Decoy Airlock
    createMovingPlatform(0, 4.2, -58.8, 3.4, 3.2, 'x', 2.2, 1.75, 0);

    fakeTriggerZ = -63.0;
    fakeTriggerX = 0;
    fakeDoorX = 0;
    fakeDoorY = 4.2;
    fakeDoorZ = -69.5;
    gantryX = 4.3;
    gantryStartY = -2.5;
    gantryRaisedY = 4.35;
    gantryZ = -70.4;
    gantryLen = 12.6;
    victoryX = 4.3;
    victoryY = 4.6;
    victoryZ = -76.0;
  } else {
    // SECTOR 05: LOCKDOWN EXTRACTION SPIRE (Final All-Traps Spire Finale!)
    addStaticPlatform(0, 0, -9.6, 4.4, 1.0, 7.8);
    createHiddenSpikeTrap('s5_spike_1', 0, 0, -7.8, 3.6, 1.35);
    createHiddenSpikeTrap('s5_spike_2', 0, 0, -11.4, 3.6, 1.35);

    // Collapsing Zig-Zag over Spire Abyss
    createCollapsingPlatform('s5_col_1', -1.2, 0.35, -16.2, 2.7, 2.8);
    createCollapsingPlatform('s5_col_2', 1.2, 0.7, -20.2, 2.7, 2.8);

    // Elevator Ascent to Spire Mid-Deck
    createMovingPlatform(0, 1.85, -25.4, 3.5, 3.4, 'y', 1.05, 1.9, 0);

    // Spire Checkpoint (topY = 2.8)
    cpCenter = new THREE.Vector3(0, 2.8, -31.8);
    cpSpawnPos = new THREE.Vector3(0, 3.75, -31.8);
    addStaticPlatform(0, 2.8, -31.8, 6.2, 1.2, 6.0);

    // Final Spire Crusher & Saw Gauntlet
    addStaticPlatform(0, 2.8, -42.6, 4.0, 1.1, 13.0);
    createHydraulicPiston('s5_pis_1', 0, 2.8, -38.4, 1.75, 2.9, 0);
    createPendulumSaw('s5_saw_1', 0, 2.8, -42.2, 2.2, 3.0, 0.5);
    createHiddenSpikeTrap('s5_spike_3', 0, 2.8, -45.5, 3.5, 1.35);
    createHydraulicPiston('s5_pis_2', 0, 2.8, -48.0, 1.75, 3.1, Math.PI);

    // Shuttle Ferry under Final Pendulum
    createMovingPlatform(0, 2.9, -52.8, 3.4, 3.5, 'x', 2.4, 1.95, 0);
    createCollapsingPlatform('s5_col_3', 0, 3.0, -57.8, 3.0, 2.8);

    fakeTriggerZ = -61.5;
    fakeTriggerX = 0;
    fakeDoorX = 0;
    fakeDoorY = 3.0;
    fakeDoorZ = -68.2;
    gantryX = -4.3;
    gantryStartY = -3.0;
    gantryRaisedY = 3.15;
    gantryZ = -69.2;
    gantryLen = 13.0;
    victoryX = -4.3;
    victoryY = 3.4;
    victoryZ = -75.0;
  }

  // =========================================================================
  // CHECKPOINT TERMINAL KIOSK
  // =========================================================================
  const cpKiosk = new THREE.Group();
  cpKiosk.position.set(cpCenter.x - 1.95, cpCenter.y, cpCenter.z);

  const cpBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.56, 0.66, 0.22, 12)), darkSteelMat);
  cpBase.position.y = 0.11;
  cpKiosk.add(cpBase);

  const cpPedestal = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.42, 1.1, 0.42)), darkSteelMat);
  cpPedestal.position.y = 0.66;
  cpKiosk.add(cpPedestal);

  const screenFace = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.56, 0.4)), terminalScreenMat);
  screenFace.position.set(0.09, 1.33, 0.19);
  screenFace.rotation.y = Math.PI * 0.22;
  screenFace.rotation.x = -0.22;
  cpKiosk.add(screenFace);

  const cpBeaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.9,
      roughness: 0.2,
    }),
  );
  const cpBeacon = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.15, 0.15, 0.24, 12)), cpBeaconMat);
  cpBeacon.position.set(-0.1, 1.75, -0.08);
  cpKiosk.add(cpBeacon);

  const cpRing = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.85, 0.045, 8, 24)), cpBeaconMat);
  cpRing.rotation.x = Math.PI / 2;
  cpRing.position.set(1.95, 0.05, 0);
  cpKiosk.add(cpRing);
  group.add(cpKiosk);

  const cpLight = new THREE.PointLight(0xf59e0b, 1.9, 10, 2);
  cpLight.position.set(cpCenter.x - 1.95, cpCenter.y + 2.0, cpCenter.z);
  group.add(cpLight);
  emergencyLights.push(cpLight);

  // =========================================================================
  // FAKE EXIT DECOY + TRUE EXTRACTION GANTRY + SISTER RESCUE PAD
  // =========================================================================
  addStaticPlatform(fakeDoorX, fakeDoorY, fakeTriggerZ, 4.4, 1.1, 4.2);

  const trapdoorZ = fakeDoorZ + 2.5;
  const fakeTrapdoorMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.2, 0.35, 4.0)), gratingMat);
  fakeTrapdoorMesh.position.set(fakeDoorX, fakeDoorY - 0.175, trapdoorZ);
  group.add(fakeTrapdoorMesh);
  const fakeTrapdoorBody = world.createRigidBody(
    rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(fakeDoorX, fakeDoorY - 0.175, trapdoorZ),
  );
  world.createCollider(rapier.ColliderDesc.cuboid(2.1, 0.175, 2.0), fakeTrapdoorBody);

  const fakeDoorFrame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.6, 4.2, 0.6)), wallMat);
  fakeDoorFrame.position.set(fakeDoorX, fakeDoorY + 2.0, fakeDoorZ);
  group.add(fakeDoorFrame);

  const fakeVaultDoor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.6, 2.6, 0.25)), darkSteelMat);
  fakeVaultDoor.position.set(fakeDoorX, fakeDoorY + 1.25, fakeDoorZ + 0.35);
  group.add(fakeVaultDoor);

  const fakeSignMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.exitSignTexture,
      emissiveMap: textures.exitSignTexture,
      emissive: 0x34d399,
      emissiveIntensity: 1.4,
      roughness: 0.35,
    }),
  );
  const fakeSign = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(3.2, 1.2)), fakeSignMat);
  fakeSign.position.set(fakeDoorX, fakeDoorY + 2.95, fakeDoorZ + 0.35);
  group.add(fakeSign);

  const fakeExitLight = new THREE.PointLight(0x10b981, 2.4, 12, 2);
  fakeExitLight.position.set(fakeDoorX, fakeDoorY + 2.4, fakeDoorZ + 1.8);
  group.add(fakeExitLight);
  emergencyLights.push(fakeExitLight);

  // Rising Side Gantry (Left or Right depending on sector!)
  const rescueGantryGroup = new THREE.Group();
  const gantryStartPos = new THREE.Vector3(gantryX, gantryStartY, gantryZ);
  const gantryRaisedPos = new THREE.Vector3(gantryX, gantryRaisedY, gantryZ);
  rescueGantryGroup.position.copy(gantryStartPos);

  const gantryDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.4, 0.8, gantryLen)), gratingMat);
  gantryDeck.receiveShadow = true;
  rescueGantryGroup.add(gantryDeck);
  const gantryTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.5, 0.14, gantryLen + 0.1)), hazardMat);
  gantryTrim.position.y = 0.35;
  rescueGantryGroup.add(gantryTrim);
  group.add(rescueGantryGroup);

  const gantryBody = world.createRigidBody(
    rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(gantryStartPos.x, gantryStartPos.y, gantryStartPos.z),
  );
  world.createCollider(rapier.ColliderDesc.cuboid(1.7, 0.4, gantryLen / 2).setFriction(0.92), gantryBody);

  // True Extraction Airlock Chamber + Waiting Sister ("HELP ME")
  addStaticPlatform(victoryX, victoryY, victoryZ, 5.4, 1.2, 5.2);

  const rescueSignMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.rescueSignTexture,
      emissiveMap: textures.rescueSignTexture,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.4,
      roughness: 0.35,
    }),
  );
  const rescueArch = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.6, 4.4, 0.6)), wallMat);
  rescueArch.position.set(victoryX, victoryY + 2.1, victoryZ - 2.4);
  group.add(rescueArch);

  const vaultDoor = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.35, 1.35, 0.24, 20)), darkSteelMat);
  vaultDoor.rotation.x = Math.PI / 2;
  vaultDoor.position.set(victoryX, victoryY + 1.3, victoryZ - 2.02);
  group.add(vaultDoor);

  const vaultWheel = new THREE.Group();
  vaultWheel.position.set(victoryX, victoryY + 1.3, victoryZ - 1.84);
  vaultWheel.add(new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.46, 0.055, 8, 16)), chromeMat));
  group.add(vaultWheel);

  const rescueSign = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(3.4, 1.15)), rescueSignMat);
  rescueSign.position.set(victoryX, victoryY + 3.25, victoryZ - 2.04);
  group.add(rescueSign);

  const rescuePadMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: theme.lightHex,
      emissive: theme.lightHex,
      emissiveIntensity: 1.45,
      roughness: 0.3,
    }),
  );
  const rescuePad = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.15, 1.25, 0.1, 18)), rescuePadMat);
  rescuePad.position.set(victoryX, victoryY + 0.05, victoryZ + 0.4);
  group.add(rescuePad);

  const rescueLight = new THREE.PointLight(theme.lightHex, 2.8, 14, 2);
  rescueLight.position.set(victoryX, victoryY + 2.6, victoryZ + 0.4);
  group.add(rescueLight);
  emergencyLights.push(rescueLight);

  const sisterRig = createSisterModel();
  sisterRig.root.position.set(victoryX, victoryY, victoryZ - 0.9);
  group.add(sisterRig.root);

  // =========================================================================
  // INSTANCED STRUCTURAL PILLARS & OVERHEAD FLUORESCENTS
  // =========================================================================
  const dummy = new THREE.Object3D();
  const pillarGeo = trackGeo(new THREE.BoxGeometry(0.65, 16.0, 0.85));
  const pillarInst = new THREE.InstancedMesh(pillarGeo, darkSteelMat, 22);
  let pIdx = 0;
  for (let i = 0; i < 11; i++) {
    const pz = 2.0 - i * 7.4;
    dummy.position.set(-7.2, 2.5, pz);
    dummy.updateMatrix();
    pillarInst.setMatrixAt(pIdx++, dummy.matrix);

    dummy.position.set(7.2, 2.5, pz);
    dummy.updateMatrix();
    pillarInst.setMatrixAt(pIdx++, dummy.matrix);
  }
  pillarInst.computeBoundingSphere();
  group.add(pillarInst);

  const trussGeo = trackGeo(new THREE.BoxGeometry(15.2, 0.45, 0.55));
  const trussInst = new THREE.InstancedMesh(trussGeo, rustBeamMat, 11);
  const fluoroGeo = trackGeo(new THREE.BoxGeometry(2.6, 0.09, 0.22));
  const fluoroInst = new THREE.InstancedMesh(fluoroGeo, fluoroMat, 11);
  for (let i = 0; i < 11; i++) {
    const lz = 2.0 - i * 7.4;
    dummy.position.set(0, 8.2, lz);
    dummy.updateMatrix();
    trussInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(0, 7.9, lz);
    dummy.updateMatrix();
    fluoroInst.setMatrixAt(i, dummy.matrix);
  }
  trussInst.computeBoundingSphere();
  fluoroInst.computeBoundingSphere();
  group.add(trussInst);
  group.add(fluoroInst);

  const abyssPlane = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(75, 130)),
    trackMat(new THREE.MeshBasicMaterial({ color: 0x04060a })),
  );
  abyssPlane.rotation.x = -Math.PI / 2;
  abyssPlane.position.set(0, -14, -36);
  group.add(abyssPlane);

  // Runtime state
  let checkpointActivated = false;
  let fakeExitTriggered = false;
  let fakeTrapdoorDropTimer = 0;
  let fakeTrapdoorFalling = false;
  let fakeTrapdoorY = fakeDoorY - 0.175;
  let gantryLiftProgress = 0;
  let victoryTriggered = false;
  let introTimer = 0;
  let shutterProgress = 0;

  const spawnPos = new THREE.Vector3(0, 0.95, 2.2);
  const victoryZoneCenter = new THREE.Vector3(victoryX, victoryY, victoryZ + 0.4);
  const gantrySideDir = gantryX < 0 ? 'LEFT' : 'RIGHT';

  const activateCheckpointVisuals = () => {
    checkpointActivated = true;
    cpBeaconMat.color.setHex(0x10b981);
    cpBeaconMat.emissive.setHex(0x10b981);
    cpLight.color.setHex(0x10b981);
  };

  const resetTraps = () => {
    introTimer = 0;
    shutterProgress = 0;
    blastShutter.position.y = shutterOpenY;

    for (const st of spikeTraps) {
      st.state = 'armed';
      st.timer = 0;
      st.extension = 0;
      st.spikesGroup.position.y = -0.95;
      st.indicatorMat.emissive.setHex(0x000000);
      st.indicatorMat.emissiveIntensity = 0;
    }

    for (const cp of collapsingPlatforms) {
      cp.state = 'idle';
      cp.timer = 0;
      cp.fallVel = 0;
      cp.mesh.position.copy(cp.basePos);
      cp.mesh.rotation.set(0, 0, 0);
      cp.body.setNextKinematicTranslation({ x: cp.basePos.x, y: cp.basePos.y, z: cp.basePos.z });
      cp.mat.emissive.setHex(0x000000);
      cp.mat.emissiveIntensity = 0;
    }

    fakeExitTriggered = false;
    fakeTrapdoorDropTimer = 0;
    fakeTrapdoorFalling = false;
    fakeTrapdoorY = fakeDoorY - 0.175;
    fakeTrapdoorMesh.position.set(fakeDoorX, fakeTrapdoorY, trapdoorZ);
    fakeTrapdoorBody.setNextKinematicTranslation({ x: fakeDoorX, y: fakeTrapdoorY, z: trapdoorZ });

    fakeSignMat.map = textures.exitSignTexture;
    fakeSignMat.emissiveMap = textures.exitSignTexture;
    fakeSignMat.emissive.setHex(0x34d399);
    fakeSignMat.needsUpdate = true;
    fakeExitLight.color.setHex(0x10b981);

    gantryLiftProgress = 0;
    rescueGantryGroup.position.copy(gantryStartPos);
    gantryBody.setNextKinematicTranslation({ x: gantryStartPos.x, y: gantryStartPos.y, z: gantryStartPos.z });
    victoryTriggered = false;
  };

  const updateAmbient = (dt: number) => {
    sisterRig.update(dt);
    introSisterRig.update(dt);
    vaultWheel.rotation.z += dt * 0.45;
  };

  const setShutterProgress = (progress: number) => {
    shutterProgress = THREE.MathUtils.clamp(progress, 0, 1);
    blastShutter.position.y = THREE.MathUtils.lerp(shutterOpenY, shutterClosedY, shutterProgress);
  };

  const update: LevelInstance['update'] = (
    dt,
    elapsed,
    playerPos,
    groundedColliderHandle,
    onTrapMessage,
    onCheckpoint,
    onVictory,
    onSpikeKill,
  ) => {
    updateAmbient(dt);

    introTimer += dt;
    if ((introTimer > 4.8 || playerPos.z < -4.2) && shutterProgress < 1) {
      shutterProgress = Math.min(1, shutterProgress + dt * 1.4);
      blastShutter.position.y = THREE.MathUtils.lerp(shutterOpenY, shutterClosedY, shutterProgress);
    }

    // Update Moving Shuttle Ferries & Elevators + store per-frame delta for player carry
    for (const mp of movingPlatforms) {
      const offset = Math.sin(elapsed * mp.speed + mp.phase) * mp.amplitude;
      const nx = mp.axis === 'x' ? mp.basePos.x + offset : mp.basePos.x;
      const ny = mp.axis === 'y' ? mp.basePos.y + offset : mp.basePos.y;
      const nz = mp.axis === 'z' ? mp.basePos.z + offset : mp.basePos.z;

      const delta = platformDeltaMap.get(mp.collider.handle);
      if (delta) {
        delta.x = nx - mp.lastPos.x;
        delta.y = ny - mp.lastPos.y;
        delta.z = nz - mp.lastPos.z;
      }
      mp.lastPos.set(nx, ny, nz);
      mp.mesh.position.set(nx, ny, nz);
      mp.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    }

    // Hidden Spikes
    for (const st of spikeTraps) {
      const dx = playerPos.x - st.triggerCenter.x;
      const dz = playerPos.z - st.triggerCenter.z;
      const dy = Math.abs(playerPos.y - st.triggerCenter.y);
      const distSq = dx * dx + dz * dz;

      if (st.state === 'armed') {
        if (distSq < st.triggerRadius * st.triggerRadius && dy < 2.0) {
          st.state = 'warning';
          st.timer = 0.18;
          st.indicatorMat.emissive.setHex(0xef4444);
          st.indicatorMat.emissiveIntensity = 2.0;
          soundEngine.playSpikeWarning();
        }
      } else if (st.state === 'warning') {
        st.timer -= dt;
        if (st.timer <= 0) {
          st.state = 'extended';
          st.timer = 1.05;
          soundEngine.playSpikeSnap();
        }
      } else if (st.state === 'extended') {
        st.extension = Math.min(1, st.extension + dt * 14);
        st.spikesGroup.position.y = THREE.MathUtils.lerp(-0.95, 0.0, st.extension);
        st.timer -= dt;

        if (
          st.extension > 0.35 &&
          playerPos.x >= st.hazardBoxMin.x &&
          playerPos.x <= st.hazardBoxMax.x &&
          playerPos.z >= st.hazardBoxMin.z &&
          playerPos.z <= st.hazardBoxMax.z &&
          playerPos.y >= st.hazardBoxMin.y &&
          playerPos.y <= st.hazardBoxMax.y + 0.55
        ) {
          onSpikeKill('Impaled by hidden floor spikes');
          return;
        }
        if (st.timer <= 0) st.state = 'retracting';
      } else if (st.state === 'retracting') {
        st.extension = Math.max(0, st.extension - dt * 2.5);
        st.spikesGroup.position.y = THREE.MathUtils.lerp(-0.95, 0.0, st.extension);
        if (st.extension <= 0) {
          st.state = 'armed';
          st.indicatorMat.emissive.setHex(0x000000);
          st.indicatorMat.emissiveIntensity = 0;
        }
      }
    }

    // Collapsing Platforms
    for (const cp of collapsingPlatforms) {
      if (cp.state === 'idle') {
        const standingOnThis = groundedColliderHandle === cp.collider.handle;
        const onTop =
          standingOnThis ||
          (Math.abs(playerPos.x - cp.basePos.x) <= cp.halfSize.x + 0.2 &&
            Math.abs(playerPos.z - cp.basePos.z) <= cp.halfSize.z + 0.2 &&
            Math.abs(playerPos.y - (cp.basePos.y + cp.halfSize.y)) < 1.15);
        if (onTop) {
          cp.state = 'shaking';
          cp.timer = 0.4;
          cp.mat.emissive.setHex(0xf97316);
          cp.mat.emissiveIntensity = 0.9;
          soundEngine.playPlatformCreak();
        }
      } else if (cp.state === 'shaking') {
        cp.timer -= dt;
        const rattle = Math.sin(elapsed * 58) * 0.055;
        cp.mesh.position.set(cp.basePos.x + rattle, cp.basePos.y, cp.basePos.z);
        cp.mesh.rotation.z = rattle * 0.6;
        if (cp.timer <= 0) {
          cp.state = 'falling';
          cp.fallVel = -1.5;
        }
      } else if (cp.state === 'falling') {
        cp.fallVel -= 26 * dt;
        const nextY = cp.mesh.position.y + cp.fallVel * dt;
        cp.mesh.position.y = nextY;
        cp.mesh.rotation.x += dt * 0.6;
        cp.body.setNextKinematicTranslation({ x: cp.basePos.x, y: nextY, z: cp.basePos.z });
        if (nextY < -16) cp.state = 'fallen';
      }
    }

    // Moving Hazards (Pistons & Pendulum Saws)
    for (const mh of movingHazards) {
      const offsetX = Math.sin(elapsed * mh.speed + mh.phase) * mh.amplitude;
      const nx = mh.basePos.x + offsetX;
      const ny = mh.kind === 'pendulum' ? mh.basePos.y + (1 - Math.cos(offsetX * 0.45)) * 0.4 : mh.basePos.y;
      mh.mesh.position.set(nx, ny, mh.basePos.z);
      if (mh.kind === 'pendulum') {
        mh.mesh.rotation.z = -offsetX * 0.22;
      }
      mh.body.setNextKinematicTranslation({ x: nx, y: ny, z: mh.basePos.z });

      if (
        Math.abs(playerPos.x - nx) < mh.halfExtents.x + 0.28 &&
        Math.abs(playerPos.z - mh.basePos.z) < mh.halfExtents.z + 0.28 &&
        Math.abs(playerPos.y - ny) < mh.halfExtents.y + 0.72
      ) {
        onSpikeKill('Crushed by facility machinery');
        return;
      }
    }

    // Checkpoint
    if (!checkpointActivated) {
      const dx = playerPos.x - cpCenter.x;
      const dz = playerPos.z - cpCenter.z;
      if (dx * dx + dz * dz < 2.25 * 2.25 && Math.abs(playerPos.y - cpCenter.y) < 2.2) {
        activateCheckpointVisuals();
        soundEngine.playCheckpoint();
        onCheckpoint();
        onTrapMessage('CHECKPOINT SECURED — PROGRESS SAVED');
      }
    }

    // Fake Exit Decoy
    if (!fakeExitTriggered && playerPos.z <= fakeTriggerZ && Math.abs(playerPos.x - fakeTriggerX) < 2.6) {
      fakeExitTriggered = true;
      fakeTrapdoorDropTimer = 0.26;
      fakeSignMat.map = textures.decoySignTexture;
      fakeSignMat.emissiveMap = textures.decoySignTexture;
      fakeSignMat.emissive.setHex(0xef4444);
      fakeSignMat.needsUpdate = true;
      fakeExitLight.color.setHex(0xef4444);
      soundEngine.playFakeExitAlarm();
      onTrapMessage(`DECOY LOCKDOWN! JUMP ${gantrySideDir} TO ${meta.airlockLabel.toUpperCase()}!`);
    }

    if (fakeExitTriggered) {
      if (gantryLiftProgress < 1) {
        gantryLiftProgress = Math.min(1, gantryLiftProgress + dt * 2.2);
        const eased = 1 - Math.pow(1 - gantryLiftProgress, 3);
        const gy = THREE.MathUtils.lerp(gantryStartPos.y, gantryRaisedPos.y, eased);
        rescueGantryGroup.position.y = gy;
        gantryBody.setNextKinematicTranslation({ x: gantryRaisedPos.x, y: gy, z: gantryRaisedPos.z });
      }
      if (!fakeTrapdoorFalling && playerPos.z <= fakeTriggerZ - 2.0 && Math.abs(playerPos.x - fakeDoorX) < 2.5) {
        fakeTrapdoorDropTimer -= dt;
        if (fakeTrapdoorDropTimer <= 0) {
          fakeTrapdoorFalling = true;
          soundEngine.playPlatformCreak();
        }
      }
      if (fakeTrapdoorFalling && fakeTrapdoorY > -15) {
        fakeTrapdoorY -= 16 * dt;
        fakeTrapdoorMesh.position.y = fakeTrapdoorY;
        fakeTrapdoorBody.setNextKinematicTranslation({ x: fakeDoorX, y: fakeTrapdoorY, z: trapdoorZ });
      }
    }

    // Victory
    if (!victoryTriggered) {
      const vx = playerPos.x - victoryZoneCenter.x;
      const vz = playerPos.z - victoryZoneCenter.z;
      if (vx * vx + vz * vz < 1.55 * 1.55 && Math.abs(playerPos.y - victoryZoneCenter.y) < 2.2) {
        victoryTriggered = true;
        soundEngine.playVictory();
        onVictory();
      }
    }
  };

  return {
    group,
    spawnPos,
    checkpointPos: cpSpawnPos,
    checkpointZoneCenter: cpCenter,
    checkpointZoneRadius: 2.25,
    get checkpointActivated() {
      return checkpointActivated;
    },
    get fakeExitTriggered() {
      return fakeExitTriggered;
    },
    victoryZoneCenter,
    victoryZoneRadius: 1.55,
    abyssY: -9.5,
    spikeTraps,
    collapsingPlatforms,
    movingHazards,
    hazardColliderHandles,
    collapsingColliderMap,
    sisterRig,
    introSisterRig,
    emergencyLights,
    atmosphere: {
      fogHex: theme.fogHex,
      keyHex: theme.keyHex,
      rimHex: theme.rimHex,
    },
    getPlatformDelta: (handle: number) => platformDeltaMap.get(handle) ?? null,
    updateAmbient,
    setShutterProgress,
    update,
    resetTraps,
    activateCheckpointVisuals,
    dispose: () => {
      sisterRig.dispose();
      introSisterRig.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

export function buildSectorLevel(
  sectorId: number,
  rapier: typeof RAPIER,
  world: RAPIER.World,
  textures: FacilityTextures,
): LevelInstance {
  if (sectorId === 1) {
    return buildSectorOneLevel(rapier, world, textures);
  }
  return buildCustomSectorLevel(sectorId, rapier, world, textures);
}

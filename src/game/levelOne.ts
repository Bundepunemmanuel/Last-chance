import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { FacilityTextures } from './textures';
import { createSisterModel, type SisterRig } from './character';
import { soundEngine } from './audio';

export interface SpikeTrap {
  id: string;
  triggerCenter: THREE.Vector3;
  triggerRadius: number;
  spikesGroup: THREE.Group;
  indicatorMat: THREE.MeshStandardMaterial;
  state: 'armed' | 'warning' | 'extended' | 'retracting';
  timer: number;
  extension: number; // 0..1
  hazardBoxMin: THREE.Vector3;
  hazardBoxMax: THREE.Vector3;
}

export interface CollapsingPlatform {
  id: string;
  mesh: THREE.Group;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  basePos: THREE.Vector3;
  halfSize: THREE.Vector3;
  state: 'idle' | 'shaking' | 'falling' | 'fallen';
  timer: number;
  fallVel: number;
  mat: THREE.MeshStandardMaterial;
}

export interface MovingHazard {
  id: string;
  kind: 'piston' | 'pendulum';
  mesh: THREE.Group;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  basePos: THREE.Vector3;
  amplitude: number;
  speed: number;
  phase: number;
  halfExtents: THREE.Vector3;
}

export interface LevelInstance {
  group: THREE.Group;
  spawnPos: THREE.Vector3;
  checkpointPos: THREE.Vector3;
  checkpointZoneCenter: THREE.Vector3;
  checkpointZoneRadius: number;
  checkpointActivated: boolean;
  fakeExitTriggered: boolean;
  victoryZoneCenter: THREE.Vector3;
  victoryZoneRadius: number;
  abyssY: number;
  spikeTraps: SpikeTrap[];
  collapsingPlatforms: CollapsingPlatform[];
  movingHazards: MovingHazard[];
  hazardColliderHandles: Set<number>;
  collapsingColliderMap: Map<number, CollapsingPlatform>;
  sisterRig: SisterRig;
  introSisterRig: SisterRig;
  emergencyLights: THREE.PointLight[];
  updateAmbient: (dt: number) => void;
  setShutterProgress: (progress: number) => void;
  update: (
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    groundedColliderHandle: number | null,
    onTrapMessage: (msg: string) => void,
    onCheckpoint: () => void,
    onVictory: () => void,
    onSpikeKill: (reason: string) => void,
  ) => void;
  resetTraps: () => void;
  activateCheckpointVisuals: () => void;
  dispose: () => void;
}

export function buildSectorOneLevel(
  rapier: typeof RAPIER,
  world: RAPIER.World,
  textures: FacilityTextures,
): LevelInstance {
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

  // Shared calibrated PBR materials (with bump + roughness maps)
  const concreteMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.concreteColor,
      roughnessMap: textures.concreteRoughness,
      bumpMap: textures.concreteBump,
      bumpScale: 0.045,
      roughness: 0.88,
      metalness: 0.05,
    }),
  );
  const darkSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x262d37,
      roughness: 0.4,
      metalness: 0.82,
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
      color: 0x623925,
      roughness: 0.72,
      metalness: 0.48,
    }),
  );
  const wallMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.wallPanelColor,
      bumpMap: textures.wallPanelBump,
      bumpScale: 0.06,
      roughness: 0.76,
      metalness: 0.2,
    }),
  );
  const gratingMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.gratingColor,
      roughness: 0.48,
      metalness: 0.68,
    }),
  );
  const hazardMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.hazardStripeColor,
      roughness: 0.52,
      metalness: 0.25,
    }),
  );
  const drumMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.drumColor,
      roughness: 0.6,
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
      emissive: 0xcfe8ff,
      emissiveIntensity: 2.1,
      roughness: 0.2,
    }),
  );
  const cableMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x16191e,
      roughness: 0.85,
      metalness: 0.12,
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

  const addStaticPlatform = (
    cx: number,
    topY: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
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
    world.createCollider(rapier.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setFriction(0.8), body);
  };

  // =========================================================================
  // ZONE A: ENTRY CONTAINMENT BAY (z: +4.5 down to -5.0, topY = 0)
  // =========================================================================
  addStaticPlatform(0, 0, -0.25, 6.2, 1.2, 9.5, concreteMat, true);

  // Back containment bulkhead wall behind spawn
  const backWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.6, 5.4, 0.65)), wallMat);
  backWall.position.set(0, 2.5, 4.8);
  backWall.receiveShadow = true;
  group.add(backWall);
  const backBody = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(0, 2.5, 4.8));
  world.createCollider(rapier.ColliderDesc.cuboid(3.8, 2.7, 0.32), backBody);

  // Entry Containment Observation Chamber on Left (-X) showing Sister right at start!
  const obsFloor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.2, 1.0, 4.2)), concreteMat);
  obsFloor.position.set(-4.8, -0.25, -1.6);
  obsFloor.receiveShadow = true;
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

  // Observation Reinforced Glass + Steel Mullions + Invisible Physics Barrier at x = -3.15
  const obsLedge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.95, 4.1)), darkSteelMat);
  obsLedge.position.set(-3.15, 0.47, -1.6);
  group.add(obsLedge);

  const obsGlass = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(3.75, 2.65)), glassMat);
  obsGlass.rotation.y = Math.PI / 2;
  obsGlass.position.set(-3.15, 2.25, -1.6);
  group.add(obsGlass);

  for (const mz of [-2.8, -1.6, -0.4]) {
    const mullion = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.1, 2.7, 0.1)), darkSteelMat);
    mullion.position.set(-3.14, 2.25, mz);
    group.add(mullion);
  }

  // Physics barrier along the observation bay edge so player can walk right up to the glass
  const obsBarrierBody = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(-3.15, 1.8, -1.6));
  world.createCollider(rapier.ColliderDesc.cuboid(0.2, 1.8, 2.1), obsBarrierBody);

  // Motorized Steel Blast Shutter (drops down ~5s into run or past z=-4.0)
  const blastShutter = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 2.7, 3.8)), wallMat);
  const shutterOpenY = 5.05;
  const shutterClosedY = 2.25;
  blastShutter.position.set(-3.26, shutterOpenY, -1.6);
  group.add(blastShutter);

  const obsLight = new THREE.PointLight(0x38bdf8, 2.4, 8, 2);
  obsLight.position.set(-4.7, 3.6, -1.6);
  group.add(obsLight);
  emergencyLights.push(obsLight);

  const introSisterRig = createSisterModel();
  introSisterRig.root.position.set(-4.65, 0.25, -1.6);
  introSisterRig.root.rotation.y = Math.PI * 0.36; // Turned toward spawn & walkway
  group.add(introSisterRig.root);

  // Biohazard Drums beside Back Wall & Observation Bay
  const drumGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.32, 0.92, 12));
  const drumRimGeo = trackGeo(new THREE.TorusGeometry(0.32, 0.03, 6, 12));
  for (const [dx, dy, dz] of [
    [2.35, 0.46, 3.6],
    [2.45, 0.46, 2.75],
    [-2.4, 0.46, 3.7],
    [2.4, 1.46, -35.8],
  ]) {
    const dGroup = new THREE.Group();
    dGroup.position.set(dx, dy, dz);
    const body = new THREE.Mesh(drumGeo, drumMat);
    body.castShadow = true;
    body.receiveShadow = true;
    dGroup.add(body);
    const rimTop = new THREE.Mesh(drumRimGeo, darkSteelMat);
    rimTop.rotation.x = Math.PI / 2;
    rimTop.position.y = 0.44;
    dGroup.add(rimTop);
    group.add(dGroup);
  }

  // =========================================================================
  // ZONE A2: HIDDEN SPIKE CORRIDOR (z: -5.4 down to -15.4, topY = 0)
  // =========================================================================
  addStaticPlatform(0, 0, -10.4, 4.4, 1.0, 10.0, concreteMat, true);

  const spikeTraps: SpikeTrap[] = [];
  const createHiddenSpikeTrap = (id: string, cz: number, topY = 0, plateW = 3.8, plateD = 1.45) => {
    const baseGroup = new THREE.Group();
    baseGroup.position.set(0, topY + 0.01, cz);

    // Beveled dark steel pit perimeter frame
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
    spikesGroup.position.y = -0.95; // Retracted below floor
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

    const trap: SpikeTrap = {
      id,
      triggerCenter: new THREE.Vector3(0, topY, cz),
      triggerRadius: 2.3,
      spikesGroup,
      indicatorMat,
      state: 'armed',
      timer: 0,
      extension: 0,
      hazardBoxMin: new THREE.Vector3(-(plateW * 0.48), topY - 0.1, cz - plateD * 0.44),
      hazardBoxMax: new THREE.Vector3(plateW * 0.48, topY + 0.95, cz + plateD * 0.44),
    };
    spikeTraps.push(trap);
    return trap;
  };

  createHiddenSpikeTrap('spike_entry_1', -7.8, 0, 3.8, 1.45);
  createHiddenSpikeTrap('spike_entry_2', -12.6, 0, 3.8, 1.45);

  // =========================================================================
  // ZONE B: COLLAPSING CATWALK GAP (z: -16.8 down to -29.0)
  // =========================================================================
  const collapsingPlatforms: CollapsingPlatform[] = [];
  const createCollapsingPlatform = (id: string, x: number, topY: number, z: number, w: number, d: number) => {
    const h = 0.36;
    const cy = topY - h / 2;
    const platGroup = new THREE.Group();
    platGroup.position.set(x, cy, z);

    const mat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.gratingColor,
        color: 0xffffff,
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

    // Steel edge trim rails + underside support girders + warning corner lights
    const railEdge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w + 0.1, 0.09, d + 0.1)), hazardMat);
    railEdge.position.y = h * 0.38;
    platGroup.add(railEdge);

    const strutGeo = trackGeo(new THREE.BoxGeometry(w * 0.94, 0.16, 0.2));
    for (const sz of [-d * 0.34, d * 0.34]) {
      const s = new THREE.Mesh(strutGeo, rustBeamMat);
      s.position.set(0, -h * 0.62, sz);
      platGroup.add(s);
    }

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

  createCollapsingPlatform('collapse_1', -0.4, 0.25, -18.2, 2.9, 3.1);
  createCollapsingPlatform('collapse_2', 0.6, 0.55, -22.7, 2.9, 3.1);
  createCollapsingPlatform('collapse_3', -0.2, 0.85, -27.2, 2.9, 3.1);

  // =========================================================================
  // ZONE C: CHECKPOINT SECURITY ISLAND (z: -30.2 to -36.8, topY = 1.0)
  // =========================================================================
  addStaticPlatform(0, 1.0, -33.5, 6.4, 1.2, 6.6, concreteMat, true);

  // Checkpoint Security Terminal & Beacon Pad (detailed composite station)
  const cpKiosk = new THREE.Group();
  cpKiosk.position.set(-1.95, 1.0, -33.5);

  const cpBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.58, 0.68, 0.22, 12)), darkSteelMat);
  cpBase.position.y = 0.11;
  cpKiosk.add(cpBase);

  const cpPedestal = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.42, 1.1, 0.42)), darkSteelMat);
  cpPedestal.position.y = 0.66;
  cpPedestal.castShadow = true;
  cpKiosk.add(cpPedestal);

  // Angled Monitor Housing + Screen Texture
  const screenCase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.68, 0.52, 0.26)), darkSteelMat);
  screenCase.position.set(0.06, 1.32, 0.08);
  screenCase.rotation.y = Math.PI * 0.22;
  screenCase.rotation.x = -0.22;
  cpKiosk.add(screenCase);

  const screenFace = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.56, 0.4)), terminalScreenMat);
  screenFace.position.set(0.09, 1.33, 0.19);
  screenFace.rotation.y = Math.PI * 0.22;
  screenFace.rotation.x = -0.22;
  cpKiosk.add(screenFace);

  const cpMast = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.06, 0.08, 0.65, 8)), chromeMat);
  cpMast.position.set(-0.1, 1.68, -0.08);
  cpKiosk.add(cpMast);

  const cpBeaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.9,
      roughness: 0.2,
      metalness: 0.2,
    }),
  );
  const cpBeacon = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.15, 0.15, 0.24, 12)), cpBeaconMat);
  cpBeacon.position.set(-0.1, 2.08, -0.08);
  cpKiosk.add(cpBeacon);

  const cpRing = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.85, 0.045, 8, 28)), cpBeaconMat);
  cpRing.rotation.x = Math.PI / 2;
  cpRing.position.set(1.95, 0.05, 0); // Centered over checkpoint pad at x = 0
  cpKiosk.add(cpRing);
  group.add(cpKiosk);

  const cpLight = new THREE.PointLight(0xf59e0b, 1.9, 10, 2);
  cpLight.position.set(-1.95, 3.0, -33.5);
  group.add(cpLight);
  emergencyLights.push(cpLight);

  // =========================================================================
  // ZONE D: MOVING MACHINERY GAUNTLET (z: -38.1 to -56.1, topY = 1.0)
  // =========================================================================
  addStaticPlatform(0, 1.0, -47.1, 4.0, 1.1, 18.0, concreteMat, true);

  const movingHazards: MovingHazard[] = [];

  const createHydraulicPiston = (id: string, zPos: number, phase: number, speed: number) => {
    const pGroup = new THREE.Group();
    pGroup.position.set(0, 1.75, zPos);

    const ramBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.5, 1.35, 1.1)), rustBeamMat);
    ramBody.castShadow = true;
    pGroup.add(ramBody);

    const ramFace = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.58, 1.15, 1.16)), hazardMat);
    pGroup.add(ramFace);

    // Chrome dual hydraulic rods + bolted bumper caps
    const rodGeo = trackGeo(new THREE.CylinderGeometry(0.1, 0.1, 3.4, 8));
    for (const ry of [-0.32, 0.32]) {
      const rod = new THREE.Mesh(rodGeo, chromeMat);
      rod.rotation.z = Math.PI / 2;
      rod.position.y = ry;
      pGroup.add(rod);
    }

    const capGeo = trackGeo(new THREE.BoxGeometry(0.12, 1.38, 1.18));
    for (const cx of [-0.82, 0.82]) {
      const cap = new THREE.Mesh(capGeo, darkSteelMat);
      cap.position.x = cx;
      pGroup.add(cap);
    }

    group.add(pGroup);

    const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1.75, zPos));
    const collider = world.createCollider(rapier.ColliderDesc.cuboid(0.76, 0.68, 0.56), body);
    hazardColliderHandles.add(collider.handle);

    movingHazards.push({
      id,
      kind: 'piston',
      mesh: pGroup,
      body,
      collider,
      basePos: new THREE.Vector3(0, 1.75, zPos),
      amplitude: 1.7,
      speed,
      phase,
      halfExtents: new THREE.Vector3(0.76, 0.68, 0.56),
    });
  };

  createHydraulicPiston('piston_1', -41.5, 0, 2.05);
  createHydraulicPiston('piston_2', -47.5, Math.PI, 2.35);

  // Hidden spike ambush right after second piston
  createHiddenSpikeTrap('spike_gauntlet', -51.4, 1.0, 3.6, 1.35);

  // Swinging Circular Pendulum Saw at z = -54.2
  {
    const pendGroup = new THREE.Group();
    pendGroup.position.set(0, 1.9, -54.2);

    const sawDisc = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.86, 0.86, 0.12, 20)), chromeMat);
    sawDisc.rotation.x = Math.PI / 2;
    sawDisc.castShadow = true;
    pendGroup.add(sawDisc);

    const sawHub = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.48, 0.48, 0.18, 14)), hazardMat);
    sawHub.rotation.x = Math.PI / 2;
    pendGroup.add(sawHub);

    // Sawtooth rim lugs
    const toothGeo = trackGeo(new THREE.ConeGeometry(0.11, 0.24, 4));
    for (let t = 0; t < 12; t++) {
      const angle = (t / 12) * Math.PI * 2;
      const tooth = new THREE.Mesh(toothGeo, spikeTipMat);
      tooth.position.set(Math.cos(angle) * 0.88, Math.sin(angle) * 0.88, 0);
      tooth.rotation.z = angle - Math.PI / 2;
      pendGroup.add(tooth);
    }

    const pivotArm = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.09, 0.11, 3.8, 8)), darkSteelMat);
    pivotArm.position.y = 1.95;
    pendGroup.add(pivotArm);

    group.add(pendGroup);

    const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1.9, -54.2));
    const collider = world.createCollider(rapier.ColliderDesc.cuboid(0.86, 0.62, 0.18), body);
    hazardColliderHandles.add(collider.handle);

    movingHazards.push({
      id: 'pendulum_saw',
      kind: 'pendulum',
      mesh: pendGroup,
      body,
      collider,
      basePos: new THREE.Vector3(0, 1.9, -54.2),
      amplitude: 2.2,
      speed: 2.5,
      phase: 0.7,
      halfExtents: new THREE.Vector3(0.86, 0.62, 0.18),
    });
  }

  // =========================================================================
  // ZONE E: FAKE EXIT DECOY & TRUE RESCUE EXTRACTION GANTRY
  // =========================================================================
  addStaticPlatform(0, 1.0, -59.5, 4.4, 1.1, 4.2, concreteMat, true);

  // Trapdoor grate directly in front of the fake green door (z: -61.7 to -65.7, topY = 1.0)
  const fakeTrapdoorMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.gratingColor,
      color: 0xffffff,
      roughness: 0.45,
      metalness: 0.65,
    }),
  );
  const fakeTrapdoorMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.2, 0.35, 4.0)), fakeTrapdoorMat);
  fakeTrapdoorMesh.position.set(0, 0.825, -63.7);
  group.add(fakeTrapdoorMesh);
  const fakeTrapdoorBody = world.createRigidBody(
    rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.825, -63.7),
  );
  world.createCollider(rapier.ColliderDesc.cuboid(2.1, 0.175, 2.0), fakeTrapdoorBody);

  // Fake Exit Bulkhead & Illuminated Sign (turns from GREEN EXIT to RED DECOY!)
  const fakeDoorFrame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.6, 4.2, 0.6)), wallMat);
  fakeDoorFrame.position.set(0, 3.0, -66.2);
  group.add(fakeDoorFrame);

  const fakeVaultDoor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.6, 2.6, 0.25)), darkSteelMat);
  fakeVaultDoor.position.set(0, 2.25, -65.85);
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
  fakeSign.position.set(0, 3.95, -65.85);
  group.add(fakeSign);

  const fakeExitLight = new THREE.PointLight(0x10b981, 2.4, 12, 2);
  fakeExitLight.position.set(0, 3.4, -64.4);
  group.add(fakeExitLight);
  emergencyLights.push(fakeExitLight);

  // TRUE RESCUE GANTRY ON THE RIGHT (+X) — rises into reachable position when decoy activates!
  const rescueGantryGroup = new THREE.Group();
  const gantryStartPos = new THREE.Vector3(4.3, -4.5, -67.5);
  const gantryRaisedPos = new THREE.Vector3(4.3, 1.25, -67.5);
  rescueGantryGroup.position.copy(gantryStartPos);

  const gantryDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.4, 0.8, 14.0)), gratingMat);
  gantryDeck.receiveShadow = true;
  rescueGantryGroup.add(gantryDeck);

  const gantryTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.5, 0.14, 14.1)), hazardMat);
  gantryTrim.position.y = 0.35;
  rescueGantryGroup.add(gantryTrim);
  group.add(rescueGantryGroup);

  const gantryBody = world.createRigidBody(
    rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(gantryStartPos.x, gantryStartPos.y, gantryStartPos.z),
  );
  world.createCollider(rapier.ColliderDesc.cuboid(1.7, 0.4, 7.0).setFriction(0.9), gantryBody);

  // True Extraction Airlock Chamber + Circular Vault Door + Younger Sister waiting at Airlock B-2
  addStaticPlatform(4.3, 1.65, -73.0, 5.4, 1.2, 5.2, concreteMat, true);

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
  rescueArch.position.set(4.3, 3.75, -75.4);
  group.add(rescueArch);

  // Circular Airlock Vault Door & Locking Wheel
  const vaultDoor = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.35, 1.35, 0.24, 24)), darkSteelMat);
  vaultDoor.rotation.x = Math.PI / 2;
  vaultDoor.position.set(4.3, 2.95, -75.02);
  group.add(vaultDoor);

  const vaultRim = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.38, 0.09, 8, 24)), hazardMat);
  vaultRim.position.set(4.3, 2.95, -74.92);
  group.add(vaultRim);

  const vaultWheel = new THREE.Group();
  vaultWheel.position.set(4.3, 2.95, -74.84);
  vaultWheel.add(new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.46, 0.055, 8, 16)), chromeMat));
  for (let s = 0; s < 3; s++) {
    const spoke = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6)), chromeMat);
    spoke.rotation.z = (s * Math.PI) / 3;
    vaultWheel.add(spoke);
  }
  group.add(vaultWheel);

  const rescueSign = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(3.4, 1.15)), rescueSignMat);
  rescueSign.position.set(4.3, 4.9, -75.04);
  group.add(rescueSign);

  const rescuePadMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x0284c7,
      emissiveIntensity: 1.5,
      roughness: 0.3,
    }),
  );
  const rescuePad = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.15, 1.25, 0.1, 20)), rescuePadMat);
  rescuePad.position.set(4.3, 1.7, -72.6);
  group.add(rescuePad);

  const rescueLight = new THREE.PointLight(0x38bdf8, 2.8, 14, 2);
  rescueLight.position.set(4.3, 4.3, -72.6);
  group.add(rescueLight);
  emergencyLights.push(rescueLight);

  const sisterRig = createSisterModel();
  sisterRig.root.position.set(4.3, 1.65, -73.9);
  group.add(sisterRig.root);

  // =========================================================================
  // HIGH-DETAIL INSTANCED ARCHITECTURAL PROPS (Guardrails, Lights, Pipes, Cables)
  // =========================================================================
  const dummy = new THREE.Object3D();

  // 1. Structural I-beam Pillars (instanced)
  const pillarGeo = trackGeo(new THREE.BoxGeometry(0.65, 14.0, 0.85));
  const pillarInst = new THREE.InstancedMesh(pillarGeo, darkSteelMat, 22);
  let pIdx = 0;
  for (let i = 0; i < 11; i++) {
    const pz = 2.0 - i * 7.4;
    dummy.position.set(-6.0, 1.5, pz);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    pillarInst.setMatrixAt(pIdx++, dummy.matrix);

    dummy.position.set(8.2, 1.5, pz);
    dummy.updateMatrix();
    pillarInst.setMatrixAt(pIdx++, dummy.matrix);
  }
  pillarInst.computeBoundingSphere();
  group.add(pillarInst);

  // 2. Overhead Ceiling Trusses & Fluorescent Light Fixtures (instanced)
  const trussGeo = trackGeo(new THREE.BoxGeometry(15.2, 0.45, 0.55));
  const trussInst = new THREE.InstancedMesh(trussGeo, rustBeamMat, 11);
  const fluoroGeo = trackGeo(new THREE.BoxGeometry(2.6, 0.09, 0.22));
  const fluoroInst = new THREE.InstancedMesh(fluoroGeo, fluoroMat, 11);
  for (let i = 0; i < 11; i++) {
    const lz = 2.0 - i * 7.4;
    dummy.position.set(1.1, 6.8, lz);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trussInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(0.3, 6.52, lz);
    dummy.updateMatrix();
    fluoroInst.setMatrixAt(i, dummy.matrix);
  }
  trussInst.computeBoundingSphere();
  fluoroInst.computeBoundingSphere();
  group.add(trussInst);
  group.add(fluoroInst);

  // 3. Corridor Safety Guardrail Posts (instanced along outer edges)
  const railPostPositions: Array<[number, number, number]> = [
    [2.9, 0, 3.6], [2.9, 0, 1.2], [2.9, 0, -1.2], [2.9, 0, -3.6],
    [-2.0, 0, -6.2], [-2.0, 0, -10.4], [-2.0, 0, -14.6],
    [2.0, 0, -6.2], [2.0, 0, -10.4], [2.0, 0, -14.6],
    [-3.0, 1.0, -31.0], [-3.0, 1.0, -33.5], [-3.0, 1.0, -36.0],
    [3.0, 1.0, -31.0], [3.0, 1.0, -33.5], [3.0, 1.0, -36.0],
  ];
  const postGeo = trackGeo(new THREE.CylinderGeometry(0.045, 0.05, 0.95, 6));
  const postInst = new THREE.InstancedMesh(postGeo, hazardMat, railPostPositions.length);
  railPostPositions.forEach(([x, y, z], idx) => {
    dummy.position.set(x, y + 0.47, z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    postInst.setMatrixAt(idx, dummy.matrix);
  });
  postInst.computeBoundingSphere();
  group.add(postInst);

  // Continuous Top Rail Bars along outer edges
  const addRailBar = (x: number, y: number, z: number, len: number) => {
    const bar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.032, 0.032, len, 6)), chromeMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(x, y + 0.92, z);
    group.add(bar);
  };
  addRailBar(2.9, 0, 0, 7.3);
  addRailBar(-2.0, 0, -10.4, 8.5);
  addRailBar(2.0, 0, -10.4, 8.5);
  addRailBar(-3.0, 1.0, -33.5, 5.1);
  addRailBar(3.0, 1.0, -33.5, 5.1);

  // 4. Pressurized Overhead Conduits, Valve Handwheels & Hanging Power Cables
  const pipeGeo = trackGeo(new THREE.CylinderGeometry(0.22, 0.22, 84, 8));
  for (const px of [-4.2, 6.8]) {
    const pipe = new THREE.Mesh(pipeGeo, rustBeamMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(px, 6.1, -36);
    group.add(pipe);
  }

  const valveGeo = trackGeo(new THREE.TorusGeometry(0.24, 0.04, 6, 12));
  for (const vz of [-8, -24, -40, -56]) {
    const valve = new THREE.Mesh(valveGeo, hazardMat);
    valve.rotation.y = Math.PI / 2;
    valve.position.set(-3.95, 5.9, vz);
    group.add(valve);
  }

  // Draping Overhead Cables (CatmullRomCurve3 + TubeGeometry)
  for (const cz of [-5, -19, -35, -50, -64]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-4.2, 6.0, cz),
      new THREE.Vector3(-1.1, 4.9, cz - 0.6),
      new THREE.Vector3(2.8, 5.1, cz - 0.4),
      new THREE.Vector3(6.8, 6.0, cz),
    ]);
    const cableGeo = trackGeo(new THREE.TubeGeometry(curve, 14, 0.045, 5, false));
    group.add(new THREE.Mesh(cableGeo, cableMat));
  }

  // Deep reactor abyss plane far below
  const abyssPlane = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(70, 130)),
    trackMat(new THREE.MeshBasicMaterial({ color: 0x05070a })),
  );
  abyssPlane.rotation.x = -Math.PI / 2;
  abyssPlane.position.set(0, -14, -36);
  group.add(abyssPlane);

  // State flags
  let checkpointActivated = false;
  let fakeExitTriggered = false;
  let fakeTrapdoorDropTimer = 0;
  let fakeTrapdoorFalling = false;
  let fakeTrapdoorY = 0.825;
  let gantryLiftProgress = 0;
  let victoryTriggered = false;
  let introTimer = 0;
  let shutterProgress = 0;

  const spawnPos = new THREE.Vector3(0, 0.95, 2.2);
  const checkpointPos = new THREE.Vector3(0, 1.95, -33.5);
  const checkpointZoneCenter = new THREE.Vector3(0, 1.0, -33.5);
  const victoryZoneCenter = new THREE.Vector3(4.3, 1.65, -72.6);

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
    fakeTrapdoorY = 0.825;
    fakeTrapdoorMesh.position.set(0, 0.825, -63.7);
    fakeTrapdoorBody.setNextKinematicTranslation({ x: 0, y: 0.825, z: -63.7 });

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

    // Entry observation bay blast shutter slides shut after 4.8s or once player moves down corridor
    introTimer += dt;
    if ((introTimer > 4.8 || playerPos.z < -4.2) && shutterProgress < 1) {
      shutterProgress = Math.min(1, shutterProgress + dt * 1.4);
      blastShutter.position.y = THREE.MathUtils.lerp(shutterOpenY, shutterClosedY, shutterProgress);
    }

    // 1. Update Hidden Spike Traps
    for (const st of spikeTraps) {
      const dx = playerPos.x - st.triggerCenter.x;
      const dz = playerPos.z - st.triggerCenter.z;
      const dy = Math.abs(playerPos.y - st.triggerCenter.y);
      const distSq = dx * dx + dz * dz;

      if (st.state === 'armed') {
        if (distSq < st.triggerRadius * st.triggerRadius && dy < 2.0) {
          st.state = 'warning';
          st.timer = 0.19;
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

        if (st.timer <= 0) {
          st.state = 'retracting';
        }
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

    // 2. Update Collapsing Platforms
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
          cp.timer = 0.42;
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
        if (nextY < -16) {
          cp.state = 'fallen';
        }
      }
    }

    // 3. Update Moving Machinery Hazards
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

    // 4. Checkpoint Activation
    if (!checkpointActivated) {
      const dx = playerPos.x - checkpointZoneCenter.x;
      const dz = playerPos.z - checkpointZoneCenter.z;
      if (dx * dx + dz * dz < 2.25 * 2.25 && Math.abs(playerPos.y - checkpointZoneCenter.y) < 2.2) {
        activateCheckpointVisuals();
        soundEngine.playCheckpoint();
        onCheckpoint();
        onTrapMessage('CHECKPOINT SECURED — PROGRESS SAVED');
      }
    }

    // 5. Fake Exit Decoy Twist & True Extraction Gantry Activation
    if (!fakeExitTriggered && playerPos.z <= -59.5 && Math.abs(playerPos.x) < 2.6) {
      fakeExitTriggered = true;
      fakeTrapdoorDropTimer = 0.28;
      fakeSignMat.map = textures.decoySignTexture;
      fakeSignMat.emissiveMap = textures.decoySignTexture;
      fakeSignMat.emissive.setHex(0xef4444);
      fakeSignMat.needsUpdate = true;
      fakeExitLight.color.setHex(0xef4444);
      soundEngine.playFakeExitAlarm();
      onTrapMessage('DECOY LOCKDOWN! JUMP RIGHT TO AIRLOCK B-2!');
    }

    if (fakeExitTriggered) {
      if (gantryLiftProgress < 1) {
        gantryLiftProgress = Math.min(1, gantryLiftProgress + dt * 2.2);
        const eased = 1 - Math.pow(1 - gantryLiftProgress, 3);
        const gy = THREE.MathUtils.lerp(gantryStartPos.y, gantryRaisedPos.y, eased);
        rescueGantryGroup.position.y = gy;
        gantryBody.setNextKinematicTranslation({ x: gantryRaisedPos.x, y: gy, z: gantryRaisedPos.z });
      }

      if (!fakeTrapdoorFalling && playerPos.z <= -61.5 && Math.abs(playerPos.x) < 2.5) {
        fakeTrapdoorDropTimer -= dt;
        if (fakeTrapdoorDropTimer <= 0) {
          fakeTrapdoorFalling = true;
          soundEngine.playPlatformCreak();
        }
      }
      if (fakeTrapdoorFalling && fakeTrapdoorY > -15) {
        fakeTrapdoorY -= 16 * dt;
        fakeTrapdoorMesh.position.y = fakeTrapdoorY;
        fakeTrapdoorBody.setNextKinematicTranslation({ x: 0, y: fakeTrapdoorY, z: -63.7 });
      }
    }

    // 6. Victory Zone Check
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
    checkpointPos,
    checkpointZoneCenter,
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

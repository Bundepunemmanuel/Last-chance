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
  emergencyLights: THREE.PointLight[];
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

  // Shared calibrated PBR materials
  const concreteMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.concreteColor,
      roughnessMap: textures.concreteRoughness,
      roughness: 0.88,
      metalness: 0.05,
    }),
  );
  const darkSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2b313a,
      roughness: 0.42,
      metalness: 0.78,
    }),
  );
  const rustBeamMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5c3624,
      roughness: 0.72,
      metalness: 0.48,
    }),
  );
  const wallMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.wallPanelColor,
      roughness: 0.78,
      metalness: 0.18,
    }),
  );
  const gratingMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.gratingColor,
      roughness: 0.5,
      metalness: 0.65,
    }),
  );
  const hazardMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.hazardStripeColor,
      roughness: 0.55,
      metalness: 0.25,
    }),
  );
  const spikeSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
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
  const backWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.2, 5.2, 0.6)), wallMat);
  backWall.position.set(0, 2.4, 4.8);
  backWall.receiveShadow = true;
  group.add(backWall);
  const backBody = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(0, 2.4, 4.8));
  world.createCollider(rapier.ColliderDesc.cuboid(3.6, 2.6, 0.3), backBody);

  // =========================================================================
  // ZONE A2: HIDDEN SPIKE CORRIDOR (z: -5.4 down to -15.4, topY = 0)
  // =========================================================================
  addStaticPlatform(0, 0, -10.4, 4.4, 1.0, 10.0, concreteMat, true);

  const spikeTraps: SpikeTrap[] = [];
  const createHiddenSpikeTrap = (id: string, cz: number) => {
    const baseGroup = new THREE.Group();
    baseGroup.position.set(0, 0.01, cz);

    const indicatorMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3f444c,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.45,
        metalness: 0.65,
      }),
    );
    const seamPlate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.8, 0.04, 1.45)), indicatorMat);
    seamPlate.receiveShadow = true;
    baseGroup.add(seamPlate);

    const spikesGroup = new THREE.Group();
    spikesGroup.position.y = -0.95; // Retracted below floor
    baseGroup.add(spikesGroup);

    const spikeConeGeo = trackGeo(new THREE.ConeGeometry(0.11, 0.92, 6));
    const tipGeo = trackGeo(new THREE.ConeGeometry(0.055, 0.32, 6));
    for (let ix = -1; ix <= 1; ix++) {
      for (let iz = -1; iz <= 1; iz++) {
        const sx = ix * 1.15;
        const sz = iz * 0.42;
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
      triggerCenter: new THREE.Vector3(0, 0, cz),
      triggerRadius: 2.35,
      spikesGroup,
      indicatorMat,
      state: 'armed',
      timer: 0,
      extension: 0,
      hazardBoxMin: new THREE.Vector3(-1.85, -0.1, cz - 0.65),
      hazardBoxMax: new THREE.Vector3(1.85, 0.95, cz + 0.65),
    });
  };

  createHiddenSpikeTrap('spike_entry_1', -7.8);
  createHiddenSpikeTrap('spike_entry_2', -12.6);

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
        roughness: 0.48,
        metalness: 0.68,
      }),
    );

    const deck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, h, d)), mat);
    deck.castShadow = true;
    deck.receiveShadow = true;
    platGroup.add(deck);

    // Underside support struts (composite multi-part structure)
    const strutGeo = trackGeo(new THREE.BoxGeometry(w * 0.94, 0.14, 0.18));
    const s1 = new THREE.Mesh(strutGeo, rustBeamMat);
    s1.position.set(0, -h * 0.6, -d * 0.32);
    platGroup.add(s1);
    const s2 = new THREE.Mesh(strutGeo, rustBeamMat);
    s2.position.set(0, -h * 0.6, d * 0.32);
    platGroup.add(s2);

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

  // Checkpoint Kiosk (5-part composite model)
  const cpKiosk = new THREE.Group();
  cpKiosk.position.set(-1.9, 1.0, -33.5);
  const cpBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.55, 0.65, 0.22, 12)), darkSteelMat);
  cpBase.position.y = 0.11;
  cpKiosk.add(cpBase);
  const cpPillar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.28, 1.45, 0.28)), darkSteelMat);
  cpPillar.position.y = 0.85;
  cpPillar.castShadow = true;
  cpKiosk.add(cpPillar);
  const cpBeaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.8,
      roughness: 0.2,
      metalness: 0.2,
    }),
  );
  const cpBeacon = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 0.24, 12)), cpBeaconMat);
  cpBeacon.position.y = 1.7;
  cpKiosk.add(cpBeacon);
  const cpRing = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.7, 0.045, 8, 24)), cpBeaconMat);
  cpRing.rotation.x = Math.PI / 2;
  cpRing.position.set(1.9, 0.05, 0); // Centered over checkpoint pad at x = 0
  cpKiosk.add(cpRing);
  group.add(cpKiosk);

  const cpLight = new THREE.PointLight(0xf59e0b, 1.8, 9, 2);
  cpLight.position.set(-1.9, 2.8, -33.5);
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

    const rod = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 3.2, 8)), spikeSteelMat);
    rod.rotation.z = Math.PI / 2;
    pGroup.add(rod);

    group.add(pGroup);

    const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1.75, zPos));
    const collider = world.createCollider(rapier.ColliderDesc.cuboid(0.75, 0.68, 0.55), body);
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
      halfExtents: new THREE.Vector3(0.75, 0.68, 0.55),
    });
  };

  createHydraulicPiston('piston_1', -41.5, 0, 2.05);
  createHydraulicPiston('piston_2', -47.5, Math.PI, 2.35);

  // Hidden spike ambush right after second piston
  const spikeAmbush = createHiddenSpikeTrapReturnable('spike_gauntlet', -51.4, 1.0);
  function createHiddenSpikeTrapReturnable(id: string, cz: number, topY: number): SpikeTrap {
    const baseGroup = new THREE.Group();
    baseGroup.position.set(0, topY + 0.01, cz);

    const indicatorMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3f444c,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.45,
        metalness: 0.65,
      }),
    );
    const seamPlate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.6, 0.04, 1.35)), indicatorMat);
    seamPlate.receiveShadow = true;
    baseGroup.add(seamPlate);

    const spikesGroup = new THREE.Group();
    spikesGroup.position.y = -0.95;
    baseGroup.add(spikesGroup);

    const spikeConeGeo = trackGeo(new THREE.ConeGeometry(0.11, 0.92, 6));
    const tipGeo = trackGeo(new THREE.ConeGeometry(0.055, 0.32, 6));
    for (let ix = -1; ix <= 1; ix++) {
      for (let iz = -1; iz <= 1; iz++) {
        const sx = ix * 1.1;
        const sz = iz * 0.4;
        const cone = new THREE.Mesh(spikeConeGeo, spikeSteelMat);
        cone.position.set(sx, 0.46, sz);
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
      triggerRadius: 2.2,
      spikesGroup,
      indicatorMat,
      state: 'armed',
      timer: 0,
      extension: 0,
      hazardBoxMin: new THREE.Vector3(-1.75, topY - 0.1, cz - 0.6),
      hazardBoxMax: new THREE.Vector3(1.75, topY + 0.95, cz + 0.6),
    };
    spikeTraps.push(trap);
    return trap;
  }
  void spikeAmbush;

  // Swinging Pendulum Blade at z = -54.2
  {
    const pendGroup = new THREE.Group();
    pendGroup.position.set(0, 1.9, -54.2);

    const blade = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.7, 1.15, 0.35)), hazardMat);
    blade.castShadow = true;
    pendGroup.add(blade);

    const pivotArm = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.09, 0.09, 3.6, 8)), darkSteelMat);
    pivotArm.position.y = 1.9;
    pendGroup.add(pivotArm);

    group.add(pendGroup);

    const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1.9, -54.2));
    const collider = world.createCollider(rapier.ColliderDesc.cuboid(0.85, 0.58, 0.18), body);
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
      halfExtents: new THREE.Vector3(0.85, 0.58, 0.18),
    });
  }

  // =========================================================================
  // ZONE E: FAKE EXIT DECOY & TRUE RESCUE EXTRACTION GANTRY
  // =========================================================================
  // Safe approach pad before fake exit (z: -57.4 to -61.6, topY = 1.0)
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
  fakeSign.position.set(0, 3.85, -65.85);
  group.add(fakeSign);

  const fakeExitLight = new THREE.PointLight(0x10b981, 2.4, 12, 2);
  fakeExitLight.position.set(0, 3.4, -64.4);
  group.add(fakeExitLight);
  emergencyLights.push(fakeExitLight);

  // TRUE RESCUE GANTRY ON THE RIGHT (+X) — rises into reachable position when decoy activates!
  // Base step platform on the right side (x: +4.3, z: -60.5 to -74.5, topY = 1.65)
  const rescueGantryGroup = new THREE.Group();
  const gantryStartPos = new THREE.Vector3(4.3, -4.5, -67.5); // Hidden below until decoy triggers!
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

  // True Extraction Airlock Chamber + Younger Sister waiting at (x: 4.3, y: 1.65, z: -72.8)
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
  const rescueArch = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.6, 4.2, 0.6)), wallMat);
  rescueArch.position.set(4.3, 3.65, -75.4);
  group.add(rescueArch);

  const rescueSign = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(3.4, 1.2)), rescueSignMat);
  rescueSign.position.set(4.3, 4.4, -75.05);
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
  rescueLight.position.set(4.3, 4.2, -72.6);
  group.add(rescueLight);
  emergencyLights.push(rescueLight);

  const sisterRig = createSisterModel();
  sisterRig.root.position.set(4.3, 1.65, -73.9);
  group.add(sisterRig.root);

  // =========================================================================
  // ATMOSPHERIC FACILITY ARCHITECTURE (Flanking pillars, overhead pipes, abyss)
  // =========================================================================
  // Instanced structural I-beam ribs along corridor for low draw calls
  const pillarGeo = trackGeo(new THREE.BoxGeometry(0.65, 14.0, 0.85));
  const pillarInst = new THREE.InstancedMesh(pillarGeo, darkSteelMat, 22);
  const dummy = new THREE.Object3D();
  let pIdx = 0;
  for (let i = 0; i < 11; i++) {
    const pz = 2.0 - i * 7.4;
    dummy.position.set(-5.8, 1.5, pz);
    dummy.updateMatrix();
    pillarInst.setMatrixAt(pIdx++, dummy.matrix);

    dummy.position.set(8.2, 1.5, pz);
    dummy.updateMatrix();
    pillarInst.setMatrixAt(pIdx++, dummy.matrix);
  }
  pillarInst.computeBoundingSphere();
  group.add(pillarInst);

  // Overhead industrial ceiling trusses & pipes (instanced)
  const trussGeo = trackGeo(new THREE.BoxGeometry(15.0, 0.45, 0.55));
  const trussInst = new THREE.InstancedMesh(trussGeo, rustBeamMat, 11);
  for (let i = 0; i < 11; i++) {
    dummy.position.set(1.2, 6.8, 2.0 - i * 7.4);
    dummy.updateMatrix();
    trussInst.setMatrixAt(i, dummy.matrix);
  }
  trussInst.computeBoundingSphere();
  group.add(trussInst);

  // Longitudinal pipes
  const pipeGeo = trackGeo(new THREE.CylinderGeometry(0.22, 0.22, 82, 8));
  for (const px of [-4.2, 6.8]) {
    const pipe = new THREE.Mesh(pipeGeo, rustBeamMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(px, 6.1, -36);
    group.add(pipe);
  }

  // Deep reactor abyss glow plane far below
  const abyssPlane = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(60, 120)),
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
    sisterRig.update(elapsed);

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

        // Check lethal spike intersection against player feet/body
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
        // Also allow proximity foot check in case controller steps onto edge
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

      // Direct AABB lethal contact check (guarantees reliable kill even if side-swiped)
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
      // Lift rescue gantry smoothly into place
      if (gantryLiftProgress < 1) {
        gantryLiftProgress = Math.min(1, gantryLiftProgress + dt * 2.2);
        const eased = 1 - Math.pow(1 - gantryLiftProgress, 3);
        const gy = THREE.MathUtils.lerp(gantryStartPos.y, gantryRaisedPos.y, eased);
        rescueGantryGroup.position.y = gy;
        gantryBody.setNextKinematicTranslation({ x: gantryRaisedPos.x, y: gy, z: gantryRaisedPos.z });
      }

      // Drop fake exit trapdoor if player steps onto the decoy threshold
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
    emergencyLights,
    update,
    resetTraps,
    activateCheckpointVisuals,
    dispose: () => {
      sisterRig.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

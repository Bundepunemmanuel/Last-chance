import * as THREE from 'three';

export interface PlayerRig {
  root: THREE.Group;
  pelvis: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  leftHip: THREE.Group;
  leftKnee: THREE.Group;
  rightHip: THREE.Group;
  rightKnee: THREE.Group;
  headlamp: THREE.SpotLight;
  contactShadow: THREE.Mesh;
  updateAnimation: (
    dt: number,
    speed: number,
    maxSpeed: number,
    grounded: boolean,
    vy: number,
    dead: boolean,
    deathTimer: number,
  ) => void;
  dispose: () => void;
}

export function createMaleProtagonist(contactShadowTex: THREE.Texture): PlayerRig {
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

  // Distinct PBR materials with realistic roughness/metalness contrast
  const skinMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xd4a383, roughness: 0.72, metalness: 0.02 }));
  const hairMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1d1a18, roughness: 0.9, metalness: 0.02 }));
  const jacketMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x38463e, roughness: 0.84, metalness: 0.06 }));
  const vestMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x20252b, roughness: 0.65, metalness: 0.18 }));
  const pantsMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x262930, roughness: 0.88, metalness: 0.04 }));
  const bootMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x161413, roughness: 0.44, metalness: 0.12 }));
  const metalMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x8b95a5, roughness: 0.24, metalness: 0.88 }));
  const lampLensMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      emissive: 0xbae6fd,
      emissiveIntensity: 2.2,
      roughness: 0.15,
      metalness: 0.1,
    }),
  );

  // Root sits at bottom-center (boots touch y = 0)
  const root = new THREE.Group();

  // Pelvis pivot at hip height (y = 0.86)
  const pelvis = new THREE.Group();
  pelvis.position.set(0, 0.86, 0);
  root.add(pelvis);

  const pelvisMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.34, 0.16, 0.22)), pantsMat);
  pelvisMesh.castShadow = true;
  pelvis.add(pelvisMesh);

  // Tactical belt + steel buckle
  const belt = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.36, 0.05, 0.24)), bootMat);
  belt.position.y = 0.06;
  pelvis.add(belt);
  const buckle = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.08, 0.055, 0.03)), metalMat);
  buckle.position.set(0, 0.06, -0.125); // Facing -Z forward!
  pelvis.add(buckle);

  // Torso
  const torso = new THREE.Group();
  torso.position.set(0, 0.08, 0);
  pelvis.add(torso);

  const chestMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.4, 0.48, 0.24)), jacketMat);
  chestMesh.position.y = 0.24;
  chestMesh.castShadow = true;
  torso.add(chestMesh);

  // Tactical chest rig + shoulder collar
  const chestRig = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.36, 0.28, 0.27)), vestMat);
  chestRig.position.y = 0.28;
  chestRig.castShadow = true;
  torso.add(chestRig);

  // Backpack & radio antenna (back is +Z when character faces -Z)
  const backpack = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.28, 0.34, 0.14)), vestMat);
  backpack.position.set(0, 0.26, 0.18);
  backpack.castShadow = true;
  torso.add(backpack);

  const packLatch = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.04, 0.03)), metalMat);
  packLatch.position.set(0, 0.34, 0.255);
  torso.add(packLatch);

  const antenna = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.008, 0.012, 0.24, 6)), metalMat);
  antenna.position.set(0.09, 0.52, 0.2);
  torso.add(antenna);

  // Shoulder flashlight emitter pointing forward (-Z)
  const lampHousing = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.035, 0.04, 0.08, 8)), metalMat);
  lampHousing.rotation.x = Math.PI / 2;
  lampHousing.position.set(-0.15, 0.43, -0.14);
  torso.add(lampHousing);

  const lampLens = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.028, 0.028, 0.01, 8)), lampLensMat);
  lampLens.rotation.x = Math.PI / 2;
  lampLens.position.set(-0.15, 0.43, -0.182);
  torso.add(lampLens);

  const headlamp = new THREE.SpotLight(0xdbeafe, 2.6, 18, Math.PI / 4.2, 0.55, 1.6);
  headlamp.position.set(-0.15, 0.43, -0.19);
  headlamp.castShadow = false; // Keep shadow budget on key directional light
  const lampTarget = new THREE.Object3D();
  lampTarget.position.set(-0.1, 0.1, -6.0);
  torso.add(lampTarget);
  headlamp.target = lampTarget;
  torso.add(headlamp);

  // Neck + Sculpted Head
  const head = new THREE.Group();
  head.position.set(0, 0.52, 0);
  torso.add(head);

  const neck = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 8)), skinMat);
  neck.position.y = 0.03;
  head.add(neck);

  const cranium = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.21, 0.23, 0.22)), skinMat);
  cranium.position.y = 0.16;
  cranium.castShadow = true;
  head.add(cranium);

  const hairCap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.225, 0.1, 0.235)), hairMat);
  hairCap.position.set(0, 0.24, 0.01);
  head.add(hairCap);

  const hairBack = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.215, 0.12, 0.08)), hairMat);
  hairBack.position.set(0, 0.17, 0.09);
  head.add(hairBack);

  // Subtle brow + eyes facing -Z
  const brow = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.03, 0.03)), hairMat);
  brow.position.set(0, 0.19, -0.105);
  head.add(brow);

  // Arms helper
  const makeArm = (side: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.26, 0.44, 0);
    torso.add(shoulder);

    const upperArm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.11, 0.27, 0.11)), jacketMat);
    upperArm.position.y = -0.12;
    upperArm.castShadow = true;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.26, 0);
    shoulder.add(elbow);

    const forearm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.095, 0.24, 0.095)), jacketMat);
    forearm.position.y = -0.11;
    forearm.castShadow = true;
    elbow.add(forearm);

    const glove = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.085, 0.09, 0.095)), vestMat);
    glove.position.y = -0.25;
    elbow.add(glove);

    return { shoulder, elbow };
  };

  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  // Legs helper (boots end at y = -0.86 relative to pelvis -> y = 0 at root!)
  const makeLeg = (side: -1 | 1) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.1, -0.04, 0);
    pelvis.add(hip);

    const thigh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.145, 0.38, 0.15)), pantsMat);
    thigh.position.y = -0.19;
    thigh.castShadow = true;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.set(0, -0.39, 0);
    hip.add(knee);

    const shin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.125, 0.34, 0.13)), pantsMat);
    shin.position.y = -0.17;
    shin.castShadow = true;
    knee.add(shin);

    // Boot sitting flush to y = -0.43 from knee (-0.04 - 0.39 - 0.43 = -0.86 -> root y=0)
    const boot = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.135, 0.12, 0.22)), bootMat);
    boot.position.set(0, -0.37, -0.035);
    boot.castShadow = true;
    knee.add(boot);

    return { hip, knee };
  };

  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);

  // Contact shadow disc placed right beneath character (moved independently in engine)
  const contactShadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    }),
  );
  const contactShadow = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.95, 0.95)), contactShadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.renderOrder = 2;

  let walkPhase = 0;

  const updateAnimation = (
    dt: number,
    speed: number,
    maxSpeed: number,
    grounded: boolean,
    vy: number,
    dead: boolean,
    deathTimer: number,
  ) => {
    if (dead) {
      const t = Math.min(1, deathTimer * 4.5);
      pelvis.position.y = THREE.MathUtils.lerp(0.86, 0.22, t);
      pelvis.rotation.x = THREE.MathUtils.lerp(pelvis.rotation.x, -Math.PI * 0.46, t);
      pelvis.rotation.z = THREE.MathUtils.lerp(pelvis.rotation.z, 0.28, t);
      leftArm.shoulder.rotation.x = -0.9 * t;
      rightArm.shoulder.rotation.x = -0.5 * t;
      leftLeg.hip.rotation.x = 0.25 * t;
      rightLeg.hip.rotation.x = -0.18 * t;
      return;
    }

    pelvis.rotation.z = THREE.MathUtils.damp(pelvis.rotation.z, 0, 12, dt);

    if (!grounded) {
      // Crisp airborne jump / fall pose
      const rising = vy > 0;
      const targetPelvisY = 0.88;
      pelvis.position.y = THREE.MathUtils.damp(pelvis.position.y, targetPelvisY, 10, dt);
      pelvis.rotation.x = THREE.MathUtils.damp(pelvis.rotation.x, rising ? -0.08 : 0.12, 10, dt);
      torso.rotation.x = THREE.MathUtils.damp(torso.rotation.x, rising ? 0.14 : -0.08, 10, dt);

      leftLeg.hip.rotation.x = THREE.MathUtils.damp(leftLeg.hip.rotation.x, rising ? 0.55 : 0.25, 10, dt);
      leftLeg.knee.rotation.x = THREE.MathUtils.damp(leftLeg.knee.rotation.x, rising ? -0.95 : -0.35, 10, dt);
      rightLeg.hip.rotation.x = THREE.MathUtils.damp(rightLeg.hip.rotation.x, rising ? -0.25 : -0.15, 10, dt);
      rightLeg.knee.rotation.x = THREE.MathUtils.damp(rightLeg.knee.rotation.x, rising ? -0.45 : -0.25, 10, dt);

      leftArm.shoulder.rotation.x = THREE.MathUtils.damp(leftArm.shoulder.rotation.x, rising ? 1.15 : 1.75, 10, dt);
      rightArm.shoulder.rotation.x = THREE.MathUtils.damp(rightArm.shoulder.rotation.x, rising ? 0.85 : 1.55, 10, dt);
      leftArm.elbow.rotation.x = THREE.MathUtils.damp(leftArm.elbow.rotation.x, 0.55, 10, dt);
      rightArm.elbow.rotation.x = THREE.MathUtils.damp(rightArm.elbow.rotation.x, 0.55, 10, dt);
      return;
    }

    const normSpeed = Math.min(1, speed / Math.max(0.1, maxSpeed));
    if (normSpeed < 0.05) {
      // Idle subtle breathing
      walkPhase += dt * 2.2;
      const breath = Math.sin(walkPhase) * 0.014;
      pelvis.position.y = THREE.MathUtils.damp(pelvis.position.y, 0.86 + breath, 12, dt);
      pelvis.rotation.x = THREE.MathUtils.damp(pelvis.rotation.x, 0, 12, dt);
      torso.rotation.x = THREE.MathUtils.damp(torso.rotation.x, 0.04 + breath * 0.5, 12, dt);

      leftLeg.hip.rotation.x = THREE.MathUtils.damp(leftLeg.hip.rotation.x, 0, 12, dt);
      leftLeg.knee.rotation.x = THREE.MathUtils.damp(leftLeg.knee.rotation.x, 0, 12, dt);
      rightLeg.hip.rotation.x = THREE.MathUtils.damp(rightLeg.hip.rotation.x, 0, 12, dt);
      rightLeg.knee.rotation.x = THREE.MathUtils.damp(rightLeg.knee.rotation.x, 0, 12, dt);

      leftArm.shoulder.rotation.x = THREE.MathUtils.damp(leftArm.shoulder.rotation.x, 0.05, 12, dt);
      rightArm.shoulder.rotation.x = THREE.MathUtils.damp(rightArm.shoulder.rotation.x, -0.05, 12, dt);
      leftArm.elbow.rotation.x = THREE.MathUtils.damp(leftArm.elbow.rotation.x, 0.18, 12, dt);
      rightArm.elbow.rotation.x = THREE.MathUtils.damp(rightArm.elbow.rotation.x, 0.18, 12, dt);
    } else {
      // Walk vs Run cycle
      const isRunning = normSpeed > 0.58;
      const strideFreq = isRunning ? 13.5 : 8.2;
      const strideAmp = isRunning ? 0.82 : 0.45;
      walkPhase += dt * strideFreq * (0.45 + normSpeed * 0.65);

      const s = Math.sin(walkPhase);
      const c = Math.cos(walkPhase);
      const bob = Math.abs(c) * (isRunning ? 0.065 : 0.028);

      pelvis.position.y = THREE.MathUtils.damp(pelvis.position.y, 0.86 + bob, 16, dt);
      pelvis.rotation.x = THREE.MathUtils.damp(pelvis.rotation.x, 0, 14, dt);
      torso.rotation.x = THREE.MathUtils.damp(torso.rotation.x, isRunning ? 0.22 : 0.08, 12, dt);
      head.rotation.x = THREE.MathUtils.damp(head.rotation.x, isRunning ? -0.14 : -0.04, 12, dt);

      leftLeg.hip.rotation.x = s * strideAmp;
      rightLeg.hip.rotation.x = -s * strideAmp;
      leftLeg.knee.rotation.x = Math.min(0, -c * (isRunning ? 0.9 : 0.45) - 0.15);
      rightLeg.knee.rotation.x = Math.min(0, c * (isRunning ? 0.9 : 0.45) - 0.15);

      leftArm.shoulder.rotation.x = -s * strideAmp * 0.85;
      rightArm.shoulder.rotation.x = s * strideAmp * 0.85;
      leftArm.elbow.rotation.x = isRunning ? 1.05 : 0.4;
      rightArm.elbow.rotation.x = isRunning ? 1.05 : 0.4;
    }
  };

  return {
    root,
    pelvis,
    torso,
    head,
    leftShoulder: leftArm.shoulder,
    leftElbow: leftArm.elbow,
    rightShoulder: rightArm.shoulder,
    rightElbow: rightArm.elbow,
    leftHip: leftLeg.hip,
    leftKnee: leftLeg.knee,
    rightHip: rightLeg.hip,
    rightKnee: rightLeg.knee,
    headlamp,
    contactShadow,
    updateAnimation,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

export interface SisterRig {
  root: THREE.Group;
  update: (elapsed: number) => void;
  dispose: () => void;
}

export function createSisterModel(): SisterRig {
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

  const skinMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xd9ab8e, roughness: 0.7, metalness: 0.02 }));
  const coatMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.82, metalness: 0.04 }));
  const pantsMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.86, metalness: 0.04 }));
  const hairMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x2a1d17, roughness: 0.88, metalness: 0.02 }));
  const bootMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.45, metalness: 0.1 }));

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // Legs (shorter younger sister proportions ~1.35m)
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.11, 0.54, 0.11)), pantsMat);
    leg.position.set(side * 0.08, 0.34, 0);
    leg.castShadow = true;
    bodyGroup.add(leg);
    const boot = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.12, 0.1, 0.16)), bootMat);
    boot.position.set(side * 0.08, 0.05, 0.02);
    bodyGroup.add(boot);
  }

  // Torso coat
  const torso = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.3, 0.44, 0.19)), coatMat);
  torso.position.set(0, 0.82, 0);
  torso.castShadow = true;
  bodyGroup.add(torso);

  // Head + hair
  const head = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.2, 0.19)), skinMat);
  head.position.set(0, 1.18, 0);
  head.castShadow = true;
  bodyGroup.add(head);

  const hair = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.2, 0.12, 0.21)), hairMat);
  hair.position.set(0, 1.24, -0.01);
  bodyGroup.add(hair);

  // Left arm down, Right arm waving with small cyan signal flare
  const leftArm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.085, 0.36, 0.085)), coatMat);
  leftArm.position.set(-0.2, 0.8, 0);
  bodyGroup.add(leftArm);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.2, 0.98, 0);
  bodyGroup.add(rightArmPivot);

  const rightArm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.085, 0.36, 0.085)), coatMat);
  rightArm.position.set(0, 0.14, 0);
  rightArmPivot.add(rightArm);

  const beaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 2.4,
      roughness: 0.2,
    }),
  );
  const handBeacon = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.065, 8, 8)), beaconMat);
  handBeacon.position.set(0, 0.34, 0);
  rightArmPivot.add(handBeacon);

  return {
    root,
    update: (elapsed: number) => {
      rightArmPivot.rotation.z = -2.45 + Math.sin(elapsed * 5.2) * 0.32;
      bodyGroup.position.y = Math.abs(Math.sin(elapsed * 2.6)) * 0.03;
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

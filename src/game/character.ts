import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type CharacterAnimState = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'death';

export interface PlayerRig {
  root: THREE.Group;
  skeleton?: THREE.Skeleton;
  skinnedMesh?: THREE.SkinnedMesh;
  mixer: THREE.AnimationMixer;
  headlamp: THREE.SpotLight;
  contactShadow: THREE.Mesh;
  updateAnimation: (
    dt: number,
    speed: number,
    maxSpeed: number,
    grounded: boolean,
    vy: number,
    dead: boolean,
  ) => void;
  dispose: () => void;
}

export interface SisterRig {
  root: THREE.Group;
  skinnedMesh: THREE.SkinnedMesh;
  mixer: THREE.AnimationMixer;
  update: (dt: number) => void;
  dispose: () => void;
}

// Helper: Assign smooth skeletal skinning weights (1 or 2-bone linear blend along Y)
function applyVerticalSkinWeights(
  geo: THREE.BufferGeometry,
  boneA: number,
  boneB: number,
  yMin: number,
  yMax: number,
): THREE.BufferGeometry {
  const nonIndexed = geo.index ? geo.toNonIndexed() : geo;
  if (!nonIndexed.attributes.normal) {
    nonIndexed.computeVertexNormals();
  }
  const pos = nonIndexed.attributes.position;
  const count = pos.count;
  if (!nonIndexed.attributes.uv) {
    nonIndexed.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }

  const skinIndices = new Uint16Array(count * 4);
  const skinWeights = new Float32Array(count * 4);
  const span = Math.max(0.0001, yMax - yMin);

  for (let i = 0; i < count; i++) {
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp((y - yMin) / span, 0, 1);
    const wB = t;
    const wA = 1 - t;
    const idx = i * 4;
    skinIndices[idx] = boneA;
    skinIndices[idx + 1] = boneB;
    skinIndices[idx + 2] = 0;
    skinIndices[idx + 3] = 0;
    skinWeights[idx] = wA;
    skinWeights[idx + 1] = wB;
    skinWeights[idx + 2] = 0;
    skinWeights[idx + 3] = 0;
  }

  nonIndexed.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  nonIndexed.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  return nonIndexed;
}

function applyRigidBone(geo: THREE.BufferGeometry, boneIndex: number): THREE.BufferGeometry {
  return applyVerticalSkinWeights(geo, boneIndex, boneIndex, 0, 1);
}

function makeEulerTrack(boneName: string, times: number[], eulers: Array<[number, number, number]>): THREE.QuaternionKeyframeTrack {
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'XYZ');
  const values: number[] = [];
  for (const [rx, ry, rz] of eulers) {
    e.set(rx, ry, rz);
    q.setFromEuler(e);
    values.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values);
}

export function createMaleProtagonist(
  contactShadowTex: THREE.Texture,
  jacketFabricTex: THREE.Texture,
): PlayerRig {
  // Bone indices
  const B_HIPS = 0;
  const B_SPINE = 1;
  const B_CHEST = 2;
  const B_HEAD = 3;
  const B_L_UPPER_ARM = 4;
  const B_L_FOREARM = 5;
  const B_R_UPPER_ARM = 6;
  const B_R_FOREARM = 7;
  const B_L_THIGH = 8;
  const B_L_SHIN = 9;
  const B_R_THIGH = 10;
  const B_R_SHIN = 11;

  const hips = new THREE.Bone();
  hips.name = 'Hips';
  hips.position.set(0, 0.88, 0);

  const spine = new THREE.Bone();
  spine.name = 'Spine';
  spine.position.set(0, 0.14, 0);
  hips.add(spine);

  const chest = new THREE.Bone();
  chest.name = 'Chest';
  chest.position.set(0, 0.24, 0);
  spine.add(chest);

  const head = new THREE.Bone();
  head.name = 'Head';
  head.position.set(0, 0.24, 0);
  chest.add(head);

  const lUpperArm = new THREE.Bone();
  lUpperArm.name = 'LUpperArm';
  lUpperArm.position.set(-0.24, 0.14, 0);
  chest.add(lUpperArm);

  const lForearm = new THREE.Bone();
  lForearm.name = 'LForearm';
  lForearm.position.set(0, -0.27, 0);
  lUpperArm.add(lForearm);

  const rUpperArm = new THREE.Bone();
  rUpperArm.name = 'RUpperArm';
  rUpperArm.position.set(0.24, 0.14, 0);
  chest.add(rUpperArm);

  const rForearm = new THREE.Bone();
  rForearm.name = 'RForearm';
  rForearm.position.set(0, -0.27, 0);
  rUpperArm.add(rForearm);

  const lThigh = new THREE.Bone();
  lThigh.name = 'LThigh';
  lThigh.position.set(-0.1, -0.04, 0);
  hips.add(lThigh);

  const lShin = new THREE.Bone();
  lShin.name = 'LShin';
  lShin.position.set(0, -0.4, 0);
  lThigh.add(lShin);

  const rThigh = new THREE.Bone();
  rThigh.name = 'RThigh';
  rThigh.position.set(0.1, -0.04, 0);
  hips.add(rThigh);

  const rShin = new THREE.Bone();
  rShin.name = 'RShin';
  rShin.position.set(0, -0.4, 0);
  rThigh.add(rShin);

  const bones = [
    hips,
    spine,
    chest,
    head,
    lUpperArm,
    lForearm,
    rUpperArm,
    rForearm,
    lThigh,
    lShin,
    rThigh,
    rShin,
  ];
  const skeleton = new THREE.Skeleton(bones);

  // Materials (7 distinct calibrated PBR materials)
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd6a585, roughness: 0.72, metalness: 0.02 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x1b1715, roughness: 0.9, metalness: 0.02 });
  const jacketMat = new THREE.MeshStandardMaterial({
    map: jacketFabricTex,
    color: 0x45584d,
    roughness: 0.84,
    metalness: 0.05,
  });
  const vestMat = new THREE.MeshStandardMaterial({ color: 0x1f242c, roughness: 0.62, metalness: 0.22 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x262a33, roughness: 0.88, metalness: 0.04 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x151312, roughness: 0.42, metalness: 0.14 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.22, metalness: 0.9 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 1.4,
    roughness: 0.15,
    metalness: 0.6,
  });

  const materials = [skinMat, hairMat, jacketMat, vestMat, pantsMat, bootMat, metalMat, visorMat];
  // Group sub-geometries by material index so mergeGeometries(parts, true) builds clean material groups
  const matBuckets: THREE.BufferGeometry[][] = materials.map(() => []);
  const pushPart = (matIdx: number, geo: THREE.BufferGeometry) => {
    matBuckets[matIdx].push(geo);
  };

  // Sculpted Torso / Tactical Jacket via LatheGeometry (tapered athletic chest & waist)
  const torsoProfile = [
    new THREE.Vector2(0.01, 0.86),
    new THREE.Vector2(0.155, 0.88),
    new THREE.Vector2(0.145, 1.02),
    new THREE.Vector2(0.185, 1.24),
    new THREE.Vector2(0.195, 1.38),
    new THREE.Vector2(0.11, 1.44),
    new THREE.Vector2(0.01, 1.45),
  ];
  const torsoGeo = new THREE.LatheGeometry(torsoProfile, 14);
  torsoGeo.scale(1.16, 1.0, 0.72);
  pushPart(2, applyVerticalSkinWeights(torsoGeo, B_HIPS, B_CHEST, 0.88, 1.34));

  // Jacket Collar
  const collarGeo = new THREE.CylinderGeometry(0.105, 0.12, 0.08, 12, 1, true);
  collarGeo.translate(0, 1.44, 0);
  pushPart(2, applyRigidBone(collarGeo, B_CHEST));

  // Tactical Chest Rig, Shoulder Armor Straps & Pouches
  const rigGeo = new THREE.BoxGeometry(0.34, 0.24, 0.25);
  rigGeo.translate(0, 1.24, -0.01);
  pushPart(3, applyRigidBone(rigGeo, B_CHEST));

  for (const px of [-0.09, 0.09]) {
    const pouch = new THREE.BoxGeometry(0.1, 0.11, 0.05);
    pouch.translate(px, 1.17, -0.145);
    pushPart(3, applyRigidBone(pouch, B_CHEST));

    const strap = new THREE.BoxGeometry(0.065, 0.16, 0.22);
    strap.translate(px * 1.35, 1.37, 0);
    pushPart(3, applyRigidBone(strap, B_CHEST));
  }

  // Radio Backpack + Strap + Steel Buckle + Comms Status Strip
  const packGeo = new THREE.CapsuleGeometry(0.11, 0.16, 6, 10);
  packGeo.scale(1.15, 1.0, 0.65);
  packGeo.translate(0, 1.22, 0.16);
  pushPart(3, applyRigidBone(packGeo, B_CHEST));

  const packLed = new THREE.BoxGeometry(0.1, 0.024, 0.02);
  packLed.translate(0, 1.29, 0.225);
  pushPart(7, applyRigidBone(packLed, B_CHEST));

  const beltGeo = new THREE.CylinderGeometry(0.168, 0.168, 0.06, 14);
  beltGeo.scale(1.12, 1.0, 0.74);
  beltGeo.translate(0, 0.91, 0);
  pushPart(5, applyRigidBone(beltGeo, B_HIPS));

  const buckleGeo = new THREE.BoxGeometry(0.075, 0.05, 0.025);
  buckleGeo.translate(0, 0.91, -0.125);
  pushPart(6, applyRigidBone(buckleGeo, B_HIPS));

  // Neck + Sculpted Head (Cranium, Jaw, Nose Bridge, Eyes, Forehead Goggles, Hair)
  const neckGeo = new THREE.CylinderGeometry(0.058, 0.072, 0.11, 10);
  neckGeo.translate(0, 1.48, 0);
  pushPart(0, applyVerticalSkinWeights(neckGeo, B_CHEST, B_HEAD, 1.44, 1.53));

  const craniumGeo = new THREE.SphereGeometry(0.118, 14, 12);
  craniumGeo.scale(0.92, 1.06, 1.0);
  craniumGeo.translate(0, 1.64, 0);
  pushPart(0, applyRigidBone(craniumGeo, B_HEAD));

  const jawGeo = new THREE.BoxGeometry(0.135, 0.1, 0.13);
  jawGeo.translate(0, 1.565, -0.028);
  pushPart(0, applyRigidBone(jawGeo, B_HEAD));

  const noseGeo = new THREE.ConeGeometry(0.02, 0.05, 6);
  noseGeo.rotateX(-Math.PI * 0.4);
  noseGeo.translate(0, 1.615, -0.115);
  pushPart(0, applyRigidBone(noseGeo, B_HEAD));

  for (const side of [-1, 1]) {
    const eyeGeo = new THREE.SphereGeometry(0.014, 6, 6);
    eyeGeo.translate(side * 0.042, 1.635, -0.104);
    pushPart(1, applyRigidBone(eyeGeo, B_HEAD));

    const earGeo = new THREE.SphereGeometry(0.022, 6, 6);
    earGeo.scale(0.55, 1.1, 0.8);
    earGeo.translate(side * 0.108, 1.62, -0.005);
    pushPart(0, applyRigidBone(earGeo, B_HEAD));
  }

  // Tactical Forehead Goggle Strap + Glowing Lens Rim
  const goggleBand = new THREE.CylinderGeometry(0.116, 0.116, 0.036, 14);
  goggleBand.scale(0.95, 1.0, 1.03);
  goggleBand.translate(0, 1.685, 0.005);
  pushPart(3, applyRigidBone(goggleBand, B_HEAD));

  const goggleLens = new THREE.BoxGeometry(0.135, 0.034, 0.028);
  goggleLens.translate(0, 1.685, -0.112);
  pushPart(7, applyRigidBone(goggleLens, B_HEAD));

  const hairTopGeo = new THREE.SphereGeometry(0.124, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62);
  hairTopGeo.scale(0.96, 1.04, 1.05);
  hairTopGeo.translate(0, 1.655, 0.012);
  pushPart(1, applyRigidBone(hairTopGeo, B_HEAD));

  const hairBackGeo = new THREE.BoxGeometry(0.18, 0.11, 0.075);
  hairBackGeo.translate(0, 1.61, 0.085);
  pushPart(1, applyRigidBone(hairBackGeo, B_HEAD));

  // Sculpted Arms (Shoulder + Upper Arm + Forearm + Gloved Hand)
  const buildArm = (side: -1 | 1, upperBone: number, foreBone: number) => {
    const sx = side * 0.24;
    const shoulderCap = new THREE.SphereGeometry(0.068, 10, 8);
    shoulderCap.translate(sx, 1.38, 0);
    pushPart(2, applyRigidBone(shoulderCap, upperBone));

    const upperArm = new THREE.CapsuleGeometry(0.052, 0.18, 6, 10);
    upperArm.translate(sx, 1.25, 0);
    pushPart(2, applyVerticalSkinWeights(upperArm, foreBone, upperBone, 1.11, 1.37));

    const forearm = new THREE.CapsuleGeometry(0.044, 0.17, 6, 10);
    forearm.translate(sx, 0.99, 0);
    pushPart(2, applyRigidBone(forearm, foreBone));

    const glove = new THREE.CapsuleGeometry(0.04, 0.05, 5, 8);
    glove.scale(0.85, 1.0, 1.15);
    glove.translate(sx, 0.84, -0.01);
    pushPart(3, applyRigidBone(glove, foreBone));
  };
  buildArm(-1, B_L_UPPER_ARM, B_L_FOREARM);
  buildArm(1, B_R_UPPER_ARM, B_R_FOREARM);

  // Sculpted Legs (Pelvis-to-Thigh, Knee Pad, Shin, Combat Boot)
  const buildLeg = (side: -1 | 1, thighBone: number, shinBone: number) => {
    const lx = side * 0.1;
    const thigh = new THREE.CapsuleGeometry(0.078, 0.27, 6, 10);
    thigh.translate(lx, 0.65, 0);
    pushPart(4, applyVerticalSkinWeights(thigh, shinBone, thighBone, 0.44, 0.82));

    const kneePad = new THREE.SphereGeometry(0.064, 10, 8);
    kneePad.scale(0.95, 1.0, 0.85);
    kneePad.translate(lx, 0.44, -0.025);
    pushPart(3, applyRigidBone(kneePad, shinBone));

    const shin = new THREE.CapsuleGeometry(0.06, 0.24, 6, 10);
    shin.translate(lx, 0.25, 0);
    pushPart(4, applyRigidBone(shin, shinBone));

    const bootShaft = new THREE.CylinderGeometry(0.062, 0.068, 0.12, 10);
    bootShaft.translate(lx, 0.11, 0);
    pushPart(5, applyRigidBone(bootShaft, shinBone));

    const bootSole = new THREE.BoxGeometry(0.132, 0.085, 0.23);
    bootSole.translate(lx, 0.0425, -0.035);
    pushPart(5, applyRigidBone(bootSole, shinBone));
  };
  buildLeg(-1, B_L_THIGH, B_L_SHIN);
  buildLeg(1, B_R_THIGH, B_R_SHIN);

  // Merge each material bucket cleanly, then merge buckets into a single multi-material geometry
  const bucketGeos: THREE.BufferGeometry[] = [];
  const activeMaterials: THREE.Material[] = [];
  matBuckets.forEach((bucket, idx) => {
    if (bucket.length > 0) {
      const mergedBucket = mergeGeometries(bucket, false);
      bucket.forEach((g) => g.dispose());
      if (mergedBucket) {
        bucketGeos.push(mergedBucket);
        activeMaterials.push(materials[idx]);
      }
    }
  });
  const finalGeo = mergeGeometries(bucketGeos, true)!;
  bucketGeos.forEach((g) => g.dispose());

  const skinnedMesh = new THREE.SkinnedMesh(finalGeo, activeMaterials);
  skinnedMesh.castShadow = true;
  skinnedMesh.receiveShadow = true;
  skinnedMesh.frustumCulled = false;
  skinnedMesh.add(hips);
  skinnedMesh.bind(skeleton);

  // Shoulder Headlamp & Antenna attached directly to Chest bone
  const lampHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.075, 10), metalMat);
  lampHousing.rotation.x = Math.PI / 2;
  lampHousing.position.set(-0.145, 0.14, -0.14);
  chest.add(lampHousing);

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.011, 0.24, 6), metalMat);
  antenna.position.set(0.095, 0.22, 0.21);
  chest.add(antenna);

  const headlamp = new THREE.SpotLight(0xdbeafe, 2.6, 20, Math.PI / 4.2, 0.55, 1.6);
  headlamp.position.set(-0.145, 0.14, -0.18);
  headlamp.castShadow = false;
  const lampTarget = new THREE.Object3D();
  lampTarget.position.set(-0.08, -0.15, -6.5);
  chest.add(lampTarget);
  headlamp.target = lampTarget;
  chest.add(headlamp);

  // Root container
  const root = new THREE.Group();
  root.add(skinnedMesh);

  // Contact shadow disc
  const contactShadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTex,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  const contactShadowGeo = new THREE.PlaneGeometry(0.95, 0.95);
  const contactShadow = new THREE.Mesh(contactShadowGeo, contactShadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.renderOrder = 2;

  // =========================================================================
  // REAL THREE.AnimationClip + AnimationMixer KEYFRAME CLIPS
  // =========================================================================
  const mixer = new THREE.AnimationMixer(skinnedMesh);

  // 1. IDLE CLIP (subtle breathing & alert stance)
  const idleClip = new THREE.AnimationClip('idle', 2.0, [
    new THREE.VectorKeyframeTrack('Hips.position', [0, 1.0, 2.0], [0, 0.88, 0, 0, 0.895, 0, 0, 0.88, 0]),
    makeEulerTrack('Chest', [0, 1.0, 2.0], [[0.03, 0, 0], [-0.02, 0, 0], [0.03, 0, 0]]),
    makeEulerTrack('LUpperArm', [0, 1.0, 2.0], [[0.05, 0, 0.08], [0.02, 0, 0.1], [0.05, 0, 0.08]]),
    makeEulerTrack('RUpperArm', [0, 1.0, 2.0], [[-0.03, 0, -0.08], [0.02, 0, -0.1], [-0.03, 0, -0.08]]),
    makeEulerTrack('LForearm', [0, 2.0], [[0.22, 0, 0], [0.22, 0, 0]]),
    makeEulerTrack('RForearm', [0, 2.0], [[0.22, 0, 0], [0.22, 0, 0]]),
    makeEulerTrack('LThigh', [0, 2.0], [[0, 0, 0], [0, 0, 0]]),
    makeEulerTrack('RThigh', [0, 2.0], [[0, 0, 0], [0, 0, 0]]),
    makeEulerTrack('LShin', [0, 2.0], [[0, 0, 0], [0, 0, 0]]),
    makeEulerTrack('RShin', [0, 2.0], [[0, 0, 0], [0, 0, 0]]),
  ]);

  // 2. WALK CLIP (measured stride, upright chest)
  const walkClip = new THREE.AnimationClip('walk', 0.8, [
    new THREE.VectorKeyframeTrack('Hips.position', [0, 0.2, 0.4, 0.6, 0.8], [0, 0.87, 0, 0, 0.9, 0, 0, 0.87, 0, 0, 0.9, 0, 0, 0.87, 0]),
    makeEulerTrack('Spine', [0, 0.8], [[0.06, 0, 0], [0.06, 0, 0]]),
    makeEulerTrack('Chest', [0, 0.4, 0.8], [[0.04, 0.06, 0], [0.04, -0.06, 0], [0.04, 0.06, 0]]),
    makeEulerTrack('LThigh', [0, 0.2, 0.4, 0.6, 0.8], [[0.45, 0, 0], [0.05, 0, 0], [-0.45, 0, 0], [0.1, 0, 0], [0.45, 0, 0]]),
    makeEulerTrack('LShin', [0, 0.2, 0.4, 0.6, 0.8], [[-0.12, 0, 0], [-0.55, 0, 0], [-0.18, 0, 0], [-0.08, 0, 0], [-0.12, 0, 0]]),
    makeEulerTrack('RThigh', [0, 0.2, 0.4, 0.6, 0.8], [[-0.45, 0, 0], [0.1, 0, 0], [0.45, 0, 0], [0.05, 0, 0], [-0.45, 0, 0]]),
    makeEulerTrack('RShin', [0, 0.2, 0.4, 0.6, 0.8], [[-0.18, 0, 0], [-0.08, 0, 0], [-0.12, 0, 0], [-0.55, 0, 0], [-0.18, 0, 0]]),
    makeEulerTrack('LUpperArm', [0, 0.4, 0.8], [[-0.38, 0, 0.06], [0.38, 0, 0.06], [-0.38, 0, 0.06]]),
    makeEulerTrack('RUpperArm', [0, 0.4, 0.8], [[0.38, 0, -0.06], [-0.38, 0, -0.06], [0.38, 0, -0.06]]),
    makeEulerTrack('LForearm', [0, 0.8], [[0.35, 0, 0], [0.35, 0, 0]]),
    makeEulerTrack('RForearm', [0, 0.8], [[0.35, 0, 0], [0.35, 0, 0]]),
  ]);

  // 3. RUN CLIP (athletic forward lean, high knee drive, pumping elbows)
  const runClip = new THREE.AnimationClip('run', 0.56, [
    new THREE.VectorKeyframeTrack('Hips.position', [0, 0.14, 0.28, 0.42, 0.56], [0, 0.85, 0, 0, 0.93, 0, 0, 0.85, 0, 0, 0.93, 0, 0, 0.85, 0]),
    makeEulerTrack('Spine', [0, 0.56], [[0.18, 0, 0], [0.18, 0, 0]]),
    makeEulerTrack('Chest', [0, 0.28, 0.56], [[0.1, 0.12, 0], [0.1, -0.12, 0], [0.1, 0.12, 0]]),
    makeEulerTrack('Head', [0, 0.56], [[-0.18, 0, 0], [-0.18, 0, 0]]),
    makeEulerTrack('LThigh', [0, 0.14, 0.28, 0.42, 0.56], [[0.85, 0, 0], [0.15, 0, 0], [-0.75, 0, 0], [0.25, 0, 0], [0.85, 0, 0]]),
    makeEulerTrack('LShin', [0, 0.14, 0.28, 0.42, 0.56], [[-0.25, 0, 0], [-1.05, 0, 0], [-0.35, 0, 0], [-0.9, 0, 0], [-0.25, 0, 0]]),
    makeEulerTrack('RThigh', [0, 0.14, 0.28, 0.42, 0.56], [[-0.75, 0, 0], [0.25, 0, 0], [0.85, 0, 0], [0.15, 0, 0], [-0.75, 0, 0]]),
    makeEulerTrack('RShin', [0, 0.14, 0.28, 0.42, 0.56], [[-0.35, 0, 0], [-0.9, 0, 0], [-0.25, 0, 0], [-1.05, 0, 0], [-0.35, 0, 0]]),
    makeEulerTrack('LUpperArm', [0, 0.28, 0.56], [[-0.75, 0, 0.08], [0.78, 0, 0.08], [-0.75, 0, 0.08]]),
    makeEulerTrack('RUpperArm', [0, 0.28, 0.56], [[0.78, 0, -0.08], [-0.75, 0, -0.08], [0.78, 0, -0.08]]),
    makeEulerTrack('LForearm', [0, 0.56], [[1.1, 0, 0], [1.1, 0, 0]]),
    makeEulerTrack('RForearm', [0, 0.56], [[1.1, 0, 0], [1.1, 0, 0]]),
  ]);

  // 4. JUMP CLIP
  const jumpClip = new THREE.AnimationClip('jump', 0.4, [
    new THREE.VectorKeyframeTrack('Hips.position', [0, 0.4], [0, 0.92, 0, 0, 0.92, 0]),
    makeEulerTrack('Spine', [0, 0.4], [[0.1, 0, 0], [0.1, 0, 0]]),
    makeEulerTrack('LThigh', [0, 0.4], [[0.65, 0, 0], [0.65, 0, 0]]),
    makeEulerTrack('LShin', [0, 0.4], [[-1.05, 0, 0], [-1.05, 0, 0]]),
    makeEulerTrack('RThigh', [0, 0.4], [[-0.25, 0, 0], [-0.25, 0, 0]]),
    makeEulerTrack('RShin', [0, 0.4], [[-0.4, 0, 0], [-0.4, 0, 0]]),
    makeEulerTrack('LUpperArm', [0, 0.4], [[1.1, 0, 0.2], [1.1, 0, 0.2]]),
    makeEulerTrack('RUpperArm', [0, 0.4], [[0.7, 0, -0.2], [0.7, 0, -0.2]]),
  ]);

  // 5. FALL CLIP
  const fallClip = new THREE.AnimationClip('fall', 0.4, [
    new THREE.VectorKeyframeTrack('Hips.position', [0, 0.4], [0, 0.9, 0, 0, 0.9, 0]),
    makeEulerTrack('Spine', [0, 0.4], [[-0.08, 0, 0], [-0.08, 0, 0]]),
    makeEulerTrack('LThigh', [0, 0.4], [[0.25, 0, 0], [0.25, 0, 0]]),
    makeEulerTrack('LShin', [0, 0.4], [[-0.35, 0, 0], [-0.35, 0, 0]]),
    makeEulerTrack('RThigh', [0, 0.4], [[-0.18, 0, 0], [-0.18, 0, 0]]),
    makeEulerTrack('RShin', [0, 0.4], [[-0.28, 0, 0], [-0.28, 0, 0]]),
    makeEulerTrack('LUpperArm', [0, 0.4], [[1.75, 0, 0.35], [1.75, 0, 0.35]]),
    makeEulerTrack('RUpperArm', [0, 0.4], [[1.65, 0, -0.35], [1.65, 0, -0.35]]),
  ]);

  // 6. DEATH CLIP (dramatic collapse)
  const deathClip = new THREE.AnimationClip('death', 0.45, [
    new THREE.VectorKeyframeTrack('Hips.position', [0, 0.3, 0.45], [0, 0.88, 0, 0, 0.24, 0, 0, 0.22, 0]),
    makeEulerTrack('Hips', [0, 0.3, 0.45], [[0, 0, 0], [-1.38, 0, 0.25], [-1.45, 0, 0.3]]),
    makeEulerTrack('LUpperArm', [0, 0.45], [[0, 0, 0], [-0.9, 0, 0.5]]),
    makeEulerTrack('RUpperArm', [0, 0.45], [[0, 0, 0], [-0.6, 0, -0.5]]),
  ]);

  const actions: Record<CharacterAnimState, THREE.AnimationAction> = {
    idle: mixer.clipAction(idleClip),
    walk: mixer.clipAction(walkClip),
    run: mixer.clipAction(runClip),
    jump: mixer.clipAction(jumpClip),
    fall: mixer.clipAction(fallClip),
    death: mixer.clipAction(deathClip),
  };
  actions.death.setLoop(THREE.LoopOnce, 1);
  actions.death.clampWhenFinished = true;

  let currentState: CharacterAnimState = 'idle';
  actions.idle.play();

  const transitionTo = (next: CharacterAnimState, fadeSeconds = 0.14) => {
    if (next === currentState) return;
    const prevAction = actions[currentState];
    const nextAction = actions[next];
    nextAction.reset();
    nextAction.play();
    prevAction.crossFadeTo(nextAction, fadeSeconds, true);
    currentState = next;
  };

  const updateAnimation = (
    dt: number,
    speed: number,
    maxSpeed: number,
    grounded: boolean,
    vy: number,
    dead: boolean,
  ) => {
    if (dead) {
      transitionTo('death', 0.08);
      mixer.update(dt);
      return;
    }

    if (!grounded) {
      transitionTo(vy > 0.5 ? 'jump' : 'fall', 0.1);
      mixer.update(dt);
      return;
    }

    const norm = Math.min(1, speed / Math.max(0.1, maxSpeed));
    if (norm < 0.06) {
      transitionTo('idle', 0.18);
      actions.idle.timeScale = 1;
    } else if (norm < 0.58) {
      transitionTo('walk', 0.14);
      actions.walk.timeScale = 0.75 + norm * 0.9;
    } else {
      transitionTo('run', 0.12);
      actions.run.timeScale = 0.8 + norm * 0.45;
    }
    mixer.update(dt);
  };

  return {
    root,
    skeleton,
    skinnedMesh,
    mixer,
    headlamp,
    contactShadow,
    updateAnimation,
    dispose: () => {
      mixer.stopAllAction();
      finalGeo.dispose();
      lampHousing.geometry.dispose();
      antenna.geometry.dispose();
      contactShadowGeo.dispose();
      materials.forEach((m) => m.dispose());
      contactShadowMat.dispose();
    },
  };
}

export function createSisterModel(): SisterRig {
  const B_HIPS = 0;
  const B_CHEST = 1;
  const B_HEAD = 2;
  const B_R_ARM = 3;

  const hips = new THREE.Bone();
  hips.name = 'SisterHips';
  hips.position.set(0, 0.68, 0);

  const chest = new THREE.Bone();
  chest.name = 'SisterChest';
  chest.position.set(0, 0.24, 0);
  hips.add(chest);

  const head = new THREE.Bone();
  head.name = 'SisterHead';
  head.position.set(0, 0.22, 0);
  chest.add(head);

  const rArm = new THREE.Bone();
  rArm.name = 'SisterRArm';
  rArm.position.set(0.18, 0.12, 0);
  chest.add(rArm);

  const skeleton = new THREE.Skeleton([hips, chest, head, rArm]);

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xdcb093, roughness: 0.7, metalness: 0.02 });
  const coatMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.82, metalness: 0.04 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.86, metalness: 0.04 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x261a14, roughness: 0.88, metalness: 0.02 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.45, metalness: 0.1 });
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 2.5,
    roughness: 0.15,
  });

  const materials = [skinMat, coatMat, pantsMat, hairMat, bootMat, beaconMat];
  const buckets: THREE.BufferGeometry[][] = materials.map(() => []);
  const pushPart = (idx: number, g: THREE.BufferGeometry) => buckets[idx].push(g);

  // Flared parka coat via LatheGeometry
  const coatProfile = [
    new THREE.Vector2(0.01, 0.56),
    new THREE.Vector2(0.17, 0.58),
    new THREE.Vector2(0.13, 0.88),
    new THREE.Vector2(0.15, 1.04),
    new THREE.Vector2(0.09, 1.12),
    new THREE.Vector2(0.01, 1.13),
  ];
  const coatGeo = new THREE.LatheGeometry(coatProfile, 12);
  coatGeo.scale(1.12, 1.0, 0.78);
  pushPart(1, applyVerticalSkinWeights(coatGeo, B_HIPS, B_CHEST, 0.6, 1.0));

  for (const side of [-1, 1]) {
    const leg = new THREE.CapsuleGeometry(0.048, 0.4, 5, 8);
    leg.translate(side * 0.075, 0.34, 0);
    pushPart(2, applyRigidBone(leg, B_HIPS));

    const boot = new THREE.BoxGeometry(0.105, 0.09, 0.17);
    boot.translate(side * 0.075, 0.045, 0.015);
    pushPart(4, applyRigidBone(boot, B_HIPS));
  }

  const headGeo = new THREE.SphereGeometry(0.098, 12, 10);
  headGeo.scale(0.92, 1.05, 0.98);
  headGeo.translate(0, 1.24, 0);
  pushPart(0, applyRigidBone(headGeo, B_HEAD));

  for (const side of [-1, 1]) {
    const eyeGeo = new THREE.SphereGeometry(0.012, 6, 6);
    eyeGeo.translate(side * 0.036, 1.245, 0.088);
    pushPart(3, applyRigidBone(eyeGeo, B_HEAD));
  }

  const scarfGeo = new THREE.CylinderGeometry(0.095, 0.115, 0.075, 12);
  scarfGeo.translate(0, 1.12, 0);
  pushPart(5, applyRigidBone(scarfGeo, B_CHEST));

  const hairGeo = new THREE.SphereGeometry(0.106, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.68);
  hairGeo.translate(0, 1.255, -0.01);
  pushPart(3, applyRigidBone(hairGeo, B_HEAD));

  const ponytail = new THREE.CapsuleGeometry(0.038, 0.18, 4, 8);
  ponytail.rotateX(0.3);
  ponytail.translate(0, 1.16, -0.11);
  pushPart(3, applyRigidBone(ponytail, B_HEAD));

  const leftArm = new THREE.CapsuleGeometry(0.038, 0.28, 5, 8);
  leftArm.rotateZ(-0.15);
  leftArm.translate(-0.19, 0.88, 0);
  pushPart(1, applyRigidBone(leftArm, B_CHEST));

  const rightArm = new THREE.CapsuleGeometry(0.038, 0.28, 5, 8);
  rightArm.translate(0.18, 0.9, 0);
  pushPart(1, applyRigidBone(rightArm, B_R_ARM));

  const flare = new THREE.SphereGeometry(0.065, 10, 8);
  flare.translate(0.18, 0.72, 0);
  pushPart(5, applyRigidBone(flare, B_R_ARM));

  const bucketGeos: THREE.BufferGeometry[] = [];
  const activeMaterials: THREE.Material[] = [];
  buckets.forEach((b, i) => {
    if (b.length > 0) {
      const m = mergeGeometries(b, false);
      b.forEach((g) => g.dispose());
      if (m) {
        bucketGeos.push(m);
        activeMaterials.push(materials[i]);
      }
    }
  });
  const finalGeo = mergeGeometries(bucketGeos, true)!;
  bucketGeos.forEach((g) => g.dispose());

  const skinnedMesh = new THREE.SkinnedMesh(finalGeo, activeMaterials);
  skinnedMesh.castShadow = true;
  skinnedMesh.frustumCulled = false;
  skinnedMesh.add(hips);
  skinnedMesh.bind(skeleton);

  const root = new THREE.Group();
  root.add(skinnedMesh);

  const mixer = new THREE.AnimationMixer(skinnedMesh);
  const waveClip = new THREE.AnimationClip('wave', 1.2, [
    new THREE.VectorKeyframeTrack('SisterHips.position', [0, 0.6, 1.2], [0, 0.68, 0, 0, 0.72, 0, 0, 0.68, 0]),
    makeEulerTrack('SisterRArm', [0, 0.3, 0.6, 0.9, 1.2], [
      [0, 0, 2.5],
      [0, 0, 2.85],
      [0, 0, 2.35],
      [0, 0, 2.85],
      [0, 0, 2.5],
    ]),
    makeEulerTrack('SisterHead', [0, 0.6, 1.2], [[0, -0.1, 0], [0, 0.1, 0], [0, -0.1, 0]]),
  ]);
  mixer.clipAction(waveClip).play();

  return {
    root,
    skinnedMesh,
    mixer,
    update: (dt: number) => {
      mixer.update(dt);
    },
    dispose: () => {
      mixer.stopAllAction();
      finalGeo.dispose();
      materials.forEach((m) => m.dispose());
    },
  };
}

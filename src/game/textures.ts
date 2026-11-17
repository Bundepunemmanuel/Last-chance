import * as THREE from 'three';

export interface FacilityTextures {
  concreteColor: THREE.CanvasTexture;
  concreteRoughness: THREE.CanvasTexture;
  concreteBump: THREE.CanvasTexture;
  gratingColor: THREE.CanvasTexture;
  hazardStripeColor: THREE.CanvasTexture;
  wallPanelColor: THREE.CanvasTexture;
  wallPanelBump: THREE.CanvasTexture;
  jacketFabricColor: THREE.CanvasTexture;
  drumColor: THREE.CanvasTexture;
  terminalScreenColor: THREE.CanvasTexture;
  contactShadowTex: THREE.CanvasTexture;
  exitSignTexture: THREE.CanvasTexture;
  decoySignTexture: THREE.CanvasTexture;
  rescueSignTexture: THREE.CanvasTexture;
  dispose: () => void;
}

function seededNoise(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

export function createFacilityTextures(maxAnisotropy: number): FacilityTextures {
  const created: THREE.Texture[] = [];

  const register = (tex: THREE.CanvasTexture, isColor: boolean, repeatX = 1, repeatY = 1): THREE.CanvasTexture => {
    tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
    tex.needsUpdate = true;
    created.push(tex);
    return tex;
  };

  // 1. High-Detail 512x512 Weathered Concrete Slab (albedo + bump + roughness)
  const concreteCanvas = document.createElement('canvas');
  concreteCanvas.width = 512;
  concreteCanvas.height = 512;
  const cCtx = concreteCanvas.getContext('2d')!;
  cCtx.fillStyle = '#4a5058';
  cCtx.fillRect(0, 0, 512, 512);

  for (let y = 0; y < 512; y += 2) {
    for (let x = 0; x < 512; x += 2) {
      const n = seededNoise(x * 0.18, y * 0.18);
      const fine = seededNoise(x * 0.7, y * 0.7);
      const shade = Math.floor(58 + n * 24 + fine * 14);
      cCtx.fillStyle = `rgb(${shade}, ${shade + 3}, ${shade + 7})`;
      cCtx.fillRect(x, y, 2, 2);
    }
  }
  // Oil & rust weathering blotches
  for (const [ox, oy, r] of [
    [130, 180, 70],
    [370, 120, 88],
    [290, 390, 64],
  ]) {
    const stain = cCtx.createRadialGradient(ox, oy, 6, ox, oy, r);
    stain.addColorStop(0, 'rgba(24, 20, 18, 0.5)');
    stain.addColorStop(1, 'rgba(24, 20, 18, 0)');
    cCtx.fillStyle = stain;
    cCtx.fillRect(ox - r, oy - r, r * 2, r * 2);
  }
  // Concrete fracture cracks
  cCtx.strokeStyle = 'rgba(18, 20, 24, 0.68)';
  cCtx.lineWidth = 2;
  cCtx.beginPath();
  cCtx.moveTo(40, 140);
  cCtx.lineTo(118, 172);
  cCtx.lineTo(156, 238);
  cCtx.moveTo(310, 420);
  cCtx.lineTo(385, 392);
  cCtx.lineTo(445, 430);
  cCtx.stroke();

  // Expansion seams & baked AO bevel
  cCtx.strokeStyle = 'rgba(14, 16, 20, 0.85)';
  cCtx.lineWidth = 6;
  cCtx.strokeRect(3, 3, 506, 506);
  cCtx.lineWidth = 3;
  cCtx.beginPath();
  cCtx.moveTo(256, 0);
  cCtx.lineTo(256, 512);
  cCtx.moveTo(0, 256);
  cCtx.lineTo(512, 256);
  cCtx.stroke();

  const concreteColor = register(new THREE.CanvasTexture(concreteCanvas), true, 1, 1);

  // 2. Concrete Roughness + Bump Maps
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 256;
  roughCanvas.height = 256;
  const rCtx = roughCanvas.getContext('2d')!;
  rCtx.fillStyle = '#cfcfcf';
  rCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) {
    for (let x = 0; x < 256; x += 2) {
      const v = Math.floor(170 + seededNoise(x, y) * 72);
      rCtx.fillStyle = `rgb(${v},${v},${v})`;
      rCtx.fillRect(x, y, 2, 2);
    }
  }
  const concreteRoughness = register(new THREE.CanvasTexture(roughCanvas), false, 1, 1);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 256;
  bumpCanvas.height = 256;
  const bCtx = bumpCanvas.getContext('2d')!;
  bCtx.fillStyle = '#888888';
  bCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) {
    for (let x = 0; x < 256; x += 2) {
      const v = Math.floor(110 + seededNoise(x * 0.8, y * 0.8) * 55);
      bCtx.fillStyle = `rgb(${v},${v},${v})`;
      bCtx.fillRect(x, y, 2, 2);
    }
  }
  bCtx.strokeStyle = '#242424';
  bCtx.lineWidth = 4;
  bCtx.strokeRect(2, 2, 252, 252);
  bCtx.beginPath();
  bCtx.moveTo(128, 0);
  bCtx.lineTo(128, 256);
  bCtx.moveTo(0, 128);
  bCtx.lineTo(256, 128);
  bCtx.stroke();
  const concreteBump = register(new THREE.CanvasTexture(bumpCanvas), false, 1, 1);

  // 3. Industrial Diamond-Plate Steel Grating
  const grateCanvas = document.createElement('canvas');
  grateCanvas.width = 256;
  grateCanvas.height = 256;
  const gCtx = grateCanvas.getContext('2d')!;
  gCtx.fillStyle = '#181c22';
  gCtx.fillRect(0, 0, 256, 256);
  gCtx.fillStyle = '#5a6370';
  for (let i = 0; i < 256; i += 16) {
    gCtx.fillRect(i, 0, 5, 256);
    gCtx.fillRect(0, i, 256, 5);
  }
  // Diamond rivets at intersections
  gCtx.fillStyle = '#8993a1';
  for (let y = 8; y < 256; y += 32) {
    for (let x = 8; x < 256; x += 32) {
      gCtx.fillRect(x - 2, y - 2, 4, 4);
    }
  }
  gCtx.fillStyle = 'rgba(138, 66, 28, 0.35)';
  gCtx.fillRect(28, 40, 48, 28);
  gCtx.fillRect(154, 160, 56, 36);
  gCtx.strokeStyle = '#758090';
  gCtx.lineWidth = 8;
  gCtx.strokeRect(4, 4, 248, 248);
  const gratingColor = register(new THREE.CanvasTexture(grateCanvas), true, 1, 1);

  // 4. Hazard Warning Stripes
  const hazCanvas = document.createElement('canvas');
  hazCanvas.width = 256;
  hazCanvas.height = 64;
  const hCtx = hazCanvas.getContext('2d')!;
  hCtx.fillStyle = '#d97706';
  hCtx.fillRect(0, 0, 256, 64);
  hCtx.fillStyle = '#14171c';
  for (let x = -64; x < 320; x += 48) {
    hCtx.beginPath();
    hCtx.moveTo(x, 0);
    hCtx.lineTo(x + 24, 0);
    hCtx.lineTo(x + 56, 64);
    hCtx.lineTo(x + 32, 64);
    hCtx.closePath();
    hCtx.fill();
  }
  hCtx.fillStyle = 'rgba(10, 12, 16, 0.22)';
  hCtx.fillRect(0, 0, 256, 64);
  const hazardStripeColor = register(new THREE.CanvasTexture(hazCanvas), true, 2, 1);

  // 5. Abandoned Lab Wall Panel + Bump
  const wallCanvas = document.createElement('canvas');
  wallCanvas.width = 512;
  wallCanvas.height = 512;
  const wCtx = wallCanvas.getContext('2d')!;
  wCtx.fillStyle = '#333a44';
  wCtx.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 512; x += 6) {
    const alpha = 0.04 + seededNoise(x, 12) * 0.12;
    wCtx.fillStyle = `rgba(12, 14, 18, ${alpha})`;
    wCtx.fillRect(x, 0, 4, 280 + seededNoise(x, 45) * 230);
  }
  // Recessed ribs
  wCtx.strokeStyle = '#1b2026';
  wCtx.lineWidth = 10;
  wCtx.strokeRect(5, 5, 502, 502);
  wCtx.lineWidth = 4;
  wCtx.strokeRect(36, 36, 440, 440);
  wCtx.fillStyle = '#6c7685';
  for (const rx of [22, 256, 490]) {
    for (const ry of [22, 256, 490]) {
      wCtx.beginPath();
      wCtx.arc(rx, ry, 5, 0, Math.PI * 2);
      wCtx.fill();
    }
  }
  // Warning band
  wCtx.fillStyle = 'rgba(217, 119, 6, 0.52)';
  wCtx.fillRect(36, 340, 440, 22);
  const rustGrad = wCtx.createLinearGradient(0, 380, 0, 512);
  rustGrad.addColorStop(0, 'rgba(95, 48, 24, 0)');
  rustGrad.addColorStop(1, 'rgba(85, 42, 20, 0.58)');
  wCtx.fillStyle = rustGrad;
  wCtx.fillRect(0, 380, 512, 132);
  const wallPanelColor = register(new THREE.CanvasTexture(wallCanvas), true, 1, 1);

  const wallBumpCanvas = document.createElement('canvas');
  wallBumpCanvas.width = 256;
  wallBumpCanvas.height = 256;
  const wbCtx = wallBumpCanvas.getContext('2d')!;
  wbCtx.fillStyle = '#808080';
  wbCtx.fillRect(0, 0, 256, 256);
  wbCtx.strokeStyle = '#303030';
  wbCtx.lineWidth = 6;
  wbCtx.strokeRect(3, 3, 250, 250);
  wbCtx.strokeRect(18, 18, 220, 220);
  const wallPanelBump = register(new THREE.CanvasTexture(wallBumpCanvas), false, 1, 1);

  // 6. Tactical Jacket Fabric Weave
  const fabricCanvas = document.createElement('canvas');
  fabricCanvas.width = 128;
  fabricCanvas.height = 128;
  const fCtx = fabricCanvas.getContext('2d')!;
  fCtx.fillStyle = '#38463e';
  fCtx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 4) {
    for (let x = 0; x < 128; x += 4) {
      const v = (x + y) % 8 === 0 ? 14 : -10;
      fCtx.fillStyle = v > 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)';
      fCtx.fillRect(x, y, 3, 3);
    }
  }
  const jacketFabricColor = register(new THREE.CanvasTexture(fabricCanvas), true, 3, 3);

  // 7. Biohazard Drum Texture
  const drumCanvas = document.createElement('canvas');
  drumCanvas.width = 256;
  drumCanvas.height = 256;
  const dCtx = drumCanvas.getContext('2d')!;
  dCtx.fillStyle = '#7c2d12';
  dCtx.fillRect(0, 0, 256, 256);
  dCtx.fillStyle = '#d97706';
  dCtx.fillRect(0, 92, 256, 68);
  dCtx.fillStyle = '#1c1917';
  dCtx.fillRect(0, 62, 256, 12);
  dCtx.fillRect(0, 182, 256, 12);
  dCtx.font = 'bold 26px sans-serif';
  dCtx.textAlign = 'center';
  dCtx.fillText('BIO-HAZARD', 128, 134);
  const drumColor = register(new THREE.CanvasTexture(drumCanvas), true, 1, 1);

  // 8. Checkpoint Terminal Screen Texture
  const termCanvas = document.createElement('canvas');
  termCanvas.width = 256;
  termCanvas.height = 192;
  const tCtx = termCanvas.getContext('2d')!;
  tCtx.fillStyle = '#071b24';
  tCtx.fillRect(0, 0, 256, 192);
  tCtx.strokeStyle = '#38bdf8';
  tCtx.lineWidth = 6;
  tCtx.strokeRect(6, 6, 244, 180);
  tCtx.fillStyle = '#38bdf8';
  tCtx.font = 'bold 26px monospace';
  tCtx.fillText('SECTOR 01', 22, 48);
  tCtx.fillStyle = '#10b981';
  tCtx.font = 'bold 22px monospace';
  tCtx.fillText('CHECKPOINT', 22, 92);
  tCtx.fillStyle = '#94a3b8';
  tCtx.font = '16px monospace';
  tCtx.fillText('SYNC STATUS: OK', 22, 138);
  const terminalScreenColor = register(new THREE.CanvasTexture(termCanvas), true, 1, 1);
  terminalScreenColor.wrapS = THREE.ClampToEdgeWrapping;
  terminalScreenColor.wrapT = THREE.ClampToEdgeWrapping;

  // 9. Soft Radial Contact Shadow Texture
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sCtx = shadowCanvas.getContext('2d')!;
  const rad = sCtx.createRadialGradient(64, 64, 8, 64, 64, 60);
  rad.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  rad.addColorStop(0.55, 'rgba(0, 0, 0, 0.34)');
  rad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  sCtx.fillStyle = rad;
  sCtx.fillRect(0, 0, 128, 128);
  const contactShadowTex = register(new THREE.CanvasTexture(shadowCanvas), true, 1, 1);
  contactShadowTex.wrapS = THREE.ClampToEdgeWrapping;
  contactShadowTex.wrapT = THREE.ClampToEdgeWrapping;

  // 10. Signage Textures
  const makeSign = (title: string, sub: string, bg: string, fg: string, border: string): THREE.CanvasTexture => {
    const sc = document.createElement('canvas');
    sc.width = 512;
    sc.height = 192;
    const ctx = sc.getContext('2d')!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 192);
    ctx.strokeStyle = border;
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, 496, 176);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.font = 'bold 58px sans-serif';
    ctx.fillText(title, 256, 94);
    ctx.font = 'bold 28px monospace';
    ctx.fillText(sub, 256, 146);
    const tex = register(new THREE.CanvasTexture(sc), true, 1, 1);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  };

  const exitSignTexture = makeSign('EXIT', 'SECTOR 01 CLEAR', '#062b1f', '#34d399', '#10b981');
  const decoySignTexture = makeSign('LOCKDOWN', 'DECOY BULKHEAD', '#380c0c', '#f87171', '#ef4444');
  const rescueSignTexture = makeSign('AIRLOCK B-2', 'EXTRACTION ZONE', '#072a33', '#38bdf8', '#0ea5e9');

  return {
    concreteColor,
    concreteRoughness,
    concreteBump,
    gratingColor,
    hazardStripeColor,
    wallPanelColor,
    wallPanelBump,
    jacketFabricColor,
    drumColor,
    terminalScreenColor,
    contactShadowTex,
    exitSignTexture,
    decoySignTexture,
    rescueSignTexture,
    dispose: () => {
      created.forEach((t) => t.dispose());
    },
  };
}

import * as THREE from 'three';

export interface FacilityTextures {
  concreteColor: THREE.CanvasTexture;
  concreteRoughness: THREE.CanvasTexture;
  gratingColor: THREE.CanvasTexture;
  hazardStripeColor: THREE.CanvasTexture;
  wallPanelColor: THREE.CanvasTexture;
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

  // 1. Weathered Concrete Floor with baked AO edge darkening & expansion seams
  const concreteCanvas = document.createElement('canvas');
  concreteCanvas.width = 256;
  concreteCanvas.height = 256;
  const cCtx = concreteCanvas.getContext('2d')!;
  cCtx.fillStyle = '#484d54';
  cCtx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 2) {
    for (let x = 0; x < 256; x += 2) {
      const n = seededNoise(x * 0.25, y * 0.25);
      const shade = Math.floor(62 + n * 28);
      cCtx.fillStyle = `rgb(${shade}, ${shade + 3}, ${shade + 7})`;
      cCtx.fillRect(x, y, 2, 2);
    }
  }
  // Subtle oil & rust stains
  const stain = cCtx.createRadialGradient(170, 90, 4, 170, 90, 56);
  stain.addColorStop(0, 'rgba(32, 26, 22, 0.45)');
  stain.addColorStop(1, 'rgba(32, 26, 22, 0)');
  cCtx.fillStyle = stain;
  cCtx.fillRect(100, 25, 140, 140);

  // Slab seams + baked AO vignette around tile edges
  cCtx.strokeStyle = 'rgba(18, 20, 24, 0.72)';
  cCtx.lineWidth = 4;
  cCtx.strokeRect(2, 2, 252, 252);
  cCtx.lineWidth = 2;
  cCtx.beginPath();
  cCtx.moveTo(128, 0);
  cCtx.lineTo(128, 256);
  cCtx.moveTo(0, 128);
  cCtx.lineTo(256, 128);
  cCtx.stroke();

  const concreteColor = register(new THREE.CanvasTexture(concreteCanvas), true, 1, 1);

  // 2. Concrete Roughness Map (linear)
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 256;
  roughCanvas.height = 256;
  const rCtx = roughCanvas.getContext('2d')!;
  rCtx.fillStyle = '#d4d4d4';
  rCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 4) {
    for (let x = 0; x < 256; x += 4) {
      const v = Math.floor(175 + seededNoise(x, y) * 65);
      rCtx.fillStyle = `rgb(${v},${v},${v})`;
      rCtx.fillRect(x, y, 4, 4);
    }
  }
  const concreteRoughness = register(new THREE.CanvasTexture(roughCanvas), false, 1, 1);

  // 3. Industrial Steel Grating
  const grateCanvas = document.createElement('canvas');
  grateCanvas.width = 256;
  grateCanvas.height = 256;
  const gCtx = grateCanvas.getContext('2d')!;
  gCtx.fillStyle = '#1b1f26';
  gCtx.fillRect(0, 0, 256, 256);
  gCtx.fillStyle = '#535b66';
  for (let i = 0; i < 256; i += 16) {
    gCtx.fillRect(i, 0, 6, 256);
    gCtx.fillRect(0, i, 256, 5);
  }
  // Rust flecks
  gCtx.fillStyle = 'rgba(138, 66, 28, 0.38)';
  gCtx.fillRect(28, 40, 44, 24);
  gCtx.fillRect(154, 160, 56, 32);
  gCtx.strokeStyle = '#6f7885';
  gCtx.lineWidth = 8;
  gCtx.strokeRect(4, 4, 248, 248);
  const gratingColor = register(new THREE.CanvasTexture(grateCanvas), true, 1, 1);

  // 4. Hazard Warning Stripes (amber/black)
  const hazCanvas = document.createElement('canvas');
  hazCanvas.width = 256;
  hazCanvas.height = 64;
  const hCtx = hazCanvas.getContext('2d')!;
  hCtx.fillStyle = '#d97706';
  hCtx.fillRect(0, 0, 256, 64);
  hCtx.fillStyle = '#181a1f';
  for (let x = -64; x < 320; x += 48) {
    hCtx.beginPath();
    hCtx.moveTo(x, 0);
    hCtx.lineTo(x + 24, 0);
    hCtx.lineTo(x + 56, 64);
    hCtx.lineTo(x + 32, 64);
    hCtx.closePath();
    hCtx.fill();
  }
  // Grime overlay
  hCtx.fillStyle = 'rgba(15, 16, 19, 0.22)';
  hCtx.fillRect(0, 0, 256, 64);
  const hazardStripeColor = register(new THREE.CanvasTexture(hazCanvas), true, 2, 1);

  // 5. Abandoned Lab Wall Panel
  const wallCanvas = document.createElement('canvas');
  wallCanvas.width = 256;
  wallCanvas.height = 256;
  const wCtx = wallCanvas.getContext('2d')!;
  wCtx.fillStyle = '#333942';
  wCtx.fillRect(0, 0, 256, 256);
  // Vertical grime streaks
  for (let x = 0; x < 256; x += 6) {
    const alpha = 0.04 + seededNoise(x, 12) * 0.12;
    wCtx.fillStyle = `rgba(12, 14, 18, ${alpha})`;
    wCtx.fillRect(x, 0, 4, 140 + seededNoise(x, 45) * 116);
  }
  // Panel bevel lines & rivets
  wCtx.strokeStyle = '#1e2329';
  wCtx.lineWidth = 6;
  wCtx.strokeRect(3, 3, 250, 250);
  wCtx.fillStyle = '#606875';
  const rivets = [16, 240];
  for (const rx of rivets) {
    for (const ry of rivets) {
      wCtx.beginPath();
      wCtx.arc(rx, ry, 4, 0, Math.PI * 2);
      wCtx.fill();
    }
  }
  // Lower rust band
  const rustGrad = wCtx.createLinearGradient(0, 190, 0, 256);
  rustGrad.addColorStop(0, 'rgba(95, 48, 24, 0)');
  rustGrad.addColorStop(1, 'rgba(85, 42, 20, 0.55)');
  wCtx.fillStyle = rustGrad;
  wCtx.fillRect(0, 190, 256, 66);
  const wallPanelColor = register(new THREE.CanvasTexture(wallCanvas), true, 1, 1);

  // 6. Soft Radial Contact Shadow Texture
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

  // 7. Signage Textures (EXIT, DECOY, EXTRACTION)
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
    gratingColor,
    hazardStripeColor,
    wallPanelColor,
    contactShadowTex,
    exitSignTexture,
    decoySignTexture,
    rescueSignTexture,
    dispose: () => {
      created.forEach((t) => t.dispose());
    },
  };
}

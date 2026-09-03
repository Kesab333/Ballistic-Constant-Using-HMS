import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { addTerminal } from './terminal-utils.js';
import { ballisticExperiment, setHMSCoilPosition } from './physics.js';

const app = document.getElementById('hms-app');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9edf2);

// Set exact camera framing matching the screenshot
const camera = new THREE.PerspectiveCamera(40, app.clientWidth / app.clientHeight, 0.05, 50);
camera.position.set(0, 2.1, 4.7);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(app.clientWidth, app.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
app.appendChild(renderer.domElement);

// Set OrbitControls target and save default state
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.target.set(0, 1.25, 0);
controls.saveState(); // Saves position so controls.reset() reloads this exact view

scene.add(new THREE.HemisphereLight(0xf5f9ff, 0x56616b, 2.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.8);
keyLight.position.set(4, 8, 5);
keyLight.castShadow = true;
scene.add(keyLight);
scene.add(new THREE.DirectionalLight(0x9ec8ff, 1.6).translateOnAxis(new THREE.Vector3(-5, 4, -5), 1));

const mats = {
  nPole: new THREE.MeshStandardMaterial({ color: 0xee2222, metalness: 0.5, roughness: 0.35 }),
  sPole: new THREE.MeshStandardMaterial({ color: 0x2266ee, metalness: 0.5, roughness: 0.35 }),
  steel: new THREE.MeshPhysicalMaterial({ color: 0x8d9398, metalness: 0.9, roughness: 0.2 }),
  silver: new THREE.MeshPhysicalMaterial({ color: 0xf0f4f8, metalness: 0.95, roughness: 0.12, clearcoat: 0.5 }),
  silverTerminal: new THREE.MeshStandardMaterial({ color: 0xe5ecf2, metalness: 0.9, roughness: 0.18 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xd4a044, metalness: 0.85, roughness: 0.3 }),
  darkSteel: new THREE.MeshStandardMaterial({ color: 0x24282c, metalness: 0.8, roughness: 0.4 }),
  copper: new THREE.MeshStandardMaterial({ color: 0xd96b27, metalness: 0.85, roughness: 0.25 }),
  springMat: new THREE.MeshStandardMaterial({ color: 0xd96b27, metalness: 0.85, roughness: 0.25 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x7c4929, roughness: 0.4 }),
  greyShell: new THREE.MeshStandardMaterial({ color: 0x70777e, roughness: 0.55, metalness: 0.35, transparent: true, opacity: 1.0 }),
  blackCover: new THREE.MeshStandardMaterial({ color: 0x16181a, roughness: 0.35, transparent: true, opacity: 1.0 }),
  casingBrass: new THREE.MeshStandardMaterial({ color: 0xd4a044, metalness: 0.85, roughness: 0.3, transparent: true, opacity: 1.0 }),
  casingDarkSteel: new THREE.MeshStandardMaterial({ color: 0x24282c, metalness: 0.8, roughness: 0.4, transparent: true, opacity: 1.0 }),
  ebonite: new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.2, metalness: 0.1 }),
  ghost: (col, op) => new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: op, depthWrite: false })
};

const addCyl = (p, r, h, pos, mat, seg = 64) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  m.position.set(...pos); m.castShadow = m.receiveShadow = true; p.add(m); return m;
};
const addBox = (p, sz, pos, mat) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...sz), mat);
  m.position.set(...pos); m.castShadow = m.receiveShadow = true; p.add(m); return m;
};
const addSphere = (p, r, pos, mat, seg = 32) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg/2), mat);
  m.position.set(...pos); m.castShadow = m.receiveShadow = true; p.add(m); return m;
};
const addAnnulus = (p, ro, ri, h, pos, mat) => {
  const shape = new THREE.Shape(); shape.absarc(0, 0, ro, 0, Math.PI * 2, false);
  const hole = new THREE.Path(); hole.absarc(0, 0, ri, 0, Math.PI * 2, true); shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 64 });
  geo.center();
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = Math.PI / 2; m.position.set(...pos); m.castShadow = m.receiveShadow = true; p.add(m); return m;
};
function addScrew(parent, radius, headHeight, pos, rot = [0, 0, 0], mat = mats.casingBrass) {
  const group = new THREE.Group();
  group.position.set(...pos);
  group.rotation.set(...rot);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.85, headHeight, 16), mat);
  head.position.y = headHeight / 2;
  head.castShadow = head.receiveShadow = true;
  group.add(head);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.6, headHeight * 0.35, radius * 0.25), mats.casingDarkSteel);
  slot.position.y = headHeight * 0.85;
  group.add(slot);
  parent.add(group);
  return group;
}

const root = new THREE.Group(); scene.add(root);
const frameGroup = new THREE.Group(); root.add(frameGroup);
const magnetGroup = new THREE.Group(); root.add(magnetGroup);
const movingGroup = new THREE.Group(); root.add(movingGroup);
const dynamicGroup = new THREE.Group(); root.add(dynamicGroup);
const fieldGroup = new THREE.Group(); root.add(fieldGroup);

const Y_BASE = 0.25;
const hCasing = 1.65;

addBox(frameGroup, [3.2, Y_BASE, 3.2], [0, Y_BASE / 2, 0], mats.wood);
[[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]].forEach(([x, z]) => {
  addScrew(frameGroup, 0.035, 0.02, [x, Y_BASE, z], [0, Math.random() * Math.PI, 0], mats.casingBrass);
});
addCyl(frameGroup, 1.30, 0.04, [0, Y_BASE + 0.02, 0], mats.greyShell);
addCyl(frameGroup, 1.05, hCasing, [0, Y_BASE + hCasing / 2, 0], mats.greyShell);

const topLidY = Y_BASE + hCasing + 0.03;
addCyl(frameGroup, 1.07, 0.06, [0, topLidY, 0], mats.blackCover);
for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
  const sx = 1.01 * Math.cos(a);
  const sz = 1.01 * Math.sin(a);
  addScrew(frameGroup, 0.024, 0.025, [sx, topLidY + 0.03, sz], [0, a, 0], mats.casingBrass);
}

function createPlateTexture(title, subtitle, specs) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 1024, 512);
  grad.addColorStop(0, '#cda03f');
  grad.addColorStop(0.5, '#eec86b');
  grad.addColorStop(1, '#b88928');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);
  ctx.strokeStyle = '#241705';
  ctx.lineWidth = 14;
  ctx.strokeRect(24, 24, 976, 464);
  ctx.lineWidth = 4;
  ctx.strokeRect(42, 42, 940, 428);
  ctx.fillStyle = '#160d02';
  ctx.font = 'bold 50px "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, 512, 115);
  ctx.font = 'italic bold 32px "Times New Roman", serif';
  ctx.fillText(subtitle, 512, 165);
  ctx.beginPath();
  ctx.moveTo(120, 185);
  ctx.lineTo(904, 185);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.font = 'bold 30px monospace';
  let y = 235;
  specs.forEach(line => {
    ctx.fillText(line, 512, y);
    y += 50;
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 16;
  return texture;
}

const frontTex = createPlateTexture(
  "HIBBERT'S MAGNETIC STANDARD",
  "LABORATORY SPECIFICATION",
  [
    "TOTAL MAGNETIC FLUX : 20,000 C.G.S.",
    "INDUCTANCE COIL   : 100 TURNS (COPPER)",
    "RESISTANCE R      : 12.45 OHMS @ 15°C",
    "SERIAL NO.        : MS-1896-B4"
  ]
);
const backTex = createPlateTexture(
  "OPERATING SPECIFICATIONS",
  "PHYSICAL STANDARD & INSTRUCTIONS",
  [
    "1. PULL LEVER DOWN TO TRIP COIL",
    "2. RELEASE FOR GRAVITY & EM DROP",
    "3. CALIBRATION CONSTANT K = N × Φ",
    "LABORATORY REF   : #409"
  ]
);

const plateMatFront = new THREE.MeshStandardMaterial({
  map: frontTex, roughness: 0.35, metalness: 0.8, bumpMap: frontTex, bumpScale: 0.002, transparent: true, opacity: 1.0
});
const plateMatBack = new THREE.MeshStandardMaterial({
  map: backTex, roughness: 0.35, metalness: 0.8, bumpMap: backTex, bumpScale: 0.002, transparent: true, opacity: 1.0
});

const plateR = 1.054; 
const plateH = 0.72;
const plateAngle = Math.PI / 2.7;
const plateY = Y_BASE + hCasing / 2 + 0.04;

const frontGeo = new THREE.CylinderGeometry(plateR, plateR, plateH, 48, 1, true, -plateAngle / 2, plateAngle);
const frontPlate = new THREE.Mesh(frontGeo, plateMatFront);
frontPlate.position.set(0, plateY, 0);
frameGroup.add(frontPlate);

const backGeo = new THREE.CylinderGeometry(plateR, plateR, plateH, 48, 1, true, Math.PI - plateAngle / 2, plateAngle);
const backPlate = new THREE.Mesh(backGeo, plateMatBack);
backPlate.position.set(0, plateY, 0);
frameGroup.add(backPlate);

const lugX = 0.35; 
const topTerminalBottomY = topLidY - 0.015;
const topTerminalGroup = new THREE.Group();
frameGroup.add(topTerminalGroup);

// Store references to terminal meshes for later use
let leftTerminalMesh = null;
let rightTerminalMesh = null;

[-lugX, lugX].forEach(x => {
  addCyl(topTerminalGroup, 0.065, 0.03, [x, topLidY, 0], mats.silverTerminal);
  const terminalPin = addCyl(topTerminalGroup, 0.028, 0.12, [x, topLidY + 0.075, 0], mats.silver);
  addCyl(topTerminalGroup, 0.058, 0.05, [x, topLidY + 0.10, 0], mats.silverTerminal);
  addCyl(topTerminalGroup, 0.012, 0.03, [x, topLidY - 0.015, 0], mats.silver);
  addScrew(topTerminalGroup, 0.014, 0.015, [x + 0.04, topLidY + 0.10, 0], [0, 0, Math.PI / 2], mats.casingBrass);
  
  // Store references to terminal pins
  if (x < 0) {
    leftTerminalMesh = terminalPin;
  } else {
    rightTerminalMesh = terminalPin;
  }
});

// ============================================
// TERMINAL INTEGRATION
// ============================================

// Create a group to hold terminal markers
const terminalGroup = new THREE.Group();
terminalGroup.userData.isTerminalGroup = true;

// Create terminal positions based on the top terminal locations
const terminalPositions = [
    { id: 'HMS_TO_COMM', color: 0x000080, x: -lugX }, // Left terminal - connects to commutator
    { id: 'HMS_TO_RB', color: 0x111111, x: lugX }     // Right terminal - connects to resistance box
];

terminalPositions.forEach((termInfo) => {
    // Create a group for this terminal at the top of the terminal pin
    const termGroup = new THREE.Group();
    const terminalY = topLidY + 0.10; // Position at the terminal nut height
    termGroup.position.set(termInfo.x, terminalY, 0);
    
    // Create a visual marker for the terminal (small colored sphere)
    const markerGeo = new THREE.SphereGeometry(0.04, 12, 12);
    const markerMat = new THREE.MeshBasicMaterial({ 
        color: termInfo.color, 
        transparent: true, 
        opacity: 0.3 
    });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    termGroup.add(marker);
    
    // Add a ring around it for better visibility
    const ringGeo = new THREE.TorusGeometry(0.045, 0.006, 8, 16);
    const ringMat = new THREE.MeshBasicMaterial({ 
        color: termInfo.color, 
        transparent: true, 
        opacity: 0.4 
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    termGroup.add(ring);
    
    // Add the terminal using terminal-utils
    const terminal = addTerminal(
        termGroup,
        termInfo.id,
        new THREE.Vector3(0, 0, 0)
    );
    
    // Mark as terminal for click detection
    terminal.userData.isTerminalHit = true;
    terminal.userData.isTerminal = true;
    terminal.userData.terminalId = termInfo.id;
    terminal.userData.apparatusId = 'hms';
    
    // Store the terminal group reference
    termGroup.userData.terminalId = termInfo.id;
    termGroup.userData.isTerminal = true;
    termGroup.userData.apparatusId = 'hms';
    
    // Add to terminal group
    terminalGroup.add(termGroup);
});

// Add the terminal group to the frame group
frameGroup.add(terminalGroup);

// Also tag the existing terminal meshes for click detection
topTerminalGroup.children.forEach((child) => {
    if (child.isMesh && child.geometry.type === 'CylinderGeometry') {
        // Determine which terminal this is based on position
        const pos = child.position;
        const terminalId = pos.x < 0 ? 'HMS_TO_COMM' : 'HMS_TO_RB';
        child.userData.isTerminalHit = true;
        child.userData.isTerminal = true;
        child.userData.terminalId = terminalId;
        child.userData.apparatusId = 'hms';
    }
});

const SCALE = 1.70;
const rNPole = 0.272;              
const rFormerIn = 0.278;           
const rFormerOut = 0.305;          
const wireRadius = 0.0073;
const rLayer1 = rFormerOut + wireRadius * 0.95; 
const rLayer2 = rLayer1 + (wireRadius * 1.8);  
const rSPoleIn = 0.331;            
const rSPoleOut = 0.50 * SCALE;    
const rOuterYoke = 0.58 * SCALE;
const hSPole = 0.65;
const magY = Y_BASE + (hSPole / 2);
const magTopY = Y_BASE + hSPole;   

addCyl(magnetGroup, rNPole, hSPole, [0, magY, 0], mats.nPole, 64);
const outerSPole = addAnnulus(magnetGroup, rSPoleOut, rSPoleIn, hSPole, [0, magY, 0], mats.sPole);
addAnnulus(magnetGroup, rOuterYoke, rSPoleOut, hSPole + 0.03, [0, magY + 0.015, 0], mats.steel);
for (let a = Math.PI/6; a < Math.PI * 2; a += Math.PI / 3) {
  addScrew(magnetGroup, 0.028, 0.02, [rOuterYoke * 0.88 * Math.cos(a), Y_BASE + 0.041, rOuterYoke * 0.88 * Math.sin(a)], [0, a, 0], mats.darkSteel);
}

const coilAnchor = new THREE.Group(); movingGroup.add(coilAnchor);
const hCoil = 0.55;
const MIN_COIL_Y = magTopY - (hCoil / 2 + 0.02); 
const MAX_COIL_Y = magTopY + (hCoil / 2 + 0.01); 
let currentY = MIN_COIL_Y;
coilAnchor.position.set(0, currentY, 0);

addAnnulus(coilAnchor, rFormerOut, rFormerIn, hCoil, [0, 0, 0], mats.brass);
const topCapHeight = 0.08;
const capRadius = 0.42;
const capSurfaceY = hCoil / 2 + topCapHeight;
addCyl(coilAnchor, capRadius, topCapHeight, [0, hCoil / 2 + topCapHeight / 2, 0], mats.silverTerminal);

const rodLength = 1.45;
const rodRadius = 0.048;
const rodYCenter = capSurfaceY + (rodLength / 2);
addCyl(coilAnchor, rodRadius, rodLength, [0, rodYCenter, 0], mats.silver);

const capRadiusTop = rodRadius + 0.014;
const knobGroup = new THREE.Group();
knobGroup.position.set(0, capSurfaceY + rodLength, 0);
addCyl(knobGroup, capRadiusTop, 0.03, [0, 0.015, 0], mats.silverTerminal);
const domeGeo = new THREE.SphereGeometry(capRadiusTop, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
const domeMesh = new THREE.Mesh(domeGeo, mats.silverTerminal);
domeMesh.position.set(0, 0.03, 0);
domeMesh.castShadow = domeMesh.receiveShadow = true;
knobGroup.add(domeMesh);

const spoolRadiusOuter = 0.070;
const spoolRadiusInner = 0.038;
addCyl(knobGroup, spoolRadiusOuter, 0.02, [0, -0.04, 0], mats.brass);
addCyl(knobGroup, spoolRadiusInner, 0.065, [0, -0.0825, 0], mats.brass);
addCyl(knobGroup, spoolRadiusOuter, 0.02, [0, -0.125, 0], mats.brass);
addScrew(knobGroup, 0.015, 0.012, [0, -0.04, spoolRadiusOuter], [Math.PI / 2, 0, 0], mats.darkSteel);
addScrew(knobGroup, 0.015, 0.012, [0, -0.125, spoolRadiusOuter], [Math.PI / 2, 0, 0], mats.darkSteel);
coilAnchor.add(knobGroup);

const collarHeight = 0.025;
const rCollarOut = 0.035;
const rCollarIn = 0.015;
addAnnulus(coilAnchor, rCollarOut, rCollarIn, collarHeight, [-lugX, capSurfaceY + collarHeight / 2, 0], mats.silverTerminal);
addAnnulus(coilAnchor, rCollarOut, rCollarIn, collarHeight, [lugX, capSurfaceY + collarHeight / 2, 0], mats.silverTerminal);

const pinHeight = 0.03;
const pinTipY = capSurfaceY + collarHeight + pinHeight;
addCyl(coilAnchor, 0.01, pinHeight, [-lugX, capSurfaceY + collarHeight + pinHeight / 2, 0], mats.copper);
addCyl(coilAnchor, 0.01, pinHeight, [lugX, capSurfaceY + collarHeight + pinHeight / 2, 0], mats.copper);

const pivotX = 0.85; 
const rodTopBaseYMin = MIN_COIL_Y + capSurfaceY + rodLength;
const rodTopBaseYMax = MAX_COIL_Y + capSurfaceY + rodLength;
const pivotY = (rodTopBaseYMin + rodTopBaseYMax) / 2;
const lidTopY = topLidY + 0.03;

const basePlateHeight = 0.04;
const basePlateCenterY = lidTopY + (basePlateHeight / 2);
addCyl(frameGroup, 0.14, basePlateHeight, [pivotX, basePlateCenterY, 0], mats.casingBrass);
for (let a = 0; a < Math.PI * 2; a += Math.PI / 2) {
  const fx = pivotX + 0.105 * Math.cos(a);
  const fz = 0.105 * Math.sin(a);
  addScrew(frameGroup, 0.018, 0.016, [fx, lidTopY + basePlateHeight, fz], [0, a, 0], mats.casingBrass);
}

const pillarBottomY = lidTopY + basePlateHeight;
const pillarH = pivotY - pillarBottomY;
const pillarZOffset = 0.06;
addCyl(frameGroup, 0.045, pillarH, [pivotX, pillarBottomY + (pillarH / 2), pillarZOffset], mats.casingBrass);
addCyl(frameGroup, 0.045, pillarH, [pivotX, pillarBottomY + (pillarH / 2), -pillarZOffset], mats.casingBrass);
addBox(frameGroup, [0.09, 0.12, 0.035], [pivotX, pivotY, pillarZOffset], mats.casingBrass);
addBox(frameGroup, [0.09, 0.12, 0.035], [pivotX, pivotY, -pillarZOffset], mats.casingBrass);
[-pillarZOffset, pillarZOffset].forEach(z => {
  addScrew(frameGroup, 0.014, 0.015, [pivotX - 0.028, pivotY + 0.06, z], [0, 0, 0], mats.casingBrass);
  addScrew(frameGroup, 0.014, 0.015, [pivotX + 0.028, pivotY + 0.06, z], [0, 0, 0], mats.casingBrass);
});

const leverGroup = new THREE.Group();
leverGroup.position.set(pivotX, pivotY, 0);
frameGroup.add(leverGroup);

const hingePin = addCyl(leverGroup, 0.025, 0.22, [0, 0, 0], mats.darkSteel);
hingePin.rotation.x = Math.PI / 2;
addScrew(leverGroup, 0.018, 0.012, [0, 0, 0.115], [Math.PI / 2, 0, 0], mats.brass);
addScrew(leverGroup, 0.018, 0.012, [0, 0, -0.115], [-Math.PI / 2, 0, 0], mats.brass);

const armStart = -0.68; 
const armEnd = 0.45;   
const armLength = armEnd - armStart;
const armMid = (armStart + armEnd) / 2;
const mainArm = addCyl(leverGroup, 0.028, armLength, [armMid, 0, 0], mats.darkSteel);
mainArm.rotation.z = Math.PI / 2;

const prongLen = 0.52;
const prongCenter = -0.88; 
const forkZOffset = 0.042;
const p1 = addCyl(leverGroup, 0.016, prongLen, [prongCenter, 0, forkZOffset], mats.darkSteel);
p1.rotation.z = Math.PI / 2;
const p2 = addCyl(leverGroup, 0.016, prongLen, [prongCenter, 0, -forkZOffset], mats.darkSteel);
p2.rotation.z = Math.PI / 2;

const contactPinLength = 0.024;
const rPin1 = addCyl(leverGroup, 0.014, contactPinLength, [prongCenter + 0.03, 0, forkZOffset - (contactPinLength / 2)], mats.brass);
rPin1.rotation.x = Math.PI / 2;
const rPin2 = addCyl(leverGroup, 0.014, contactPinLength, [prongCenter + 0.03, 0, -forkZOffset + (contactPinLength / 2)], mats.brass);
rPin2.rotation.x = Math.PI / 2;

const handleMesh = addSphere(leverGroup, 0.09, [armEnd + 0.05, 0, 0], mats.ebonite);
handleMesh.name = 'hms-handle';
const handleTrim = addCyl(leverGroup, 0.04, 0.04, [armEnd, 0, 0], mats.brass);
handleTrim.rotation.z = Math.PI / 2;

const wirePts = [];
const hWinding = hCoil - 0.02;
const yTop = hWinding / 2;
const yBot = -hWinding / 2;
const turnsPerLayer = 45;
wirePts.push(new THREE.Vector3(-lugX, pinTipY, 0));
wirePts.push(new THREE.Vector3(-lugX, capSurfaceY - 0.02, 0));
wirePts.push(new THREE.Vector3(-rLayer1, yTop + 0.005, 0));

const startAngleL1 = Math.PI;
const stepsL1 = 1500;
for (let i = 0; i <= stepsL1; i++) {
  const t = i / stepsL1;
  const y = yTop * (1 - t) + yBot * t;
  const angle = startAngleL1 + t * Math.PI * 2 * turnsPerLayer;
  wirePts.push(new THREE.Vector3(rLayer1 * Math.cos(angle), y, rLayer1 * Math.sin(angle)));
}

const lastAngleL1 = startAngleL1 + Math.PI * 2 * turnsPerLayer;
const stepsTrans = 30;
for (let i = 1; i <= stepsTrans; i++) {
  const t = i / stepsTrans;
  const angle = lastAngleL1 + (t * Math.PI);
  const r = rLayer1 * (1 - t) + rLayer2 * t;
  const y = yBot - (0.003 * Math.sin(t * Math.PI));
  wirePts.push(new THREE.Vector3(r * Math.cos(angle), y, r * Math.sin(angle)));
}

const startAngleL2 = lastAngleL1 + Math.PI;
const targetEndAngleL2 = Math.ceil(startAngleL2 / (Math.PI * 2)) * Math.PI * 2 + Math.PI * 2 * turnsPerLayer;
const stepsL2 = 1500;
for (let i = 0; i <= stepsL2; i++) {
  const t = i / stepsL2;
  const y = yBot * (1 - t) + yTop * t;
  const angle = startAngleL2 * (1 - t) + targetEndAngleL2 * t;
  wirePts.push(new THREE.Vector3(rLayer2 * Math.cos(angle), y, rLayer2 * Math.sin(angle)));
}

wirePts.push(new THREE.Vector3(rLayer2, yTop + 0.005, 0));
wirePts.push(new THREE.Vector3(lugX, capSurfaceY - 0.02, 0));
wirePts.push(new THREE.Vector3(lugX, pinTipY, 0));

const wirePath = new THREE.CatmullRomCurve3(wirePts);
const wireGeo = new THREE.TubeGeometry(wirePath, 3500, wireRadius, 6, false);
coilAnchor.add(new THREE.Mesh(wireGeo, mats.copper));

let springMeshLeft = null;
let springMeshRight = null;
let lastSpringGeometryY = Number.NaN;

function buildSpringGeometry(bottomPos, topPos, radius = 0.032, turns = 18, wireR = 0.0055) {
  const pts = [];
  const steps = 300;
  const deltaY = topPos.y - bottomPos.y;
  const endLeadLen = 0.025; 
  pts.push(new THREE.Vector3(bottomPos.x, bottomPos.y, bottomPos.z));
  pts.push(new THREE.Vector3(bottomPos.x, bottomPos.y + endLeadLen, bottomPos.z));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = (bottomPos.y + endLeadLen) + t * (deltaY - 2 * endLeadLen);
    const angle = t * Math.PI * 2 * turns;
    const x = bottomPos.x + radius * Math.cos(angle);
    const z = bottomPos.z + radius * Math.sin(angle);
    pts.push(new THREE.Vector3(x, y, z));
  }
  pts.push(new THREE.Vector3(topPos.x, topPos.y - endLeadLen, topPos.z));
  pts.push(new THREE.Vector3(topPos.x, topPos.y, topPos.z));
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, 350, wireR, 8, false);
}

function updateDynamicComponents() {
  const currentCoilY = coilAnchor.position.y;
  // Lever still updates every frame; high-detail springs update only after visible travel.
  const updateSprings = !Number.isFinite(lastSpringGeometryY) || Math.abs(currentCoilY - lastSpringGeometryY) >= 0.05;
  if (!updateSprings) {
    const rodCurrentY = currentCoilY + capSurfaceY + rodLength - 0.0825;
    leverGroup.rotation.z = -Math.atan2(rodCurrentY - pivotY, pivotX);
    return;
  }
  if (springMeshLeft) { springMeshLeft.geometry.dispose(); dynamicGroup.remove(springMeshLeft); }
  if (springMeshRight) { springMeshRight.geometry.dispose(); dynamicGroup.remove(springMeshRight); }
  
  lastSpringGeometryY = currentCoilY;
  const botLeft = new THREE.Vector3(-lugX, currentCoilY + pinTipY, 0);
  const botRight = new THREE.Vector3(lugX, currentCoilY + pinTipY, 0);
  const topLeft = new THREE.Vector3(-lugX, topTerminalBottomY, 0);
  const topRight = new THREE.Vector3(lugX, topTerminalBottomY, 0);
  
  const geoLeft = buildSpringGeometry(botLeft, topLeft);
  const geoRight = buildSpringGeometry(botRight, topRight);
  
  springMeshLeft = new THREE.Mesh(geoLeft, mats.springMat);
  springMeshRight = new THREE.Mesh(geoRight, mats.springMat);
  springMeshLeft.castShadow = springMeshLeft.receiveShadow = true;
  springMeshRight.castShadow = springMeshRight.receiveShadow = true;
  dynamicGroup.add(springMeshLeft);
  dynamicGroup.add(springMeshRight);
  
  const rodCurrentY = currentCoilY + capSurfaceY + rodLength - 0.0825;
  const dy = rodCurrentY - pivotY;
  leverGroup.rotation.z = -Math.atan2(dy, pivotX);
}

function buildField() {
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
    const p1 = new THREE.Vector3(rNPole * Math.cos(a), magY, rNPole * Math.sin(a));
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    fieldGroup.add(new THREE.ArrowHelper(dir, p1, rSPoleIn - rNPole, 0x2e7eea, 0.04, 0.02));
  }
  fieldGroup.visible = false;
}
buildField();

const coilPosSlider = document.getElementById('hms-coilPosSlider');
const stateReadout = document.getElementById('hms-stateReadout');
const physicsReadout = document.getElementById('hms-physicsReadout');

coilPosSlider.min = MIN_COIL_Y.toFixed(4);
coilPosSlider.max = MAX_COIL_Y.toFixed(4);
coilPosSlider.value = MIN_COIL_Y.toFixed(4);

let targetY = MIN_COIL_Y;
let animating = false;
let isDragging = false;
let isFreeFalling = false; 
let velocityY = 0;
let leverMotionState = 'REST';
let autoLeverCycle = false;
let autoNextActionAt = 0;
const GRAVITY = 8.5; 
const EM_DAMPING = 5.0; 
const laboratoryModelMirrors = new Set();

function syncLaboratoryModels() {
  const copyChildren = (source, target) => {
    source.children.forEach((sourceChild, index) => {
      const targetChild = target.children[index];
      if (!targetChild) return;
      targetChild.position.copy(sourceChild.position);
      targetChild.quaternion.copy(sourceChild.quaternion);
      targetChild.scale.copy(sourceChild.scale);
      targetChild.visible = sourceChild.visible;
      copyChildren(sourceChild, targetChild);
    });
  };
  laboratoryModelMirrors.forEach(model => copyChildren(root, model));
}

function updateAutoControlButtons() {

    const hmsBtn =
        document.getElementById('hms-autoCycle');

    const labBtn =
        document.getElementById('lab-hms-auto');

    const label =
        autoLeverCycle
            ? 'Stop Auto Control'
            : 'Auto Lever Up–Down';

    if (hmsBtn) {
        hmsBtn.textContent = label;
        hmsBtn.classList.toggle(
            'is-running',
            autoLeverCycle
        );
    }

    if (labBtn) {
        labBtn.textContent = label;
        labBtn.classList.toggle(
            'is-running',
            autoLeverCycle
        );
    }
}

coilPosSlider.oninput = e => {
  animating = false;
  isFreeFalling = false;
  currentY = Math.min(MAX_COIL_Y, Math.max(MIN_COIL_Y, parseFloat(e.target.value)));
  coilAnchor.position.y = currentY;
  leverMotionState = 'REST';
  updateStateText();
  updateDynamicComponents();
  const labHmsManual = document.getElementById('lab-hms-manual');
  if (labHmsManual) labHmsManual.value = coilPosSlider.value;
};

function updateStateText() {
  const norm = (coilAnchor.position.y - MIN_COIL_Y) / (MAX_COIL_Y - MIN_COIL_Y);
  const labLeverButton = document.getElementById('lab-hms-drop');
  if (labLeverButton) labLeverButton.textContent = norm >= 0.98 ? 'Drop' : 'Raise Coil';
  if (isDragging) {
    physicsReadout.textContent = "Pointer Drag (Manual)";
    stateReadout.textContent = `Dragging Lever (${(norm * 100).toFixed(0)}%)`;
  } else if (isFreeFalling) {
    physicsReadout.textContent = "Gravity + EM Drop";
    stateReadout.textContent = `Falling (${(norm * 100).toFixed(0)}%)`;
  } else if (animating) {
    physicsReadout.textContent = "HUD Button Transition";
    stateReadout.textContent = `Moving to preset...`;
  } else {
    physicsReadout.textContent = "Static / Manual Hold";
    if (norm <= 0.02) {
      stateReadout.textContent = 'At Min (Inside Gap)';
    } else if (norm >= 0.98) {
      stateReadout.textContent = 'At Max (Elevated / Compressed Springs)';
    } else {
      stateReadout.textContent = `Set at ${(norm * 100).toFixed(0)}%`;
    }
  }
}

function pullUp() {
  if (ballisticExperiment.controlSource !== 'HMS') return;
  animating = true;
  isFreeFalling = false;
  leverMotionState = 'MOVING_UP';
  targetY = MAX_COIL_Y;
}
function release({ externalSwitch = false } = {}) {
  if (!externalSwitch && ballisticExperiment.controlSource !== 'HMS') return;
  if (!externalSwitch && !ballisticExperiment.circuitClosed) {
    physicsReadout.textContent = 'Circuit open — coil will drop without an induced throw';
  }
  animating = true;
  isFreeFalling = false;
  leverMotionState = 'MOVING_DOWN';
  targetY = MIN_COIL_Y;
}

document.getElementById('hms-pullUp').onclick = () => {
  autoLeverCycle = false;
  autoNextActionAt = 0;
  updateAutoControlButtons();
  pullUp();
};
document.getElementById('hms-release').onclick = () => {
  autoLeverCycle = false;
  autoNextActionAt = 0;
  updateAutoControlButtons();
  release();
};
document.getElementById('hms-field').onclick = () => fieldGroup.visible = !fieldGroup.visible;

const autoCycleBtn = document.getElementById('hms-autoCycle');
if (autoCycleBtn) {
  autoCycleBtn.onclick = () => {
    if (ballisticExperiment.controlSource !== 'HMS') {
      physicsReadout.textContent = 'Select HMS Lever control mode for Auto Lever.';
      return;
    }
    if (!autoLeverCycle && !ballisticExperiment.circuitClosed) {
      physicsReadout.textContent = 'No throw: Auto Connect wires the circuit; now open the Tapping Switch.';
      stateReadout.textContent = 'BG path open — switch must be OFF (OPEN)';
      return;
    }

    // STOP
    if (autoLeverCycle) {
      autoLeverCycle = false;
      autoNextActionAt = 0;
      updateAutoControlButtons();
      physicsReadout.textContent = 'Automatic control stopped.';
      return;
    }

    // START
    autoLeverCycle = true;
    autoNextActionAt = 0;
    updateAutoControlButtons();
    physicsReadout.textContent = 'Automatic Up–Down control running.';
    pullUp();
  };
}

const casingMaterials = [
  mats.greyShell,
  mats.blackCover,
  plateMatFront,
  plateMatBack,
  mats.casingBrass,
  mats.casingDarkSteel
];

function updateCasingOpacity(val) {
  casingMaterials.forEach(m => {
    m.opacity = val;
    m.depthWrite = val >= 0.99;
    m.visible = val > 0.001;
  });
}

document.getElementById('hms-casingOpacity').oninput = e => {
  updateCasingOpacity(parseFloat(e.target.value));
};

function setMode(mode) {
  document.querySelectorAll('#hms-hud button').forEach(b => b.classList.remove('active'));
  const modeButton = document.getElementById('hms-view' + mode[0].toUpperCase() + mode.slice(1));
  if (modeButton) modeButton.classList.add('active');
  let targetOpacity = 1.0;
  if (mode === 'cut') {
    outerSPole.material = mats.ghost(0x2266ee, 0.35);
    targetOpacity = 0.4;
  } else if (mode === 'internal') {
    outerSPole.material = mats.sPole;
    targetOpacity = 0.0;
  } else if (mode === 'exploded') {
    outerSPole.material = mats.sPole;
    targetOpacity = 0.25;
  } else {
    outerSPole.material = mats.sPole;
    targetOpacity = 1.0;
  }
  document.getElementById('hms-casingOpacity').value = targetOpacity;
  updateCasingOpacity(targetOpacity);
}

['exterior', 'cut', 'exploded', 'internal'].forEach(m => {
  document.getElementById('hms-view' + m[0].toUpperCase() + m.slice(1)).onclick = () => setMode(m);
});

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const planeIntersect = new THREE.Vector3();
const armEndPos = armEnd + 0.05; 

function setCoilFromHandleY(handleY) {
  const handleDy = handleY - pivotY;
  const rodDy = -handleDy * (pivotX / armEndPos);
  const rodTopY = pivotY + rodDy;
  let calculatedCoilY = rodTopY - (capSurfaceY + rodLength - 0.0825);
  calculatedCoilY = Math.min(MAX_COIL_Y, Math.max(MIN_COIL_Y, calculatedCoilY));
  coilAnchor.position.y = calculatedCoilY;
  leverMotionState = 'REST';
  coilPosSlider.value = calculatedCoilY;
  updateStateText();
  updateDynamicComponents();
}

function updateMousePosition(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

function onPointerDown(e) {
  updateMousePosition(e);
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects([handleMesh, handleTrim], true);
  if (intersects.length > 0) {
    isDragging = true;
    animating = false;
    isFreeFalling = false;
    leverMotionState = 'REST';
    velocityY = 0;
    controls.enabled = false; 
    document.body.style.cursor = 'grabbing';
  }
}

function onPointerMove(e) {
  updateMousePosition(e);
  if (isDragging) {
    raycaster.setFromCamera(mouse, camera);
    if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
      setCoilFromHandleY(planeIntersect.y);
    }
  } else {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects([handleMesh, handleTrim], true);
    document.body.style.cursor = intersects.length > 0 ? 'grab' : 'default';
  }
}

function onPointerUp() {
  if (isDragging) {
    isDragging = false;
    controls.enabled = true;
    document.body.style.cursor = 'default';
    velocityY = 0;
    if (coilAnchor.position.y > MIN_COIL_Y) {
      isFreeFalling = true;
      leverMotionState = 'MOVING_DOWN';
    }
  }
}

// Attach pointerdown directly to canvas element for precise targeting
renderer.domElement.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.032, clock.getDelta());
  
  if (animating) {
    const diff = targetY - coilAnchor.position.y;
    const speed = 2.2;
    if (Math.abs(diff) < 0.002) {
      coilAnchor.position.y = targetY;
      animating = false;
      leverMotionState = 'REST';
      if (autoLeverCycle) {
        autoNextActionAt = performance.now() + 450;
      }
    } else {
      coilAnchor.position.y += Math.sign(diff) * speed * dt;
      coilAnchor.position.y = Math.min(MAX_COIL_Y, Math.max(MIN_COIL_Y, coilAnchor.position.y));
    }
    coilPosSlider.value = coilAnchor.position.y;
    updateStateText();
    updateDynamicComponents();
  } 
  else if (isFreeFalling && coilAnchor.position.y > MIN_COIL_Y) {
    velocityY -= GRAVITY * dt;
    const normInGap = 1 - (coilAnchor.position.y - MIN_COIL_Y) / (MAX_COIL_Y - MIN_COIL_Y);
    const dynamicEMDamping = EM_DAMPING * (0.3 + 0.7 * normInGap);
    velocityY *= Math.max(0, 1 - dynamicEMDamping * dt);
    coilAnchor.position.y += velocityY * dt;
    if (coilAnchor.position.y <= MIN_COIL_Y) {
      coilAnchor.position.y = MIN_COIL_Y;
      velocityY = 0;
      isFreeFalling = false;
      leverMotionState = 'REST';
    }
    coilPosSlider.value = coilAnchor.position.y;
    updateStateText();
    updateDynamicComponents();
  }
  
  // Continuous auto-cycle engine
  if (
    autoLeverCycle &&
    autoNextActionAt &&
    performance.now() >= autoNextActionAt &&
    !animating &&
    !isFreeFalling
  ) {
    autoNextActionAt = 0;
    const atTop = coilAnchor.position.y >= MAX_COIL_Y - 0.003;
    if (atTop) {
      release();
    } else {
      pullUp();
    }
  }
  
  setHMSCoilPosition(coilAnchor.position.y, {
    minPosition: MIN_COIL_Y,
    maxPosition: MAX_COIL_Y,
    motionState: leverMotionState
  });
  syncLaboratoryModels();
  
  controls.update();
  renderer.render(scene, camera);
}

// Helper function to reset camera and state on reload or tab switch
function resetToDefaultView() {
  camera.position.set(0, 2.1, 4.7);
  controls.target.set(0, 1.25, 0);
  controls.reset();
  initMinState();
}

function initMinState() {
  coilAnchor.position.y = MIN_COIL_Y;
  if (coilPosSlider) coilPosSlider.value = MIN_COIL_Y;
  updateStateText();
  updateDynamicComponents();
}

// Initial state execution
initMinState();
resetToDefaultView();
animate();

// Listener for apparatus reload events
window.addEventListener('apparatus:reload', resetToDefaultView);

window.addEventListener('resize', () => {
  camera.aspect = app.clientWidth / app.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(app.clientWidth, app.clientHeight);
});

const hmsStage = app.closest('.apparatus-stage');
const resizeHms = () => {
  const { width, height } = app.getBoundingClientRect();
  if (width < 2 || height < 2) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
};
new ResizeObserver(resizeHms).observe(app);
window.addEventListener('apparatus:resize', resizeHms);

const renderHms = renderer.render.bind(renderer);
renderer.render = (activeScene, activeCamera) => {
  if (hmsStage.classList.contains('is-active')) {
    renderHms(activeScene, activeCamera);
  }
};

window.hmsHandleControl = {
  setY: setCoilFromHandleY
};

window.hmsControl = {
  setLeverPosition(position) { position === 'UP' ? pullUp() : release(); },
  raiseCoil: pullUp,
  dropCoil: release,
  toggleLever() {
    const isRaised = targetY >= MAX_COIL_Y - 0.003;
    if (isRaised) release();
    else pullUp();
    return isRaised ? 'Drop' : 'Raise Coil';
  },
  getLeverAction: () => coilAnchor.position.y >= MAX_COIL_Y - 0.003 ? 'Drop' : 'Raise Coil',
  getCoilPosition: () => coilAnchor.position.y
};
window.addEventListener('ballistic:external-switch-event', () => release({ externalSwitch: true }));

export const getModel = () => {
  const model = root.clone(true);
  laboratoryModelMirrors.add(model);
  return model;
};

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { addTerminal } from './terminal-utils.js';

// --- SETUP ---
const app = document.getElementById('resistance-box-stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef0f2);

const camera = new THREE.PerspectiveCamera(34, app.clientWidth / app.clientHeight, 0.1, 100);
camera.position.set(0, 8.5, 10.5);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(app.clientWidth, app.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.domElement.className = 'resistance-box-canvas';
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0, 1.8, 0);
controls.maxPolarAngle = Math.PI / 2 + 0.12;

// --- TEXTURES & MATERIALS ---
function createWoodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d4a366'; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 500; i++) {
    const y = Math.random() * 512;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(110,60,20,0.06)' : 'rgba(255,235,190,0.08)';
    ctx.fillRect(0, y, 512, Math.random() * 3 + 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTopPlateTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 640;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#121214'; ctx.fillRect(0, 0, 1024, 640);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, 984, 600);
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
  
  ctx.font = 'bold 36px sans-serif'; ctx.fillText('RESISTANCE BOX', 512, 62);
  ctx.font = 'bold 32px sans-serif'; ctx.fillText('CONSTANTAN COILS', 512, 582);
  
  // Front Row Values
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('100', 250, 508);
  ctx.fillText('50', 423, 508);
  ctx.fillText('20', 601, 508);
  ctx.fillText('20', 774, 508);
  
  // Mid Value
  ctx.fillText('10', 810, 345);
  
  // Back Row Values
  ctx.fillText('1', 250, 142);
  ctx.fillText('2', 423, 142);
  ctx.fillText('2', 601, 142);
  ctx.fillText('5', 774, 142);
  
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function mat(color, rough = 0.5, metal = 0, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...opts });
}

const woodTex = createWoodTexture();
const topPlateTex = createTopPlateTexture();

const brassMat = mat(0xe6b54a, 0.22, 0.88);
const brassDarkMat = mat(0xa37928, 0.32, 0.82);
const chromeMat = mat(0xd4d8dc, 0.18, 0.94);
const plugMat = mat(0x18181a, 0.5, 0.05);
const ceramicMat = mat(0xe4dccb, 0.6, 0.02);
const copperMat = mat(0xb87333, 0.3, 0.85);

const wireBaseColor = 0x8c3b1a;
const wireMats = Array.from({ length: 9 }, () => mat(wireBaseColor, 0.3, 0.82));

// --- PRIMITIVE HELPERS ---
function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

function cyl(r1, r2, h, material, x, y, z, rotX = 0, rotZ = 0, seg = 32) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), material);
  m.position.set(x, y, z);
  m.rotation.set(rotX, 0, rotZ);
  m.castShadow = m.receiveShadow = true;
  return m;
}

function makeScrew(x, y, z, scale = 1) {
  const g = new THREE.Group();
  g.add(cyl(0.18 * scale, 0.18 * scale, 0.05 * scale, chromeMat, 0, 0, 0));
  const slot = box(0.26 * scale, 0.02 * scale, 0.05 * scale, mat(0x111111, 0.8, 0), 0, 0.026 * scale, 0);
  slot.rotation.y = 0.78;
  g.add(slot);
  g.position.set(x, y, z);
  return g;
}

function createWireSegment(p1, p2, radius = 0.028, material = copperMat) {
  const v1 = new THREE.Vector3(...p1);
  const v2 = new THREE.Vector3(...p2);
  const dist = v1.distanceTo(v2);
  const geom = new THREE.CylinderGeometry(radius, radius, dist, 8);
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.copy(v1.clone().add(v2).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v2.clone().sub(v1).normalize());
  mesh.castShadow = true;
  return mesh;
}

// --- CORRECTED GEOMETRY FUNCTIONS ---
function createBrassBlockGeo(minX, maxX, hasLeftNotch, hasRightNotch) {
  const shape = new THREE.Shape();
  const hd = 0.26, r = 0.14, halfGap = 0.04;
  const yEdge = Math.sqrt(r * r - halfGap * halfGap);

  const leftSocketX = minX - halfGap;
  const rightSocketX = maxX + halfGap;

  shape.moveTo(minX, -hd);

  if (hasRightNotch) {
    shape.lineTo(maxX, -hd);
    shape.lineTo(maxX, -yEdge);
    shape.absarc(
      rightSocketX, 0, r, 
      Math.atan2(-yEdge, -halfGap), 
      Math.atan2(yEdge, -halfGap), 
      true
    );
    shape.lineTo(maxX, hd);
  } else {
    shape.lineTo(maxX, -hd);
    shape.lineTo(maxX, hd);
  }

  if (hasLeftNotch) {
    shape.lineTo(minX, hd);
    shape.lineTo(minX, yEdge);
    shape.absarc(
      leftSocketX, 0, r, 
      Math.atan2(yEdge, halfGap), 
      Math.atan2(-yEdge, halfGap), 
      true
    );
    shape.lineTo(minX, -hd);
  } else {
    shape.lineTo(minX, hd);
    shape.lineTo(minX, -hd);
  }

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.34,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.02,
    bevelThickness: 0.02
  });
  geom.rotateX(Math.PI / 2);
  return geom;
}

function createLBlockGeo(isTop) {
  const shape = new THREE.Shape();
  const r = 0.14, hd = 0.26, halfGap = 0.04;
  const edgeOffset = Math.sqrt(r * r - halfGap * halfGap);

  const socket3X = 2.215, socket3Z = -0.95; // 5 ohm socket center
  const socket5X = 2.215, socket5Z = 0.95;  // 20 ohm socket center
  const socket4X = 2.95,  socket4Z = 0.0;   // 10 ohm socket center

  if (isTop) {
    // Top L-Block
    shape.moveTo(2.255, 0.69);
    shape.lineTo(2.69, 0.69);
    shape.lineTo(2.69, halfGap);
    
    // 10 Ohm Socket Cutout (Bottom Edge)
    shape.lineTo(socket4X - edgeOffset, halfGap);
    shape.absarc(
      socket4X, socket4Z, r, 
      Math.atan2(halfGap, -edgeOffset), 
      Math.atan2(halfGap, edgeOffset), 
      true
    );
    
    shape.lineTo(3.21, halfGap);
    shape.lineTo(3.21, 1.21);
    shape.lineTo(2.255, 1.21);
    
    // 20 Ohm Socket Cutout (Left Edge)
    shape.lineTo(2.255, socket5Z + edgeOffset);
    shape.absarc(
      socket5X, socket5Z, r, 
      Math.atan2(edgeOffset, halfGap), 
      Math.atan2(-edgeOffset, halfGap), 
      true
    );
    shape.lineTo(2.255, 0.69);
  } else {
    // Bottom L-Block
    shape.moveTo(2.255, -0.69);
    shape.lineTo(2.69, -0.69);
    shape.lineTo(2.69, -halfGap);
    
    // 10 Ohm Socket Cutout (Top Edge)
    shape.lineTo(socket4X - edgeOffset, -halfGap);
    shape.absarc(
      socket4X, socket4Z, r, 
      Math.atan2(-halfGap, -edgeOffset), 
      Math.atan2(-halfGap, edgeOffset), 
      false
    );
    
    shape.lineTo(3.21, -halfGap);
    shape.lineTo(3.21, -1.21);
    shape.lineTo(2.255, -1.21);
    
    // 5 Ohm Socket Cutout (Left Edge)
    shape.lineTo(2.255, socket3Z - edgeOffset);
    shape.absarc(
      socket3X, socket3Z, r, 
      Math.atan2(-edgeOffset, halfGap), 
      Math.atan2(edgeOffset, halfGap), 
      false
    );
    shape.lineTo(2.255, -0.69);
  }

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.34,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.02,
    bevelThickness: 0.02
  });
  geom.rotateX(Math.PI / 2);
  return geom;
}

// --- SCENE CONSTRUCTION ---
const machine = new THREE.Group();
scene.add(machine);

// 1. CASING & CORNER JOINTS
const casing = new THREE.Group();
machine.add(casing);
const shellPieces = [];

function addShellMesh(geo, matConfig, x, y, z) {
  const material = new THREE.MeshStandardMaterial({ ...matConfig, transparent: true, opacity: 1.0 });
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  casing.add(m);
  shellPieces.push(m);
  return m;
}

addShellMesh(new THREE.BoxGeometry(9.1, 0.3, 6.1), { map: woodTex, roughness: 0.5, color: 0xb58045 }, 0, 0.15, 0);
addShellMesh(new THREE.BoxGeometry(8.6, 2.7, 0.35), { map: woodTex, roughness: 0.4 }, 0, 1.65, 2.625);
addShellMesh(new THREE.BoxGeometry(8.6, 2.7, 0.35), { map: woodTex, roughness: 0.4 }, 0, 1.65, -2.625);
addShellMesh(new THREE.BoxGeometry(0.35, 2.7, 4.9), { map: woodTex, roughness: 0.4 }, -4.125, 1.65, 0);
addShellMesh(new THREE.BoxGeometry(0.35, 2.7, 4.9), { map: woodTex, roughness: 0.4 }, 4.125, 1.65, 0);
addShellMesh(new THREE.BoxGeometry(8.0, 0.15, 4.9), { map: woodTex, roughness: 0.4 }, 0, 0.35, 0);
addShellMesh(new THREE.BoxGeometry(8.6, 0.16, 5.6), { map: topPlateTex, roughness: 0.22, metalness: 0.08 }, 0, 3.08, 0);

for (const cx of [-4.28, 4.28]) {
  for (const cz of [-2.78, 2.78]) {
    for (let i = 0; i < 7; i++) {
      if (i % 2 === 0) {
        addShellMesh(new THREE.BoxGeometry(0.38, 0.32, 0.38), { map: woodTex, roughness: 0.5, color: 0xb58045 }, cx, 0.5 + i * 0.36, cz);
      }
    }
  }
}

for (const x of [-4.05, 4.05]) {
  for (const z of [-2.55, 2.55]) {
    const screwGroup = makeScrew(x, 3.17, z, 0.85);
    casing.add(screwGroup);
    screwGroup.traverse(child => { if (child.isMesh) shellPieces.push(child); });
  }
}

// 2. HARDWARE & BRASS BLOCKS
const deckHardware = new THREE.Group();
machine.add(deckHardware);

const blockConfigs = [
  { min: -3.10, max: -2.255, left: false, right: true },
  { min: -2.175, max: -0.78, left: true, right: true },
  { min: -0.70, max: 0.70, left: true, right: true },
  { min: 0.78, max: 2.175, left: true, right: true }
];

[-0.95, 0.95].forEach((zPos) => {
  blockConfigs.forEach((b) => {
    const mesh = new THREE.Mesh(createBrassBlockGeo(b.min, b.max, b.left, b.right), brassMat);
    mesh.position.set(0, 3.33, zPos);
    mesh.castShadow = mesh.receiveShadow = true;
    deckHardware.add(mesh);
  });
});

deckHardware.add(new THREE.Mesh(createLBlockGeo(true), brassMat).translateY(3.33));
deckHardware.add(new THREE.Mesh(createLBlockGeo(false), brassMat).translateY(3.33));

// Store binding post references for terminal creation
const bindingPostPositions = [
  { x: -3.55, z: -0.95, id: 'RB_ORANGE', color: 0xffa500 },   // Orange terminal (left)
  { x: -3.55, z: 0.95, id: 'RB_HMS_BLACK', color: 0x111111 }  // Black terminal (right)
];

function createBindingPost(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 3.16, z);
  g.add(cyl(0.38, 0.42, 0.12, brassMat, 0, 0.06, 0));
  g.add(cyl(0.24, 0.24, 0.32, chromeMat, 0, 0.26, 0));
  g.add(cyl(0.38, 0.38, 0.28, chromeMat, 0, 0.54, 0));
  g.add(cyl(0.28, 0.28, 0.08, chromeMat, 0, 0.72, 0));
  g.add(cyl(0.08, 0.08, 0.85, brassDarkMat, 0, 0.45, 0));
  return g;
}

// Store binding post groups for terminal integration
const bindingPostGroups = [];
bindingPostPositions.forEach((pos) => {
  const group = createBindingPost(pos.x, pos.z);
  deckHardware.add(group);
  bindingPostGroups.push({ group, ...pos });
});

// ============================================
// TERMINAL INTEGRATION
// ============================================

// Create a group to hold terminal markers
const terminalGroup = new THREE.Group();
terminalGroup.userData.isTerminalGroup = true;

// Create terminals for each binding post
bindingPostGroups.forEach((postInfo) => {
  const { x, z, id, color } = postInfo;
  
  // Create a group for this terminal at the top of the binding post
  const termGroup = new THREE.Group();
  const terminalY = 3.16 + 0.72; // Top of the binding post
  termGroup.position.set(x, terminalY, z);
  
  // Create a visual marker for the terminal (small colored sphere)
  const markerGeo = new THREE.SphereGeometry(0.055, 12, 12);
  const markerMat = new THREE.MeshBasicMaterial({ 
    color: color, 
    transparent: true, 
    opacity: 0.3 
  });
  const marker = new THREE.Mesh(markerGeo, markerMat);
  termGroup.add(marker);
  
  // Add a ring around it for better visibility
  const ringGeo = new THREE.TorusGeometry(0.06, 0.008, 8, 16);
  const ringMat = new THREE.MeshBasicMaterial({ 
    color: color, 
    transparent: true, 
    opacity: 0.4 
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  termGroup.add(ring);
  
  // Add the terminal using terminal-utils
  const terminal = addTerminal(
    termGroup,
    id,
    new THREE.Vector3(0, 0, 0)
  );
  
  // Mark as terminal for click detection
  terminal.userData.isTerminalHit = true;
  terminal.userData.isTerminal = true;
  terminal.userData.terminalId = id;
  terminal.userData.apparatusId = 'resistance-box';
  
  // Store the terminal group reference
  termGroup.userData.terminalId = id;
  termGroup.userData.isTerminal = true;
  termGroup.userData.apparatusId = 'resistance-box';
  
  // Add to terminal group
  terminalGroup.add(termGroup);
  
  // Also tag the binding post meshes for click detection
  postInfo.group.children.forEach((child) => {
    if (child.isMesh) {
      child.userData.isTerminalHit = true;
      child.userData.isTerminal = true;
      child.userData.terminalId = id;
      child.userData.apparatusId = 'resistance-box';
    }
  });
});

// Add the terminal group to the machine
machine.add(terminalGroup);

// 3. CIRCUIT LOGIC, COILS & PLUGS
const internalAssembly = new THREE.Group();
machine.add(internalAssembly);

const dX = -0.35;
const coilValues = [
  { ohm: 1,   x: -2.215 + dX, z: -0.95, rWire: 0.042, turns: 5  },
  { ohm: 2,   x: -0.74 + dX,  z: -0.95, rWire: 0.034, turns: 7  },
  { ohm: 2,   x: 0.74 + dX,   z: -0.95, rWire: 0.034, turns: 7  },
  { ohm: 5,   x: 2.215 + dX,  z: -0.95, rWire: 0.025, turns: 11 },
  { ohm: 10,  x: 2.95 + dX,   z: 0,     rWire: 0.019, turns: 16 },
  { ohm: 20,  x: 2.215 + dX,  z: 0.95,  rWire: 0.014, turns: 22 },
  { ohm: 20,  x: 0.74 + dX,   z: 0.95,  rWire: 0.014, turns: 22 },
  { ohm: 50,  x: -0.74 + dX,  z: 0.95,  rWire: 0.009, turns: 32 },
  { ohm: 100, x: -2.215 + dX, z: 0.95,  rWire: 0.006, turns: 44 }
];

const plugs = [];
const socketHitboxes = [];
const socketHitboxMat = new THREE.MeshBasicMaterial({ visible: false });

function createFunctionalPlug(coilIndex, x, z, angle = 0) {
  const g = new THREE.Group();
  g.position.set(x, 3.33, z);
  const parts = [
    cyl(0.14, 0.11, 0.42, brassMat, 0, 0.05, 0),
    cyl(0.22, 0.22, 0.1, brassDarkMat, 0, 0.28, 0),
    cyl(0.16, 0.16, 0.28, plugMat, 0, 0.46, 0),
    box(0.64, 0.26, 0.32, plugMat, 0, 0.65, 0)
  ];
  parts[3].rotation.y = angle;
  parts.forEach(part => g.add(part));
  deckHardware.add(g);
  
  // Static invisible socket hitbox so user can re-insert key when socket is empty
  const socketHitbox = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.8, 16), socketHitboxMat);
  socketHitbox.position.set(x, 3.4, z);
  socketHitbox.userData = { isSocket: true, coilIndex };
  deckHardware.add(socketHitbox);
  socketHitboxes.push(socketHitbox);

  plugs[coilIndex] = { group: g, connected: true, ohm: coilValues[coilIndex].ohm };
}

createFunctionalPlug(0, -2.215, -0.95, 0.15);
createFunctionalPlug(1, -0.74, -0.95, -0.3);
createFunctionalPlug(2, 0.74, -0.95, 0.15);
createFunctionalPlug(3, 2.215, -0.95, -0.3);
createFunctionalPlug(4, 2.95, 0, Math.PI / 2);
createFunctionalPlug(5, 2.215, 0.95, -0.25);
createFunctionalPlug(6, 0.74, 0.95, 0.2);
createFunctionalPlug(7, -0.74, 0.95, -0.25);
createFunctionalPlug(8, -2.215, 0.95, 0.2);

// COIL GENERATION
coilValues.forEach((c, index) => {
  const g = new THREE.Group();
  g.position.set(c.x, 2.0, c.z);

  const coreRadius = 0.32;
  const windingHeight = 0.90;

  g.add(cyl(coreRadius, coreRadius, 1.1, ceramicMat, 0, -0.1, 0));
  g.add(cyl(0.48, 0.48, 0.08, ceramicMat, 0, 0.42, 0));
  g.add(cyl(0.48, 0.48, 0.08, ceramicMat, 0, -0.62, 0));

  const underlyingRadius = coreRadius + c.rWire * 0.75;
  g.add(cyl(underlyingRadius, underlyingRadius, windingHeight, wireMats[index], 0, -0.1, 0));

  const startY = -0.1 - (windingHeight / 2) + c.rWire;
  const stepY = (windingHeight - 2 * c.rWire) / Math.max(1, c.turns - 1);

  for (let n = 0; n < c.turns; n++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(coreRadius + c.rWire, c.rWire, 8, 24), wireMats[index]);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = startY + n * stepY;
    g.add(ring);
  }
  internalAssembly.add(g);

  const leadRadius = Math.max(0.016, c.rWire * 0.7);
  internalAssembly.add(createWireSegment([c.x, 2.45, c.z], [c.x, 3.16, c.z], leadRadius, copperMat));
  internalAssembly.add(createWireSegment([c.x, 1.55, c.z], [c.x, 1.09, c.z], leadRadius, copperMat));
  
  // UPDATED: Lowered coil caps from y=3.14 to y=2.95 to hide below deck
  internalAssembly.add(cyl(0.08, 0.08, 0.06, brassDarkMat, c.x, 2.95, c.z));
  internalAssembly.add(cyl(0.08, 0.08, 0.06, brassDarkMat, c.x, 1.11, c.z));
});

internalAssembly.add(createWireSegment([-3.55, 3.16, -0.95], [-3.10, 3.16, -0.95], 0.045, brassDarkMat));
internalAssembly.add(createWireSegment([-3.55, 3.16, 0.95], [-3.10, 3.16, 0.95], 0.045, brassDarkMat));

function createBusLink(x1, y1, z1, x2, y2, z2, radius = 0.035) {
  internalAssembly.add(createWireSegment([x1, y1, z1], [x2, y2, z2], radius, copperMat));
}

const interCoilXPositions = [-2.90 + dX, -1.4775 + dX, 0.0 + dX, 1.4775 + dX, 2.90 + dX];

[-0.95, 0.95].forEach((zPos) => interCoilXPositions.forEach((rx, idx) => {
  if (idx === 0) return;
  const g = new THREE.Group();
  g.position.set(rx, 2.1, zPos);
  g.add(cyl(0.045, 0.045, 2.3, brassDarkMat, 0, 0, 0));
  const hexGeom = new THREE.CylinderGeometry(0.09, 0.09, 0.08, 6);
  g.add(new THREE.Mesh(hexGeom, brassMat).translateY(1.05));
  g.add(new THREE.Mesh(hexGeom, brassMat).translateY(-1.05));
  internalAssembly.add(g);
}));

createBusLink(coilValues[0].x, 1.08, -0.95, interCoilXPositions[1], 1.08, -0.95);
createBusLink(interCoilXPositions[1], 1.08, -0.95, coilValues[1].x, 1.08, -0.95);
createBusLink(coilValues[1].x, 1.08, -0.95, interCoilXPositions[2], 1.08, -0.95);
createBusLink(interCoilXPositions[2], 1.08, -0.95, coilValues[2].x, 1.08, -0.95);
createBusLink(coilValues[2].x, 1.08, -0.95, interCoilXPositions[3], 1.08, -0.95);
createBusLink(interCoilXPositions[3], 1.08, -0.95, coilValues[3].x, 1.08, -0.95);
createBusLink(coilValues[3].x, 1.08, -0.95, interCoilXPositions[4], 1.08, -0.95);

createBusLink(interCoilXPositions[4], 1.08, -0.95, coilValues[4].x, 1.08, coilValues[4].z);
createBusLink(coilValues[4].x, 1.08, coilValues[4].z, interCoilXPositions[4], 1.08, 0.95);

createBusLink(interCoilXPositions[4], 1.08, 0.95, coilValues[5].x, 1.08, 0.95);
createBusLink(coilValues[5].x, 1.08, 0.95, interCoilXPositions[3], 1.08, 0.95);
createBusLink(interCoilXPositions[3], 1.08, 0.95, coilValues[6].x, 1.08, 0.95);
createBusLink(coilValues[6].x, 1.08, 0.95, interCoilXPositions[2], 1.08, 0.95);
createBusLink(interCoilXPositions[2], 1.08, 0.95, coilValues[7].x, 1.08, 0.95);
createBusLink(coilValues[7].x, 1.08, 0.95, interCoilXPositions[1], 1.08, 0.95);
createBusLink(interCoilXPositions[1], 1.08, 0.95, coilValues[8].x, 1.08, 0.95);

// 4. LIGHTING & RENDERING
scene.add(new THREE.HemisphereLight(0xffffff, 0x756555, 1.8));

const keyLight = new THREE.DirectionalLight(0xfff6ea, 3.8);
keyLight.position.set(6, 12, 8);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -8; keyLight.shadow.camera.right = 8;
keyLight.shadow.camera.top = 8; keyLight.shadow.camera.bottom = -8;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xddeeff, 1.2);
fillLight.position.set(-8, 6, -4);
scene.add(fillLight);

const pointHighlight = new THREE.PointLight(0xffdfa0, 15, 20);
pointHighlight.position.set(0, 6, 4);
scene.add(pointHighlight);

// 5. INTERACTION LOGIC, CIRCUIT VERIFICATION & CALCULATIONS
function calculateResistance() {
  return plugs.reduce((sum, p) => p.connected ? sum : sum + p.ohm, 0);
}

function updateCircuit(updateInputUI = true) {
  const total = calculateResistance();
  const openKeys = [];

  plugs.forEach((p, i) => {
    const isOpened = !p.connected;
    
    // Key disappears when open (unplugged) and reappears when inserted
    p.group.visible = p.connected;

    if (isOpened) {
      wireMats[i].emissive.setHex(0x551100); 
      openKeys.push(`${p.ohm} Ω`);
    } else {
      wireMats[i].emissive.setHex(0x000000); 
    }
  });

  // UI Element Updates
  const resValElem = document.getElementById('res-val');
  if (resValElem) resValElem.innerText = total;

  const resInputElem = document.getElementById('res-input');
  if (resInputElem && updateInputUI) resInputElem.value = total;

  const keysDetailElem = document.getElementById('keys-detail');
  if (keysDetailElem) {
    keysDetailElem.textContent = openKeys.length > 0 ? openKeys.join(', ') : 'None (0 Ω)';
  }
  // Shared apparatus state consumed by the experiment physics, not a duplicate UI calculation.
  window.resistanceBoxState = { resistance: total, openKeys: [...openKeys] };
  window.dispatchEvent(new CustomEvent('ballistic:resistance-change', { detail: window.resistanceBoxState }));
  const labResistanceInput = document.getElementById('lab-total-resistance');
  if (labResistanceInput) labResistanceInput.value = total;
}

// Function to find and snap to the nearest achievable resistance combination
function setTargetResistance(target) {
  target = Math.max(0, Math.min(210, Number(target) || 0));
  
  let minDiff = Infinity;
  let bestOpenIndices = [];

  const n = coilValues.length;
  for (let i = 0; i < (1 << n); i++) {
    let sum = 0;
    let openIndices = [];
    for (let j = 0; j < n; j++) {
      if ((i >> j) & 1) {
        sum += coilValues[j].ohm;
        openIndices.push(j);
      }
    }
    let diff = Math.abs(target - sum);
    if (diff < minDiff) {
      minDiff = diff;
      bestOpenIndices = openIndices;
    }
  }

  plugs.forEach((p, i) => {
    p.connected = !bestOpenIndices.includes(i);
  });

  updateCircuit(true);
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

app.addEventListener('pointerdown', (event) => {
  if (event.target.closest('#ui') || event.target.closest('#resistance-ui')) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  raycaster.setFromCamera(pointer, camera);
  
  // Raycast against sockets so clicks work on both inserted keys and empty sockets
  const intersects = raycaster.intersectObjects(socketHitboxes, false);
  if (intersects.length > 0) {
    const clickedSocket = intersects[0].object;
    if (clickedSocket.userData && clickedSocket.userData.isSocket) {
      const idx = clickedSocket.userData.coilIndex;
      plugs[idx].connected = !plugs[idx].connected;
      updateCircuit(true);
    }
  }
});

// 6. UI BINDINGS & STEPPERS
const opacityInput = document.getElementById('opacity');
const opacityValElem = document.getElementById('opacity-val');
const opacityStepper = document.getElementById('opacity-stepper');
const resInputElem = document.getElementById('res-input');

function updateOpacity(val) {
  let numVal = Number(val);
  if (isNaN(numVal)) numVal = 100;
  
  // If the input is fractional (0 to 1), scale to 0-100 percentage
  if (numVal <= 1 && numVal > 0 && val.toString().includes('.')) {
    numVal = numVal * 100;
  }
  
  numVal = Math.max(0, Math.min(100, numVal));
  const opacityFrac = numVal / 100;

  if (opacityInput) opacityInput.value = opacityFrac;
  if (opacityStepper) opacityStepper.value = Math.round(numVal);
  if (opacityValElem) opacityValElem.textContent = Math.round(numVal) + '%';

  shellPieces.forEach((m) => {
    if (m.material) {
      m.material.opacity = opacityFrac;
      m.material.transparent = true;
      m.material.depthWrite = opacityFrac > 0.05;
      m.material.needsUpdate = true;
    }
  });
}

if (opacityInput) {
  opacityInput.addEventListener('input', () => updateOpacity(opacityInput.value));
}
if (opacityStepper) {
  opacityStepper.addEventListener('input', () => updateOpacity(opacityStepper.value));
  opacityStepper.addEventListener('change', () => updateOpacity(opacityStepper.value));
}

if (resInputElem) {
  resInputElem.addEventListener('change', () => setTargetResistance(resInputElem.value));
}

const resizeResistanceBox = () => {
  const { width, height } = app.getBoundingClientRect();
  if (width < 2 || height < 2) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
};

new ResizeObserver(resizeResistanceBox).observe(app);
window.addEventListener('resize', resizeResistanceBox);
window.addEventListener('apparatus:resize', resizeResistanceBox);

updateCircuit(true);

function render() {
  requestAnimationFrame(render);
  if (!app.classList.contains('is-active')) return;
  controls.update();
  renderer.render(scene, camera);
}
render();

export const getModel = () => {
  const pivot = new THREE.Group();
  pivot.add(machine);
  return pivot;
};

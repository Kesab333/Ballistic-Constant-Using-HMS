import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { addTerminal } from './terminal-utils.js';

const apparatusHost = document.getElementById('commutator-canvas-container');
if (!apparatusHost) throw new Error('commutator-canvas-container not found');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeaecf0);

const camera = new THREE.PerspectiveCamera(38, apparatusHost.clientWidth / apparatusHost.clientHeight, 0.05, 50);
camera.position.set(0, 1.8, 2.6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(apparatusHost.clientWidth, apparatusHost.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
apparatusHost.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.target.set(0, 0.2, 0);
controls.minDistance = 0.8;
controls.maxDistance = 6;
controls.maxPolarAngle = Math.PI / 2 + 0.15;

// --- Balanced Lighting setup (Prevents dark/blackish reflections on metal) ---
// Hemisphere light adds a general ambient tone (warm sky, cool shadows)
scene.add(new THREE.HemisphereLight(0xfff5e6, 0x303540, 1.8)); 

const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(3, 6, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xd0e0ff, 1.0);
fillLight.position.set(-4, 3, -3);
scene.add(fillLight);

// --- Materials ---
function createKnurlTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    for (let i = -128; i < 256; i += 8) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 128, 128); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i, 128); ctx.lineTo(i + 128, 0); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 2);
    return tex;
}

const knurlMap = createKnurlTexture();
const eboniteMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.05 });

// Standard Polished Brass Materials (Adjusted to avoid black rendering)
const polishedBrassMat = new THREE.MeshStandardMaterial({ 
    color: 0xd4a849, 
    roughness: 0.35, 
    metalness: 0.65, 
    emissive: 0x221805 // Subtle glow prevents pure black shadows
});

const knurledBrassMat = new THREE.MeshStandardMaterial({ 
    color: 0xc4962c, 
    roughness: 0.45, 
    metalness: 0.6, 
    bumpMap: knurlMap, 
    bumpScale: 0.015,
    emissive: 0x221805
});

const silverMat = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.2, metalness: 0.8 });

// --- Build Commutator Model ---
const mainGroup = new THREE.Group();

// Base disk
const base = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.18, 64), eboniteMat);
base.position.y = 0.09;
base.castShadow = base.receiveShadow = true;
mainGroup.add(base);

// 4-segment brass commutator ring with PRECISE AIR GAPS & SOCKET NOTCHES
const numSegments = 4;
const innerR = 0.52;
const outerR = 0.82;
const midR = (innerR + outerR) / 2; // 0.67
const holeRadius = 0.085;
const halfGap = 0.015; // Clean, straight gap width / 2
const segmentAngle = (Math.PI * 2) / numSegments;

function createPreciseGappedSegmentShape() {
    const shape = new THREE.Shape();
    
    // Math helpers for exact coordinate intersections
    const getX = (r, y) => Math.sqrt(r * r - y * y);
    const getY = (r, x) => Math.sqrt(r * r - x * x);
    const dxHole = getX(holeRadius, halfGap);
    const alphaHole = Math.asin(halfGap / holeRadius);

    // 1. Bottom-inner corner
    shape.moveTo(getX(innerR, halfGap), halfGap);
    
    // 2. Line along bottom gap to Hole 1
    shape.lineTo(midR - dxHole, halfGap);
    
    // 3. Cutout for Hole 1 (Clockwise)
    shape.absarc(midR, 0, holeRadius, Math.PI - alphaHole, alphaHole, true);
    
    // 4. Line along bottom gap to outer edge
    shape.lineTo(getX(outerR, halfGap), halfGap);
    
    // 5. Outer Arc boundary (Counter-clockwise)
    shape.absarc(0, 0, outerR, Math.asin(halfGap/outerR), Math.PI/2 - Math.asin(halfGap/outerR), false);
    
    // 6. Line down left gap to Hole 2
    shape.lineTo(halfGap, midR + dxHole);
    
    // 7. Cutout for Hole 2 (Clockwise)
    shape.absarc(0, midR, holeRadius, Math.PI/2 - alphaHole, -Math.PI/2 + alphaHole, true);
    
    // 8. Line down left gap to inner edge
    shape.lineTo(halfGap, getY(innerR, halfGap));
    
    // 9. Inner Arc boundary (Clockwise)
    shape.absarc(0, 0, innerR, Math.PI/2 - Math.asin(halfGap/innerR), Math.asin(halfGap/innerR), true);

    return shape;
}

const ringGroup = new THREE.Group();
const segShape = createPreciseGappedSegmentShape();
// Very small bevel to avoid intersecting complex corner geometry
const extSettings = { depth: 0.09, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.002, bevelThickness: 0.002 };
const segGeo = new THREE.ExtrudeGeometry(segShape, extSettings);

for (let i = 0; i < numSegments; i++) {
    const seg = new THREE.Mesh(segGeo, polishedBrassMat);
    seg.rotation.x = -Math.PI / 2;
    seg.rotation.z = i * segmentAngle;
    seg.position.y = 0.18;
    seg.castShadow = seg.receiveShadow = true;
    ringGroup.add(seg);
}
mainGroup.add(ringGroup);

// 4 Plug Keys (Click to plug/unplug)
const keysGroup = new THREE.Group();
for (let i = 0; i < numSegments; i++) {
    const gapPos = i * segmentAngle;
    const x = Math.cos(gapPos) * midR;
    const z = Math.sin(gapPos) * midR;

    const keyGroup = new THREE.Group();
    
    // Tapered brass plug pin
    const brassPlug = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.075, 0.14, 24), polishedBrassMat);
    brassPlug.position.y = 0.22;
    brassPlug.castShadow = true;
    keyGroup.add(brassPlug);

    // Insulated handle knob
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.10, 0.14, 24), eboniteMat);
    handle.position.y = 0.33;
    handle.castShadow = true;
    keyGroup.add(handle);

    // Brass top cap
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16), polishedBrassMat);
    cap.position.y = 0.40;
    keyGroup.add(cap);

    keyGroup.position.set(x, 0, z);
    keysGroup.add(keyGroup);
}
mainGroup.add(keysGroup);

// 4 Binding posts between segments
const postsGroup = new THREE.Group();
const postPositions = [];

// Terminal color mapping for the 4 posts
const terminalColors = ['C_SKY_BLUE', 'C_NAVY_BLUE', 'C_ORANGE', 'C_RED'];
// Color hex values for visual reference
const colorHexes = [0x00bfff, 0x000080, 0xffa500, 0xff0000];

for (let i = 0; i < numSegments; i++) {
    const midAngle = i * segmentAngle + segmentAngle / 2;
    const radius = (innerR + outerR) / 2;
    const x = Math.cos(midAngle) * radius;
    const z = Math.sin(midAngle) * radius;
    
    // Store post positions for terminal creation
    postPositions.push({ x, z, angle: midAngle, index: i });

    const postGroup = new THREE.Group();
    const baseCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.03, 16), eboniteMat);
    baseCollar.position.y = 0.20;
    postGroup.add(baseCollar);

    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 24), polishedBrassMat);
    pin.position.y = 0.27;
    postGroup.add(pin);

    const washer = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.04, 24), polishedBrassMat);
    washer.position.y = 0.235;
    postGroup.add(washer);

    const nutGroup = new THREE.Group();
    const nutBody = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.08, 0.08, 32), knurledBrassMat);
    nutGroup.add(nutBody);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.082, 24), silverMat);
    nutGroup.add(core);
    nutGroup.position.y = 0.31;
    nutGroup.castShadow = true;

    postGroup.add(nutGroup);
    postGroup.position.set(x, 0, z);
    postsGroup.add(postGroup);
}
mainGroup.add(postsGroup);

scene.add(mainGroup);

// --- Key Plug / Unplug Interaction ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let pointerDownPos = { x: 0, y: 0 };

renderer.domElement.addEventListener('pointerdown', (e) => {
    pointerDownPos = { x: e.clientX, y: e.clientY };
});

renderer.domElement.addEventListener('pointerup', (e) => {
    const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
    if (dist > 6) return; // Skip if orbiting camera

    const rect = apparatusHost.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(keysGroup.children, true);

    if (intersects.length > 0) {
        let targetKey = intersects[0].object;
        while (targetKey.parent && targetKey.parent !== keysGroup) {
            targetKey = targetKey.parent;
        }
        if (targetKey) {
            targetKey.visible = !targetKey.visible; // Toggle plugged/unplugged
        }
    }
});

renderer.domElement.addEventListener('pointermove', (e) => {
    const rect = apparatusHost.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(keysGroup.children, true);
    apparatusHost.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
});

// --- Resize handler ---
const resizeCommutator = () => {
    const { width, height } = apparatusHost.getBoundingClientRect();
    if (width < 2 || height < 2) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
};
new ResizeObserver(resizeCommutator).observe(apparatusHost);
window.addEventListener('apparatus:resize', resizeCommutator);

// --- Animate ---
const stageEl = document.getElementById('commutator-stage');
function animate() {
    requestAnimationFrame(animate);
    if (!stageEl || !stageEl.classList.contains('is-active')) return;
    controls.update();
    renderer.render(scene, camera);
}
animate();

// ============================================
// TERMINAL INTEGRATION
// ============================================

// Create a group to hold terminal markers
const terminalGroup = new THREE.Group();
terminalGroup.userData.isTerminalGroup = true;

// Find or create terminal posts for each of the 4 binding posts
const terminalPositions = [
    { id: 'C_SKY_BLUE', color: 0x00bfff, angleOffset: 0 },
    { id: 'C_NAVY_BLUE', color: 0x000080, angleOffset: 1 },
    { id: 'C_ORANGE', color: 0xffa500, angleOffset: 2 },
    { id: 'C_RED', color: 0xff0000, angleOffset: 3 }
];

terminalPositions.forEach((termInfo) => {
    // Calculate position based on segment angle
    const angle = termInfo.angleOffset * segmentAngle + segmentAngle / 2;
    const radius = (innerR + outerR) / 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    
    // Create a group for this terminal
    const termGroup = new THREE.Group();
    termGroup.position.set(x, 0.31, z); // Position at the nut height
    
    // Create a visual marker for the terminal (small colored sphere)
    const markerGeo = new THREE.SphereGeometry(0.05, 12, 12);
    const markerMat = new THREE.MeshBasicMaterial({ 
        color: termInfo.color, 
        transparent: true, 
        opacity: 0.3 
    });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    termGroup.add(marker);
    
    // Add a ring around it for better visibility
    const ringGeo = new THREE.TorusGeometry(0.055, 0.008, 8, 16);
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
    terminal.userData.apparatusId = 'commutator';
    
    // Store the terminal group reference
    termGroup.userData.terminalId = termInfo.id;
    termGroup.userData.isTerminal = true;
    
    // Add to terminal group
    terminalGroup.add(termGroup);
});

// Add the terminal group to the main group
mainGroup.add(terminalGroup);

// Also tag existing post meshes as terminal hits for click detection
postsGroup.children.forEach((postGroup, index) => {
    postGroup.traverse((child) => {
        if (child.isMesh) {
            child.userData.isTerminalHit = true;
            child.userData.isTerminal = true;
            child.userData.terminalId = terminalPositions[index % terminalPositions.length].id;
            child.userData.apparatusId = 'commutator';
        }
    });
});

// --- Export model for lab-scene usage ---
export const getModel = () => {
    const pivot = new THREE.Group();
    pivot.add(mainGroup);
    return pivot;
};
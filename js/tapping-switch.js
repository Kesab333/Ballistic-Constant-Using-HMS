import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { addTerminal } from './terminal-utils.js';
import { setSwitchClosed } from './physics.js';

const apparatusHost = document.getElementById('tapping-switch-stage');
if (!apparatusHost) throw new Error('tapping-switch-stage not found');

// ============================================
// FIX: Define angle constants BEFORE they are used
// ============================================
const OFF_ANGLE = 0.085;
const ON_ANGLE = 0.000;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9e9e9);

// Adjusted FOV & camera distance so full switch base fits on screen
const camera = new THREE.PerspectiveCamera(36, apparatusHost.clientWidth / apparatusHost.clientHeight, 0.1, 100);
camera.position.set(0, 4.5, 7.8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(apparatusHost.clientWidth, apparatusHost.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
apparatusHost.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.target.set(0, 0.35, 0);

// --- Lights ---
scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.8);
keyLight.position.set(2, 7, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.width = 2048;
keyLight.shadow.mapSize.height = 2048;
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 1.2);
fillLight.position.set(-4, 3, -3);
scene.add(fillLight);

// --- Materials ---
const blackPlastic = new THREE.MeshStandardMaterial({ color: 0x080909, roughness: 0.24, metalness: 0.05 });
const blackRubber = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.72, metalness: 0 });
const redPlastic = new THREE.MeshStandardMaterial({ color: 0xc90000, roughness: 0.28, metalness: 0.03 });
const metal = new THREE.MeshStandardMaterial({ color: 0xb8b8b5, roughness: 0.25, metalness: 0.88 });
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x444543, roughness: 0.3, metalness: 0.9 });
const brass = new THREE.MeshStandardMaterial({ color: 0xb58a4a, roughness: 0.25, metalness: 0.82 });
const stripMaterial = new THREE.MeshStandardMaterial({ color: 0x9a9a96, metalness: 0.92, roughness: 0.24 });

// --- Helper Functions ---
function cylinder(radius, height, mat, radial = 48) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, radial), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

function bevelBox(w, h, d, radius, material) {
    const shape = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    shape.moveTo(x + radius, y);
    shape.lineTo(x + w - radius, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + radius);
    shape.lineTo(x + w, y + h - radius);
    shape.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    shape.lineTo(x + radius, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - radius);
    shape.lineTo(x, y + radius);
    shape.quadraticCurveTo(x, y, x + radius, y);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: radius * 0.45, bevelThickness: radius * 0.35 });
    geo.center();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

function screwHead(radius, height) {
    const group = new THREE.Group();
    const body = cylinder(radius, height, metal, 32);
    group.add(body);
    const slotMat = new THREE.MeshStandardMaterial({ color: 0x242424, roughness: 0.55, metalness: 0.25 });
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.25, height * 0.12, radius * 0.18), slotMat);
    s1.position.y = height / 2 + 0.003;
    group.add(s1);
    return group;
}

// --- Base ---
const base = bevelBox(6.5, 0.62, 3.45, 0.18, blackPlastic);
base.position.set(0, 0, 0);
scene.add(base);

// Store binding post references for terminal creation
const bindingPostGroups = [];

// --- Binding Posts ---
function bindingPost(x, z, material, scale = 1.05, terminalId, terminalColor) {
    const group = new THREE.Group();
    const collar = cylinder(0.38 * scale, 0.14 * scale, blackPlastic);
    collar.position.y = 0.40 * scale;
    group.add(collar);
    const post = cylinder(0.27 * scale, 0.72 * scale, brass, 40);
    post.position.y = 0.78 * scale;
    group.add(post);
    const shoulder = cylinder(0.34 * scale, 0.15 * scale, material, 40);
    shoulder.position.y = 1.03 * scale;
    group.add(shoulder);
    const cap = cylinder(0.31 * scale, 0.34 * scale, material, 40);
    cap.position.y = 1.22 * scale;
    group.add(cap);
    const hole = cylinder(0.13 * scale, 0.012, blackRubber, 32);
    hole.position.y = 1.395 * scale;
    group.add(hole);
    group.position.set(x, 0, z);
    scene.add(group);
    
    // Store for terminal integration
    bindingPostGroups.push({ 
        group, 
        x, 
        z, 
        terminalId, 
        terminalColor,
        terminalY: 1.395 * scale 
    });
    
    return group;
}

// Create binding posts with terminal IDs
bindingPost(-1.5, 0.9, darkMetal, 1.05, 'SW_BLACK', 0x111111);
bindingPost(1.5, 0.9, redPlastic, 1.05, 'SW_RED', 0xff0000);

const CONTACT_X = 1.62;
const PIVOT_START_X = -1.15;
const CLAMP_FRONT_X = -0.75;
const PIVOT_Z = 0.02;

// --- Lower Contact ---
const lowerContactGroup = new THREE.Group();
const contactBase = cylinder(0.20, 0.10, brass);
contactBase.position.y = 0.35;
lowerContactGroup.add(contactBase);
const contactStem = cylinder(0.11, 0.12, brass);
contactStem.position.y = 0.44;
lowerContactGroup.add(contactStem);
const contactHead = cylinder(0.20, 0.08, brass);
contactHead.position.y = 0.51;
lowerContactGroup.add(contactHead);
lowerContactGroup.position.set(CONTACT_X, 0, PIVOT_Z);
scene.add(lowerContactGroup);

// --- Pivot & Fixed Strip ---
const pivotBlock = bevelBox(0.9, 0.22, 0.65, 0.05, darkMetal);
pivotBlock.position.set(PIVOT_START_X + 0.35, 0.45, PIVOT_Z);
scene.add(pivotBlock);

const fixedStripWidth = CLAMP_FRONT_X - PIVOT_START_X;
const fixedStrip = new THREE.Mesh(
    new THREE.BoxGeometry(fixedStripWidth, 0.04, 0.28),
    stripMaterial
);
fixedStrip.position.set(PIVOT_START_X + fixedStripWidth / 2, 0.58, PIVOT_Z);
fixedStrip.castShadow = true;
scene.add(fixedStrip);

const screw1 = screwHead(0.08, 0.05);
screw1.position.set(PIVOT_START_X + 0.15, 0.61, PIVOT_Z - 0.18);
scene.add(screw1);
const screw2 = screwHead(0.08, 0.05);
screw2.position.set(PIVOT_START_X + 0.15, 0.61, PIVOT_Z + 0.18);
scene.add(screw2);

// --- Lever & Tapping Knob ---
const leverGroup = new THREE.Group();
leverGroup.position.set(CLAMP_FRONT_X, 0.58, PIVOT_Z);

// FIX 1: Set initial visual state to OFF (Open) position
// OFF_ANGLE is now defined at the top of the file
leverGroup.rotation.z = OFF_ANGLE;

const ARM_LENGTH = CONTACT_X - CLAMP_FRONT_X;
const STRIP_HEIGHT = 0.04;
const stripArm = new THREE.Mesh(new THREE.BoxGeometry(ARM_LENGTH, STRIP_HEIGHT, 0.28), stripMaterial);
stripArm.position.set(ARM_LENGTH / 2, 0, 0);
stripArm.castShadow = true;
leverGroup.add(stripArm);

const upperContact = cylinder(0.18, 0.02, brass);
upperContact.position.set(ARM_LENGTH, -0.02, 0);
leverGroup.add(upperContact);

const knobGroup = new THREE.Group();
const brassStem = cylinder(0.16, 0.10, brass);
brassStem.position.y = 0.05;
knobGroup.add(brassStem);
const washer = cylinder(0.42, 0.06, blackRubber);
washer.position.y = 0.13;
knobGroup.add(washer);
const knobBody = cylinder(0.46, 0.48, blackRubber);
knobBody.position.y = 0.40;
knobGroup.add(knobBody);
const knobTop = cylinder(0.42, 0.05, blackRubber);
knobTop.position.y = 0.665;
knobGroup.add(knobTop);

for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const groove = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.40, 0.012), darkMetal);
    groove.position.set(Math.cos(a) * 0.445, 0.40, Math.sin(a) * 0.41);
    groove.rotation.y = -a;
    knobGroup.add(groove);
}
knobGroup.position.set(ARM_LENGTH, STRIP_HEIGHT / 2, 0);
leverGroup.add(knobGroup);
scene.add(leverGroup);

// ============================================
// TERMINAL INTEGRATION
// ============================================

// Create a group to hold terminal markers
const terminalGroup = new THREE.Group();
terminalGroup.userData.isTerminalGroup = true;

// Create terminals for each binding post
bindingPostGroups.forEach((postInfo) => {
    const { x, z, terminalId, terminalColor, terminalY } = postInfo;
    
    // Create a group for this terminal at the top of the binding post
    const termGroup = new THREE.Group();
    termGroup.position.set(x, terminalY, z);
    
    // Create a visual marker for the terminal (small colored sphere)
    const markerGeo = new THREE.SphereGeometry(0.055, 12, 12);
    const markerMat = new THREE.MeshBasicMaterial({ 
        color: terminalColor, 
        transparent: true, 
        opacity: 0.3 
    });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    termGroup.add(marker);
    
    // Add a ring around it for better visibility
    const ringGeo = new THREE.TorusGeometry(0.06, 0.008, 8, 16);
    const ringMat = new THREE.MeshBasicMaterial({ 
        color: terminalColor, 
        transparent: true, 
        opacity: 0.4 
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    termGroup.add(ring);
    
    // Add the terminal using terminal-utils
    const terminal = addTerminal(
        termGroup,
        terminalId,
        new THREE.Vector3(0, 0, 0)
    );
    
    // Mark as terminal for click detection
    terminal.userData.isTerminalHit = true;
    terminal.userData.isTerminal = true;
    terminal.userData.terminalId = terminalId;
    terminal.userData.apparatusId = 'tapping-switch';
    
    // Store the terminal group reference
    termGroup.userData.terminalId = terminalId;
    termGroup.userData.isTerminal = true;
    termGroup.userData.apparatusId = 'tapping-switch';
    
    // Add to terminal group
    terminalGroup.add(termGroup);
    
    // Also tag the binding post meshes for click detection
    postInfo.group.children.forEach((child) => {
        if (child.isMesh) {
            child.userData.isTerminalHit = true;
            child.userData.isTerminal = true;
            child.userData.terminalId = terminalId;
            child.userData.apparatusId = 'tapping-switch';
        }
    });
});

// Add the terminal group to the scene
scene.add(terminalGroup);

// --- Logic & Controls ---
// OFF_ANGLE and ON_ANGLE are now defined at the top
let targetAngle = OFF_ANGLE;
let isKeyON = false;
let isLocked = false;
let isDraggingKey = false;

const statusDot = document.getElementById('tapping-switch-status-dot');
const statusText = document.getElementById('tapping-switch-status-text');
const toggleBtn = document.getElementById('tapping-switch-toggle-btn');
const pressBtn = document.getElementById('tapping-switch-press-btn');

function setKeyState(active) {
    isKeyON = active;
    targetAngle = active ? ON_ANGLE : OFF_ANGLE;
    
    // FIX 2: Immediately update rotation state for imported 3D scene instances
    leverGroup.rotation.z = targetAngle;

    if (statusDot) {
        if (active) statusDot.classList.add('active');
        else statusDot.classList.remove('active');
    }
    if (statusText) {
        statusText.innerText = active ? 'ON (CLOSED)' : 'OFF (OPEN)';
        statusText.style.color = active ? '#28a745' : '#333';
    }
    setSwitchClosed(active);
}

if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        isLocked = !isLocked;
        setKeyState(isLocked);
    });
}

if (pressBtn) {
    pressBtn.addEventListener('mousedown', () => setKeyState(true));
    pressBtn.addEventListener('mouseup', () => { if (!isLocked) setKeyState(false); });
    pressBtn.addEventListener('touchstart', (e) => { e.preventDefault(); setKeyState(true); });
    pressBtn.addEventListener('touchend', () => { if (!isLocked) setKeyState(false); });
}

// --- Raycaster & Direct Screen Drag Handler ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function updateMouseNDC(e) {
    const rect = apparatusHost.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
}

window.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#tapping-switch-control-panel')) return;
    updateMouseNDC(e);
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects([leverGroup], true);
    if (intersects.length > 0) {
        isDraggingKey = true;
        controls.enabled = false;
        setKeyState(true); // Depress switch on press
    }
});

window.addEventListener('pointermove', (e) => {
    updateMouseNDC(e);
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects([leverGroup], true);
    document.body.style.cursor = (intersects.length > 0 || isDraggingKey) ? 'pointer' : 'default';
});

const endDrag = () => {
    if (isDraggingKey) {
        isDraggingKey = false;
        controls.enabled = true;
        if (!isLocked) setKeyState(false); // Release switch when touch/drag ends
    }
};

window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

// --- Resize handler ---
const resizeTappingSwitch = () => {
    const { width, height } = apparatusHost.getBoundingClientRect();
    if (width < 2 || height < 2) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
};
new ResizeObserver(resizeTappingSwitch).observe(apparatusHost);
window.addEventListener('apparatus:resize', resizeTappingSwitch);

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    
    // FIX 3: Always update lever animation regardless of active viewport tab
    leverGroup.rotation.z += (targetAngle - leverGroup.rotation.z) * 0.25;

    if (!apparatusHost.classList.contains('is-active')) return;
    controls.update();
    renderer.render(scene, camera);
}

setKeyState(false);
animate();

// ============================================
// FIXED: getModel() with safe array copying
// ============================================
export const getModel = () => {
    const pivot = new THREE.Group();

    // IMPORTANT:
    // Copy the children first.
    // pivot.add(child) removes the child from scene.children,
    // so we must NOT iterate over scene.children directly.
    const children = [...scene.children];

    children.forEach(child => {
        if (!child.isMesh && !child.isGroup) return;
        if (child.isGridHelper) return;

        // Skip the unwanted plane if present
        if (
            child.geometry?.type === 'PlaneGeometry' &&
            child.geometry.parameters?.width === 30
        ) {
            return;
        }

        pivot.add(child);
    });

    return pivot;
};
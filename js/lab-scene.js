import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getModel as getResistanceBox } from './resistance-box.js';
import { getModel as getHMS } from './hms-apparatus.js';
import { getModel as getGalvanometer } from './ballistic-galvanometer.js';
import { getModel as getTappingSwitch } from './tapping-switch.js';
import { getModel as getCommutator, togglePolarity as toggleCommutatorPolarity, updatePolarityAnimation, setPolarityAngle, snapPolarity } from './reversing_key_commutator.js';
import { createWoodTexture, createTileTexture, createVentGrille } from './lab-scene-assets.js';
import { updateAllWires, createWire, removeWire } from './terminal-utils.js';
import { ballisticExperiment, setElectricalConnections, updateBallisticPhysics } from './physics.js';

let scene, camera, renderer, controls, simulationViewport;
let labTable, surfaceGrid, commutator;

// ============================================================
// MONITOR T — DEDICATED OPTICAL OBSERVATION
// ============================================================

let monitorRenderTarget;
let monitorCamera;

let monitorObservationScene;
let monitorObservationCamera;

let monitorScaleMesh;
let monitorSpotMesh;

let monitorScaleCanvas;
let monitorScaleTexture;
let observationMonitorCanvas;
let observationMonitorContext;
let observationMonitorTexture;

function updateObservationMonitor(state = ballisticExperiment) {
    if (!observationMonitorContext || !observationMonitorTexture) return;
    const ctx = observationMonitorContext;
    const c = state.calibration;

    // Fill monitor background with solid white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1024, 680);

    // Set global text color to red
    ctx.fillStyle = '#020005';

    // Title
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BALLISTIC GALVANOMETER', 512, 75);

    // Status / Circuit info
    ctx.font = '24px sans-serif';
    ctx.fillText(`Circuit: ${state.circuitClosed ? 'CLOSED / ARMED' : 'OPEN'}    Observations: ${state.observation.trials.length}`, 512, 135);

    // Labels
    ctx.textAlign = 'left';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('Latest charge', 95, 225);
    ctx.fillText('First throw θ₁', 95, 325);
    ctx.fillText('Later throw θ₃', 95, 425);
    ctx.fillText('Ballistic constant', 95, 525);

    // Values
    ctx.font = '30px monospace';
    ctx.fillText(`${Number.isFinite(state.observation.charge) ? state.observation.charge.toExponential(3) : '—'} C`, 560, 225);
    ctx.fillText(`${Number.isFinite(state.galvanometer.firstThrowSpotCm) ? state.galvanometer.firstThrowSpotCm.toFixed(3) : '—'} cm`, 560, 325);
    ctx.fillText(`${Number.isFinite(state.galvanometer.thirdThrowSpotCm) ? state.galvanometer.thirdThrowSpotCm.toFixed(3) : '—'} cm`, 560, 425);
    ctx.fillText(c.ballisticConstant === null ? 'Awaiting two resistance settings' : `${c.ballisticConstant.toExponential(3)} C/cm`, 560, 525);

    // Validation message
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(state.validationMessage, 512, 620);

    // Trigger texture refresh
    observationMonitorTexture.needsUpdate = true;
}

window.addEventListener('ballistic:statechange', event => updateObservationMonitor(event.detail));

// Table Dimensions
const TABLE_WIDTH = 6.5;
const TABLE_DEPTH = 3.2;
const TABLE_HEIGHT = 1.5;
const TABLETOP_SURFACE_Y = TABLE_HEIGHT;

// Light switch state
let wallLightSwitchMesh = null;
let lightsOnState = true;
window.labLightsOn = true;
let roomLights = [];

// Global selected apparatus
let currentlySelectedApparatus = null;

// Terminal selection state for manual wiring
let selectedStartAnchor = null;
let isTerminalSelectionMode = false;

// Active Wires Collection
const activeWires = [];

function terminalLabel(terminal) {
    const apparatus = terminal?.userData?.apparatusId?.replaceAll('-', ' ') || 'apparatus';
    const id = terminal?.userData?.terminalId || 'terminal';
    return `${apparatus}: ${id}`;
}

function showLabNotification(message, type = 'info') {
    const output = document.getElementById('apparatus-runtime-error');
    if (!output) return;
    output.textContent = message;
    output.dataset.type = type;
    output.hidden = false;
    window.clearTimeout(showLabNotification.timeout);
    showLabNotification.timeout = window.setTimeout(() => { output.hidden = true; }, 6500);
}

function validateManualConnection(from, to) {
    const fromId = fullTerminalId(from);
    const toId = fullTerminalId(to);
    if (!fromId || !toId) return { valid: false, reason: 'A terminal could not be identified. Select the coloured binding-post terminals.', solution: 'Click a highlighted terminal on each apparatus.' };
    if (from.userData.apparatusId === to.userData.apparatusId) {
        return { valid: false, reason: 'Both ends are on the same apparatus, so this bypasses the rest of the experiment.', solution: 'Connect each terminal to the next apparatus in the circuit route.' };
    }
    const terminalConnectionLimit = terminal => terminal.userData?.apparatusId === 'tapping-switch' ? 2 : 1;
    const terminalAtLimit = [from, to].some(terminal => {
        const connections = activeWires.filter(wire => {
            const start = wire.userData?.fromTerminal?.object;
            const end = wire.userData?.toTerminal?.object;
            return start === terminal || end === terminal;
        }).length;
        return connections >= terminalConnectionLimit(terminal);
    });
    if (terminalAtLimit) {
        return { valid: false, reason: 'This terminal already has all of its permitted connections.', solution: 'The two tapping-switch terminals can each form a junction for two wires; all other terminals take one wire.' };
    }
    const apparatusPair = [from.userData.apparatusId, to.userData.apparatusId].sort().join('|');
    const duplicatePair = activeWires.some(wire => {
        const start = wire.userData?.fromTerminal?.object?.userData?.apparatusId;
        const end = wire.userData?.toTerminal?.object?.userData?.apparatusId;
        return start && end && [start, end].sort().join('|') === apparatusPair;
    });
    if (duplicatePair && apparatusPair !== 'commutator|tapping-switch') {
        return { valid: false, reason: 'Both terminals would be connected only between the same two apparatus.', solution: 'Use the remaining terminal to continue to the next apparatus in the circuit.' };
    }
    return { valid: true };
}

// Lab Controls fullscreen state
let labControlsOriginalParent = null;
let labControlsOriginalNextSibling = null;

function fullTerminalId(terminal) {
    const apparatusId = terminal?.userData?.apparatusId;
    const terminalId = terminal?.userData?.terminalId;
    return apparatusId && terminalId ? `${apparatusId}_${terminalId}` : null;
}

function syncElectricalConnections() {
    const connections = activeWires.map((wire) => {
        const from = wire.userData?.fromTerminal?.object || wire.userData?.startAnchor;
        const to = wire.userData?.toTerminal?.object || wire.userData?.endAnchor;
        // Auto Connect has a known, fixed laboratory topology.  Keep its
        // electrical IDs on the wire instead of depending on nested Three.js
        // marker groups, whose parent can be the last object found by traverse.
        const fromId = wire.userData.autoElectricalFromId || fullTerminalId(from);
        const toId = wire.userData.autoElectricalToId || fullTerminalId(to);
        const valid = Boolean(fromId && toId && from !== to);
        wire.userData.visualConnected = true;
        wire.userData.electricalConnected = valid;
        return valid ? { from: fromId, to: toId, resistance: 0 } : null;
    }).filter(Boolean);
    setElectricalConnections(connections);
}

function addCircuitWire(fromTerm, toTerm, color, autoElectricalFromId = null, autoElectricalToId = null) {
    if (!fromTerm?.userData?.isTerminal || !toTerm?.userData?.isTerminal || fromTerm === toTerm) return null;
    const wire = createWire(fromTerm, toTerm, color);
    if (!wire) return null;
    wire.userData.fromTerminal = { object: fromTerm };
    wire.userData.toTerminal = { object: toTerm };
    wire.userData.autoElectricalFromId = autoElectricalFromId;
    wire.userData.autoElectricalToId = autoElectricalToId;
    wire.userData.visualConnected = true;
    scene.add(wire);
    activeWires.push(wire);
    syncElectricalConnections();
    return wire;
}
const placedApparatus = [];
const instantiatedApparatus = new Set();
const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TABLETOP_SURFACE_Y);

const APPARATUS_TARGET_SIZES = {
    'resistance-box': { type: 'max', size: 1.0 },
    'hms': { type: 'max', size: 1.2 },
    'ballistic-galvanometer': { type: 'height', size: 1.2 },
    'tapping-switch': { type: 'max', size: 0.6 },
    'commutator': { type: 'max', size: 0.75 }
};

function init() {
    simulationViewport = document.getElementById('threeViewport');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f4f8);

    camera = new THREE.PerspectiveCamera(45, simulationViewport.clientWidth / simulationViewport.clientHeight, 0.1, 100);
    camera.position.set(0, TABLE_HEIGHT + 0.75, 4.8);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(simulationViewport.clientWidth, simulationViewport.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.domElement.className = 'lab-canvas';
    simulationViewport.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, TABLE_HEIGHT + 0.3, 0);
    
    // No inertial damping in the laboratory: the camera stops exactly on pointer release.
    controls.enableDamping = false;
    controls.dampingFactor = 0;
    controls.minDistance = 1.0;
    controls.maxDistance = 7.8;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minPolarAngle = 0.05;

    // ============================================================
    // MONITOR T INITIALIZATION
    // Dedicated scene containing ONLY:
    //
    //     1. White scale
    //     2. Graduations
    //     3. Moving reflected light spot
    //
    // Absolutely no laboratory geometry is rendered here.
    // ============================================================

    monitorRenderTarget = new THREE.WebGLRenderTarget(
        1024,
        680,
        {
            format: THREE.RGBAFormat,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            depthBuffer: true,
            stencilBuffer: false
        }
    );

    // ------------------------------------------------------------
    // Dedicated monitor scene
    // ------------------------------------------------------------

    monitorObservationScene = new THREE.Scene();

    monitorObservationScene.background =
        new THREE.Color(0xffffff);

    // ------------------------------------------------------------
    // Dedicated orthographic camera
    // ------------------------------------------------------------

    monitorObservationCamera =
        new THREE.OrthographicCamera(
            -6,
            6,
            4,
            -4,
            0.1,
            10
        );

    monitorObservationCamera.position.set(
        0,
        0,
        5
    );

    monitorObservationCamera.lookAt(
        0,
        0,
        0
    );

    // ------------------------------------------------------------
    // SCALE CANVAS
    // ------------------------------------------------------------

    monitorScaleCanvas =
        document.createElement('canvas');

    monitorScaleCanvas.width = 1600;
    monitorScaleCanvas.height = 520;

    const scaleCtx =
        monitorScaleCanvas.getContext('2d');

    scaleCtx.clearRect(
        0,
        0,
        monitorScaleCanvas.width,
        monitorScaleCanvas.height
    );

    // Background
    scaleCtx.fillStyle = '#ffffff';

    scaleCtx.fillRect(
        0,
        0,
        monitorScaleCanvas.width,
        monitorScaleCanvas.height
    );

    // ------------------------------------------------------------
    // PHYSICAL SCALE
    // ------------------------------------------------------------

    const scaleLeft = 100;
    const scaleRight = 1500;

    const scaleY = 270;

    const scaleWidth =
        scaleRight - scaleLeft;

    // Main scale line
    scaleCtx.strokeStyle = '#111827';
    scaleCtx.lineWidth = 4;

    scaleCtx.beginPath();

    scaleCtx.moveTo(
        scaleLeft,
        scaleY
    );

    scaleCtx.lineTo(
        scaleRight,
        scaleY
    );

    scaleCtx.stroke();

    // ------------------------------------------------------------
    // GRADUATIONS
    // ------------------------------------------------------------

    // 100 cm total range:
    // -50 ... +50 cm
    //
    // 1 cm = scaleWidth / 100 pixels

    for (let cm = -50; cm <= 50; cm++) {

        const px =
            scaleLeft +
            ((cm + 50) / 100) * scaleWidth;

        const isMajor10 =
            cm % 10 === 0;

        const isMajor5 =
            cm % 5 === 0;

        let tickHeight;

        if (isMajor10) {
            tickHeight = 90;
        } else if (isMajor5) {
            tickHeight = 60;
        } else {
            tickHeight = 38;
        }

        scaleCtx.lineWidth =
            isMajor10 ? 4 : 2;

        scaleCtx.beginPath();

        scaleCtx.moveTo(
            px,
            scaleY
        );

        scaleCtx.lineTo(
            px,
            scaleY + tickHeight
        );

        scaleCtx.stroke();

        // --------------------------------------------------------
        // NUMBER LABELS
        // --------------------------------------------------------

        if (isMajor10) {

            scaleCtx.fillStyle =
                '#111827';

            scaleCtx.font =
                'bold 34px Arial';

            scaleCtx.textAlign =
                'center';

            // Center = 0
            scaleCtx.fillText(
                String(cm),
                px,
                scaleY + 140
            );
        }
    }

    // ------------------------------------------------------------
    // ZERO MARKER
    // ------------------------------------------------------------

    const zeroPx =
        scaleLeft +
        0.5 * scaleWidth;

    scaleCtx.strokeStyle =
        '#111827';

    scaleCtx.lineWidth = 6;

    scaleCtx.beginPath();

    scaleCtx.moveTo(
        zeroPx,
        scaleY - 25
    );

    scaleCtx.lineTo(
        zeroPx,
        scaleY + 105
    );

    scaleCtx.stroke();

    // cm label
    scaleCtx.font =
        'bold 30px Arial';

    scaleCtx.fillStyle =
        '#111827';

    scaleCtx.textAlign =
        'left';

    scaleCtx.fillText(
        'cm',
        scaleRight - 45,
        scaleY + 140
    );

    // ------------------------------------------------------------
    // BORDER
    // ------------------------------------------------------------

    scaleCtx.strokeStyle =
        '#cbd5e1';

    scaleCtx.lineWidth = 3;

    scaleCtx.strokeRect(
        30,
        40,
        1540,
        430
    );

    // ------------------------------------------------------------
    // Canvas texture
    // ------------------------------------------------------------

    monitorScaleTexture =
        new THREE.CanvasTexture(
            monitorScaleCanvas
        );

    monitorScaleTexture.minFilter =
        THREE.LinearFilter;

    monitorScaleTexture.magFilter =
        THREE.LinearFilter;

    monitorScaleTexture.needsUpdate = true;

    // ------------------------------------------------------------
    // Scale plane
    // ------------------------------------------------------------

    const monitorScaleGeometry =
        new THREE.PlaneGeometry(
            11.2,
            3.65
        );

    const monitorScaleMaterial =
        new THREE.MeshBasicMaterial({
            map: monitorScaleTexture,
            transparent: false,
            depthWrite: false
        });

    monitorScaleMesh =
        new THREE.Mesh(
            monitorScaleGeometry,
            monitorScaleMaterial
        );

    monitorScaleMesh.position.set(
        0,
        0,
        0
    );

    monitorObservationScene.add(
        monitorScaleMesh
    );

    // ============================================================
    // MONITOR T — LARGE OPTICAL REFLECTION SPOT
    // ============================================================
    //
    // Appearance:
    //   - Large warm orange optical halo
    //   - Bright yellow/white center
    //   - Completely self-lit
    //   - Independent of laboratory room lighting
    //   - Always rendered above the scale
    // ============================================================

    const spotGroup = new THREE.Group();

    // ------------------------------------------------------------
    // Outer optical glow / halo
    // ------------------------------------------------------------

    const spotHaloGeometry =
        new THREE.CircleGeometry(
            0.32,
            48
        );

    const spotHaloMaterial =
        new THREE.MeshBasicMaterial({
            color: 0xffc24d,
            transparent: true,
            opacity: 0.58,
            depthTest: false,
            depthWrite: false
        });

    const spotHalo =
        new THREE.Mesh(
            spotHaloGeometry,
            spotHaloMaterial
        );

    spotHalo.position.z = 0.00;

    spotGroup.add(
        spotHalo
    );

    // ------------------------------------------------------------
    // Main orange optical spot
    // ------------------------------------------------------------

    const spotMainGeometry =
        new THREE.CircleGeometry(
            0.22,
            48
        );

    const spotMainMaterial =
        new THREE.MeshBasicMaterial({
            color: 0xffe24a,
            transparent: true,
            opacity: 0.96,
            depthTest: false,
            depthWrite: false
        });

    const spotMain =
        new THREE.Mesh(
            spotMainGeometry,
            spotMainMaterial
        );

    spotMain.position.z = 0.01;

    spotGroup.add(
        spotMain
    );

    // ------------------------------------------------------------
    // Bright yellow-white optical center
    // ------------------------------------------------------------

    const spotCoreGeometry =
        new THREE.CircleGeometry(
            0.13,
            48
        );

    const spotCoreMaterial =
        new THREE.MeshBasicMaterial({
            color: 0xffff5c,
            transparent: true,
            opacity: 1.0,
            depthTest: false,
            depthWrite: false
        });

    const spotCore =
        new THREE.Mesh(
            spotCoreGeometry,
            spotCoreMaterial
        );

    spotCore.position.z = 0.02;

    spotGroup.add(
        spotCore
    );

    // ------------------------------------------------------------
    // Strong white/yellow identification center
    // ------------------------------------------------------------

    const spotCenterGeometry =
        new THREE.CircleGeometry(
            0.055,
            32
        );

    const spotCenterMaterial =
        new THREE.MeshBasicMaterial({
            color: 0xffffcc,
            transparent: true,
            opacity: 1.0,
            depthTest: false,
            depthWrite: false
        });

    const spotCenter =
        new THREE.Mesh(
            spotCenterGeometry,
            spotCenterMaterial
        );

    spotCenter.position.z = 0.03;

    spotGroup.add(
        spotCenter
    );

    // ------------------------------------------------------------
    // Register as Monitor T spot
    // ------------------------------------------------------------

    monitorSpotMesh = spotGroup;

    monitorSpotMesh.position.set(
        0,
        0.05,
        0.05
    );

    monitorSpotMesh.visible = false;

    monitorObservationScene.add(
        monitorSpotMesh
    );

    // Lighting Setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);
    roomLights.push(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.2);
    hemiLight.position.set(0, 15, 0);
    scene.add(hemiLight);
    roomLights.push(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(5, 12, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);
    roomLights.push(keyLight);

    const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.8);
    fillLight.position.set(-6, 8, -4);
    scene.add(fillLight);
    roomLights.push(fillLight);

    const mainLight = new THREE.PointLight(0xffffff, 1.2, 25);
    mainLight.position.set(0, 8, 0);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.bias = -0.001;
    scene.add(mainLight);
    roomLights.push(mainLight);

    buildRoom();
    createTable();

    setupUI();
    setupDragAndDrop();
    refreshLabControlsVisibility();
    
    // ============================================================
    // FIX: ResizeObserver for viewport element tracking
    // ============================================================
    window.addEventListener('resize', onWindowResize);

    const viewportObserver = new ResizeObserver(() => {
        onWindowResize();
    });

    viewportObserver.observe(simulationViewport);
    
    setupRaycasterForInteractions();
    enableTerminalInspector();
}

// ============================================================
// FIX: Safer onWindowResize() with guard clauses
// ============================================================
function onWindowResize() {
    const width = simulationViewport.clientWidth;
    const height = simulationViewport.clientHeight;

    // Guard against invalid dimensions
    if (!width || !height) return;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height, false);
}

function buildRoom() {
    const floorGeo = new THREE.PlaneGeometry(20, 20);
    const tileTex = createTileTexture();
    const floorMat = new THREE.MeshStandardMaterial({ 
        color: 0xffffff, 
        roughness: 0.1, 
        metalness: 0.1,
        map: tileTex
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.1 });
    const wallGeo = new THREE.PlaneGeometry(20, 10);
    
    const wallBack = new THREE.Mesh(wallGeo, wallMat);
    wallBack.position.set(0, 5, -10);
    wallBack.receiveShadow = true;
    scene.add(wallBack);

    const wallFront = new THREE.Mesh(wallGeo, wallMat);
    wallFront.position.set(0, 5, 10);
    wallFront.rotation.y = Math.PI;
    wallFront.receiveShadow = true;
    scene.add(wallFront);

    const wallLeft = new THREE.Mesh(wallGeo, wallMat);
    wallLeft.position.set(-10, 5, 0);
    wallLeft.rotation.y = Math.PI / 2;
    wallLeft.receiveShadow = true;
    scene.add(wallLeft);

    const wallRight = new THREE.Mesh(wallGeo, wallMat);
    wallRight.position.set(10, 5, 0);
    wallRight.rotation.y = -Math.PI / 2;
    wallRight.receiveShadow = true;
    scene.add(wallRight);

    const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const ceilingGeo = new THREE.PlaneGeometry(20, 20);
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.position.set(0, 10, 0);
    ceiling.rotation.x = Math.PI / 2; 
    scene.add(ceiling);

    // Light Switch
    const switchGroup = new THREE.Group();
    const plateGeo = new THREE.BoxGeometry(0.5, 0.8, 0.05);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3, metalness: 0.2 });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    switchGroup.add(plate);

    const toggleGeo = new THREE.BoxGeometry(0.12, 0.28, 0.08);
    const toggleMat = new THREE.MeshStandardMaterial({ 
        color: 0x0284c7, 
        emissive: 0x0284c7,
        emissiveIntensity: 0.2,
        roughness: 0.2, 
        metalness: 0.5 
    });
    wallLightSwitchMesh = new THREE.Mesh(toggleGeo, toggleMat);
    wallLightSwitchMesh.position.set(0, 0, 0.04);
    wallLightSwitchMesh.userData = { isLightSwitch: true, clickable: true };
    switchGroup.add(wallLightSwitchMesh);

    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 128;
    labelCanvas.height = 64;
    const labelCtx = labelCanvas.getContext('2d');
    labelCtx.fillStyle = 'rgba(0,0,0,0)';
    labelCtx.fillRect(0, 0, 128, 64);
    labelCtx.fillStyle = '#ffffff';
    labelCtx.font = 'bold 20px sans-serif';
    labelCtx.textAlign = 'center';
    labelCtx.fillText('LIGHTS', 64, 42);
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true });
    const label = new THREE.Sprite(labelMat);
    label.position.set(0, 0.7, 0.04);
    label.scale.set(0.6, 0.3, 1);
    switchGroup.add(label);

    switchGroup.position.set(-9.95, 4.2, -1.5);
    switchGroup.rotation.y = Math.PI / 2;
    scene.add(switchGroup);

    // Live Monitors
    const monitorFrameGeo = new THREE.BoxGeometry(6.45, 4.35, 0.12);
    const monitorFrameMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.85, roughness: 0.2 });
    const screenGeo = new THREE.PlaneGeometry(6.15, 4.05);
    const mountGeo = new THREE.BoxGeometry(1.2, 1.2, 0.2);

    const obsMonitorGroup = new THREE.Group();
    const obsFrame = new THREE.Mesh(monitorFrameGeo, monitorFrameMat);
    obsMonitorGroup.add(obsFrame);

    // ============================================================
    // OBSERVATION MONITOR - FIXED: No tone mapping, sRGB color space
    // ============================================================
    
    observationMonitorCanvas = document.createElement('canvas');
    observationMonitorCanvas.width = 1024;
    observationMonitorCanvas.height = 680;
    observationMonitorContext = observationMonitorCanvas.getContext('2d');

    // 1. Set sRGB color space on the CanvasTexture
    observationMonitorTexture = new THREE.CanvasTexture(observationMonitorCanvas);
    observationMonitorTexture.colorSpace = THREE.SRGBColorSpace;

    updateObservationMonitor();

    // 2. Disable tone mapping on the screen material
    const obsScreenMat = new THREE.MeshBasicMaterial({
        map: observationMonitorTexture,
        toneMapped: false
    });
    
    const obsScreen = new THREE.Mesh(screenGeo, obsScreenMat);
    obsScreen.position.z = 0.065;
    obsMonitorGroup.add(obsScreen);

    const obsMount = new THREE.Mesh(mountGeo, monitorFrameMat);
    obsMount.position.z = -0.1;
    obsMonitorGroup.add(obsMount);

    obsMonitorGroup.position.set(-4.2, 5.8, -9.88);
    scene.add(obsMonitorGroup);

    // ============================================================
    // MONITOR T SCREEN
    // ============================================================

    const liveMonitorGroup = new THREE.Group();

    const liveFrame =
        new THREE.Mesh(
            monitorFrameGeo,
            monitorFrameMat
        );

    liveMonitorGroup.add(
        liveFrame
    );

    // ------------------------------------------------------------
    // MONITOR T SCREEN
    // ------------------------------------------------------------

    const liveScreenMat =
        new THREE.MeshBasicMaterial({
            map: monitorRenderTarget.texture,
            toneMapped: false
        });

    const liveScreen =
        new THREE.Mesh(
            screenGeo,
            liveScreenMat
        );

    liveScreen.position.z =
        0.065;

    liveMonitorGroup.add(
        liveScreen
    );

    // ------------------------------------------------------------
    // MONITOR MOUNT
    // ------------------------------------------------------------

    const liveMount =
        new THREE.Mesh(
            mountGeo,
            monitorFrameMat
        );

    liveMount.position.z =
        -0.1;

    liveMonitorGroup.add(
        liveMount
    );

    // Existing position
    liveMonitorGroup.position.set(
        4.2,
        5.8,
        -9.88
    );

    scene.add(
        liveMonitorGroup
    );

    // Ventilation outlets
    const ventY = 9.25;
    const ventOffsets = [-5.5, 0, 5.5];

    ventOffsets.forEach(x => {
        const vent = createVentGrille();
        vent.position.set(x, ventY, -9.94);
        scene.add(vent);
    });

    ventOffsets.forEach(x => {
        const vent = createVentGrille();
        vent.position.set(x, ventY, 9.94);
        vent.rotation.y = Math.PI;
        scene.add(vent);
    });

    ventOffsets.forEach(z => {
        const vent = createVentGrille();
        vent.position.set(-9.94, ventY, z);
        vent.rotation.y = Math.PI / 2;
        scene.add(vent);
    });

    ventOffsets.forEach(z => {
        const vent = createVentGrille();
        vent.position.set(9.94, ventY, z);
        vent.rotation.y = -Math.PI / 2;
        scene.add(vent);
    });

    // Doors
    const doorGroup = new THREE.Group();
    const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0xB8C0C6, metalness: 0.95, roughness: 0.22 });
    
    const sideFrameGeo = new THREE.BoxGeometry(0.4, 5.8, 0.4);
    const leftFrame = new THREE.Mesh(sideFrameGeo, doorFrameMat);
    leftFrame.position.set(-2.8, 2.9, 0);
    doorGroup.add(leftFrame);

    const rightFrame = new THREE.Mesh(sideFrameGeo, doorFrameMat);
    rightFrame.position.set(2.8, 2.9, 0);
    doorGroup.add(rightFrame);

    const topFrameGeo = new THREE.BoxGeometry(6.0, 0.4, 0.4);
    const topFrame = new THREE.Mesh(topFrameGeo, doorFrameMat);
    topFrame.position.set(0, 5.9, 0);
    doorGroup.add(topFrame);

    const glassMat = new THREE.MeshStandardMaterial({ 
        color: 0xe2e8f0, 
        roughness: 0.05, 
        metalness: 0.2, 
        transparent: true, 
        opacity: 0.3,
        side: THREE.DoubleSide
    });

    const doorPaneGeo = new THREE.BoxGeometry(2.55, 5.5, 0.08);
    const leftDoor = new THREE.Mesh(doorPaneGeo, glassMat);
    leftDoor.position.set(-1.325, 2.85, 0);
    doorGroup.add(leftDoor);

    const rightDoor = new THREE.Mesh(doorPaneGeo, glassMat);
    rightDoor.position.set(1.325, 2.85, 0);
    doorGroup.add(rightDoor);

    const handleMat = new THREE.MeshStandardMaterial({ color: 0xB8C0C6, metalness: 0.95, roughness: 0.22 });
    const handleGeo = new THREE.BoxGeometry(0.12, 0.25, 0.12);
    
    const leftHandle = new THREE.Mesh(handleGeo, handleMat);
    leftHandle.position.set(-0.08, 2.85, 0.06);
    doorGroup.add(leftHandle);

    const rightHandle = new THREE.Mesh(handleGeo, handleMat);
    rightHandle.position.set(0.08, 2.85, 0.06);
    doorGroup.add(rightHandle);

    doorGroup.position.set(0, 0, 9.85);
    doorGroup.rotation.y = Math.PI;
    scene.add(doorGroup);
}

function createTable() {
    labTable = new THREE.Group();
    
    const woodMap = createWoodTexture();
    const woodTopMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.0, map: woodMap });
    const woodLegMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.0, map: woodMap });

    const topGeo = new THREE.BoxGeometry(TABLE_WIDTH, 0.12, TABLE_DEPTH);
    const top = new THREE.Mesh(topGeo, woodTopMaterial);
    top.position.y = TABLE_HEIGHT - 0.06;
    top.receiveShadow = true;
    top.castShadow = true;
    labTable.add(top);

    const legGeo = new THREE.BoxGeometry(0.15, TABLE_HEIGHT - 0.12, 0.15);
    const legX = TABLE_WIDTH / 2 - 0.2;
    const legZ = TABLE_DEPTH / 2 - 0.2;

    const positions = [[-legX, -legZ], [legX, -legZ], [-legX, legZ], [legX, legZ]];

    positions.forEach(([x, z]) => {
        const leg = new THREE.Mesh(legGeo, woodLegMaterial);
        leg.position.set(x, (TABLE_HEIGHT - 0.12) / 2, z);
        leg.castShadow = true;
        labTable.add(leg);
    });

    scene.add(labTable);
}

const REQUIRED_LAB_APPARATUS = [
    'resistance-box',
    'hms',
    'ballistic-galvanometer',
    'tapping-switch',
    'commutator'
];

function areAllLabApparatusPresent() {
    return REQUIRED_LAB_APPARATUS.every(id =>
        placedApparatus.some(
            model => model.userData?.apparatusId === id
        )
    );
}

function getApparatusPanelId(apparatusId) {
    const panelMap = {
        'resistance-box': 'resistance-ui',
        'hms': 'hms-hud',
        'ballistic-galvanometer': 'ballistic-galvanometer-ui-panel',
        'tapping-switch': 'tapping-switch-control-panel',
        'commutator': 'commutator-control-panel'
    };

    return panelMap[apparatusId] || null;
}

function isLaboratoryMode() {
    const simulationWindow =
        document.getElementById('simulationWindow');

    return Boolean(
        simulationWindow &&
        !simulationWindow.classList.contains(
            'external-apparatus-mode'
        )
    );
}

function hideLabControls() {
    const labControls = document.getElementById('lab-controls');
    if (labControls) {
        labControls.hidden = true;
        labControls.style.setProperty('display', 'none', 'important');
    }
}

function hideAllApparatusControls() {
    document.querySelectorAll('.apparatus-panel').forEach(panel => {
        panel.style.setProperty('display', 'none', 'important');
        panel.dataset.apparatusOpen = 'false';
    });
}

function showLabControls() {
    const labControls = document.getElementById('lab-controls');
    if (!labControls) return;

    // ONLY show Lab Controls if:
    // 1. We are in laboratory mode
    // 2. ALL required apparatuses are dragged onto the table
    // 3. NO individual apparatus is currently selected
    if (isLaboratoryMode() && areAllLabApparatusPresent() && !currentlySelectedApparatus) {
        labControls.hidden = false;
        labControls.style.setProperty('display', 'flex', 'important');
    } else {
        labControls.hidden = true;
        labControls.style.setProperty('display', 'none', 'important');
    }
}

function showControlsOnRightSide(apparatusId) {
    currentlySelectedApparatus = apparatusId;
    hideAllApparatusControls();

    const targetPanelId = getApparatusPanelId(apparatusId);
    const panel = targetPanelId ? document.getElementById(targetPanelId) : null;

    if (panel) {
        // Hide lab controls while an individual apparatus control is active
        hideLabControls();
        panel.style.setProperty('display', 'flex', 'important');
        panel.dataset.apparatusOpen = 'true';
    } else {
        refreshLabControlsVisibility();
    }
}

function closeCurrentApparatusControls() {
    currentlySelectedApparatus = null;
    hideAllApparatusControls();
    refreshLabControlsVisibility();
}

function refreshLabControlsVisibility() {
    if (!isLaboratoryMode()) {
        hideLabControls();
        hideAllApparatusControls();
        return;
    }

    if (currentlySelectedApparatus) {
        showControlsOnRightSide(currentlySelectedApparatus);
    } else {
        hideAllApparatusControls();
        showLabControls();
    }
}

function moveLabControlsIntoFullscreen() {

    const labControls =
        document.getElementById('lab-controls');

    const host =
        document.getElementById(
            'lab-controls-fullscreen-host'
        );

    if (!labControls || !host) return;

    if (!labControlsOriginalParent) {

        labControlsOriginalParent =
            labControls.parentElement;

        labControlsOriginalNextSibling =
            labControls.nextSibling;
    }

    host.appendChild(labControls);

    labControls.classList.add(
        'is-fullscreen-lab-controls'
    );

    updateFullscreenLabControlsButton(true);
}

function moveLabControlsBackToSidebar() {

    const labControls =
        document.getElementById('lab-controls');

    if (
        !labControls ||
        !labControlsOriginalParent
    ) {
        return;
    }

    if (labControlsOriginalNextSibling &&
        labControlsOriginalNextSibling.parentNode ===
            labControlsOriginalParent) {

        labControlsOriginalParent.insertBefore(
            labControls,
            labControlsOriginalNextSibling
        );

    } else {

        labControlsOriginalParent.appendChild(
            labControls
        );
    }

    labControls.classList.remove(
        'is-fullscreen-lab-controls'
    );

    updateFullscreenLabControlsButton(false);
}

function updateFullscreenLabControlsButton(isOpen) {
    const button = document.getElementById('fullscreenLabControlsButton');
    if (!button) return;

    button.classList.toggle('is-open', isOpen);
    button.setAttribute('aria-label', isOpen ? 'Close lab controls' : 'Open lab controls');
    button.setAttribute('title', isOpen ? 'Close Lab Controls' : 'Open Lab Controls');
}

function setupUI() {
    document.querySelectorAll('.apparatus-panel:not(#lab-ui-container)').forEach(panel => {
        panel.style.display = 'none';
        panel.dataset.apparatusOpen = 'false';
    });
    // A refresh always starts at the laboratory, with no stale apparatus panel
    // left open from a previous selection.
    hideLabControls();

    const uiLightSwitchBtn = document.getElementById('light-toggle-btn');
    if (uiLightSwitchBtn) {
        uiLightSwitchBtn.addEventListener('click', toggleRoomLights);
    }

    const globalFullscreenBtn = document.getElementById('fullscreenButton');
    const enterWebsiteFullscreen = () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => console.log(err));
            } else {
                document.exitFullscreen();
            }
    };
    document.querySelectorAll('.section-fullscreen-button').forEach(button => {
        if (button !== globalFullscreenBtn) button.addEventListener('click', enterWebsiteFullscreen);
    });
    if (globalFullscreenBtn) globalFullscreenBtn.addEventListener('click', enterWebsiteFullscreen);

    const viewportFullscreenBtn = document.getElementById('viewportFullscreenButton');
    if (viewportFullscreenBtn) {
        viewportFullscreenBtn.addEventListener('click', () => {
            const simWindow = document.getElementById('simulationWindow');
            if (!document.fullscreenElement) {
                simWindow.requestFullscreen().catch(err => console.log(err));
            } else {
                document.exitFullscreen();
            }
        });
    }

    const fullscreenLabControlsBtn = document.getElementById('fullscreenLabControlsButton');
    if (fullscreenLabControlsBtn) {
        fullscreenLabControlsBtn.addEventListener('click', () => {
            const labControls = document.getElementById('lab-controls');
            if (!labControls) return;

            if (labControls.classList.contains('is-fullscreen-lab-controls')) {
                moveLabControlsBackToSidebar();
                refreshLabControlsVisibility();
            } else {
                moveLabControlsIntoFullscreen();
            }
        });
    }

    const helpBtn = document.getElementById('helpButton');
    const helpOverlay = document.getElementById('helpOverlay');
    const closeHelpBtn = document.getElementById('closeHelpButton');
    
    if (helpBtn && helpOverlay) {
        const openHelp = () => {
            helpOverlay.hidden = false;
            helpOverlay.setAttribute('aria-hidden', 'false');
        };
        document.querySelectorAll('.section-help-button').forEach(button => {
            if (button !== helpBtn) button.addEventListener('click', openHelp);
        });
        helpBtn.addEventListener('click', openHelp);
    }
    if (closeHelpBtn && helpOverlay) {
        closeHelpBtn.addEventListener('click', () => {
            helpOverlay.hidden = true;
            helpOverlay.setAttribute('aria-hidden', 'true');
        });
    }

    const terminalModeBtn = document.getElementById('terminalModeToggle');
    if (terminalModeBtn) {
        terminalModeBtn.addEventListener('click', () => {
            isTerminalSelectionMode = !isTerminalSelectionMode;
            window.terminalSelectionMode = isTerminalSelectionMode;
            terminalModeBtn.classList.toggle('active', isTerminalSelectionMode);
            
            if (!isTerminalSelectionMode && selectedStartAnchor) {
                if (selectedStartAnchor.userData.highlightMesh) {
                    selectedStartAnchor.userData.highlightMesh.visible = false;
                }
                selectedStartAnchor = null;
            }
        });
    }

    // ============================================================
    // APPARATUS CONTROL CLOSE BUTTONS
    // ============================================================

    document
        .querySelectorAll('.apparatus-close-btn')
        .forEach(button => {

            button.addEventListener('click', (event) => {

                event.preventDefault();
                event.stopPropagation();

                closeCurrentApparatusControls();
            });

        });

    // ============================================================
    // GLOBAL LAB CONTROL BUTTONS
    // ============================================================

    const labResistanceInput =
        document.getElementById('lab-total-resistance');

    const resistanceInput =
        document.getElementById('res-input');

    const labHmsDrop = document.getElementById('lab-hms-drop');
    const labCommutatorToggle = document.getElementById('lab-commutator-toggle');

    const labSwitchToggle =
        document.getElementById('lab-switch-toggle');

    const switchToggle =
        document.getElementById('tapping-switch-toggle-btn');

    const labSwitchPress =
        document.getElementById('lab-switch-press');

    const switchPress =
        document.getElementById('tapping-switch-press-btn');


    // ------------------------------------------------------------
    // Resistance synchronization: Lab -> Apparatus
    // ------------------------------------------------------------

    if (labResistanceInput && resistanceInput) {

        labResistanceInput.addEventListener('change', () => {

            resistanceInput.value =
                labResistanceInput.value;

            resistanceInput.dispatchEvent(
                new Event('change', { bubbles: true })
            );

        });

    }


    if (labHmsDrop) {
        labHmsDrop.textContent = window.hmsControl?.getLeverAction?.() || 'Raise Coil';
        labHmsDrop.addEventListener('click', () => {
            const nextAction = window.hmsControl?.toggleLever?.();
            if (nextAction) labHmsDrop.textContent = nextAction;
        });
    }

    if (labCommutatorToggle) {
        labCommutatorToggle.addEventListener('click', () => {
            toggleCommutatorPolarity(commutator);
        });
    }


    // ------------------------------------------------------------
    // Tapping Switch
    // ------------------------------------------------------------

    if (labSwitchToggle && switchToggle) {

        labSwitchToggle.addEventListener('click', () => {
            switchToggle.click();
        });

    }

    const updateLabSwitchStatus = (closed) => {
        if (!labSwitchToggle) return;
        labSwitchToggle.textContent = closed ? 'Open to Route Through BG' : 'Close to Bypass BG';
        labSwitchToggle.setAttribute('aria-pressed', String(closed));
    };
    updateLabSwitchStatus(false);
    window.addEventListener('tapping-switch:change', event => {
        updateLabSwitchStatus(Boolean(event.detail?.closed));
    });

    if (labSwitchPress && switchPress) {

        // Mouse hold
        labSwitchPress.addEventListener('mousedown', () => {
            switchPress.dispatchEvent(
                new MouseEvent('mousedown', { bubbles: true })
            );
        });

        labSwitchPress.addEventListener('mouseup', () => {
            switchPress.dispatchEvent(
                new MouseEvent('mouseup', { bubbles: true })
            );
        });

        labSwitchPress.addEventListener('mouseleave', () => {
            switchPress.dispatchEvent(
                new MouseEvent('mouseup', { bubbles: true })
            );
        });

        // Touch hold
        labSwitchPress.addEventListener('touchstart', (event) => {

            event.preventDefault();

            switchPress.dispatchEvent(
                new TouchEvent('touchstart', {
                    bubbles: true
                })
            );

        }, { passive: false });

        labSwitchPress.addEventListener('touchend', () => {

            switchPress.dispatchEvent(
                new TouchEvent('touchend', {
                    bubbles: true
                })
            );

        });

    }

    // ============================================================
    // FULLSCREEN LAB CONTROLS
    // ============================================================

    document.addEventListener(
        'fullscreenchange',
        () => {

            const simulationWindow =
                document.getElementById(
                    'simulationWindow'
                );

            const labControls =
                document.getElementById(
                    'lab-controls'
                );

            if (!simulationWindow || !labControls) {
                return;
            }

            const isLabFullscreen =
                document.fullscreenElement ===
                simulationWindow;

            if (isLabFullscreen) {

                updateFullscreenLabControlsButton(false);

            } else {

                moveLabControlsBackToSidebar();
                refreshLabControlsVisibility();
            }
        }
    );

    // ============================================================
    // MUTATION OBSERVER FOR EXTERNAL APPARATUS MODE
    // ============================================================

    const simWindow =
        document.getElementById('simulationWindow');

    if (simWindow) {

        const modeObserver = new MutationObserver(() => {
            refreshLabControlsVisibility();
            refreshApparatusCloseButtons();
        });

        modeObserver.observe(simWindow, {
            attributes: true,
            attributeFilter: ['class']
        });
    }
}

function toggleRoomLights() {
    lightsOnState = !lightsOnState;
    window.labLightsOn = lightsOnState;
    
    // --- UPDATE THIS BLOCK ---
    const uiLightSwitchBtn = document.getElementById('light-toggle-btn');
    if (uiLightSwitchBtn) {
        uiLightSwitchBtn.textContent = `Room Light (${lightsOnState ? 'On' : 'Off'})`;
    }
    // -------------------------

    // 3D Wall Switch Mesh Updates
    if (wallLightSwitchMesh) {
        wallLightSwitchMesh.position.y = lightsOnState ? 0 : -0.06;
        const newColor = lightsOnState ? 0x0284c7 : 0xef4444; 
        wallLightSwitchMesh.material.color.setHex(newColor);
        wallLightSwitchMesh.material.emissive.setHex(newColor);
        wallLightSwitchMesh.material.emissiveIntensity = lightsOnState ? 0.2 : 0.8;
    }
    
    // 3D Scene Light Visibility
    roomLights.forEach(light => {
        if (light) light.visible = lightsOnState;
    });
}
// ============================================================
// NOTE: onWindowResize moved up near init() for clarity
// ============================================================

// =========================================================================
// 3. SIMPLIFIED APPARATUS TERMINAL DISCOVERY (HARD-CODED OFFSETS REMOVED)
// =========================================================================
function getApparatusTerminals(model) {
    const terminals = [];

    model.traverse(child => {
        if (child.userData?.isTerminal) {
            const pos = new THREE.Vector3();
            child.getWorldPosition(pos);

            terminals.push({
                id: `${model.userData.apparatusId}_${child.userData.terminalId || child.name}`,
                pos,
                object: child
            });
        }
    });

    return terminals;
}

function getAllPlacedTerminals() {
    const list = [];
    placedApparatus.forEach(model => {
        const terms = getApparatusTerminals(model);
        list.push(...terms);
    });
    return list;
}

// =========================================================================
// 4. IMPROVED TERMINAL CLICK HANDLING
// =========================================================================
function handleTerminalClick(raycaster) {
    const terminals = getAllPlacedTerminals();

    const terminalObjects = terminals
        .map(t => t.object)
        .filter(Boolean);

    const hits = raycaster.intersectObjects(terminalObjects, true);

    if (!hits.length) return null;

    let terminal = hits[0].object;

    while (terminal && !terminal.userData?.isTerminal) {
        terminal = terminal.parent;
    }

    if (!terminal) return null;

    // Ignore anything that is not an actual terminal.
    if (!terminal.userData.terminalId) return null;

    if (!selectedStartAnchor) {
        selectedStartAnchor = terminal;

        if (terminal.userData.highlightMesh) {
            terminal.userData.highlightMesh.visible = true;
        }

        showLabNotification(`Selected ${terminalLabel(terminal)}. Now select the terminal to connect.`, 'info');
        return {
            status: 'selected_first',
            anchor: terminal
        };
    }

    if (selectedStartAnchor === terminal) {
        if (selectedStartAnchor.userData.highlightMesh) {
            selectedStartAnchor.userData.highlightMesh.visible = false;
        }

        selectedStartAnchor = null;

        showLabNotification('Terminal selection cancelled. Select a terminal to start a connection.', 'info');

        return {
            status: 'deselected'
        };
    }

    const startTerminal = selectedStartAnchor;
    const validation = validateManualConnection(startTerminal, terminal);

    if (startTerminal.userData.highlightMesh) {
        startTerminal.userData.highlightMesh.visible = false;
    }

    selectedStartAnchor = null;

    if (!validation.valid) {
        showLabNotification(`Wrong connection: ${validation.reason} Solution: ${validation.solution}`, 'error');
        return { status: 'rejected', reason: validation.reason, wire: null };
    }

    const wire = addCircuitWire(startTerminal, terminal, 0xcc2222);
    showLabNotification(`Connected ${terminalLabel(startTerminal)} to ${terminalLabel(terminal)}.`, 'success');

    return {
        status: 'connected',
        wire
    };
}

// =========================================================================
// 5. WIRE DYNAMIC ENDPOINT REGENERATION FOR MOVING APPARATUSES
// =========================================================================
function updateConnectedWires() {
    activeWires.forEach(wire => {
        if (!wire.userData?.fromTerminal?.object || !wire.userData?.toTerminal?.object) return;

        const from = wire.userData.fromTerminal;
        const to = wire.userData.toTerminal;

        const p1 = from.object.getWorldPosition(new THREE.Vector3());
        const p2 = to.object.getWorldPosition(new THREE.Vector3());

        // Dynamic geometry update via terminal-utils helper
    });

    updateAllWires();
}

// ============================================================
// MONITOR T — LIVE BALLISTIC GALVANOMETER OBSERVATION
// ============================================================

function updateBallisticGalvanometerMonitor() {

    if (
        !monitorRenderTarget ||
        !monitorObservationScene ||
        !monitorObservationCamera ||
        !monitorSpotMesh
    ) {
        return;
    }

    const observation =
        window.ballisticGalvanometerObservation;

    // No galvanometer / no optical hit.
    if (!observation) {

        monitorSpotMesh.visible = false;

    } else {

        monitorSpotMesh.visible =
            observation.visible === true;

        if (observation.visible) {

            // ------------------------------------------------
            // Convert physical scale coordinate
            //
            // observation.normalized:
            // 0 = -50 cm
            // 0.5 = 0 cm
            // 1 = +50 cm
            // ------------------------------------------------

            const x =
                -5.6 +
                observation.normalized * 11.2;

            monitorSpotMesh.position.x =
                x;

            // Keep spot positioned exactly on scale line.
            monitorSpotMesh.position.y =
                0.05;

            // Small optical glow effect
            const pulse =
                0.95 +
                Math.sin(
                    performance.now() * 0.012
                ) * 0.05;

            monitorSpotMesh.scale.setScalar(
                pulse
            );
        }
    }

    // --------------------------------------------------------
    // Render ONLY the observation scene.
    // --------------------------------------------------------

    renderer.setRenderTarget(
        monitorRenderTarget
    );

    renderer.clearColor();

    renderer.clear(
        true,
        true,
        true
    );

    renderer.render(
        monitorObservationScene,
        monitorObservationCamera
    );

    renderer.setRenderTarget(
        null
    );
}

function animate() {

    requestAnimationFrame(
        animate
    );

    // --------------------------------------------------------
    // Main laboratory controls
    // --------------------------------------------------------

    controls.update();

    // --------------------------------------------------------
    // Recalculate wire geometry
    // --------------------------------------------------------

    updateConnectedWires();

    // --------------------------------------------------------
    // Update dedicated Monitor T
    // --------------------------------------------------------

    updateBallisticGalvanometerMonitor();
    updateBallisticPhysics(performance.now() / 1000);
    updatePolarityAnimation(commutator, performance.now());

    // --------------------------------------------------------
    // Render main laboratory
    // --------------------------------------------------------

    if (
        !document.hidden &&
        !document
            .getElementById('simulationWindow')
            .classList
            .contains('external-apparatus-mode')
    ) {

        renderer.render(
            scene,
            camera
        );
    }
}

// =========================================================================
// FIXED: positionApparatusOnTable() with cached scale
// =========================================================================
function positionApparatusOnTable(model, id, point) {
    // 1. Calculate scale only ONCE upon initial creation
    if (!model.userData.initialScale) {
        model.position.set(0, 0, 0);
        model.scale.set(1, 1, 1);
        model.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);

        const config = APPARATUS_TARGET_SIZES[id] || { type: 'max', size: 1.0 };
        let scale = 1.0;
        if (config.type === 'height' && size.y > 0) {
            scale = config.size / size.y;
        } else {
            const maxDim = Math.max(size.x, size.z);
            if (maxDim > 0) {
                scale = config.size / maxDim;
            }
        }

        model.scale.set(scale, scale, scale);
        model.updateMatrixWorld(true);

        const scaledBox = new THREE.Box3().setFromObject(model);

        // Lock in scale and local offset baseline
        model.userData.initialScale = scale;
        model.userData.localMinY = scaledBox.min.y;
    } else {
        // Reuse stored scale so attached wires never alter model scale
        model.scale.setScalar(model.userData.initialScale);
    }

    // 2. Position model cleanly on table surface
    const targetY = TABLETOP_SURFACE_Y - model.userData.localMinY;
    model.position.set(point.x, targetY, point.z);
    model.updateMatrixWorld(true);

    // 3. Update wire positions
    updateConnectedWires();
}

function clearAllWires() {
    activeWires.forEach(w => removeWire(w));
    activeWires.length = 0;
    if (selectedStartAnchor?.userData?.highlightMesh) selectedStartAnchor.userData.highlightMesh.visible = false;
    selectedStartAnchor = null;
    syncElectricalConnections();
    showLabNotification('All wires cleared. Manual Connect is ready for a new circuit.', 'info');
}

const circuitConnections = [
    // 1. HMS to Resistance Box and Commutator Input
    { from: 'hms_HMS_TO_COMM', to: 'commutator_C_NAVY_BLUE', color: 0x000080 },
    { from: 'hms_HMS_TO_RB', to: 'resistance-box_RB_HMS_BLACK', color: "green" },
    { from: 'resistance-box_RB_ORANGE', to: 'commutator_C_ORANGE', color: 0xffa500 },

    // 2. Commutator Output -> Tapping Switch Terminals (First pair at SW)
    { from: 'commutator_C_RED', to: 'tapping-switch_SW_RED', color: 0xff0000 },
    { from: 'commutator_C_SKY_BLUE', to: 'tapping-switch_SW_BLACK', color: 0x00bfff },

    // 3. Tapping Switch Terminals -> Ballistic Galvanometer (Second pair at SW - Junction Node)
    { from: 'tapping-switch_SW_RED', to: 'ballistic-galvanometer_BG_RED', color: 0xff0000 },
    { from: 'tapping-switch_SW_BLACK', to: 'ballistic-galvanometer_BG_BLACK', color: "orange" }
];

function autoConnectCircuit() {
    clearAllWires();

    const required = ['hms', 'resistance-box', 'commutator', 'tapping-switch', 'ballistic-galvanometer'];
    const defaultPositions = {
        'hms': new THREE.Vector3(-2.2, TABLETOP_SURFACE_Y, -0.4),
        'resistance-box': new THREE.Vector3(-0.7, TABLETOP_SURFACE_Y, -0.8),
        'commutator': new THREE.Vector3(0.4, TABLETOP_SURFACE_Y, -0.2),
        'tapping-switch': new THREE.Vector3(1.4, TABLETOP_SURFACE_Y, 0.4), // Positioned lower right
        'ballistic-galvanometer': new THREE.Vector3(2.3, TABLETOP_SURFACE_Y, 0.3)
    };

    required.forEach(id => {
        if (!instantiatedApparatus.has(id)) {
            addApparatusToTable(id, defaultPositions[id]);
        } else {
            const model = placedApparatus.find(m => m.userData.apparatusId === id);
            if (model) {
                positionApparatusOnTable(model, id, defaultPositions[id]);
            }
        }
        
        // Rotate the Tapping Switch so terminals point cleanly toward the circuit
        if (id === 'tapping-switch') {
            const swModel = placedApparatus.find(m => m.userData.apparatusId === 'tapping-switch');
            if (swModel) {
                swModel.rotation.y = Math.PI; // Flipped 180° (use Math.PI * 2 for 360° / full rotation)
            }
        }
    });

    circuitConnections.forEach(conn => {
        const fromTerm = findTerminalById(conn.from);
        const toTerm = findTerminalById(conn.to);
        if (fromTerm && toTerm) {
            addCircuitWire(fromTerm, toTerm, conn.color, conn.from, conn.to);
        }
    });

    syncElectricalConnections();
    showLabNotification('Circuit connected properly in parallel.', 'success');
}

function findTerminalById(id) {
    let result = null;
    placedApparatus.forEach(model => {
        model.traverse((child) => {
            if (child.userData?.isTerminal) {
                const terminalId = child.userData.terminalId || child.name;
                const fullId = `${model.userData.apparatusId}_${terminalId}`;
                if (fullId === id) {
                    result = child;
                }
            }
        });
    });
    return result;
}

let isRotationLocked = false;
function toggleRotationLock() {
    isRotationLocked = !isRotationLocked;
    controls.enableRotate = !isRotationLocked;
    const btn = document.getElementById('rotationLockButton');
    if (btn) {
        btn.classList.toggle('is-locked', isRotationLocked);
        btn.title = isRotationLocked ? 'Unlock View Rotation' : 'Lock View Rotation';
    }
}

let selectedApparatusForDrag = null;
let isDraggingOnTable = false;
const dragStartPosition = new THREE.Vector2();

function getPlacedApparatusRoot(object) {
    let current = object;
    while (current) {
        if (placedApparatus.includes(current)) return current;
        current = current.parent;
    }
    return null;
}

function setupRaycasterForInteractions() {
    const canvas = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let switchPointerHandled = false;
    let suppressSwitchClick = false;
    let draggingCommutator = false;
    let commutatorDragStartPointerAngle = 0;
    let commutatorDragStartArmAngle = 0;
    let activeApparatusControl = null;
    let activeControlStartX = 0;
    let activeControlStartY = 0;
    let activeControlValue = 0;

    const getPlacedSwitchLever = () => {
        const switchModel = placedApparatus.find(model => model.userData.apparatusId === 'tapping-switch');
        return switchModel?.getObjectByName('tapping-switch-lever');
    };

    const pointAtEvent = (event) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
    };

    const getPlacedCommutatorArm = () => {
        return commutator?.getObjectByName('commutator-arm');
    };

    const getPlacedControl = () => {
        const controlsToCheck = [
            ['hms', 'hms-handle'],
            ['ballistic-galvanometer', 'bg-zero-knob'],
            ['ballistic-galvanometer', 'bg-lamp'],
            ['ballistic-galvanometer', 'bg-stand']
        ];
        for (const [apparatusId, objectName] of controlsToCheck) {
            const model = placedApparatus.find(item => item.userData.apparatusId === apparatusId);
            const object = model?.getObjectByName(objectName);
            if (object) {
                const hits = raycaster.intersectObject(object, true);
                if (hits.length) return { apparatusId, object, hit: hits[0] };
            }
        }
        const resistanceBox = placedApparatus.find(item => item.userData.apparatusId === 'resistance-box');
        if (resistanceBox) {
            const sockets = [];
            resistanceBox.traverse(object => {
                if (object.name === 'rb-socket') sockets.push(object);
            });
            const hits = raycaster.intersectObjects(sockets, true);
            if (hits.length) return { apparatusId: 'resistance-box', object: hits[0].object, hit: hits[0] };
        }
        return null;
    };

    const updateCommutatorDrag = event => {
        pointAtEvent(event);
        const arm = getPlacedCommutatorArm();
        if (!arm) return;
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -arm.getWorldPosition(new THREE.Vector3()).y);
        const hitPoint = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(plane, hitPoint)) return;
        const localPoint = commutator.worldToLocal(hitPoint);
        const pointerAngle = Math.atan2(localPoint.z, localPoint.x);
        const delta = Math.atan2(
            Math.sin(pointerAngle - commutatorDragStartPointerAngle),
            Math.cos(pointerAngle - commutatorDragStartPointerAngle)
        );
        setPolarityAngle(commutator, commutatorDragStartArmAngle - delta);
    };

    canvas.addEventListener('pointerdown', event => {
        if (isTerminalSelectionMode || window.terminalSelectionMode) return;
        pointAtEvent(event);
        const control = getPlacedControl();
        if (control) {
            activeControlStartX = event.clientX;
            activeControlStartY = event.clientY;
            activeControlValue = control.apparatusId === 'hms'
                ? window.hmsControl?.getCoilPosition?.() || 0
                : control.apparatusId === 'ballistic-galvanometer'
                    ? Number(document.getElementById('ballistic-galvanometer-knob')?.value || 0)
                    : 0;
            activeApparatusControl = control;
            controls.enabled = false;
            canvas.setPointerCapture(event.pointerId);
            event.stopImmediatePropagation();
            return;
        }
        const arm = getPlacedCommutatorArm();
        if (!arm) return;
        pointAtEvent(event);
        draggingCommutator = raycaster.intersectObject(arm, true).length > 0;
        if (draggingCommutator) {
            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -arm.getWorldPosition(new THREE.Vector3()).y);
            const hitPoint = new THREE.Vector3();
            if (!raycaster.ray.intersectPlane(plane, hitPoint)) {
                draggingCommutator = false;
                return;
            }
            const localPoint = commutator.worldToLocal(hitPoint);
            commutatorDragStartPointerAngle = Math.atan2(localPoint.z, localPoint.x);
            commutatorDragStartArmAngle = arm.rotation.y;
            controls.enabled = false;
            canvas.setPointerCapture(event.pointerId);
            event.stopImmediatePropagation();
        }
    }, true);

    canvas.addEventListener('pointermove', event => {
        if (activeApparatusControl) {
            const { apparatusId } = activeApparatusControl;
            if (apparatusId === 'hms') {
                window.hmsHandleControl?.setY(activeControlValue - (event.clientY - activeControlStartY) * 0.01);
            } else if (apparatusId === 'ballistic-galvanometer') {
                const deltaX = event.clientX - activeControlStartX;
                const deltaY = event.clientY - activeControlStartY;
                if (activeApparatusControl.object.name === 'bg-zero-knob') {
                    window.bgKnobControl?.rotate(activeControlValue + deltaX * 0.8);
                } else if (activeApparatusControl.object.name === 'bg-stand') {
                    window.bgStandControl?.adjust('x', deltaX * 0.002);
                    window.bgStandControl?.adjust('z', -deltaY * 0.002);
                    activeControlStartX = event.clientX;
                    activeControlStartY = event.clientY;
                } else if (activeApparatusControl.object.name === 'bg-lamp') {
                    window.bgStandControl?.adjust('lampY', -deltaY * 0.01);
                    window.bgStandControl?.adjust('lampRot', deltaX * 0.5);
                    activeControlStartX = event.clientX;
                    activeControlStartY = event.clientY;
                }
            }
            event.stopImmediatePropagation();
            return;
        }
        if (!draggingCommutator) return;
        updateCommutatorDrag(event);
        event.stopImmediatePropagation();
    }, true);

    canvas.addEventListener('pointerup', event => {
        if (activeApparatusControl) {
            const control = activeApparatusControl;
            activeApparatusControl = null;
            controls.enabled = !isRotationLocked;
            if (control.apparatusId === 'resistance-box') {
                window.resistanceBoxControl?.toggleSocket(control.object.userData.coilIndex);
            }
            if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
            event.stopImmediatePropagation();
            return;
        }
        if (!draggingCommutator) return;
        draggingCommutator = false;
        controls.enabled = !isRotationLocked;
        snapPolarity(commutator);
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        event.stopImmediatePropagation();
    }, true);

    canvas.addEventListener('pointerdown', (event) => {
        if (isTerminalSelectionMode || window.terminalSelectionMode) return;
        const lever = getPlacedSwitchLever();
        if (!lever) return;
        pointAtEvent(event);
        switchPointerHandled = raycaster.intersectObject(lever, true).length > 0;
        if (switchPointerHandled) event.stopPropagation();
    }, true);

    canvas.addEventListener('pointerup', (event) => {
        if (!switchPointerHandled) return;
        switchPointerHandled = false;
        suppressSwitchClick = true;
        window.tappingSwitchControl?.toggle();
        event.stopPropagation();
    }, true);

    canvas.addEventListener('click', (e) => {
        if (suppressSwitchClick) {
            suppressSwitchClick = false;
            return;
        }
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const lightIntersects = raycaster.intersectObject(wallLightSwitchMesh);
        if (lightIntersects.length > 0) {
            toggleRoomLights();
            return;
        }

        if (!isTerminalSelectionMode && !window.terminalSelectionMode) {
            const lever = getPlacedSwitchLever();
            if (lever && raycaster.intersectObject(lever, true).length > 0) {
                window.tappingSwitchControl?.toggle();
                return;
            }
        }

        if (isTerminalSelectionMode || window.terminalSelectionMode) {
            handleTerminalClick(raycaster);
        }
    });
}

function setupDragAndDrop() {
    const canvas = renderer.domElement;
    const viewport = document.getElementById('threeViewport');

    const autoBtn = document.getElementById('autoConnectBtn');
    if (autoBtn) autoBtn.addEventListener('click', autoConnectCircuit);

    const manualBtn = document.getElementById('manualConnectBtn');
    if (manualBtn) manualBtn.addEventListener('click', () => {
        isTerminalSelectionMode = !isTerminalSelectionMode;
        window.terminalSelectionMode = isTerminalSelectionMode;
        manualBtn.classList.toggle('active', isTerminalSelectionMode);
        manualBtn.textContent = isTerminalSelectionMode ? 'Click Two Terminals' : 'Manual Connect';
        if (!isTerminalSelectionMode && selectedStartAnchor) {
            const highlight = selectedStartAnchor.userData.highlightMesh;
            if (highlight) highlight.visible = false;
            selectedStartAnchor = null;
        }
    });

    const clearBtn = document.getElementById('clearWiresBtn');
    if (clearBtn) clearBtn.addEventListener('click', clearAllWires);

    const lockBtn = document.getElementById('rotationLockButton');
    if (lockBtn) lockBtn.addEventListener('click', toggleRotationLock);

    [viewport, canvas].forEach(element => {
        if (!element) return;
        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });

        element.addEventListener('drop', (e) => {
            e.preventDefault();
            const apparatusId = e.dataTransfer.getData('text/plain');
            if (!apparatusId) return;

            const rect = canvas.getBoundingClientRect();
            const mouse = new THREE.Vector2();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, camera);

            const intersectPoint = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(tablePlane, intersectPoint)) {
                const halfW = TABLE_WIDTH / 2 - 0.3;
                const halfD = TABLE_DEPTH / 2 - 0.3;
                intersectPoint.x = Math.max(-halfW, Math.min(halfW, intersectPoint.x));
                intersectPoint.z = Math.max(-halfD, Math.min(halfD, intersectPoint.z));
                addApparatusToTable(apparatusId, intersectPoint);
            }
        });
    });

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    canvas.addEventListener('pointerdown', (e) => {
        if (document.getElementById('simulationWindow').classList.contains('external-apparatus-mode')) return;
        
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        if (isTerminalSelectionMode || window.terminalSelectionMode) {
            const terminalHits = raycaster.intersectObjects(
                getAllPlacedTerminals().map(terminal => terminal.object),
                true
            );
            if (terminalHits.length) return;
        }
        
        const intersects = raycaster.intersectObjects(placedApparatus, true);
        if (intersects.length > 0) {
            const obj = getPlacedApparatusRoot(intersects[0].object);
            if (obj) {
                selectedApparatusForDrag = obj;
                isDraggingOnTable = false;
                dragStartPosition.set(e.clientX, e.clientY);
            }
        } else {
            // Clicked background / empty table space -> deselect
            closeCurrentApparatusControls();
        }
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!selectedApparatusForDrag) return;
        
        const dist = dragStartPosition.distanceTo(new THREE.Vector2(e.clientX, e.clientY));
        if (dist > 5) {
            isDraggingOnTable = true;
            controls.enabled = false;
        }

        if (isDraggingOnTable) {
            const rect = canvas.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);

            const intersectPoint = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(tablePlane, intersectPoint)) {
                const halfW = TABLE_WIDTH / 2 - 0.3;
                const halfD = TABLE_DEPTH / 2 - 0.3;
                intersectPoint.x = Math.max(-halfW, Math.min(halfW, intersectPoint.x));
                intersectPoint.z = Math.max(-halfD, Math.min(halfD, intersectPoint.z));
                
                positionApparatusOnTable(selectedApparatusForDrag, selectedApparatusForDrag.userData.apparatusId, intersectPoint);
            }
        }
    });

    const endTableDrag = () => {
        if (selectedApparatusForDrag) {
            if (!isDraggingOnTable) {
                // Clicked on an apparatus - show its controls
                const id = selectedApparatusForDrag.userData.apparatusId;
                showControlsOnRightSide(id);
            }
            controls.enabled = !isRotationLocked;
            selectedApparatusForDrag = null;
            isDraggingOnTable = false;
            refreshLabControlsVisibility();
        }
    };

    canvas.addEventListener('pointerup', endTableDrag);
    canvas.addEventListener('pointercancel', endTableDrag);
}

function addApparatusToTable(id, point) {
    let model;
    if (instantiatedApparatus.has(id)) {
        model = placedApparatus.find(m => m.userData.apparatusId === id);
        if (model) {
            if (id === 'commutator') commutator = model;
            positionApparatusOnTable(model, id, point);
        }
        refreshLabControlsVisibility();
        return;
    }

    switch(id) {
        case 'resistance-box': model = getResistanceBox(); break;
        case 'hms': model = getHMS(); break;
        case 'ballistic-galvanometer': model = getGalvanometer(); break;
        case 'tapping-switch': model = getTappingSwitch(); break;
        case 'commutator': model = getCommutator(); break;
        default: return;
    }
    if (model) {
        model.userData.apparatusId = id;
        if (id === 'commutator') commutator = model;
        scene.add(model);
        placedApparatus.push(model);
        instantiatedApparatus.add(id);
        positionApparatusOnTable(model, id, point);

        model.traverse((child) => {
            if (child.userData && (child.userData.isTerminal || child.userData.terminalId)) {
                child.userData.isTerminalHit = true;
                child.userData.isTerminal = true;

                const highlight = new THREE.Mesh(
                    new THREE.SphereGeometry(0.03, 12, 12),
                    new THREE.MeshBasicMaterial({ 
                        color: 0x00ff00,
                        transparent: true,
                        opacity: 0.6,
                        wireframe: true
                    })
                );
                highlight.position.copy(child.position);
                highlight.visible = false;
                child.parent.add(highlight);
                
                child.userData.highlightMesh = highlight;
            }
        });
        
        // Re-evaluate visibility (Lab controls will only show once all 5 are present)
        refreshLabControlsVisibility();
    }
}

function enableTerminalInspector() {
    const inspectorRaycaster = new THREE.Raycaster();
    const inspectorMouse = new THREE.Vector2();

    window.addEventListener('click', (event) => {
        if (!event.shiftKey) return;

        inspectorMouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        inspectorMouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        inspectorRaycaster.setFromCamera(inspectorMouse, camera);

        const intersects = inspectorRaycaster.intersectObjects(placedApparatus, true);

        if (intersects.length > 0) {
            const hit = intersects[0];
            
            let rootModel = hit.object;
            while (rootModel.parent && rootModel.parent.type !== 'Scene' && !rootModel.userData.apparatusId) {
                rootModel = rootModel.parent;
            }

            const localPoint = rootModel.worldToLocal(hit.point.clone());

            console.log(
                `%c[Terminal Inspector] App: "${rootModel.userData.apparatusId}"`, 
                'color: #00ff00; font-weight: bold;'
            );
            console.log(
                `pos: new THREE.Vector3(${localPoint.x.toFixed(2)}, ${localPoint.y.toFixed(2)}, ${localPoint.z.toFixed(2)})`
            );
        }
    });
}

function cleanup() {
    clearAllWires();
    
    if (monitorRenderTarget) {
        monitorRenderTarget.dispose();
    }
    
    window.removeEventListener('resize', onWindowResize);
    renderer.dispose();
}

export { 
    init, 
    animate, 
    addApparatusToTable, 
    autoConnectCircuit,
    clearAllWires,
    toggleRoomLights,
    handleTerminalClick,
    cleanup,
    updateConnectedWires,
    createWire
};

window.addEventListener('load', () => {
    init();
    animate();
}, { once: true });
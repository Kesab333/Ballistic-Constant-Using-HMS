// terminal-utils.js

import * as THREE from 'three';

// ============================================================
// TERMINALS
// ============================================================

export function addTerminal(
    parent,
    id,
    position,
    color = 0x00ff88
) {
    const anchor = new THREE.Object3D();

    anchor.position.copy(position);

    anchor.userData = {
        isTerminal: true,
        terminalId: id,
        terminalColor: color
    };

    // Invisible but clickable hit area - reduced from 0.09 to 0.02
    const hit = new THREE.Mesh(
        new THREE.SphereGeometry(0.02, 16, 16),
        new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0
        })
    );

    hit.userData = {
        isTerminalHit: true,
        terminalId: id,
        terminalAnchor: anchor
    };

    anchor.add(hit);
    parent.add(anchor);

    return anchor;
}

// ============================================================
// TERMINAL HIGHLIGHT (World-space, not affected by apparatus scale)
// ============================================================

/**
 * Creates a fixed-size highlight ring in world-space
 * @param {THREE.Object3D} terminalAnchor - The terminal anchor object
 * @param {THREE.Scene} scene - The scene to add the highlight to
 * @param {number} color - Color of the highlight
 * @returns {THREE.Mesh} The highlight mesh
 */
export function createTerminalHighlight(terminalAnchor, scene, color = 0x00ff88) {
    // 1. Get exact world position from terminal anchor
    const worldPos = new THREE.Vector3();
    terminalAnchor.getWorldPosition(worldPos);

    // 2. Create fixed size ring/disc in world units (radius = 0.025m / 2.5cm)
    const geometry = new THREE.RingGeometry(0.015, 0.03, 32);
    geometry.rotateX(-Math.PI / 2); // Lay flat on XZ plane

    const material = new THREE.MeshBasicMaterial({
        color: color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
        depthTest: false // Keeps ring visible on top of terminal
    });

    const highlightMesh = new THREE.Mesh(geometry, material);
    
    // Position slightly above the terminal surface
    highlightMesh.position.copy(worldPos);
    highlightMesh.position.y += 0.01;

    // Store reference to the anchor for updates
    highlightMesh.userData.terminalAnchor = terminalAnchor;
    highlightMesh.userData.isHighlight = true;

    // CRITICAL: Attach directly to scene so it never inherits apparatus scale
    scene.add(highlightMesh);

    return highlightMesh;
}

/**
 * Updates a terminal highlight position (call when apparatus moves)
 * @param {THREE.Mesh} highlightMesh - The highlight mesh to update
 */
export function updateTerminalHighlight(highlightMesh) {
    if (!highlightMesh.userData?.terminalAnchor) return;

    const worldPos = new THREE.Vector3();
    highlightMesh.userData.terminalAnchor.getWorldPosition(worldPos);
    
    highlightMesh.position.copy(worldPos);
    highlightMesh.position.y += 0.01;
}

/**
 * Removes a terminal highlight
 * @param {THREE.Mesh} highlightMesh - The highlight mesh to remove
 * @param {THREE.Scene} scene - The scene containing the highlight
 */
export function removeTerminalHighlight(highlightMesh, scene) {
    if (highlightMesh) {
        scene.remove(highlightMesh);
        highlightMesh.geometry?.dispose();
        highlightMesh.material?.dispose();
    }
}

// ============================================================
// WIRES
// ============================================================

export const activeWires = [];

export function createWire(
    startAnchor,
    endAnchor,
    color = 0x2563eb
) {
    const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.4,
        metalness: 0.15
    });

    const wireMesh = new THREE.Mesh(
        new THREE.BufferGeometry(),
        material
    );

    wireMesh.userData = {
        startAnchor,
        endAnchor,
        color,
        isWire: true,
        // Drawing a wire and accepting it electrically are deliberately separate.
        visualConnected: true,
        electricalConnected: false
    };

    updateWireGeometry(wireMesh);

    activeWires.push(wireMesh);

    return wireMesh;
}

// ============================================================
// UPDATE ONE WIRE
// ============================================================

export function updateWireGeometry(wireMesh) {
    const startAnchor = wireMesh.userData.startAnchor;
    const endAnchor = wireMesh.userData.endAnchor;

    if (!startAnchor || !endAnchor) return;

    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();

    startAnchor.getWorldPosition(p1);
    endAnchor.getWorldPosition(p2);

    // Stationary wires do not need new TubeGeometry every animation frame.
    // This avoids six expensive allocations per frame after Auto Connect.
    const lastStart = wireMesh.userData.lastStartPosition;
    const lastEnd = wireMesh.userData.lastEndPosition;
    if (lastStart && lastEnd && p1.distanceToSquared(lastStart) < 1e-8 && p2.distanceToSquared(lastEnd) < 1e-8) {
        return;
    }

    const dist = p1.distanceTo(p2);
    // A coincident or invalid endpoint must never produce an oversized tube.
    if (!Number.isFinite(dist) || dist < 0.002) return;

    // Increase vertical lift out of binding post to clear apparatus tops
    const lift = 0.25 + Math.min(dist * 0.08, 0.3);

    const connectorDirection = (anchor) => {
        const local = anchor.userData?.connectorDirection;
        if (local?.isVector3) {
            return local.clone().transformDirection(anchor.matrixWorld).normalize();
        }
        return new THREE.Vector3(0, 1, 0);
    };
    const exit1 = p1.clone().add(connectorDirection(startAnchor).multiplyScalar(lift));
    const exit2 = p2.clone().add(connectorDirection(endAnchor).multiplyScalar(lift));

    // Midpoint height droops relative to higher terminal without clipping tops
    const midX = (p1.x + p2.x) / 2;
    const midZ = (p1.z + p2.z) / 2;
    
    const midY = Math.max(p1.y, p2.y) + 0.05 - Math.min(dist * 0.08, 0.25);

    const midPoint = new THREE.Vector3(midX, midY, midZ);

    const controlPoints = [
        p1,
        exit1,
        midPoint,
        exit2,
        p2
    ];

    const curve = new THREE.CatmullRomCurve3(
        controlPoints,
        false,
        'centripetal',
        0.5
    );

    const newGeometry = new THREE.TubeGeometry(
        curve,
        64,
        0.012,
        10,
        false
    );

    if (wireMesh.geometry) {
        wireMesh.geometry.dispose();
    }

    wireMesh.geometry = newGeometry;
    wireMesh.userData.lastStartPosition = p1.clone();
    wireMesh.userData.lastEndPosition = p2.clone();
}

// ============================================================
// UPDATE ALL WIRES
// ============================================================

export function updateAllWires() {
    for (const wire of activeWires) {
        updateWireGeometry(wire);
    }
}

// ============================================================
// REMOVE ONE WIRE
// ============================================================

export function removeWire(wireMesh) {
    const index = activeWires.indexOf(wireMesh);

    if (index !== -1) {
        activeWires.splice(index, 1);
    }

    if (wireMesh.parent) {
        wireMesh.parent.remove(wireMesh);
    }

    wireMesh.geometry?.dispose();
    wireMesh.material?.dispose();
    window.dispatchEvent(new CustomEvent('ballistic:wire-removed', { detail: wireMesh }));
}

// ============================================================
// CLEAR ALL WIRES
// ============================================================

export function clearAllWires() {
    for (const wire of [...activeWires]) {
        removeWire(wire);
    }

    activeWires.length = 0;
}

// ============================================================
// MANUAL WIRE CONNECTOR (with fixed highlights)
// ============================================================

export class ManualWireConnector {
    constructor(scene, tableHeight = 1.525, wireOptions = {}) {
        this.scene = scene;
        this.tableHeight = tableHeight;
        this.wireOptions = wireOptions;
        this.selectedTerminal = null;
        this.highlightMesh = null;
        this.highlightColor = 0x00ff88;
    }

    /**
     * Handle a terminal click in manual connect mode
     * @param {THREE.Object3D} clickedTerminal - The terminal that was clicked
     * @param {number} color - Color for the wire (optional)
     * @returns {Object} - { status: 'selected'|'connected'|'deselected', wire: Mesh|null }
     */
    handleTerminalClick(clickedTerminal, color = 0xcc2222) {
        if (!this.selectedTerminal) {
            // First terminal selected
            this.selectedTerminal = clickedTerminal;
            this.showHighlight(clickedTerminal, this.highlightColor);
            return { status: 'selected', wire: null };
        } else if (this.selectedTerminal !== clickedTerminal) {
            // Second terminal selected - create wire
            const wire = createWire(
                this.selectedTerminal,
                clickedTerminal,
                color
            );
            
            // Store terminal references in wire
            wire.userData.fromTerminal = this.selectedTerminal;
            wire.userData.toTerminal = clickedTerminal;
            
            this.removeHighlight();
            const wireResult = wire;
            this.selectedTerminal = null;
            return { status: 'connected', wire: wireResult };
        } else {
            // Same terminal clicked - deselect
            this.removeHighlight();
            this.selectedTerminal = null;
            return { status: 'deselected', wire: null };
        }
    }

    /**
     * Show a highlight ring on the selected terminal
     * @param {THREE.Object3D} terminal - The terminal to highlight
     * @param {number} color - Color of the highlight
     */
    showHighlight(terminal, color = 0x00ff88) {
        this.removeHighlight();
        this.highlightMesh = createTerminalHighlight(terminal, this.scene, color);
        this.highlightColor = color;
    }

    /**
     * Remove the current highlight
     */
    removeHighlight() {
        if (this.highlightMesh) {
            removeTerminalHighlight(this.highlightMesh, this.scene);
            this.highlightMesh = null;
        }
    }

    /**
     * Update highlight position (call in animation loop)
     */
    updateHighlight() {
        if (this.highlightMesh) {
            updateTerminalHighlight(this.highlightMesh);
        }
    }

    /**
     * Reset the connector state
     */
    reset() {
        this.removeHighlight();
        this.selectedTerminal = null;
    }

    /**
     * Get the selected terminal
     * @returns {THREE.Object3D|null}
     */
    getSelectedTerminal() {
        return this.selectedTerminal;
    }
}

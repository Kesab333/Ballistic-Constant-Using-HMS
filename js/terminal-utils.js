// terminal-utils.js

import * as THREE from 'three';

export const COMMUTATOR_TERMINAL_POSITIONS = {
    handle: [
        { id: 'C_NAVY_BLUE', color: 0x000080, position: new THREE.Vector3(-2.5, 1.1, 0) },
        { id: 'C_ORANGE', color: 0xffa500, position: new THREE.Vector3(2.5, 1.1, 0) }
    ],
    plate: [
        { id: 'C_RED', color: 0xff0000, position: new THREE.Vector3(3, 2.2, 0) },
        { id: 'C_SKY_BLUE', color: 0x00bfff, position: new THREE.Vector3(-3, 2.2, 0) }
    ]
};

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
        terminalId: id
    };

    anchor.add(hit);
    parent.add(anchor);

    return anchor;
}

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

export function updateWireGeometry(wireMesh, matricesReady = false) {
    const startAnchor = wireMesh.userData.startAnchor;
    const endAnchor = wireMesh.userData.endAnchor;

    if (!startAnchor || !endAnchor) return;

    const p1 = wireMesh.userData.scratchStart ||= new THREE.Vector3();
    const p2 = wireMesh.userData.scratchEnd ||= new THREE.Vector3();
    if (!matricesReady) { startAnchor.updateWorldMatrix(true, false); endAnchor.updateWorldMatrix(true, false); }
    p1.setFromMatrixPosition(startAnchor.matrixWorld);
    p2.setFromMatrixPosition(endAnchor.matrixWorld);

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

    // Leave each binding post vertically, then travel above the apparatus.
    // Keeping every middle control point above both endpoints prevents the
    // spline from dipping through a casing between two terminals.
    const lift = 0.20 + Math.min(dist * 0.10, 0.35);

    const connectorDirection = (anchor) => {
        const local = anchor.userData?.connectorDirection;
        if (local?.isVector3) {
            return local.clone().transformDirection(anchor.matrixWorld).normalize();
        }
        return new THREE.Vector3(0, 1, 0);
    };
    const exit1 = p1.clone().add(connectorDirection(startAnchor).multiplyScalar(lift));
    const exit2 = p2.clone().add(connectorDirection(endAnchor).multiplyScalar(lift));

    // Route overhead rather than sagging through the equipment body.
    const midX = (p1.x + p2.x) / 2;
    const midZ = (p1.z + p2.z) / 2;
    const midY = Math.max(exit1.y, exit2.y) + 0.08;

    const midPoint = new THREE.Vector3(midX, midY, midZ);
    const overStart = exit1.clone().lerp(midPoint, 0.32);
    const overEnd = exit2.clone().lerp(midPoint, 0.32);

    const controlPoints = [
        p1,
        exit1,
        overStart,
        midPoint,
        overEnd,
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

    const existing = wireMesh.geometry;
    if (existing.attributes.position?.count === newGeometry.attributes.position.count) {
        for (const key of ['position', 'normal']) {
            existing.attributes[key].array.set(newGeometry.attributes[key].array);
            existing.attributes[key].needsUpdate = true;
        }
        existing.computeBoundingSphere();
        newGeometry.dispose();
    } else {
        existing.dispose();
        wireMesh.geometry = newGeometry;
    }
    wireMesh.userData.lastStartPosition = p1.clone();
    wireMesh.userData.lastEndPosition = p2.clone();
}

// ============================================================
// UPDATE ALL WIRES
// ============================================================

export function updateAllWires() {
    for (const wire of activeWires) {
        updateWireGeometry(wire, true);
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

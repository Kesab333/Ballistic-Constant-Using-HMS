import * as THREE from 'three';
export function createWoodTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    
    // Warm golden-brown base color
    ctx.fillStyle = '#c89658';
    ctx.fillRect(0, 0, 1024, 1024);
    
    // Longitudinal wood grain fibers
    ctx.fillStyle = '#b07d42';
    for (let i = 0; i < 800; i++) {
        ctx.globalAlpha = Math.random() * 0.25 + 0.08;
        const y = Math.random() * 1024;
        const h = Math.random() * 3 + 1;
        ctx.fillRect(0, y, 1024, h);
    }

    // Darker grain waves and streaks
    ctx.strokeStyle = '#8c5825';
    ctx.lineWidth = 2;
    for (let i = 0; i < 35; i++) {
        ctx.globalAlpha = Math.random() * 0.3 + 0.1;
        ctx.beginPath();
        let startY = Math.random() * 1024;
        ctx.moveTo(0, startY);
        for (let x = 0; x <= 1024; x += 100) {
            startY += (Math.random() - 0.5) * 45;
            ctx.lineTo(x, startY);
        }
        ctx.stroke();
    }

    // Natural wood knots
    function drawKnot(kx, ky) {
        ctx.save();
        ctx.translate(kx, ky);
        ctx.scale(1, 0.4);
        for (let r = 70; r > 12; r -= 10) {
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.strokeStyle = '#734316';
            ctx.globalAlpha = 0.25;
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        ctx.fillStyle = '#593210';
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    drawKnot(280, 320);
    drawKnot(780, 720);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.2, 1.2);
    return texture;
}

export function createTileTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#ffffff'; 
    ctx.fillRect(0, 0, 512, 512);
    
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 4;
    
    for (let i = 0; i <= 512; i += 128) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    return texture;
}

export function createKnurlTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    for (let i = -128; i < 256; i += 8) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 128, 128); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i, 128); ctx.lineTo(i + 128, 0); ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 2);
    return texture;
}

// Helper: Ventilation Outlet Grille Mesh
export function createVentGrille() {
    const ventGroup = new THREE.Group();

    const frameGeo = new THREE.BoxGeometry(2.4, 0.5, 0.06);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    ventGroup.add(frame);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#475569';
    for (let y = 6; y < 64; y += 10) {
        ctx.fillRect(6, y, 244, 4);
    }

    const ventTex = new THREE.CanvasTexture(canvas);
    const innerGeo = new THREE.PlaneGeometry(2.26, 0.38);
    const innerMat = new THREE.MeshBasicMaterial({ map: ventTex });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.position.z = 0.032;
    ventGroup.add(inner);

    return ventGroup;
}

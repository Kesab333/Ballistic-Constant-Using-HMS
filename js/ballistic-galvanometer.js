import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { addTerminal } from './terminal-utils.js';
import { getGalvanometerAngle } from './physics.js';

const apparatusHost = document.getElementById('ballistic-galvanometer-canvas-container');
const $ = id => document.getElementById(id),
    PI = Math.PI,
    PI2 = PI / 2,
    V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const scn = new THREE.Scene();
scn.background = new THREE.Color(0xffffff);

// --- FIX 1: Initial Camera Angle (Stand Left, BG Right) ---
const cam = new THREE.PerspectiveCamera(40, (apparatusHost.clientWidth || 1) / (apparatusHost.clientHeight || 1), 0.1, 1000);
cam.position.set(11.0, 5.5, 8.5);

const rnd = new THREE.WebGLRenderer({ antialias: true, alpha: true });
rnd.setSize(apparatusHost.clientWidth || 800, apparatusHost.clientHeight || 600);
rnd.setPixelRatio(Math.min(window.devicePixelRatio, 2));
rnd.shadowMap.enabled = true;
rnd.shadowMap.type = THREE.PCFSoftShadowMap;
$('ballistic-galvanometer-canvas-container').appendChild(rnd.domElement);

// Updated orbit controls target for Stand-Left / BG-Right framing
const ctrl = new OrbitControls(cam, rnd.domElement);
ctrl.enableDamping = true;
ctrl.dampingFactor = 0.05;
ctrl.maxPolarAngle = PI2 + 0.05;
ctrl.target.set(0, 2.5, 2.5);

scn.add(new THREE.AmbientLight(0xffffff, 0.95));
const dL = new THREE.DirectionalLight(0xffffff, 0.85);
dL.position.set(5, 12, 7);
dL.castShadow = true;
scn.add(dL);
const fL = new THREE.DirectionalLight(0xffffff, 0.5);
fL.position.set(0, 3.5, 8);
scn.add(fL);

// --- PROCEDURAL TEXTURES ---
const CT = (w, h, dFn) => { const c = document.createElement('canvas'),
        x = c.getContext('2d');
    c.width = w;
    c.height = h;
    dFn(x);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
};
const bSteelTex = CT(512, 512, x => { x.fillStyle = '#b8c0c8';
    x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 3e3; i++) { const y = Math.random() * 512,
            a = Math.random() * 0.18;
        x.strokeStyle = Math.random() > .5 ? `rgba(255,255,255,${a})` : `rgba(30,35,40,${a})`;
        x.lineWidth = 1 + Math.random();
        x.beginPath();
        x.moveTo(0, y);
        x.lineTo(512, y);
        x.stroke(); } });
const mTex = CT(512, 512, x => { const g = x.createLinearGradient(0, 0, 512, 512);
    ['#fff', '#f1f5f9', '#cbd5e1', '#fff', '#94a3b8', '#e2e8f0', '#fff'].forEach((c, i) => g.addColorStop([0, 0.2, 0.45, 0.5, 0.55, 0.8, 1][i], c));
    x.fillStyle = g;
    x.fillRect(0, 0, 512, 512); });
const cAlpTex = CT(1024, 1024, x => { x.fillStyle = '#fff';
    x.fillRect(0, 0, 1024, 1024);
    x.fillStyle = '#000';
    x.beginPath();
    x.ellipse(512, 1024 * (1 - 3.9 / 5.8), (0.72 / (2 * PI * 1.964)) * 1024, (0.72 / 5.8) * 1024, 0, 0, 2 * PI);
    x.fill(); });

// Fixed Banner Texture: Straight, clean, rectangular gold box around label text
const lTex = CT(512, 256, x => {
    x.fillStyle = '#111113';
    x.fillRect(0, 0, 512, 256);
    x.strokeStyle = '#d4af37';
    x.lineWidth = 12;
    x.strokeRect(12, 12, 488, 232);
    x.fillStyle = '#fff';
    x.font = 'bold 28px Arial';
    x.textAlign = 'center';
    x.fillText('BALLISTIC GALVANOMETER', 256, 95);
    x.font = 'bold 24px Arial';
    x.fillStyle = '#d4af37';
    x.fillText('COIL RES  500  OHMS', 256, 165);
});

// CM Scale Texture
const sTex = CT(2048, 256, x => {
    x.fillStyle = '#fff';
    x.fillRect(0, 0, 2048, 256);
    x.fillStyle = x.strokeStyle = '#0f172a';
    x.font = 'bold 24px monospace';
    x.textAlign = 'center';
    for (let i = 0; i <= 100; i++) {
        const px = i * 20 + 24,
            r0 = i % 10,
            r5 = i % 5;
        let h = r0 === 0 ? 65 : (!r5 ? 42 : 25);
        if (!r0) x.fillText(Math.abs(i - 50), px, 185);
        x.lineWidth = !r5 ? 3 : 1.5;
        x.beginPath();
        x.moveTo(px, 70);
        x.lineTo(px, 70 + h);
        x.stroke();
    }
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(24, 70);
    x.lineTo(2024, 70);
    x.stroke();
    x.font = 'bold 28px sans-serif';
    x.fillText('cm', 2024 - 40, 185);
    x.fillText('cm', 24 + 40, 185);
});

class HBorder extends THREE.Curve {
    constructor(y, r) { super();
        this.y = y;
        this.r = r; }
    getPoint(t, v = V3()) { const a = t * PI * 2,
            y = this.y + this.r * Math.sin(a),
            R = 2.3 - ((y - 0.4) / 5.8) * 0.5,
            th = (this.r * Math.cos(a)) / R; return v.set(R * Math.sin(th), y, R * Math.cos(th)); }
}
class HRRectCurve extends THREE.Curve {
    constructor(w, h, r, t, z1, z2) {
        super();
        Object.assign(this, { w, h, r, t, z1, z2 });
        const lx = 2 * (w - r),
            ly = 2 * (h - r),
            ac = PI2 * r;
        this.p = 2 * lx + 2 * ly + 4 * ac;
        this.S = [lx, lx + ac, lx + ly + ac, lx + ly + 2 * ac, 2 * lx + ly + 2 * ac, 2 * lx + ly + 3 * ac, 2 * lx + 2 * ly + 3 * ac];
        this.O = this.S[3] + lx / 2;
    }
    getPoint(t, v = V3()) {
        const z = this.z1 + t * (this.z2 - this.z1);
        let s = (t * this.t * this.p + this.O) % this.p;
        if (s < 0) s += this.p;
        const { w, h, r, S } = this;
        let x, y, da;
        if (s < S[0]) { x = s - w + r;
            y = -h; } else if (s < S[1]) { da = (s - S[0]) / r - PI2;
            x = w - r + r * Math.cos(da);
            y = -h + r + r * Math.sin(da); } else if (s < S[2]) { x = w;
            y = -h + r + s - S[1]; } else if (s < S[3]) { da = (s - S[2]) / r;
            x = w - r + r * Math.cos(da);
            y = h - r + r * Math.sin(da); } else if (s < S[4]) { x = w - r - (s - S[3]);
            y = h; } else if (s < S[5]) { da = (s - S[4]) / r + PI2;
            x = -w + r + r * Math.cos(da);
            y = h - r + r * Math.sin(da); } else if (s < S[6]) { x = -w;
            y = h - r - (s - S[5]); } else { da = (s - S[6]) / r + PI;
            x = -w + r + r * Math.cos(da);
            y = -h + r + r * Math.sin(da); }
        return v.set(x, y, z);
    }
}

const mKM = o => new THREE.MeshStandardMaterial(o),
    mMB = o => new THREE.MeshBasicMaterial(o);
const mats = {
    base: mKM({ color: 0x18181a, roughness: 0.6 }),
    steel: mKM({ map: bSteelTex, color: 0xc8cecf, roughness: 0.35, metalness: 0.9 }),
    wood: mKM({ color: 0x6e431f, roughness: 0.75, metalness: 0.05 }),
    casing: mKM({ color: 0x18181c, roughness: 0.4, metalness: 0.1, alphaMap: cAlpTex, alphaTest: 0.5, side: 2 }),
    winFr: mKM({ color: 0x18181a, roughness: 0.85 }),
    brass: mKM({ color: 0xd4af37, roughness: 0.35, metalness: 0.75 }),
    silv: mKM({ color: 0xd0d7de, roughness: 0.2, metalness: 0.9 }),
    cop: mKM({ color: 0xb85c1d, roughness: 0.35, metalness: 0.75 }),
    form: mKM({ color: 0xf8f9fa, roughness: 0.2, metalness: 0.05, side: 2 }),
    iron: mKM({ color: 0x3a3b3e, roughness: 0.5, metalness: 0.6 }),
    mag: mKM({ color: 0x1b59ac, roughness: 0.35, metalness: 0.35 }),
    spirit: mKM({ color: 0x39ff14, roughness: 0.1, emissive: 0x1b800a, emissiveIntensity: 0.2 }),
    ruby: mKM({ color: 0xb91c1c, roughness: 0.1, metalness: 0.3 }),
    tita: mKM({ color: 0x88929a, roughness: 0.2, metalness: 0.9 }),
    redGold: mKM({ color: 0xd48837, roughness: 0.3, metalness: 0.85 }),
    glassCrystal: mKM({ color: 0xffffff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.65 }),
    rWr: mKM({ color: 0xcc2222, roughness: 0.4, metalness: 0.3 }),
    bWr: mKM({ color: 0x222224, roughness: 0.4, metalness: 0.3 }),
    mirr: mKM({ map: mTex, roughness: 0.08, metalness: 0.35, emissive: 0xf0f4f8, emissiveIntensity: 0.15, side: 2 }),
    scBd: mKM({ map: sTex, roughness: 0.2, side: 2 }),
    lBm: mMB({ color: 0xffea00, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, side: 2 }),
    lSp: mMB({ color: 0xff3300, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, side: 2 })
};
const { base, steel, wood, casing, winFr, brass, silv, cop, form, iron, mag, spirit, ruby, tita, redGold, glassCrystal, rWr, bWr, mirr, scBd, lBm, lSp } = mats;

const M = (g, m, p, pos = [0, 0, 0], rot = [0, 0, 0]) => { const x = new THREE.Mesh(g, m);
    x.position.set(...pos);
    x.rotation.set(...rot);
    p?.add(x);
    return x; };
const G = (p, pos = [0, 0, 0]) => { const g = new THREE.Group();
    g.position.set(...pos);
    p?.add(g);
    return g; };
const C = (r1, r2, h, s = 32, o = false, t = PI * 2) => new THREE.CylinderGeometry(r1, r2, h, s, 1, o, 0, t);
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const T = (r, t) => new THREE.TorusGeometry(r, t, 16, 32);

// Core Hierarchy Setup
const mG = G(scn),
    bG = G(mG),
    cG = G(mG),
    iG = G(mG),
    coG = G(iG, [0, 3.2, 0]);
const aKn = G(G(cG, [0, 6.2, 0]), [0, 0.12, 0]),
    miG = G(coG, [0, 1.1, 0]),
    bmG = G(mG);

// Stand Hierarchy
const lG = G(mG, [0, 0, 14.0]);
const scG = G(lG, [0, 4.7, 0]);
const lpG = G(lG, [0, 3.5, 0]);
const bxG = G(lpG, [0, 0, -0.45]);

// --- GALVANOMETER BODY ---
M(C(2.8, 3, 0.4, 64), base, bG, [0, 0.2, 0]).receiveShadow = true;
for (let i = 0; i < 3; i++) { const g = G(bG, [Math.cos(i * PI * 2 / 3) * 2.5, 0, Math.sin(i * PI * 2 / 3) * 2.5]);
    M(C(0.38, 0.38, 0.15), base, g, [0, -0.07, 0]);
    M(C(0.42, 0.42, 0.06), brass, g, [0, 0.02, 0]);
    M(C(0.32, 0.32, 0.35), brass, g, [0, 0.2, 0]); }
[{ x: 0.85, c: 0xaa2222 }, { x: -0.85, c: 0x222222 }].forEach(p => { const g = G(bG, [p.x, 0.4, 2.45]);
    M(C(0.1, 0.1, 0.4, 16), brass, g, [0, 0.2, 0]);
    M(C(0.2, 0.18, 0.38, 24), mKM({ color: p.c, roughness: 0.3 }), g, [0, 0.35, 0]); });
[-0.04, -0.035, -0.03].forEach((y, i) => M(C([0.3, 0.25, 0.2][i], [0.3, 0.25, 0.2][i], 0.08), [base, brass, spirit][i], bG, [-1.5, 0.48 + y, 2.0]));

M(C(1.8, 2.3, 5.8, 64, true), casing, cG, [0, 3.3, 0], [0, PI, 0]);
M(C(1.8, 1.8, 0.15, 64), casing, cG, [0, 6.2, 0]);

// Banner Mesh adjusted to display complete un-cut frame
M(new THREE.CylinderGeometry(1.865, 1.865, 0.45, 64, 1, true, -PI / 7, PI / 3.5), mKM({ map: lTex, roughness: 0.3, metalness: 0.2, side: 2 }), cG, [0, 5.58, 0]);
M(new THREE.TubeGeometry(new HBorder(4.3, 0.72), 128, 0.05, 16, true), winFr, cG);

const kBz = mKM({ color: 0x94a3b8, roughness: 0.25, metalness: 0.85 }),
    kRb = mKM({ color: 0x272a30, roughness: 0.6, metalness: 0.3 });
M(C(0.44, 0.42, 0.1), kBz, aKn, [0, 0.05, 0]);
M(C(0.38, 0.38, 0.18), kRb, aKn, [0, 0.11, 0]);
for (let i = 0; i < 36; i++) M(B(0.02, 0.18, 0.03), kRb, aKn, [Math.cos(i * PI / 18) * 0.385, 0.11, Math.sin(i * PI / 18) * 0.385], [0, -i * PI / 18, 0]);
M(C(0.31, 0.31, 0.2), mKM({ color: 0x17191d, roughness: 0.35, metalness: 0.2 }), aKn, [0, 0.12, 0]);
M(T(0.31, 0.012), kBz, aKn, [0, 0.221, 0], [PI2, 0, 0]);
M(B(0.035, 0.012, 0.18), mKM({ color: 0xffffff, roughness: 0.1, metalness: 0.1, emissive: 0xffffff, emissiveIntensity: 0.4 }), aKn, [0, 0.225, 0.09]);
M(C(0.18, 0.18, 0.3, 24), brass, aKn.parent, [0, -0.05, 0]);
M(C(0.1, 0.1, 0.5, 24), brass, aKn.parent, [0, -0.23, 0]);

M(C(0.1, 0.1, 3.6), brass, iG, [0, 2.2, -0.88]);
M(C(0.26, 0.28, 0.1), brass, iG, [0, 0.45, -0.88]);
M(C(0.18, 0.2, 0.14), brass, iG, [0, 0.55, -0.88]);
for (let i = 0; i < 4; i++) M(C(0.025, 0.025, 0.12, 12), steel, iG, [Math.cos(i * PI2) * 0.22, 0.5, -0.88 + Math.sin(i * PI2) * 0.22]);
M(B(0.22, 0.16, 0.18), brass, iG, [0, 3.6, -0.88]);
M(C(0.15, 0.15, 0.18, 24), brass, iG, [0, 3.6, -0.88]);

const tS = new THREE.Shape();
tS.moveTo(-0.6, 0);
tS.lineTo(0.6, 0);
tS.lineTo(0.6, 0.7);
tS.lineTo(0.28, 1.2);
tS.lineTo(-0.28, 1.2);
tS.lineTo(-0.6, 0.7);
tS.closePath();
const hp = new THREE.Path();
hp.absarc(0, 0.6, 0.22, 0, PI * 2, true);
tS.holes.push(hp);
M(new THREE.ExtrudeGeometry(tS, { depth: 0.08, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.01, bevelThickness: 0.01 }), brass, iG, [0, 3.7, -0.84]);

[3.48, 1.82].forEach(y => { M(C(0.15, 0.15, 0.1, 24), brass, iG, [0, y, -0.88]);
    M(B(0.07, 0.05, 0.88), brass, iG, [0, y, -0.44]);
    M(C(0.13, 0.13, 0.09), brass, iG, [0, y, 0]);
    M(T(0.06, 0.012), ruby, iG, [0, y, 0], [PI2, 0, 0]); });
M(C(0.32, 0.32, 1.05, 48), iron, iG, [0, 2.65, 0]);
M(C(0.04, 0.04, 1.35, 24), brass, iG, [0, 2.65, 0]);
M(C(0.12, 0.12, 0.18, 24), brass, iG, [0, 2.65, -0.88]);
M(B(0.06, 0.1, 0.68), brass, iG, [0, 2.65, -0.54]);
M(B(0.08, 0.06, 0.18), brass, iG, [0.12, 3.36, -0.3]);
M(B(0.08, 0.06, 0.18), brass, iG, [-0.12, 1.94, -0.3]);
M(B(0.4, 0.1, 0.7), brass, iG, [0, 0.45, 0]);
[-0.85, 0.85].forEach(x => { M(B(0.38, 0.06, 0.75), brass, iG, [x, 0.43, 0]);
    M(B(0.26, 0.36, 0.7), brass, iG, [x, 0.64, 0]);
    M(B(0.3, 0.04, 0.75), brass, iG, [x, 0.84, 0]);
    [-0.28, 0.28].forEach(z => M(C(0.02, 0.02, 0.08, 12), steel, iG, [x, 0.47, z])); });

const uS = new THREE.Shape();
uS.moveTo(-1.25, 3.55);
uS.lineTo(-1.25, 1.8);
uS.absarc(0, 1.8, 1.25, PI, PI * 2, false);
uS.lineTo(1.25, 3.55);
uS.lineTo(0.65, 3.55);
uS.lineTo(0.65, 1.8);
uS.absarc(0, 1.8, 0.65, PI * 2, PI, true);
uS.lineTo(-0.65, 3.55);
uS.closePath();
const uG = new THREE.ExtrudeGeometry(uS, { depth: 1.1, steps: 40, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.015, bevelThickness: 0.015 });
uG.translate(0, 0, -0.55);
const P = uG.attributes.position;
for (let i = 0; i < P.count; i++) {
    let x = P.getX(i),
        y = P.getY(i),
        z = P.getZ(i);
    if (y >= 1.65 && Math.abs(x) < 1.15 && Math.abs(z) < 0.85) { let f = y < 1.95 ? Math.max(0, (y - 1.65) / 0.3) : 1;
        f = f * f * (3 - 2 * f);
        let tx = Math.sqrt(0.85 * 0.85 - z * z);
        if (tx > 0.65) P.setX(i, Math.sign(x) * (0.65 + (tx - 0.65) * f)); }
}
uG.computeVertexNormals();
M(uG, mag, iG);

// Core Rod & Suspension Thread
M(C(0.04, 0.04, 1.8, 24), steel, coG, [0, -0.55, 0]);
M(C(0.05, 0.05, 0.12, 24), brass, coG, [0, 0.22, 0]);
M(C(0.05, 0.05, 0.12, 24), brass, coG, [0, -1.26, 0]);
M(C(0.08, 0.08, 0.3, 24), brass, coG, [0, 2.62, 0]);
M(C(0.012, 0.012, 2.4, 16), redGold, coG, [0, 1.42, 0]);

// Mirror Assembly
M(C(0.025, 0.025, 0.06, 16), silv, miG);
M(C(0.22, 0.22, 0.015), silv, miG, [0, 0, 0.03], [PI2, 0, 0]);
M(T(0.205, 0.01), steel, miG, [0, 0, 0.039]);
const mir = M(new THREE.CircleGeometry(0.2, 32), mirr, miG, [0, 0, 0.039]);

const RRS = (w, h, r) => { const s = new THREE.Shape(),
        x = -w / 2,
        y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.absarc(x + w - r, y + r, r, -PI2, 0);
    s.lineTo(x + w, y + h - r);
    s.absarc(x + w - r, y + h - r, r, 0, PI2);
    s.lineTo(x + r, y + h);
    s.absarc(x + r, y + h - r, r, PI2, PI);
    s.lineTo(x, y + r);
    s.absarc(x + r, y + r, r, PI, PI * 1.5);
    return s; };
const oS = RRS(0.82, 1.18, 0.16),
    iS = RRS(0.74, 1.10, 0.12);
oS.holes.push(iS);
const fGe = new THREE.ExtrudeGeometry(oS, { depth: 0.36, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.01, bevelThickness: 0.01 });
fGe.center();
M(fGe, form, coG, [0, -0.55, 0]);

const hel = new HRRectCurve(0.427, 0.607, 0.177, 28.5, -0.168, 0.168);
M(new THREE.TubeGeometry(hel, 1368, 0.007, 8, false), cop, coG, [0, -0.55, 0]);
M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(0, 0.71, 0), V3(0, 0.71, -0.168), hel.getPoint(0)]), 20, 0.007, 8, false), cop, coG, [0, -0.55, 0]);
M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([hel.getPoint(1), V3(0, -0.71, 0.168), V3(0, -0.71, 0)]), 20, 0.007, 8, false), cop, coG, [0, -0.55, 0]);

let tSp, bSp, lastSpringDeflection = Number.NaN;
const hS = (t, d) => { const p = [],
        y = t ? 3.36 : 1.94,
        x = t ? 0.12 : -0.12,
        A = Math.atan2(-0.3, x),
        tA = (t ? 1 : -1) * 6.4 * PI,
        iA = A - tA + d;
    for (let i = 0; i <= 160; i++) { const f = i / 160,
            r = 0.055 + f * (Math.hypot(x, -0.3) - 0.055),
            g = iA + f * (A - iA);
        p.push(V3(r * Math.cos(g), y, r * Math.sin(g))); }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p), 180, 0.008, 8, false); };
const uSpg = d => {
    // Rebuilding both spring tubes on every physics tick causes avoidable GC stalls.
    if (Number.isFinite(lastSpringDeflection) && Math.abs(d - lastSpringDeflection) < 0.015) return;
    lastSpringDeflection = d;
    if (tSp) { tSp.geometry.dispose();
        tSp.geometry = hS(1, d); } else tSp = M(hS(1, d), steel, iG); if (bSp) { bSp.geometry.dispose();
        bSp.geometry = hS(0, d); } else bSp = M(hS(0, d), steel, iG); };
uSpg(0);

// ============================================
// FIX 2: Internal Wires - Updated endpoints to Y=0.94
// ============================================

const TW = (pts, m) => M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => V3(...p))), 120, 0.016, 8, false), m, iG);

// RED internal lead - terminates at Y=0.94
TW([
    [0.12, 3.36, -0.3],
    [0.24, 3.36, -0.65],
    [0.36, 3.36, -0.88],
    [0.36, 0.44, -0.88],
    [0.36, 0.43, -0.4],
    [0.55, 0.43, 0.5],
    [0.85, 0.43, 1.5],
    [0.85, 0.43, 2.3],
    [0.85, 0.94, 2.45]
], rWr);

// BLACK internal lead - terminates at Y=0.94
TW([
    [-0.12, 1.94, -0.3],
    [-0.24, 1.94, -0.65],
    [-0.36, 1.94, -0.88],
    [-0.36, 0.44, -0.88],
    [-0.36, 0.43, -0.4],
    [-0.55, 0.43, 0.5],
    [-0.85, 0.43, 1.5],
    [-0.85, 0.43, 2.3],
    [-0.85, 0.94, 2.45]
], bWr);

// --- STAND & SCALE ASSEMBLY ---
M(B(1.5, 0.18, 1.5), steel, lG, [0, 0.09, 0]);
M(C(0.35, 0.45, 0.22), steel, lG, [0, 0.28, 0]);
M(C(0.12, 0.12, 6.4), steel, lG, [0, 3.4, 0]);

M(C(0.24, 0.24, 0.7), steel, scG, [0, 0, 0]);
M(C(0.06, 0.06, 0.35), steel, scG, [0, 0, 0.25], [PI2, 0, 0]);
M(C(0.14, 0.14, 0.1), steel, scG, [0, 0, 0.38], [PI2, 0, 0]);
M(B(0.24, 0.2, 0.6), steel, scG, [0, -0.6, -0.32]);
const bw = new THREE.Shape();
bw.moveTo(-1.6, 0.35);
bw.quadraticCurveTo(0, -0.45, 1.6, 0.35);
bw.lineTo(1.6, 0.15);
bw.quadraticCurveTo(0, -0.65, -1.6, 0.15);
bw.closePath();
M(new THREE.ExtrudeGeometry(bw, { depth: 0.12, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.02, bevelThickness: 0.02 }), steel, scG, [0, -0.5, -0.58]);
[-1.4, 1.4].forEach(x => { M(B(0.18, 0.85, 0.24), steel, scG, [x, -0.05, -0.52]);
    M(B(0.2, 0.65, 0.06), steel, scG, [x, -0.05, -0.66]);
    M(B(0.2, 0.65, 0.06), steel, scG, [x, -0.05, -0.38]);
    M(C(0.04, 0.04, 0.28), steel, scG, [x, 0.43, -0.52]);
    M(C(0.09, 0.09, 0.12), steel, scG, [x, 0.53, -0.52]); });
M(B(3.6, 0.72, 0.1), wood, scG, [0, 0, -0.64]);
const sBd = M(B(3.5, 0.58, 0.01), scBd, scG, [0, 0, -0.695]);

// Lamp Mount
M(C(0.22, 0.22, 0.35), steel, lpG, [0, 0, 0]);
M(C(0.06, 0.06, 0.45), steel, lpG, [0, 0, -0.22], [PI2, 0, 0]);

const lampCylGeom = new THREE.CylinderGeometry(0.24, 0.24, 0.5, 32);
lampCylGeom.rotateX(PI2);

M(lampCylGeom, steel, bxG, [0, 0, 0]);
M(new THREE.CylinderGeometry(0.25, 0.25, 0.06, 32).rotateX(PI2), brass, bxG, [0, 0, 0.25]);
M(T(0.25, 0.025), steel, bxG, [0, 0, -0.25]);

const lLn = M(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 32).rotateX(PI2), brass, bxG, [0, 0, -0.26]);
const lensDomeGeom = new THREE.SphereGeometry(0.21, 32, 16, 0, PI * 2, 0, PI / 2);
lensDomeGeom.rotateX(-PI2);
M(lensDomeGeom, glassCrystal, bxG, [0, 0, -0.27]);

const mkB = (r, m) => { const x = M(C(0.025, r, 1, 16), m, bmG);
    x.geometry.translate(0, 0.5, 0);
    x.geometry.rotateX(PI2);
    return x; };
const iBm = mkB(0.025, lBm),
    rBm = mkB(0.045, lBm),
    sPt = M(new THREE.CircleGeometry(0.09, 32), lSp, scn);

// --- REALISTIC OPTICS ENGINE ---
const vC = () => V3(),
    qC = () => new THREE.Quaternion(),
    wMr = vC(),
    wLm = vC(),
    sP = vC(),
    sD = vC(),
    hP = vC(),
    sPl = new THREE.Plane(),
    mPl = new THREE.Plane(),
    rRy = new THREE.Ray();

const iWn = (p1, p2) => {
    const dx = p2.x - p1.x,
        dz = p2.z - p1.z,
        A = dx * dx + dz * dz,
        B = 2 * (p1.x * dx + p1.z * dz),
        C = p1.x * p1.x + p1.z * p1.z - 3.8025,
        d = B * B - 4 * A * C;

    if (A < 1e-6 || d < 0) return true;

    const sq = Math.sqrt(d),
        t1 = (-B - sq) / (2 * A),
        t2 = (-B + sq) / (2 * A),
        t = (t1 >= 0 && t1 <= 1)
            ? t1
            : ((t2 >= 0 && t2 <= 1) ? t2 : -1);

    if (t < 0) return true;

    return p1.z + t * dz < 0.2
        ? false
        : Math.hypot(
            p1.x + t * dx,
            p1.y + t * (p2.y - p1.y) - 4.30
        ) <= 0.75;
};

// ============================================================
// MONITOR T OPTICAL OBSERVATION STATE
// Only the reflected spot position is exposed.
// No apparatus geometry is exposed to Monitor T.
// ============================================================

window.ballisticGalvanometerObservation = {
    visible: false,
    x: 0,
    readingCm: 0,
    normalized: 0
};

const uRt = () => {

    // Default monitor state = no light spot.
    window.ballisticGalvanometerObservation.visible = false;

    mir.getWorldPosition(wMr);

    bxG.updateMatrixWorld();

    lLn.getWorldPosition(wLm);

    const mQ = qC();

    mir.getWorldQuaternion(mQ);

    // Incoming ray: lamp -> mirror
    const inc = wMr.clone().sub(wLm).normalize();

    // Hide physical optical rays / spot initially.
    const hd = () => {
        iBm.visible = false;
        rBm.visible = false;
        sPt.visible = false;

        window.ballisticGalvanometerObservation.visible = false;
    };

    // No optical path / lights off.
    if (!iWn(wLm, wMr) || window.labLightsOn === false) {
        return hd();
    }

    // Mirror normal
    const mN = V3(0, 0, 1)
        .applyQuaternion(mQ)
        .normalize();

    const csI = inc.dot(mN);

    mPl.setFromNormalAndCoplanarPoint(mN, wMr);

    const hM = vC();

    // Incoming ray intersects mirror.
    if (
        csI < -0.05 &&
        new THREE.Ray(wLm, inc).intersectPlane(mPl, hM) &&
        hM.distanceTo(wMr) <= 0.2
    ) {

        // ----------------------------------------------------
        // 1. INCIDENT BEAM
        // ----------------------------------------------------

        const localLm = bmG.worldToLocal(wLm.clone());
        const localHM = bmG.worldToLocal(hM.clone());

        const localInc = localHM
            .clone()
            .sub(localLm)
            .normalize();

        iBm.position.copy(localLm);

        iBm.scale.set(
            1,
            1,
            localLm.distanceTo(localHM)
        );

        iBm.quaternion.setFromUnitVectors(
            V3(0, 0, 1),
            localInc
        );

        iBm.visible = true;

        // ----------------------------------------------------
        // 2. REFLECTION FROM MIRROR
        // ----------------------------------------------------

        const rfl = inc
            .clone()
            .sub(mN.multiplyScalar(2 * csI))
            .normalize();

        sBd.getWorldPosition(sP);
        sBd.getWorldDirection(sD);

        const sN = sD.clone().negate();

        sPl.setFromNormalAndCoplanarPoint(
            sN,
            sP
        );

        rRy.set(hM, rfl);

        // Reflected ray intersects scale plane.
        if (
            rRy.intersectPlane(sPl, hP) &&
            iWn(hM, hP)
        ) {

            // ------------------------------------------------
            // 3. REFLECTED BEAM
            // ------------------------------------------------

            const localHP = bmG.worldToLocal(hP.clone());

            const localRfl = localHP
                .clone()
                .sub(localHM)
                .normalize();

            rBm.position.copy(localHM);

            rBm.scale.set(
                1,
                1,
                localHM.distanceTo(localHP)
            );

            rBm.quaternion.setFromUnitVectors(
                V3(0, 0, 1),
                localRfl
            );

            rBm.visible = true;

            // ------------------------------------------------
            // 4. SCALE HIT POSITION
            // ------------------------------------------------

            const lSp = sBd.worldToLocal(
                hP.clone()
            );

            // Scale width = 3.5
            // Therefore valid optical region:
            // X = -1.75 ... +1.75
            if (
                Math.abs(lSp.x) <= 1.75 &&
                Math.abs(lSp.y) <= 0.29
            ) {

                // Physical apparatus spot
                sPt.position
                    .copy(hP)
                    .add(sN.multiplyScalar(0.01));

                sBd.getWorldQuaternion(mQ);

                sPt.quaternion.copy(mQ);

                sPt.visible = true;

                // ====================================================
                // MONITOR T DATA
                // ====================================================

                const clampedX = THREE.MathUtils.clamp(
                    lSp.x,
                    -1.75,
                    1.75
                );

                // Convert scale coordinate to cm.
                //
                // The physical scale is:
                // left  = -50 cm
                // center = 0 cm
                // right = +50 cm
                //
                // 1.75 world units = 50 cm
                const readingCm = (
                    clampedX / 1.75
                ) * 50.0;

                const normalized = (
                    clampedX + 1.75
                ) / 3.5;

                window.ballisticGalvanometerObservation.visible = true;

                window.ballisticGalvanometerObservation.x = clampedX;

                window.ballisticGalvanometerObservation.readingCm =
                    readingCm;

                window.ballisticGalvanometerObservation.normalized =
                    THREE.MathUtils.clamp(
                        normalized,
                        0,
                        1
                    );

            } else {

                sPt.visible = false;

                window.ballisticGalvanometerObservation.visible =
                    false;
            }

        } else {

            rBm.visible = false;
            sPt.visible = false;

            window.ballisticGalvanometerObservation.visible =
                false;
        }

    } else {

        hd();
    }
};

// --- CONTROLS & KNOB INTERACTION FIX ---
let kA = 0,
    uD = 0,
    sA = 0,
    sK = 0,
    d3 = 0,
    pM = 0,
    sim = 0,
    sT = 0;

// Get the rotary knob element - check if it exists first
const uK = $('ballistic-galvanometer-ui-rotary-knob');

// --- FIX 3: UNIFIED KNOB CONTROL & 3D SCREEN DRAG FIX ---
const uKnob = (val) => {
    val = Math.max(-135, Math.min(135, val));
    kA = val;
    aKn.rotation.y = val * PI / 180;
    miG.position.y = 1.1 + val * 0.25 / 180;

    if (uK) uK.style.transform = `rotate(${val}deg)`;
    const knobValEl = $('ballistic-galvanometer-knob-val');
    if (knobValEl) knobValEl.innerText = Math.round(val) + '°';
    const knobNumEl = $('ballistic-galvanometer-knob-num');
    if (knobNumEl) knobNumEl.value = Math.round(val);
    const knobSlider = $('ballistic-galvanometer-knob');
    if (knobSlider) knobSlider.value = Math.round(val);
    uRt();
};

// Get exact normalized device coordinates accounting for container position
const getNDCCoords = (e) => {
    const rect = apparatusHost.getBoundingClientRect();
    return {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((e.clientY - rect.top) / rect.height) * 2 + 1
    };
};

const rc = new THREE.Raycaster();
const ms = new THREE.Vector2();

window.addEventListener('pointermove', e => {
    if (d3) {
        uKnob(kA + (e.clientX - pM) * 0.8);
        pM = e.clientX;
        return;
    }
    const coords = getNDCCoords(e);
    ms.set(coords.x, coords.y);
    rc.setFromCamera(ms, cam);
    document.body.style.cursor = rc.intersectObject(aKn, true).length ? 'pointer' : 'default';
});

rnd.domElement.addEventListener('pointerdown', e => {
    const coords = getNDCCoords(e);
    ms.set(coords.x, coords.y);
    rc.setFromCamera(ms, cam);
    const hits = rc.intersectObject(aKn, true);
    if (hits.length > 0) {
        d3 = 1;
        pM = e.clientX;
        ctrl.enabled = false;
        document.body.style.cursor = 'grabbing';
        e.stopPropagation();
    }
}, true);

window.addEventListener('pointerup', () => {
    if (d3) {
        d3 = 0;
        ctrl.enabled = true;
        document.body.style.cursor = 'default';
    }
});

// --- END OF KNOB CONTROL FIX ---

const sCl = r => { coG.rotation.y = r;
    uSpg(r);
    const d = Math.round(r * 180 / PI);
    const angleSlider = $('ballistic-galvanometer-coil-angle');
    if (angleSlider) angleSlider.value = d;
    const angleValEl = $('ballistic-galvanometer-angle-val');
    if (angleValEl) angleValEl.innerText = d + '°';
    const angleNumEl = $('ballistic-galvanometer-coil-angle-num');
    if (angleNumEl) angleNumEl.value = d;
    uRt(); };

const uOp = v => {
    casing.opacity = v;
    casing.transparent = v < 0.98;
    casing.alphaTest = v >= 0.98 ? 0.5 : 0.01;
    casing.depthWrite = v > 0.1;
    casing.needsUpdate = true;
    const opacityValEl = $('ballistic-galvanometer-opacity-val');
    if (opacityValEl) opacityValEl.innerText = Math.round(v * 100) + '%';
    const numInput = $('ballistic-galvanometer-casing-opacity-num');
    if (numInput) numInput.value = Math.round(v * 100);
};

const uSd = () => {
    const v = k => parseFloat($(`ballistic-galvanometer-stand-${k}`).value);
    const lRotEl = $('ballistic-galvanometer-lamp-rot');
    const lampRot = lRotEl ? parseFloat(lRotEl.value) * PI / 180 : 0;

    lG.position.set(v('x'), 0, v('z') * 5.0);
    scG.position.y = v('scaleY');
    lpG.position.y = v('lampY');
    lG.rotation.y = v('rot') * PI / 180;

    bxG.rotation.y = lampRot - lG.rotation.y;

    ['x', 'z'].forEach(k => {
        const el = $(`ballistic-galvanometer-stand-${k}-val`);
        if (el) el.innerText = v(k).toFixed(1) + 'm';
        const numEl = $(`ballistic-galvanometer-stand-${k}-num`);
        if (numEl) numEl.value = v(k).toFixed(1);
    });
    ['scaleY', 'lampY'].forEach(k => {
        const el = $(`ballistic-galvanometer-stand-${k}-val`);
        if (el) el.innerText = v(k).toFixed(1);
        const numEl = $(`ballistic-galvanometer-stand-${k}-num`);
        if (numEl) numEl.value = v(k).toFixed(1);
    });
    const rotValEl = $('ballistic-galvanometer-stand-rot-val');
    if (rotValEl) rotValEl.innerText = Math.round(v('rot')) + '°';
    const rotNumEl = $('ballistic-galvanometer-stand-rot-num');
    if (rotNumEl) rotNumEl.value = Math.round(v('rot'));
    if (lRotEl) {
        const lampRotValEl = $('ballistic-galvanometer-lamp-rot-val');
        if (lampRotValEl) lampRotValEl.innerText = Math.round(lampRot * 180 / PI) + '°';
        const lampRotNumEl = $('ballistic-galvanometer-lamp-rot-num');
        if (lampRotNumEl) lampRotNumEl.value = Math.round(lampRot * 180 / PI);
    }
    uRt();
};

['x', 'z', 'scaleY', 'lampY', 'rot'].forEach(k => $(`ballistic-galvanometer-stand-${k}`).oninput = uSd);
if ($('ballistic-galvanometer-lamp-rot')) $('ballistic-galvanometer-lamp-rot').oninput = uSd;

// Prevent UI panel interactions from triggering OrbitControls screen rotation
const uiPanel = $('ballistic-galvanometer-ui-panel');
if (uiPanel) {
    uiPanel.addEventListener('pointerdown', e => e.stopPropagation());
}

// Casing opacity event listeners
const casingSlider = $('ballistic-galvanometer-casing-opacity');
if (casingSlider) {
    casingSlider.oninput = e => {
        const val = parseFloat(e.target.value);
        uOp(val);
        const numInput = $('ballistic-galvanometer-casing-opacity-num');
        if (numInput) numInput.value = Math.round(val * 100);
    };
}

// Coil angle event listeners
const angleSlider = $('ballistic-galvanometer-coil-angle');
if (angleSlider) {
    angleSlider.oninput = e => sCl(parseFloat(e.target.value) * PI / 180);
}

// Impulse button
const impulseBtn = $('ballistic-galvanometer-btn-impulse');
if (impulseBtn) {
    impulseBtn.onclick = () => {
        // A ballistic response may only start from an HMS flux transition.
        if (window.hmsControl) window.hmsControl.dropCoil();
    };
}

// --- FIX 2: Reset button with new camera position and 1.0m default ---
const resetBtn = $('ballistic-galvanometer-btn-reset');
if (resetBtn) {
    resetBtn.onclick = () => {
        cam.position.set(11.0, 5.5, 8.5);
        ctrl.target.set(0, 2.5, 2.5);
        sCl(0);
        // Reset knob to 0
        uKnob(0);
        const casingSlider = $('ballistic-galvanometer-casing-opacity');
        if (casingSlider) casingSlider.value = 1;
        const casingNum = $('ballistic-galvanometer-casing-opacity-num');
        if (casingNum) casingNum.value = 100;
        uOp(1);
        // Reset stand controls with both slider and number input
        const standDefaults = {
            'ballistic-galvanometer-stand-z': '1.0',
            'ballistic-galvanometer-stand-z-num': '1.0',
            'ballistic-galvanometer-stand-x': '0',
            'ballistic-galvanometer-stand-x-num': '0.0',
            'ballistic-galvanometer-stand-scaleY': '5.0',
            'ballistic-galvanometer-stand-scaleY-num': '5.0',
            'ballistic-galvanometer-stand-lampY': '3.5',
            'ballistic-galvanometer-stand-lampY-num': '3.5',
            'ballistic-galvanometer-stand-rot': '0',
            'ballistic-galvanometer-stand-rot-num': '0',
            'ballistic-galvanometer-lamp-rot': '0',
            'ballistic-galvanometer-lamp-rot-num': '0'
        };
        Object.entries(standDefaults).forEach(([id, val]) => {
            const el = $(id);
            if (el) el.value = val;
        });
        uSd();
    };
}

uOp(1);
uKnob(0);
uSd();

// Resize handler function
const resizeBallistic = () => {
    const { width, height } = apparatusHost.getBoundingClientRect();
    if (width < 2 || height < 2) return;
    cam.aspect = width / height;
    cam.updateProjectionMatrix();
    rnd.setSize(width, height, false);
};

// Immediate canvas resizing on script execution
resizeBallistic();
requestAnimationFrame(resizeBallistic);

// Window resize listener
window.addEventListener('resize', resizeBallistic);

// Existing ResizeObserver and apparatus:resize events
const ballisticStage = apparatusHost.closest('.apparatus-stage');
new ResizeObserver(resizeBallistic).observe(apparatusHost);
window.addEventListener('apparatus:resize', resizeBallistic);

const renderBallistic = rnd.render.bind(rnd);
rnd.render = (activeScene, activeCamera) => {
    if (ballisticStage.classList.contains('is-active')) {
        renderBallistic(activeScene, activeCamera);
    }
};

const anim = t => {
    requestAnimationFrame(anim);
    // The authoritative physics module integrates the circuit impulse and oscillator.
    // The existing mirror/optics consume this physical coil angle directly.
    const physicalAngle = getGalvanometerAngle();
    if (Number.isFinite(physicalAngle)) sCl(physicalAngle);
    ctrl.update();
    uRt();
    rnd.render(scn, cam);
};
anim(0);

// ============================================
// SYNC BINDINGS: Sliders ↔ Numeric Steppers
// ============================================

/**
 * Helper for bidirectional synchronization between slider and numeric stepper
 * @param {string} sliderId - ID of the range input
 * @param {string} numId - ID of the number input
 * @param {Function} onUpdate - Callback function to update the 3D scene
 * @param {boolean} isPercent - Whether the slider value represents a percentage (0-1 → 0-100)
 */
function bindInputPair(sliderId, numId, onUpdate, isPercent = false) {
    const slider = document.getElementById(sliderId);
    const numInput = document.getElementById(numId);
    if (!slider || !numInput) return;

    // Slider → Number input
    slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        numInput.value = isPercent ? Math.round(val * 100) : val;
        if (onUpdate) onUpdate(val);
    });

    // Number input → Slider
    numInput.addEventListener('input', () => {
        const val = parseFloat(numInput.value);
        if (!isNaN(val)) {
            const min = parseFloat(slider.min);
            const max = parseFloat(slider.max);
            const clampedVal = Math.min(max, Math.max(min, val));
            const sliderVal = isPercent ? clampedVal / 100 : clampedVal;
            slider.value = sliderVal;
            if (onUpdate) onUpdate(sliderVal);
        }
    });
}

// Attach bindings to all ballistic controls
// For casing opacity, we use a wrapper that passes the value to uOp
bindInputPair('ballistic-galvanometer-casing-opacity', 'ballistic-galvanometer-casing-opacity-num', (val) => {
    uOp(val);
}, true);

// Zero Adjuster Knob - bind the slider to the number input using uKnob
bindInputPair('ballistic-galvanometer-knob', 'ballistic-galvanometer-knob-num', (val) => {
    uKnob(val);
});

bindInputPair('ballistic-galvanometer-coil-angle', 'ballistic-galvanometer-coil-angle-num', (val) => {
    sCl(val * PI / 180);
});

bindInputPair('ballistic-galvanometer-stand-z', 'ballistic-galvanometer-stand-z-num', uSd);
bindInputPair('ballistic-galvanometer-stand-x', 'ballistic-galvanometer-stand-x-num', uSd);
bindInputPair('ballistic-galvanometer-stand-scaleY', 'ballistic-galvanometer-stand-scaleY-num', uSd);
bindInputPair('ballistic-galvanometer-stand-rot', 'ballistic-galvanometer-stand-rot-num', uSd);
bindInputPair('ballistic-galvanometer-stand-lampY', 'ballistic-galvanometer-stand-lampY-num', uSd);
bindInputPair('ballistic-galvanometer-lamp-rot', 'ballistic-galvanometer-lamp-rot-num', uSd);

// ============================================
// SINGLE-OPEN ACCORDION BEHAVIOR
// ============================================

// Enforce single active container restriction across all browsers
document.querySelectorAll('#ballistic-galvanometer-ui-panel details.bg-accordion-group').forEach((targetDetail) => {
    targetDetail.addEventListener('toggle', () => {
        if (targetDetail.open) {
            document.querySelectorAll('#ballistic-galvanometer-ui-panel details.bg-accordion-group').forEach((detail) => {
                if (detail !== targetDetail) detail.open = false;
            });
        }
    });
});

window.bgKnobControl = {
    rotate: uKnob
};

// ============================================
// TERMINAL INTEGRATION - FIXED
// ============================================
//
// The physical binding posts are:
//   RED   -> x = +0.85, y ≈ 0.94, z = 2.45
//   BLACK -> x = -0.85, y ≈ 0.94, z = 2.45
//
// Do NOT search child.position here.
// The coloured post meshes are children of post groups,
// so child.position is local to those groups.
//
// Instead, create explicit terminal anchors at the
// actual electrical connection points.

const terminalGroup = new THREE.Group();
terminalGroup.name = 'BG-Terminals';
terminalGroup.userData.isTerminalGroup = true;

const BG_RED_POS = new THREE.Vector3(0.85, 0.94, 2.45);
const BG_BLACK_POS = new THREE.Vector3(-0.85, 0.94, 2.45);

function createBGTerminal(id, position, color) {
    const anchor = new THREE.Group();

    anchor.name = `${id}-anchor`;
    anchor.position.copy(position);

    anchor.userData.isTerminal = true;
    anchor.userData.terminalId = id;
    anchor.userData.apparatusId = 'ballistic-galvanometer';
    anchor.userData.isTerminalHit = true;

    // Small visible locator for debugging / easier clicking.
    const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 16, 16),
        new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.25,
            depthTest: false
        })
    );

    marker.userData.isTerminalHit = true;
    anchor.add(marker);

    // Actual terminal interaction object.
    const terminal = addTerminal(
        anchor,
        id,
        new THREE.Vector3(0, 0, 0)
    );

    terminal.userData.isTerminalHit = true;
    terminal.userData.isTerminal = true;
    terminal.userData.terminalId = id;
    terminal.userData.apparatusId = 'ballistic-galvanometer';

    terminalGroup.add(anchor);

    return terminal;
}

const redTerminal = createBGTerminal(
    'BG_RED',
    BG_RED_POS,
    0xff0000
);

const blackTerminal = createBGTerminal(
    'BG_BLACK',
    BG_BLACK_POS,
    0x111111
);

mG.add(terminalGroup);

// ============================================
// EXPORT
// ============================================

export const getModel = () => {
    const pivot = new THREE.Group();
    pivot.add(mG);
    pivot.add(lG);
    pivot.add(bmG);
    return pivot;
};

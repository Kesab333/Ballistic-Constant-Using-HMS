import * as THREE from 'three';
import { getLabEnvironmentClone, getMonitorTPreviewTexture } from './lab-scene.js';

const DASHBOARD_SECTIONS = [
  { id: 'diagram', title: 'Diagram', iconSrc: './images/diagram.svg', workspace: 'diagram' },
  { id: 'formula', title: 'Formula', iconSrc: './images/formula.svg', workspace: 'formula' },
  { id: 'simulation', title: 'Simulation', iconSrc: './images/simulation.svg', workspace: 'simulation' },
  { id: 'observation', title: 'Observation', iconSrc: './images/observation.svg', workspace: 'observation' },
  { id: 'graphs', title: 'Live Graph', iconSrc: './images/graphbutton.svg', workspace: 'graphs' },
  { id: 'calculation', title: 'Calculation', iconSrc: './images/calculation.svg', workspace: 'calculation' },
  { id: 'results', title: 'Results', iconSrc: './images/results.svg', workspace: 'results' }
];

/**
 * Initialise the dashboard for Project 2 (Hibbert's Standard & Ballistic Galvanometer).
 */
export function initDashboard({ onSelectSection, onReturnHome } = {}) {
  const dashboardView = document.getElementById('dashboardView');
  if (!dashboardView) {
    console.warn('[Dashboard] #dashboardView container not found in HTML.');
    return null;
  }

  // Inject dashboard cards
  dashboardView.innerHTML = `
    <div class="dashboard-cards-grid">
      ${DASHBOARD_SECTIONS.map(sec => `
        <div class="dash-preview-card" data-section="${sec.workspace}" tabindex="0" role="button" aria-label="Open ${sec.title}">
          <div class="dash-preview-area">
            <!-- Specific section background preview -->
            <div class="dash-preview-content" id="dashPreview_${sec.id}">
              ${getCardPreviewHTML(sec.id)}
            </div>

            <!-- Top-right corner section badge -->
            <div class="dash-preview-badge" title="${sec.title}">
              <img src="${sec.iconSrc}" alt="${sec.title} icon" class="dash-icon-img" draggable="false" />
            </div>
          </div>
          <div class="dash-card-label">
            <span>${sec.title}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // Render LaTeX on Formula card
  renderFormulaCardLatex();

  // Initialize interactive preview loops
  initLiveGraphPreview();
  initObservationFluctuation();
  initSimulationMiniPreview();

  // Card click -> open section
  dashboardView.querySelectorAll('.dash-preview-card').forEach(card => {
    const handler = () => {
      const sectionId = card.dataset.section;
      openSection(sectionId);
    };
    card.addEventListener('click', handler);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
    });
  });

  // Wire up all close buttons across the app
  document.querySelectorAll('.dashboard-close-btn, #dashboardCloseBtn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showDashboard();
    });
  });

  // Listen to sidebar link clicks so clicking sidebar dismisses dashboard if active
  document.querySelectorAll('.workspace-link').forEach(link => {
    link.addEventListener('click', () => {
      document.body.classList.remove('dashboard-active');
      document.documentElement.classList.remove('dashboard-active');
      document.documentElement.style.removeProperty('height');
      document.body.style.removeProperty('height');
      document.body.style.removeProperty('min-height');
      document.querySelector('.container')?.style.removeProperty('min-height');
    });
  });

  function showDashboard() {
    document.body.classList.add('dashboard-active');
    document.documentElement.classList.add('dashboard-active');

    document.documentElement.style.setProperty('height', 'auto', 'important');
    document.body.style.setProperty('height', 'auto', 'important');
    document.body.style.setProperty('min-height', '0', 'important');
    document.querySelector('.container')?.style.setProperty('min-height', '0', 'important');

    // Deactivate sidebar highlights
    document.querySelectorAll('.workspace-link').forEach(l => l.classList.remove('is-active'));
    
    // Enforce dashboard visibility even when mobile layout rules use !important.
    document.querySelectorAll('.main__task-div').forEach(sec => {
      if (sec.classList.contains('footer')) {
        sec.style.setProperty('display', 'block', 'important');
      } else {
        sec.style.setProperty('display', 'none', 'important');
      }
    });

    dashboardView.style.setProperty('display', 'flex', 'important');

    if (typeof onReturnHome === 'function') onReturnHome();
  }

  function openSection(workspaceId) {
    document.body.classList.remove('dashboard-active');
    document.documentElement.classList.remove('dashboard-active');

    document.documentElement.style.removeProperty('height');
    document.body.style.removeProperty('height');
    document.body.style.removeProperty('min-height');
    document.querySelector('.container')?.style.removeProperty('min-height');

    if (typeof window.showWorkspace === 'function') {
      window.showWorkspace(workspaceId);
    } else {
      const targetSec = document.getElementById(workspaceId);
      if (targetSec) {
        document.querySelectorAll('.main__task-div').forEach(sec => {
          if (sec.tagName !== 'FOOTER') sec.style.display = (sec.id === workspaceId ? 'flex' : 'none');
        });
      }
    }

    // Highlight correct sidebar item
    document.querySelectorAll('.workspace-link').forEach(link => {
      link.classList.toggle('is-active', link.dataset.workspace === workspaceId);
    });

    if (typeof onSelectSection === 'function') onSelectSection(workspaceId);
  }

  // Start in dashboard mode
  showDashboard();

  return { showDashboard, openSection };
}

// ============================================================
// Preview HTML Templates
// ============================================================

function getCardPreviewHTML(sectionId) {
  switch (sectionId) {
    case 'diagram':
      return `
        <div class="dash-diagram-bg">
          <img src="images/ballistic-galvanometer-circuit_diagram.png" alt="Ballistic Galvanometer Circuit Preview" class="dash-diagram-img" />
        </div>
      `;

    case 'formula':
      return `
        <div class="dash-formula-bg">
          <div id="dashFormulaLatex" class="dash-formula-primary">
            \\theta_0 = \\theta_1 \\left( \\frac{\\theta_1}{\\theta_3} \\right)^{\\frac{1}{4}}
          </div>
        </div>
      `;

    case 'simulation':
      return `
        <div class="dash-sim-bg">
          <canvas id="dashSimMiniCanvas" class="dash-sim-canvas"></canvas>
        </div>
      `;

    case 'observation':
      return `
        <div class="dash-obs-bg">
          <div class="dash-obs-tag">
            <span class="dash-obs-pulse"></span>
            <span>Live Readings Table</span>
          </div>
          <table class="dash-obs-table">
            <thead>
              <tr>
                <th>Trial</th>
                <th>R (kΩ)</th>
                <th>θ₁ (cm)</th>
                <th>θ₃ (cm)</th>
                <th>θ₀ (cm)</th>
              </tr>
            </thead>
            <tbody id="dashObsTableBody">
              <tr class="active-row">
                <td>#1</td>
                <td id="dashObsR">5.00</td>
                <td id="dashObsT1">18.42</td>
                <td id="dashObsT3">12.18</td>
                <td id="dashObsT0">19.85</td>
              </tr>
              <tr>
                <td>#2</td>
                <td>10.00</td>
                <td>11.20</td>
                <td>7.40</td>
                <td>12.08</td>
              </tr>
              <tr>
                <td>#3</td>
                <td>15.00</td>
                <td>7.85</td>
                <td>5.12</td>
                <td>8.46</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;

    case 'graphs':
      return `
        <div class="dash-graph-bg">
          <span class="dash-graph-label">Galvanometer Deflection θ vs Time (t)</span>
          <canvas id="dashGraphCanvas" class="dash-graph-canvas"></canvas>
        </div>
      `;

    case 'calculation':
      return `
        <div class="dash-calc-bg">
          <div class="dash-calc-step">
            <span class="dash-calc-step-title">Step 1: Delivered Charge (Q)</span>
            <span class="dash-calc-step-formula">Q = (n · Φ) / (R + r_HMS + G)</span>
            <span class="dash-calc-step-value" id="dashCalcCharge">= (100 × 0.200 mWb) / 5620 Ω = 3.559 µC</span>
          </div>
          <div class="dash-calc-step">
            <span class="dash-calc-step-title">Step 2: Damping Corrected Throw (θ₀)</span>
            <span class="dash-calc-step-formula">θ₀ = θ₁ · (θ₁ / θ₃)^(1/4)</span>
            <span class="dash-calc-step-value" id="dashCalcThrow">= 18.42 × (18.42 / 12.18)^0.25 = 19.85 cm</span>
          </div>
          <div class="dash-calc-step">
            <span class="dash-calc-step-title">Step 3: Ballistic Constant (K)</span>
            <span class="dash-calc-step-formula">K = Q / θ₀</span>
            <span class="dash-calc-step-value" id="dashCalcConstant">= 3.559 µC / 19.85 cm = 0.179 µC/cm</span>
          </div>
        </div>
      `;

    case 'results':
      return `
        <div class="dash-results-bg">
          <div class="dash-result-pill">
            <span class="dash-result-pill-label">Ballistic Constant K</span>
            <span class="dash-result-pill-val" id="dashResK">0.179 µC/cm</span>
          </div>
          <div class="dash-result-pill">
            <span class="dash-result-pill-label">Corrected Throw θ₀</span>
            <span class="dash-result-pill-val" id="dashResThrow">19.85 cm</span>
          </div>
          <div class="dash-result-pill">
            <span class="dash-result-pill-label">Delivered Charge Q</span>
            <span class="dash-result-pill-val" id="dashResQ">3.56 µC</span>
          </div>
          <div class="dash-result-pill">
            <span class="dash-result-pill-label">Galv Resistance G</span>
            <span class="dash-result-pill-val">500 Ω</span>
          </div>
        </div>
      `;

    default:
      return '';
  }
}

// ============================================================
// Interactive Loops & Renderers
// ============================================================

/**
 * Render Formula Card using KaTeX or plain text fallback
 */
function renderFormulaCardLatex() {
  const latexEl = document.getElementById('dashFormulaLatex');
  if (!latexEl) return;

  if (window.katex) {
    try {
      katex.render('\\theta_0 = \\theta_1 \\left( \\frac{\\theta_1}{\\theta_3} \\right)^{\\frac{1}{4}}', latexEl, {
        displayMode: true,
        throwOnError: false
      });
    } catch (e) {
      latexEl.innerHTML = '<em>&theta;<sub>0</sub> = &theta;<sub>1</sub> (&theta;<sub>1</sub> / &theta;<sub>3</sub>)<sup>1/4</sup></em>';
    }
  } else {
    setTimeout(renderFormulaCardLatex, 300);
  }
}

/**
 * Live Graph: Continuous moving Ballistic Galvanometer Damped Oscillation Wave
 */
let graphAnimId = null;
function initLiveGraphPreview() {
  const canvas = document.getElementById('dashGraphCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let t = 0;

  function draw() {
    if (!document.body.classList.contains('dashboard-active')) {
      graphAnimId = requestAnimationFrame(draw);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);

    if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w;
      canvas.height = h;
    }

    if (canvas.width === 0 || canvas.height === 0) {
      graphAnimId = requestAnimationFrame(draw);
      return;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    const width = rect.width;
    const height = rect.height;

    // Background: Pure White
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Light-grey horizontal grid lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    const numGridLines = 5;
    for (let i = 1; i < numGridLines; i++) {
      const y = (height / numGridLines) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Center Zero Baseline
    const centerY = height / 2;
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // Damped Ballistic Galvanometer Oscillatory Wave
    ctx.strokeStyle = '#089b93';
    ctx.lineWidth = 2.0;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    t += 0.045; // smooth scrolling speed

    // Damped harmonic motion with successive peaks
    const wavelength = 65; // period in pixels
    const damping = 0.0035;

    for (let x = 0; x <= width; x += 1.5) {
      const phase = (x / wavelength) * Math.PI * 2 - t;
      const decayFactor = Math.exp(-((x % (width * 0.95)) * damping));
      const envelope = 0.38 * height * decayFactor;
      const y = centerY - Math.sin(phase) * envelope;

      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.restore();
    graphAnimId = requestAnimationFrame(draw);
  }

  if (graphAnimId) cancelAnimationFrame(graphAnimId);
  graphAnimId = requestAnimationFrame(draw);
}

/**
 * Observation Card: Dynamic fluctuating ballistic readings
 */
let obsTimer = null;
function initObservationFluctuation() {
  if (obsTimer) clearInterval(obsTimer);

  const t1El = document.getElementById('dashObsT1');
  const t3El = document.getElementById('dashObsT3');
  const t0El = document.getElementById('dashObsT0');
  const calcChargeEl = document.getElementById('dashCalcCharge');
  const calcThrowEl = document.getElementById('dashCalcThrow');
  const calcConstEl = document.getElementById('dashCalcConstant');
  const resKEl = document.getElementById('dashResK');
  const resThrowEl = document.getElementById('dashResThrow');
  const resQEl = document.getElementById('dashResQ');

  let step = 0;
  obsTimer = setInterval(() => {
    if (!document.body.classList.contains('dashboard-active')) return;

    step += 0.35;
    // Realistic subtle variations around nominal calibration
    const delta = Math.sin(step) * 0.45;
    const t1 = (18.42 + delta).toFixed(2);
    const t3 = (12.18 + delta * 0.66).toFixed(2);
    const t0 = (parseFloat(t1) * Math.pow(parseFloat(t1) / parseFloat(t3), 0.25)).toFixed(2);
    const qVal = (3.559 + Math.cos(step) * 0.04).toFixed(3);
    const kVal = (parseFloat(qVal) / parseFloat(t0)).toFixed(3);

    if (t1El) t1El.textContent = t1;
    if (t3El) t3El.textContent = t3;
    if (t0El) t0El.textContent = t0;

    // Update Calculation card
    if (calcChargeEl) calcChargeEl.textContent = `= (100 × 0.200 mWb) / 5620 Ω = ${qVal} µC`;
    if (calcThrowEl) calcThrowEl.textContent = `= ${t1} × (${t1} / ${t3})^0.25 = ${t0} cm`;
    if (calcConstEl) calcConstEl.textContent = `= ${qVal} µC / ${t0} cm = ${kVal} µC/cm`;

    // Update Results card
    if (resKEl) resKEl.textContent = `${kVal} µC/cm`;
    if (resThrowEl) resThrowEl.textContent = `${t0} cm`;
    if (resQEl) resQEl.textContent = `${qVal} µC`;
  }, 1400);
}

/**
 * Simulation Mini-Preview: rotating empty laboratory environment.
 */
let simAnimId = null;
let miniThreeInstance = null;

function initSimulationMiniPreview() {
  const canvas = document.getElementById('dashSimMiniCanvas');
  if (!canvas) return;

  if (miniThreeInstance) {
    try {
      miniThreeInstance.renderer.dispose();
    } catch (e) { /* ignore */ }
    miniThreeInstance = null;
  }
  if (simAnimId) {
    cancelAnimationFrame(simAnimId);
    simAnimId = null;
  }

  const labEnvironment = getLabEnvironmentClone();
  if (!labEnvironment) {
    window.addEventListener('lab:ready', initSimulationMiniPreview, { once: true });
    return;
  }

  const scene = new THREE.Scene();
  scene.background = labEnvironment.background || new THREE.Color(0xd9e5e8);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  const cameraTarget = new THREE.Vector3(0, 2.6, -2.5);
  const cameraRadius = 7;

  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;

  const labGroup = new THREE.Group();
  scene.add(labGroup);
  labEnvironment.children.forEach(child => labGroup.add(child));

  const monitorTTexture = getMonitorTPreviewTexture();
  if (monitorTTexture) {
    labGroup.traverse(object => {
      if (object.parent?.userData?.labRole !== 'monitor-t') return;
      if (!object.material || !object.material.map) return;
      object.material = object.material.clone();
      object.material.map = monitorTTexture;
      object.material.needsUpdate = true;
    });
  }

  miniThreeInstance = { scene, camera, renderer, labGroup };

  function resizeMiniScene() {
    const parent = canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      renderer.setSize(rect.width, rect.height, false);
    }
  }

  resizeMiniScene();

  let rotAngle = 0;
  function animateMiniSim() {
    if (!document.body.classList.contains('dashboard-active')) {
      simAnimId = requestAnimationFrame(animateMiniSim);
      return;
    }

    resizeMiniScene();

    rotAngle += 0.008;
    const orbitAngle = rotAngle % (Math.PI * 2);
    camera.position.set(
      Math.sin(orbitAngle) * cameraRadius,
      3.2,
      Math.cos(orbitAngle) * cameraRadius
    );
    camera.lookAt(cameraTarget);

    renderer.render(scene, camera);
    simAnimId = requestAnimationFrame(animateMiniSim);
  }

  if (simAnimId) cancelAnimationFrame(simAnimId);
  simAnimId = requestAnimationFrame(animateMiniSim);
}

// Auto-initialize dashboard when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initDashboard());
} else {
  initDashboard();
}

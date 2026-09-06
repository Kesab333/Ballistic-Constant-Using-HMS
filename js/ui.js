import { ballisticExperiment, configureExperimentParameters, resetBallisticExperiment, setControlSource } from './physics.js';

const $ = id => document.getElementById(id);
const number = (value, digits = 4) => Number.isFinite(value) ? value.toFixed(digits) : '—';
const manualObservations = [];
let graphNeedsRefresh = true;
let trajectoryWasActive = false;
let lastCalibrationSignature = '';
let lastTrajectoryPointCount = -1;

const FORMULAS = [
  { id: 'charge', label: 'Ballistic constant', latex: String.raw`Q=K_q\theta_0`, usage: 'Use this after each valid first throw to relate the known charge to the damping-corrected angular throw.', variables: [['Q', 'Charge delivered during the flux transition (C)'], ['K_q', 'Ballistic constant of the galvanometer (C rad⁻¹)'], ['\\theta_0', 'Damping-corrected first angular throw (rad)']] },
  { id: 'emf', label: 'Hibbert induced emf', latex: String.raw`\varepsilon=-n\frac{d\Phi}{dt}`, usage: 'Use this to describe the emf induced while the HMS coil moves and its linked magnetic flux changes.', variables: [['\\varepsilon', 'Induced electromotive force (V)'], ['n', 'Number of turns in the HMS coil'], ['\\Phi', 'Magnetic flux per turn (Wb)'], ['t', 'Time (s)']] },
  { id: 'current', label: 'Circuit current', latex: String.raw`I=\frac{\varepsilon}{R+r_{\mathrm{HMS}}+G}`, usage: 'Use this to find the induced current from the emf and the complete resistance in the discharge circuit.', variables: [['I', 'Induced circuit current (A)'], ['R', 'Resistance-box setting (Ω)'], ['r_{\\mathrm{HMS}}', 'HMS winding resistance (Ω)'], ['G', 'Galvanometer resistance (Ω)']] },
  { id: 'total-charge', label: 'Known HMS charge', latex: String.raw`Q=\int I\,dt=\frac{n\Phi}{R+r_{\mathrm{HMS}}+G}`, usage: 'Use this to calculate the known charge supplied by a complete change of HMS flux through the connected circuit.', variables: [['Q', 'Total charge through the galvanometer (C)'], ['n', 'HMS turns'], ['\\Phi', 'Maximum flux per turn (Wb)'], ['R+r_{\\mathrm{HMS}}+G', 'Total circuit resistance (Ω)']] },
  { id: 'calibration', label: 'Resistance–throw graph', latex: String.raw`\frac{1}{\theta_0}=\frac{K_q}{n\Phi}(R+r_{\mathrm{HMS}}+G)`, usage: 'Use the reciprocal corrected-throw versus resistance plot to check linearity and estimate the internal resistance.', variables: [['\\theta_0', 'Corrected first angular throw (rad)'], ['R', 'Resistance-box setting (Ω)'], ['K_q', 'Ballistic constant (C rad⁻¹)'], ['n\\Phi', 'Flux linkage of the HMS (Wb-turn)']] }
];

const DIAGRAM_INFO = {
  'images/ballistic-galvanometer-circuit_diagram.png': {
    caption: 'Ballistic galvanometer circuit used to measure the first angular throw.',
    content: `<div class="info-card"><span class="info-eyebrow">Ballistic galvanometer</span><p>A sensitive moving-coil instrument that measures charge from its first deflection.</p><div class="sidebar-equation" data-latex="Q=K_q\\theta_0"></div></div><div class="info-card"><span class="info-eyebrow">Key components</span><p><span data-latex="G"></span> is the galvanometer and <span data-latex="R"></span> sets the circuit resistance.</p></div>`
  },
  'images/HMS_Circuit_Diagram.png': {
    caption: 'HMS connection showing the magnetic standard used as the known-flux source.',
    content: `<div class="info-card"><span class="info-eyebrow">HMS</span><p><strong>Hibbert’s Magnetic Standard</strong> provides a known magnetic flux change for calibrating the galvanometer.</p><div class="sidebar-equation" data-latex="Q=\\frac{n\\Phi}{R+r_{\\mathrm{HMS}}+G}"></div></div><div class="info-card"><span class="info-eyebrow">What it supplies</span><p><span data-latex="n"></span> is the coil turns and <span data-latex="\\Phi"></span> is the marked flux per turn.</p></div>`
  },
  'images/lab_circuit_Connection.png': {
    caption: 'Complete laboratory connection for recording the galvanometer first throw.',
    content: `<div class="info-card"><span class="info-eyebrow">Complete connection</span><p>This view combines the HMS, resistance box, tapping switch, commutator, and ballistic galvanometer.</p></div><div class="info-card"><span class="info-eyebrow">Before release</span><ol><li>Set <span data-latex="R"></span>.</li><li>Close the circuit.</li><li>Raise the HMS coil, then release it.</li></ol></div>`
  }
};

function renderLatex(element, latex, displayMode = true) {
  if (window.katex) window.katex.render(latex, element, { displayMode, throwOnError: false });
  else element.textContent = latex;
}

function renderStaticLatex(scope = document) {
  scope.querySelectorAll?.('[data-latex]').forEach(element => renderLatex(element, element.dataset.latex, element.classList.contains('sidebar-equation')));
}

function buildCalculation() {
  const panel = $('calculation')?.querySelector('.calculation-panel');
  if (!panel) return;
  panel.innerHTML = `
    <p>Set the virtual-instrument constants, record first throws, and use the live values below to check the calibration.</p>
    <div class="ballistic-input-grid">
      
      <label>HMS turns <span data-latex="n"></span><input id="ballisticTurns" type="number" min="1" step="1" value="100"></label>
      <label>Maximum flux <span data-latex="\\Phi\\;(\\mathrm{Wb})"></span><input id="ballisticFlux" type="number" min="0" step="any" value="0.0002"></label>
      <label>Galvanometer resistance <span data-latex="G\\;(\\Omega)"></span><input id="ballisticResistance" type="number" min="0" step="any" value="500"></label>
      <label>Moment of inertia <span data-latex="J\\;(\\mathrm{kg\\,m^2})"></span><input id="ballisticInertia" type="number" min="0" step="any" value="0.000001"></label>
      <label>Torsion constant <span data-latex="S\\;(\\mathrm{N\\,m/rad})"></span><input id="ballisticTorsion" type="number" min="0" step="any" value="0.0000025"></label>
      <label>Damping coefficient <span data-latex="c\\;(\\mathrm{N\\,m\\,s/rad})"></span><input id="ballisticDamping" type="number" min="0" step="any" value="0.0000002"></label>
      <label>Torque constant <span data-latex="\\tau/I\\;(\\mathrm{N\\,m/A})"></span><input id="ballisticTorque" type="number" min="0" step="any" value="0.004"></label>
    </div>
    <div id="ballisticCalculationOutput" class="calculation-output"></div>
    <button id="ballisticResetExperiment" class="control-btn secondary" type="button">Reset observations</button>`;
  const fields = { ballisticTurns: 'turns', ballisticFlux: 'maximumFlux', ballisticResistance: 'galvanometerResistance', ballisticInertia: 'momentOfInertia', ballisticTorsion: 'torsionalConstant', ballisticDamping: 'dampingCoefficient', ballisticTorque: 'torqueConstant' };
  const update = () => {
    const values = {};
    Object.entries(fields).forEach(([id, key]) => { values[key] = Number($(id).value); });
    configureExperimentParameters(values);
  };
  Object.keys(fields).forEach(id => $(id).addEventListener('change', update));
  $('ballisticResetExperiment').addEventListener('click', resetBallisticExperiment);
  renderStaticLatex(panel); update();
}

function buildFormula() {
  const select = $('formulaSelect');
  if (!select) return;
  select.replaceChildren(...FORMULAS.map(({ id, label }) => new Option(label, id)));
  const renderFormula = () => {
    const formula = FORMULAS.find(item => item.id === select.value) || FORMULAS[0];
    if ($('formulaUsage')) $('formulaUsage').textContent = formula.usage;
    if ($('formulaLatex')) renderLatex($('formulaLatex'), formula.latex);
    if ($('formulaVariables')) {
      $('formulaVariables').innerHTML = formula.variables.map(([symbol, description]) => `<li><span class="var-symbol" data-latex="${symbol}"></span><span class="var-desc">${description}</span></li>`).join('');
      renderStaticLatex($('formulaVariables'));
    }
  };
  select.addEventListener('change', renderFormula); renderFormula();
}

function buildDiagram() {
  const img = $('ballisticDiagramImage');
  document.querySelector('map[name="circuit-labels"]')?.remove();
  if (!img) return;
  const select = $('ballisticDiagramSelect');
  const update = () => {
    const info = DIAGRAM_INFO[select?.value] || DIAGRAM_INFO['images/ballistic-galvanometer-circuit_diagram.png'];
    img.src = select?.value || img.src;
    img.alt = select?.selectedOptions[0]?.text || 'Circuit diagram';
    if ($('diagramCaption')) $('diagramCaption').textContent = info.caption;
    if ($('diagramInfo')) { $('diagramInfo').innerHTML = info.content; renderStaticLatex($('diagramInfo')); }
  };
  select?.addEventListener('change', update); update();
}

function renderManualObservations() {
  const rows = $('manualReadings');
  if (!rows) return;
  rows.replaceChildren();
  if (!manualObservations.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = 'No manual readings added.';
    row.append(cell); rows.append(row); return;
  }
  manualObservations.forEach((reading, index) => {
    const row = document.createElement('tr');
    [index + 1, reading.resistance, reading.spot, reading.theta].forEach(value => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    });
    rows.append(row);
  });
}

function buildManualObservation() {
  const form = $('manualObservationForm');
  if (!form) return;
  form.addEventListener('submit', event => {
    event.preventDefault();
    const resistance = Number($('manualResistance').value);
    const spot = Number($('manualSpot').value);
    const theta = Number($('manualTheta').value);
    if (![resistance, spot, theta].every(Number.isFinite)) return;
    manualObservations.push({ resistance: resistance.toFixed(2), spot: spot.toFixed(2), theta: theta.toFixed(5) });
    renderManualObservations(); form.reset();
  });
  renderManualObservations();
}

function formatReading(value, digits = 2) {
  return value === null || value === undefined || Number.isNaN(value) ? '—' : number(value, digits);
}

function renderObservation(state) {
  if ($('observationText')) $('observationText').textContent = `${state.validationMessage} Circuit: ${state.circuitClosed ? 'CLOSED' : 'OPEN'}; HMS coil: ${state.hms.position}.`;
  const rows = $('emfReadings');
  if (!rows) return;
  rows.innerHTML = state.observation.trials.length
    ? state.observation.trials.map(row => {
        const leftTheta1 = row.leftTheta1 ?? row.theta ?? null;
        const leftTheta3 = row.leftTheta3 ?? null;
        const leftMean = row.leftMean ?? row.theta ?? null;
        const rightTheta2 = row.rightTheta2 ?? row.theta ?? null;
        const rightTheta4 = row.rightTheta4 ?? null;
        const rightMean = row.rightMean ?? row.theta ?? null;
        const corrected = row.correctedMeanCm ?? row.correctedThrow ?? null;
        const constant = row.ballisticConstantCm ?? ((row.charge && corrected) ? row.charge / corrected : null);
        return `<tr>
          <td>${row.trial}</td>
          <td>${number(row.R, 2)}</td>
          <td>${formatReading(leftTheta1, 5)}</td>
          <td>${formatReading(leftTheta3, 5)}</td>
          <td>${formatReading(leftMean, 5)}</td>
          <td>${formatReading(rightTheta2, 5)}</td>
          <td>${formatReading(rightTheta4, 5)}</td>
          <td>${formatReading(rightMean, 5)}</td>
          <td>${formatReading(corrected, 5)}</td>
          <td>${formatReading(constant, 8)}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="10">No valid first-throw observations recorded.</td></tr>';
  renderStaticLatex(rows);
}

function calculationReadout(latex, value) {
  return `<div class="calculation-readout"><span data-latex="${latex}"></span><strong>${value}</strong></div>`;
}

function renderCalculation(state) {
  const out = $('ballisticCalculationOutput');
  if (!out) return;
  const c = state.calibration, circuit = state.circuit;
  out.innerHTML = [
    calculationReadout('n', number(state.hmsStandard.turns, 0)),
    calculationReadout('\\Phi\\;(\\mathrm{Wb/turn})', number(state.hmsStandard.maximumFlux, 7)),
    calculationReadout('r_{\\mathrm{HMS}}\\;(\\Omega)', number(state.hmsStandard.windingResistance, 2)),
    calculationReadout('R\\;(\\Omega)', number(circuit.externalResistance, 2)),
    calculationReadout('R_{\\mathrm{total}}\\;(\\Omega)', number(circuit.totalResistance, 2)),
    calculationReadout('Q\\;(\\mathrm{C})', number(circuit.charge, 8)),
    calculationReadout('K_q\\;(\\mathrm{C\\,rad^{-1}})', c.ballisticConstant === null ? 'Awaiting valid observations' : number(c.ballisticConstant, 8)),
    calculationReadout('r_{\\mathrm{HMS}}+G\\;(\\Omega)', c.fittedInternalResistance === null ? 'Requires two resistance values' : number(c.fittedInternalResistance, 2))
  ].join('');
  renderStaticLatex(out);
}

function renderResult(state) {
  const result = $('ballisticResult');
  if (!result) return;
  const c = state.calibration;
  result.innerHTML = c.ballisticConstant === null
    ? `<p><strong>Experiment status:</strong> ${state.status}</p><p><span data-latex="K_q"></span> is awaiting valid first-throw observations. Valid trials: <strong>${state.observation.trials.length}</strong>.</p>`
    : `<p><strong>Calibration complete</strong> — Ballistic galvanometer calibrated using Hibbert’s Magnetic Standard.</p><p><span data-latex="K_q=${number(c.ballisticConstant, 8)}\\;\\mathrm{C\\,rad^{-1}}"></span></p><p>Valid trials: <strong>${state.observation.trials.length}</strong>; fitted <span data-latex="r_{\\mathrm{HMS}}+G"></span> = <strong>${number(c.fittedInternalResistance, 2)} Ω</strong>.</p>`;
  renderStaticLatex(result);
}

function renderLiveReadout(state) {
  const set = (id, text) => { const el = $(id); if (el) el.textContent = text; };
  set('angleValue', `${(state.galvanometer.angle * 180 / Math.PI).toFixed(2)}°`);
  set('velocityValue', `${state.galvanometer.angularVelocity.toFixed(4)} rad/s`);
  set('fluxValue', `${((state.observation.flux || 0) * 1e3).toFixed(4)} mWb`);
  set('emfValue', `${state.circuit.emf.toFixed(5)} V`);
  set('currentValue', `${(state.circuit.current * 1e3).toFixed(4)} mA`);
  set('chargeValue', `${Math.abs(state.circuit.charge).toExponential(4)} C`);
  set('countValue', String(state.observation.trials.length));
  set('motionValue', state.circuit.transientActive ? 'Flux transition / throw' : (Math.abs(state.galvanometer.angularVelocity) > 0.004 ? 'Free oscillation' : 'Stationary'));
  set('heatValue', `${(state.circuit.energyDissipated * 1e3).toFixed(5)} mJ`);
  const fill = $('heatFill'); if (fill) fill.style.width = `${Math.min(100, state.circuit.energyDissipated * 1e8)}%`;
}

function draw(canvas, points, xKey, yKey, xLabel, yLabel) {
  if (!canvas) return;
  const cssWidth = canvas.clientWidth || 760;
  const cssHeight = canvas.clientHeight || 300;
  const scale = window.devicePixelRatio || 1;
  const pixelWidth = Math.round(cssWidth * scale), pixelHeight = Math.round(cssHeight * scale);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  const left = 58, top = 22, right = 18, bottom = 36, plotWidth = Math.max(1, cssWidth - left - right), plotHeight = Math.max(1, cssHeight - top - bottom);
  if (!points.length) {
    ctx.fillStyle = '#607170';
    ctx.font = '12px Nunito, sans-serif';
    ctx.fillText('Perform a valid throw to display this graph.', left, top + 20);
    return;
  }
  ctx.strokeStyle = '#94aaa7'; ctx.lineWidth = 1; ctx.strokeRect(left, top, plotWidth, plotHeight);
  ctx.fillStyle = '#405150'; ctx.font = '12px Nunito, sans-serif'; ctx.fillText(yLabel, 8, 16); ctx.fillText(xLabel, Math.max(left, cssWidth / 2 - 30), cssHeight - 10);
  const xs = points.map(p => p[xKey]), ys = points.map(p => p[yKey]);
  const range = values => { const lo = Math.min(...values), hi = Math.max(...values); const pad = hi === lo ? Math.max(Math.abs(lo) * .1, 1) : (hi - lo) * .06; return [lo - pad, hi + pad]; };
  const [xmin, xmax] = range(xs), [ymin, ymax] = range(ys);
  const point = p => ({ x: left + ((p[xKey] - xmin) / (xmax - xmin)) * plotWidth, y: top + (1 - (p[yKey] - ymin) / (ymax - ymin)) * plotHeight });
  ctx.strokeStyle = '#0f8f86'; ctx.lineWidth = 2; ctx.beginPath();
  points.forEach((p, i) => { const { x, y } = point(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
  ctx.fillStyle = '#087d76'; points.forEach(p => { const { x, y } = point(p); ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); });
}

function renderGraphs(state) {
  if ($('graphs')?.hidden) return;
  const calibrationPoints = state.observation.trials
    .filter(point => point.correctedThrow > 0)
    .map(point => ({ R: point.R, inverseThrow: 1 / point.correctedThrow }));
  const calibrationSignature = calibrationPoints.map(point => `${point.R}:${point.inverseThrow}`).join('|');
  if (graphNeedsRefresh || calibrationSignature !== lastCalibrationSignature) {
    draw($('ballisticCalibrationGraph'), calibrationPoints, 'R', 'inverseThrow', 'R (Ω)', '1/θ₀ (rad⁻¹)');
    lastCalibrationSignature = calibrationSignature;
  }

  const trajectoryIsActive = state.circuit.transientActive || Math.abs(state.galvanometer.angularVelocity) > 0.004;
  const trajectoryChangedDuringThrow = trajectoryIsActive && state.observation.trajectory.length !== lastTrajectoryPointCount;
  if (graphNeedsRefresh || trajectoryChangedDuringThrow || (trajectoryWasActive && !trajectoryIsActive)) {
    draw($('ballisticTrajectoryGraph'), state.observation.trajectory, 'time', 'angle', 't (s)', 'θ (rad)');
    lastTrajectoryPointCount = state.observation.trajectory.length;
  }
  trajectoryWasActive = trajectoryIsActive;
  graphNeedsRefresh = false;
}

function render(state = ballisticExperiment) { renderObservation(state); renderCalculation(state); renderResult(state); renderLiveReadout(state); renderGraphs(state); }
buildCalculation(); buildFormula(); buildDiagram(); buildManualObservation(); renderStaticLatex();
window.addEventListener('ballistic:statechange', event => render(event.detail));
window.addEventListener('workspace:change', () => { graphNeedsRefresh = true; render(); });
window.addEventListener('resize', () => { graphNeedsRefresh = true; render(); });
window.addEventListener('load', () => {
  const selectedFormula = FORMULAS.find(item => item.id === $('formulaSelect')?.value) || FORMULAS[0];
  if ($('formulaLatex')) renderLatex($('formulaLatex'), selectedFormula.latex);
  renderStaticLatex();
  graphNeedsRefresh = true;
  render();
});
render();

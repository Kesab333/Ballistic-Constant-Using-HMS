// Authoritative SI model for the Hibbert magnetic-standard / ballistic-galvanometer experiment.
// The HMS nameplate gives 20,000 maxwells = 2.000e-4 Wb per turn and 100 turns.

const now = () => performance.now() / 1000;
const HMS_WINDING_RESISTANCE = 12.45; // ohm, marked on the HMS nameplate

export const ballisticExperiment = {
  mode: 'HMS', controlSource: 'HMS', circuitClosed: false,
  hms: { leverPosition: 'DOWN', motionState: 'REST', coilPosition: 0, minPosition: 0, maxPosition: 1 },
  hmsStandard: { turns: 100, maximumFlux: 2e-4, windingResistance: HMS_WINDING_RESISTANCE, position: 'DOWN' },
  galvanometer: {
    resistance: 500, angle: 0, angularVelocity: 0,
    firstThrow: null, firstThrowSpotCm: null, correctedThrow: null,
    period: null, dampingLogarithmicDecrement: null
  },
  circuit: {
    totalResistance: null, externalResistance: null, emf: 0, current: 0, charge: 0,
    expectedCharge: null, energyDissipated: 0, transientActive: false, eventStartTime: null, eventEndTime: null
  },
  calibration: {
    ballisticConstant: null, mechanicalBallisticConstant: null, fittedInternalResistance: null,
    slope: null, intercept: null
  },
  observation: { liveThrow: null, correctedThrow: null, charge: null, flux: null, ballisticConstant: null, trials: [], trajectory: [] },
  // Calibrated virtual-instrument constants. They are editable in Calculation, not guessed at run time.
  mechanics: { momentOfInertia: 1.0e-6, torsionalConstant: 2.5e-6, dampingCoefficient: 2.0e-7, torqueConstant: 4.0e-3 },
  status: 'Connect the circuit, close the tapping switch, raise the HMS coil, then release it.',
  validationMessage: 'Circuit is open.', connections: []
};

const REQUIRED_EDGES = [
  ['hms_HMS_TO_COMM', 'commutator_C_NAVY_BLUE'], ['hms_HMS_TO_RB', 'resistance-box_RB_HMS_BLACK'],
  ['resistance-box_RB_ORANGE', 'commutator_C_ORANGE'], ['commutator_C_RED', 'tapping-switch_SW_RED'],
  ['tapping-switch_SW_BLACK', 'ballistic-galvanometer_BG_RED'], ['ballistic-galvanometer_BG_BLACK', 'commutator_C_SKY_BLUE']
];

let switchClosed = false, lastTime = null, lastFlux = 0, previousVelocity = 0;
let awaitingFirstThrow = false, hmsWasRaised = false, lastPublishedAt = 0;

const validNumber = (value, positive = false) => Number.isFinite(value) && (!positive || value > 0);
const edgeKey = (a, b) => [a, b].sort().join('|');

function getExternalResistance() {
  const value = window.resistanceBoxState?.resistance;
  return validNumber(value) ? value : 0;
}

function mechanicsReady() {
  const m = ballisticExperiment.mechanics;
  return validNumber(m.momentOfInertia, true) && validNumber(m.torsionalConstant, true) &&
    validNumber(m.dampingCoefficient) && validNumber(m.torqueConstant, true);
}

function updateDerivedInstrumentValues() {
  const exp = ballisticExperiment, m = exp.mechanics;
  if (!mechanicsReady()) { exp.galvanometer.period = null; exp.galvanometer.dampingLogarithmicDecrement = null; return; }
  const beta = m.dampingCoefficient / (2 * m.momentOfInertia);
  const omega0 = Math.sqrt(m.torsionalConstant / m.momentOfInertia);
  const omegaD = Math.sqrt(Math.max(0, omega0 * omega0 - beta * beta));
  exp.galvanometer.period = omegaD ? (2 * Math.PI / omegaD) : null;
  exp.galvanometer.dampingLogarithmicDecrement = omegaD ? (2 * Math.PI * beta / omegaD) : null;
  // Q/theta_first for an impulsive charge, from Jθ'' + cθ' + Sθ = Kt I.
  if (omegaD) {
    const peakTime = Math.atan2(omegaD, beta) / omegaD;
    exp.calibration.mechanicalBallisticConstant = (m.momentOfInertia * omegaD / m.torqueConstant) * Math.exp(beta * peakTime);
  }
}

function updateCircuitState() {
  const keys = new Set(ballisticExperiment.connections.map(({ from, to }) => edgeKey(from, to)));
  const topologyComplete = REQUIRED_EDGES.every(([a, b]) => keys.has(edgeKey(a, b)));
  const exp = ballisticExperiment;
  exp.circuit.externalResistance = getExternalResistance();
  exp.circuit.totalResistance = exp.circuit.externalResistance + exp.galvanometer.resistance + exp.hmsStandard.windingResistance;
  exp.circuit.expectedCharge = validNumber(exp.hmsStandard.turns, true) && validNumber(exp.hmsStandard.maximumFlux, true)
    ? exp.hmsStandard.turns * exp.hmsStandard.maximumFlux / exp.circuit.totalResistance : null;
  exp.circuitClosed = topologyComplete && switchClosed;
  if (!topologyComplete) exp.validationMessage = 'Circuit open: connect HMS → resistance box → commutator → tapping switch → BG → commutator.';
  else if (!switchClosed) exp.validationMessage = 'Circuit complete. Close the tapping switch to arm the experiment.';
  else if (!exp.circuit.transientActive) exp.validationMessage = 'Circuit armed. Raise the HMS coil fully, then release it.';
  publish(true);
}

function fluxForPosition(position) {
  const hms = ballisticExperiment.hms, phiMax = ballisticExperiment.hmsStandard.maximumFlux;
  if (!validNumber(phiMax, true) || !validNumber(hms.maxPosition - hms.minPosition, true)) return null;
  const inField = Math.max(0, Math.min(1, (hms.maxPosition - position) / (hms.maxPosition - hms.minPosition)));
  // Smooth calibrated field map; its full transition is still exactly Phi_max.
  return phiMax * inField * inField * (3 - 2 * inField);
}

function correctedThrow(theta) {
  const lambda = ballisticExperiment.galvanometer.dampingLogarithmicDecrement;
  // Standard first-order ballistic damping correction: theta_0 = theta_1(1 + lambda/2).
  return validNumber(lambda) ? theta * (1 + lambda / 2) : theta;
}

function regression(rows) {
  if (rows.length < 2) return null;
  const points = rows.map(row => ({ x: row.R, y: 1 / row.correctedThrow })).filter(p => validNumber(p.y, true));
  if (points.length < 2) return null;
  const n = points.length, sx = points.reduce((a, p) => a + p.x, 0), sy = points.reduce((a, p) => a + p.y, 0);
  const sxx = points.reduce((a, p) => a + p.x * p.x, 0), sxy = points.reduce((a, p) => a + p.x * p.y, 0);
  const denominator = n * sxx - sx * sx;
  if (Math.abs(denominator) < 1e-12) return null;
  const slope = (n * sxy - sx * sy) / denominator, intercept = (sy - slope * sx) / n;
  return validNumber(slope, true) ? { slope, intercept, internalResistance: intercept / slope } : null;
}

function calculateCalibration() {
  const exp = ballisticExperiment, { turns, maximumFlux } = exp.hmsStandard;
  const validTrials = exp.observation.trials.filter(row => validNumber(row.correctedThrow, true) && validNumber(row.charge, true));
  if (!validTrials.length) { exp.calibration.ballisticConstant = null; exp.observation.ballisticConstant = null; return; }
  // Direct definition: Kq = Q/theta0, where Q=NΦ/(R+r_HMS+G).
  const constants = validTrials.map(row => row.charge / row.correctedThrow);
  exp.calibration.ballisticConstant = constants.reduce((a, b) => a + b, 0) / constants.length;
  exp.observation.ballisticConstant = exp.calibration.ballisticConstant;
  const fit = regression(validTrials);
  exp.calibration.slope = fit?.slope ?? null;
  exp.calibration.intercept = fit?.intercept ?? null;
  exp.calibration.fittedInternalResistance = fit?.internalResistance ?? null;
  // Graph: 1/theta0 = (R+r_HMS+G)/(NΦ/Kq), so Kq = slope × NΦ.
  if (fit && validNumber(turns, true) && validNumber(maximumFlux, true)) {
    exp.calibration.ballisticConstant = fit.slope * turns * maximumFlux;
    exp.observation.ballisticConstant = exp.calibration.ballisticConstant;
  }
}

function commitTrial() {
  const exp = ballisticExperiment, theta = exp.galvanometer.firstThrow;
  if (!validNumber(theta, true) || !validNumber(Math.abs(exp.circuit.charge), true)) {
    exp.validationMessage = 'No usable first throw was detected; check optical alignment and repeat from the raised position.';
    return;
  }
  const theta0 = correctedThrow(theta);
  exp.galvanometer.correctedThrow = theta0; exp.observation.correctedThrow = theta0;
  exp.observation.trials.push({
    trial: exp.observation.trials.length + 1, R: exp.circuit.externalResistance,
    spotCm: exp.galvanometer.firstThrowSpotCm, theta, correctedThrow: theta0,
    n: exp.hmsStandard.turns, flux: exp.hmsStandard.maximumFlux,
    charge: Math.abs(exp.circuit.charge), totalResistance: exp.circuit.totalResistance
  });
  calculateCalibration();
  exp.status = exp.observation.trials.length < 2 ? 'First observation recorded. Change R and repeat after the pointer returns to zero.' : 'Calibration complete.';
  exp.validationMessage = 'First throw recorded. The scale reading and damping-corrected angular throw are in the observation table.';
  publish(true);
}

function publish(force = false) {
  const timestamp = now();
  if (!force && timestamp - lastPublishedAt < 0.1) return;
  lastPublishedAt = timestamp;
  window.dispatchEvent(new CustomEvent('ballistic:statechange', { detail: ballisticExperiment }));
}

export function setElectricalConnections(connections) {
  ballisticExperiment.connections = connections.map(({ from, to, resistance = 0 }) => ({ from, to, resistance })); updateCircuitState();
}
export function setSwitchClosed(isClosed) {
  const changed = switchClosed !== Boolean(isClosed); switchClosed = Boolean(isClosed); updateCircuitState();
  if (changed && switchClosed && ballisticExperiment.controlSource === 'SWITCH' && !ballisticExperiment.circuit.transientActive) window.dispatchEvent(new CustomEvent('ballistic:external-switch-event'));
}
export function setControlSource(source) { ballisticExperiment.controlSource = source === 'SWITCH' ? 'SWITCH' : 'HMS'; publish(true); }
export function configureExperimentParameters(values) {
  const hms = ballisticExperiment.hmsStandard, galv = ballisticExperiment.galvanometer, mechanics = ballisticExperiment.mechanics;
  if ('turns' in values) hms.turns = validNumber(values.turns, true) ? values.turns : null;
  if ('maximumFlux' in values) hms.maximumFlux = validNumber(values.maximumFlux, true) ? values.maximumFlux : null;
  if ('galvanometerResistance' in values) galv.resistance = validNumber(values.galvanometerResistance, true) ? values.galvanometerResistance : null;
  for (const key of ['momentOfInertia', 'torsionalConstant', 'dampingCoefficient', 'torqueConstant']) if (key in values) mechanics[key] = validNumber(values[key], key !== 'dampingCoefficient') ? values[key] : null;
  updateDerivedInstrumentValues(); updateCircuitState();
}
export function setHMSCoilPosition(position, { minPosition, maxPosition, motionState } = {}) {
  const hms = ballisticExperiment.hms;
  if (validNumber(minPosition)) hms.minPosition = minPosition;
  if (validNumber(maxPosition)) hms.maxPosition = maxPosition;
  if (validNumber(position)) hms.coilPosition = position;
  if (motionState) hms.motionState = motionState;
  const atUpper = Math.abs(hms.coilPosition - hms.maxPosition) < 0.003;
  if (atUpper && hms.motionState === 'REST') hmsWasRaised = true;
  hms.leverPosition = atUpper ? 'UP' : (hms.motionState === 'MOVING_UP' ? 'MOVING_UP' : hms.motionState === 'MOVING_DOWN' ? 'MOVING_DOWN' : 'DOWN');
  hms.position = atUpper ? 'UP' : 'DOWN'; ballisticExperiment.hmsStandard.position = hms.position;
}

export function updateBallisticPhysics(timestamp = now()) {
  if (lastTime === null) { lastTime = timestamp; lastFlux = fluxForPosition(ballisticExperiment.hms.coilPosition) || 0; updateDerivedInstrumentValues(); return; }
  const dt = Math.min(0.032, Math.max(0.001, timestamp - lastTime)); lastTime = timestamp;
  const exp = ballisticExperiment, flux = fluxForPosition(exp.hms.coilPosition), fluxRate = flux === null ? 0 : (flux - lastFlux) / dt;
  exp.observation.flux = flux; lastFlux = flux ?? lastFlux;
  const canInduce = exp.circuitClosed && validNumber(exp.hmsStandard.turns, true) && validNumber(exp.circuit.totalResistance, true);
  // hmsWasRaised arms the *start* of a known transition.  Once started, keep
  // integrating until the coil stops; clearing the arm must not truncate Q.
  const movingFlux = canInduce && (hmsWasRaised || exp.circuit.transientActive) && Math.abs(fluxRate) > 1e-12;
  exp.circuit.emf = movingFlux ? -exp.hmsStandard.turns * fluxRate : 0;
  exp.circuit.current = movingFlux ? exp.circuit.emf / exp.circuit.totalResistance : 0;
  if (canInduce && !hmsWasRaised && Math.abs(fluxRate) > 1e-12) exp.validationMessage = 'Raise the HMS coil fully before its downward flux change; otherwise the standard flux change is not known.';
  if (movingFlux && !exp.circuit.transientActive) {
    const atRest = Math.abs(exp.galvanometer.angle) < 0.003 && Math.abs(exp.galvanometer.angularVelocity) < 0.004;
    if (!atRest) exp.validationMessage = 'Wait for the galvanometer spot to return to zero before taking the next throw.';
    else {
      exp.circuit.transientActive = true; exp.circuit.eventStartTime = timestamp; exp.circuit.charge = 0; exp.circuit.energyDissipated = 0;
      exp.galvanometer.firstThrow = null; exp.galvanometer.firstThrowSpotCm = null; exp.galvanometer.correctedThrow = null;
      exp.observation.trajectory = []; awaitingFirstThrow = mechanicsReady(); hmsWasRaised = false;
    }
  }
  if (exp.circuit.transientActive && movingFlux) {
    exp.circuit.charge += exp.circuit.current * dt;
    exp.circuit.energyDissipated += exp.circuit.current * exp.circuit.current * exp.circuit.totalResistance * dt;
  }
  const m = exp.mechanics;
  if (mechanicsReady()) {
    const torque = exp.circuit.transientActive ? exp.circuit.current * m.torqueConstant : 0;
    const acceleration = (torque - m.dampingCoefficient * exp.galvanometer.angularVelocity - m.torsionalConstant * exp.galvanometer.angle) / m.momentOfInertia;
    exp.galvanometer.angularVelocity += acceleration * dt; exp.galvanometer.angle += exp.galvanometer.angularVelocity * dt;
    const reading = window.ballisticGalvanometerObservation?.readingCm;
    // The trajectory is a record of a real throw/oscillation, not a permanent
    // idle-time trace. Keeping it empty at rest leaves the graph blank until
    // the user actually performs an experiment.
    const trajectoryActive = exp.circuit.transientActive || Math.abs(exp.galvanometer.angle) > 0.001 || Math.abs(exp.galvanometer.angularVelocity) > 0.004;
    if (trajectoryActive) {
      exp.observation.trajectory.push({ time: timestamp, angle: exp.galvanometer.angle, spot: validNumber(reading) ? reading : null });
      if (exp.observation.trajectory.length > 1200) exp.observation.trajectory.shift();
    }
    if (awaitingFirstThrow && previousVelocity !== 0 && previousVelocity * exp.galvanometer.angularVelocity <= 0 && Math.abs(exp.galvanometer.angle) > 1e-6) {
      exp.galvanometer.firstThrow = Math.abs(exp.galvanometer.angle);
      exp.galvanometer.firstThrowSpotCm = validNumber(reading) ? Math.abs(reading) : null;
      exp.observation.liveThrow = exp.galvanometer.firstThrow; awaitingFirstThrow = false; commitTrial();
    }
    previousVelocity = exp.galvanometer.angularVelocity;
  }
  if (exp.circuit.transientActive && !movingFlux && timestamp - exp.circuit.eventStartTime > 0.05) {
    exp.circuit.transientActive = false; exp.circuit.eventEndTime = timestamp;
    if (!exp.galvanometer.firstThrow) exp.validationMessage = 'Awaiting the first maximum throw.';
  }
  exp.observation.charge = Math.abs(exp.circuit.charge); publish();
}

export const getGalvanometerAngle = () => ballisticExperiment.galvanometer.angle;
export function resetBallisticExperiment() {
  const exp = ballisticExperiment; exp.observation.trials.length = 0; exp.observation.trajectory.length = 0;
  exp.calibration.ballisticConstant = null; exp.calibration.fittedInternalResistance = null; exp.calibration.slope = null; exp.calibration.intercept = null;
  exp.galvanometer.angle = 0; exp.galvanometer.angularVelocity = 0; exp.galvanometer.firstThrow = null; exp.galvanometer.correctedThrow = null;
  exp.circuit.charge = 0; exp.circuit.energyDissipated = 0; awaitingFirstThrow = false; previousVelocity = 0;
  exp.status = 'Observations cleared. Raise the HMS coil fully before release.'; publish(true);
}

window.ballisticExperiment = ballisticExperiment;
window.addEventListener('ballistic:resistance-change', updateCircuitState);

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
    firstThrow: null, thirdThrow: null, firstThrowSpotCm: null, thirdThrowSpotCm: null, correctedThrow: null,
    period: null, dampingLogarithmicDecrement: null
  },
  circuit: {
    totalResistance: null, externalResistance: null, emf: 0, current: 0, charge: 0,
    expectedCharge: null, energyDissipated: 0, transientActive: false, eventStartTime: null, eventEndTime: null
  },
  calibration: {
    ballisticConstant: null, mechanicalBallisticConstant: null, fittedInternalResistance: null,
    slope: null, intercept: null, pairConstants: []
  },
  commutator: { polarity: 1 },
  observation: { liveThrow: null, laterThrow: null, correctedThrow: null, charge: null, flux: null, ballisticConstant: null, trials: [], trajectory: [] },
  // Calibrated virtual-instrument constants. They are editable in Calculation, not guessed at run time.
  mechanics: { momentOfInertia: 1.0e-6, torsionalConstant: 2.5e-6, dampingCoefficient: 2.0e-7, torqueConstant: 4.0e-3 },
  status: 'Connect the circuit, close the tapping switch, raise the HMS coil, then release it.',
  validationMessage: 'Circuit is open.', connections: []
};

const REQUIRED_EDGES = [
  ['hms_HMS_TO_COMM', 'commutator_C_NAVY_BLUE'], ['hms_HMS_TO_RB', 'resistance-box_RB_HMS_BLACK'],
  ['resistance-box_RB_ORANGE', 'commutator_C_ORANGE'], ['commutator_C_RED', 'tapping-switch_SW_RED'],
  ['commutator_C_SKY_BLUE', 'tapping-switch_SW_BLACK'], ['tapping-switch_SW_RED', 'ballistic-galvanometer_BG_RED'],
  ['tapping-switch_SW_BLACK', 'ballistic-galvanometer_BG_BLACK']
];

let switchClosed = false, lastTime = null, lastFlux = 0, previousVelocity = 0;
let awaitingDampingPeaks = false, hmsWasRaised = false, lastPublishedAt = 0;
let recordedPeakCount = 0;

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

function correctedThrow(theta1, theta3) {
  // HMS procedure: correct the first throw using the first and third maxima.
  return validNumber(theta1, true) && validNumber(theta3, true)
    ? theta1 * Math.pow(theta1 / theta3, 0.25)
    : null;
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
  const validTrials = exp.observation.trials.filter(row => row.complete && validNumber(row.correctedThrow, true) && validNumber(row.charge, true));
  if (!validTrials.length) { exp.calibration.ballisticConstant = null; exp.observation.ballisticConstant = null; return; }
  const pairConstants = [];
  for (let i = 0; i < validTrials.length - 1; i += 1) {
    for (let j = i + 1; j < validTrials.length; j += 1) {
      const first = validTrials[i], second = validTrials[j];
      const resistanceDifference = first.R - second.R;
      const k = resistanceDifference
        ? (turns * maximumFlux / resistanceDifference) * ((second.correctedThrow - first.correctedThrow) / (first.correctedThrow * second.correctedThrow))
        : null;
      if (validNumber(k, true)) pairConstants.push({ firstTrial: first.trial, secondTrial: second.trial, value: k });
    }
  }
  exp.calibration.pairConstants = pairConstants;
  exp.calibration.ballisticConstant = pairConstants.length
    ? pairConstants.reduce((sum, pair) => sum + pair.value, 0) / pairConstants.length
    : null;
  exp.observation.ballisticConstant = exp.calibration.ballisticConstant;
  const fit = regression(validTrials);
  exp.calibration.slope = fit?.slope ?? null;
  exp.calibration.intercept = fit?.intercept ?? null;
  exp.calibration.fittedInternalResistance = fit?.internalResistance ?? null;
  // The graph remains a useful linearity check; K itself follows the prescribed pair method above.
}

function commitTrial() {
  const exp = ballisticExperiment;
  const theta1 = exp.galvanometer.firstThrow;
  const theta3 = exp.galvanometer.thirdThrow;
  const theta1Cm = exp.galvanometer.firstThrowSpotCm;
  const theta3Cm = exp.galvanometer.thirdThrowSpotCm;
  if (!validNumber(theta1, true) || !validNumber(theta3, true) || !validNumber(theta1Cm, true) || !validNumber(theta3Cm, true) || !validNumber(Math.abs(exp.circuit.charge), true)) {
    exp.validationMessage = 'A usable θ₁ and θ₃ reading is required; check the optical scale and repeat from the raised position.';
    return;
  }
  const correctedAngularThrow = correctedThrow(theta1, theta3);
  const correctedCm = correctedThrow(theta1Cm, theta3Cm);
  const isRight = exp.commutator.polarity > 0;
  let row = exp.observation.trials.find(candidate =>
    candidate.R === exp.circuit.externalResistance && candidate.n === exp.hmsStandard.turns &&
    candidate.flux === exp.hmsStandard.maximumFlux && !candidate.complete
  );
  if (!row) {
    row = {
      trial: exp.observation.trials.length + 1, R: exp.circuit.externalResistance,
      n: exp.hmsStandard.turns, flux: exp.hmsStandard.maximumFlux,
      charge: Math.abs(exp.circuit.charge), totalResistance: exp.circuit.totalResistance
    };
    exp.observation.trials.push(row);
  }
  const prefix = isRight ? 'right' : 'left';
  row[`${prefix}Theta1`] = theta1Cm;
  row[`${prefix}Theta3`] = theta3Cm;
  row[`${prefix}Corrected`] = correctedCm;
  row[`${prefix}AngularCorrected`] = correctedAngularThrow;
  row[`${prefix}Direction`] = exp.commutator.polarity;
  const readings = [row.leftCorrected, row.rightCorrected].filter(value => validNumber(value, true));
  row.correctedMeanCm = readings.length ? readings.reduce((sum, value) => sum + value, 0) / readings.length : null;
  row.correctedThrow = row.correctedMeanCm;
  row.ballisticConstantCm = row.correctedMeanCm ? row.charge / row.correctedMeanCm : null;
  row.complete = validNumber(row.leftCorrected, true) && validNumber(row.rightCorrected, true);
  exp.galvanometer.correctedThrow = correctedAngularThrow;
  exp.observation.correctedThrow = correctedAngularThrow;
  calculateCalibration();
  exp.status = row.complete
    ? 'Both current directions recorded. Set the next resistance after the spot returns to zero.'
    : `θ₁ and θ₃ recorded on the ${isRight ? 'right' : 'left'}; reverse the commutator and repeat at the same resistance.`;
  exp.validationMessage = row.complete
    ? 'Mean damping-corrected throw recorded. Change resistance only after the spot returns to zero.'
    : 'Operate the commutator, raise the HMS coil again, and record the opposite-direction θ₁ and θ₃.';
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
export function setCommutatorPolarity(polarity) {
  ballisticExperiment.commutator.polarity = Number(polarity) < 0 ? -1 : 1;
  if (!ballisticExperiment.circuit.transientActive) {
    ballisticExperiment.validationMessage = `Commutator set for ${ballisticExperiment.commutator.polarity > 0 ? 'right' : 'left'} deflection. Raise the HMS coil when ready.`;
  }
  publish(true);
}
export function setControlSource(source) { ballisticExperiment.controlSource = source === 'SWITCH' ? 'SWITCH' : 'HMS'; publish(true); }
export function simulateGalvanometerImpulse(targetAngleRadians) {
  const exp = ballisticExperiment;
  if (!mechanicsReady()) return false;
  const target = Number(targetAngleRadians);
  if (!validNumber(target) || Math.abs(target) < 1e-6) return false;
  const m = exp.mechanics;
  const beta = m.dampingCoefficient / (2 * m.momentOfInertia);
  const omega0 = Math.sqrt(m.torsionalConstant / m.momentOfInertia);
  const omegaD = Math.sqrt(Math.max(1e-9, omega0 * omega0 - beta * beta));
  // Give the coil the angular velocity that produces the requested first
  // deflection, then let the same damped physics animation run as a trial.
  exp.galvanometer.angle = 0;
  exp.galvanometer.angularVelocity = target * omegaD;
  exp.galvanometer.firstThrow = null;
  exp.galvanometer.correctedThrow = null;
  exp.observation.liveThrow = null;
  exp.observation.trajectory = [];
  awaitingDampingPeaks = false;
  previousVelocity = exp.galvanometer.angularVelocity;
  exp.status = 'Simulated charge impulse running.';
  exp.validationMessage = 'Simulated charge impulse: observe the light spot and coil deflection.';
  publish(true);
  return true;
}
export function configureExperimentParameters(values) {
  const hms = ballisticExperiment.hmsStandard, galv = ballisticExperiment.galvanometer, mechanics = ballisticExperiment.mechanics;
  const hasReadings = ballisticExperiment.observation.trials.length > 0;
  const changingStandard = ('turns' in values && Number(values.turns) !== hms.turns) || ('maximumFlux' in values && Number(values.maximumFlux) !== hms.maximumFlux);
  if (hasReadings && changingStandard) {
    ballisticExperiment.validationMessage = 'Keep the HMS turns and flux fixed for one observation set. Reset observations before changing the magnetic standard.';
    publish(true);
    return;
  }
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
  exp.circuit.current = movingFlux ? (exp.commutator.polarity * exp.circuit.emf / exp.circuit.totalResistance) : 0;
  if (canInduce && !hmsWasRaised && Math.abs(fluxRate) > 1e-12) exp.validationMessage = 'Raise the HMS coil fully before its downward flux change; otherwise the standard flux change is not known.';
  if (movingFlux && !exp.circuit.transientActive) {
    const atRest = Math.abs(exp.galvanometer.angle) < 0.003 && Math.abs(exp.galvanometer.angularVelocity) < 0.004;
    if (!atRest) exp.validationMessage = 'Wait for the galvanometer spot to return to zero before taking the next throw.';
    else {
      exp.circuit.transientActive = true; exp.circuit.eventStartTime = timestamp; exp.circuit.charge = 0; exp.circuit.energyDissipated = 0;
      exp.galvanometer.firstThrow = null; exp.galvanometer.thirdThrow = null;
      exp.galvanometer.firstThrowSpotCm = null; exp.galvanometer.thirdThrowSpotCm = null; exp.galvanometer.correctedThrow = null;
      exp.observation.liveThrow = null; exp.observation.laterThrow = null;
      exp.observation.trajectory = []; awaitingDampingPeaks = mechanicsReady(); recordedPeakCount = 0; hmsWasRaised = false;
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
    if (awaitingDampingPeaks && previousVelocity !== 0 && previousVelocity * exp.galvanometer.angularVelocity <= 0 && Math.abs(exp.galvanometer.angle) > 1e-6) {
      recordedPeakCount += 1;
      const peakAngle = Math.abs(exp.galvanometer.angle);
      const peakSpot = validNumber(reading) ? Math.abs(reading) : null;
      if (recordedPeakCount === 1) {
        exp.galvanometer.firstThrow = peakAngle;
        exp.galvanometer.firstThrowSpotCm = peakSpot;
        exp.observation.liveThrow = peakAngle;
        exp.validationMessage = 'θ₁ recorded. Allow the spot to complete the next oscillation; θ₃ will be recorded at the following maximum.';
      } else if (recordedPeakCount === 3) {
        exp.galvanometer.thirdThrow = peakAngle;
        exp.galvanometer.thirdThrowSpotCm = peakSpot;
        exp.observation.laterThrow = peakAngle;
        awaitingDampingPeaks = false;
        commitTrial();
      }
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
  exp.calibration.ballisticConstant = null; exp.calibration.fittedInternalResistance = null; exp.calibration.slope = null; exp.calibration.intercept = null; exp.calibration.pairConstants = [];
  exp.galvanometer.angle = 0; exp.galvanometer.angularVelocity = 0; exp.galvanometer.firstThrow = null; exp.galvanometer.correctedThrow = null;
  exp.circuit.charge = 0; exp.circuit.energyDissipated = 0; awaitingDampingPeaks = false; recordedPeakCount = 0; previousVelocity = 0;
  exp.status = 'Observations cleared. Raise the HMS coil fully before release.'; publish(true);
}

window.ballisticExperiment = ballisticExperiment;
window.addEventListener('ballistic:resistance-change', updateCircuitState);
window.addEventListener('commutator:polarity-change', event => setCommutatorPolarity(event.detail?.polarity));

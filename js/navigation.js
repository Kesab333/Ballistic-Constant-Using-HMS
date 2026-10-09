function showRuntimeError(error) {
  const panel = document.getElementById('apparatus-runtime-error');
  if (!panel) return;
  panel.hidden = false;
  panel.textContent = `Apparatus error: ${error}`;
}

window.addEventListener('error', (event) => {
  showRuntimeError(event.error?.message || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  showRuntimeError(event.reason?.message || String(event.reason));
});

(() => {
  const guides = {
    experiment: {
      title: 'How to perform the experiment',
      subtitle: 'Follow the complete HMS procedure: two throws per direction, then repeat for new resistance settings.',
      steps: [
        ['Start in Laboratory view', 'Open Simulation and select Laboratory. Confirm that the room light is on and that the apparatus can be seen clearly.'],
        ['Prepare the resistance box', 'Begin with the protective high setting of 5 kΩ. Keep the number of HMS turns fixed for the complete set of observations.'],
        ['Make the circuit', 'Use Auto Connect for a guided ready-to-use circuit, or use Manual Connect to join every required terminal. The circuit route is HMS → resistance box → commutator → tapping switch → ballistic galvanometer → commutator.'],
        ['Arm the circuit', 'Open the tapping switch. A closed switch bypasses the BG; the status message must say that the circuit is armed before a valid observation can be taken.'],
        ['Raise the HMS coil fully', 'Move the HMS coil all the way to its upper position and let it settle. Raising it fully establishes the known magnetic-flux transition.'],
        ['Release once', 'Release the coil and do not change resistance or switches while it is moving. The induced charge gives the galvanometer a first throw.'],
        ['Read θ₁ and θ₃', 'Read the first maximum θ₁, then allow two more extrema so the later same-side maximum θ₃ is recorded. The lab calculates θ = θ₁(θ₁/θ₃)^(1/4).'],
        ['Reverse and repeat', 'After the spot returns to zero, operate the commutator, raise the HMS coil again, and record θ₁ and θ₃ on the opposite side at the same resistance. The table then takes the mean corrected throw.'],
        ['Change resistance', 'Choose the next separated resistance (for example 6 kΩ), then repeat both directions. Complete at least two resistance settings.'],
        ['Review the result', 'Use Observation to inspect the corrected mean throws. Results reports K from all available resistance pairs and their arithmetic mean.']
      ],
      tip: 'Do not change R or commutator position during a throw. Always wait for the spot to return to zero before the next release.'
    },
    apparatus: {
      title: 'Apparatus available in this simulation',
      subtitle: 'Select an apparatus from the Simulation toolbar to open its controls.',
      steps: [
        ['Laboratory', 'Shows the complete experiment and exposes circuit actions: Auto Connect, Manual Connect, Clear Wires, and Room Light. Use this as the normal working view.'],
        ['Resistance box', 'Sets the external resistance R in the circuit. Its value directly changes total resistance, charge, and the calibration graph.'],
        ['HMS', 'Hibbert’s Magnetic Standard is the known flux source. Raise the coil completely and release it to create the controlled flux transition.'],
        ['Ballistic galvanometer', 'Displays the angular response and reflected-spot reading. The first maximum deflection is the measurement used for calibration.'],
        ['Tapping switch', 'A closed switch bypasses the BG. Open it to route the experiment current through the BG; close it before changing connections.'],
        ['Commutator', 'Routes the circuit connections. Use its terminals correctly when making a manual circuit; incorrect or incomplete wiring keeps the experiment open.']
      ],
      tip: 'Each apparatus has its own panel. Close an apparatus panel before selecting another if you need a less cluttered simulation view.'
    },
    'resistance-box': {
      title: 'How to use the resistance box',
      subtitle: 'The resistance box supplies the adjustable external resistance R.',
      steps: [
        ['Select Resistance Box', 'Open it from the apparatus toolbar in Simulation.'],
        ['Set a value', 'Use the available controls to choose a positive resistance. The live value appears in Calculation and is stored with every trial.'],
        ['Take one complete observation', 'With the circuit armed and HMS raised, release the coil, wait for θ₁ and θ₃, then reverse the commutator and repeat before changing R.'],
        ['Change R before the next trial', 'Use a clearly different resistance. Repeating the same value does not provide the spread needed for the graph.'],
        ['Check the effect', 'A larger total resistance produces a smaller charge and a smaller first throw. Compare the stored rows in Observation.']
      ],
      tip: 'Never change the resistance setting while the coil is moving or while the galvanometer is still oscillating.'
    },
    'hms-galvanometer': {
      title: 'Using the HMS and ballistic galvanometer',
      subtitle: 'These two instruments create and measure the known charge impulse.',
      steps: [
        ['HMS: raise completely', 'Use the HMS control to bring the coil to the fully raised position. The experiment accepts only this known starting position.'],
        ['HMS: release cleanly', 'Release the coil once. The downward motion changes the linked flux and induces emf in the closed circuit.'],
        ['Galvanometer: observe θ₁ and θ₃', 'Watch the reflected spot at the first maximum and the later third maximum. Both magnitudes are used for the damping correction.'],
        ['Optical alignment', 'If the spot reading is unavailable, align the optical observation before repeating the trial. A valid spot reading is required for the table.'],
        ['Let it settle', 'Wait until the spot returns close to zero before starting another throw. Starting early contaminates the next reading.']
      ],
      tip: 'The calculation uses θ = θ₁(θ₁/θ₃)^(1/4), then averages the corrected readings from the two directions.'
    },
    switching: {
      title: 'Switches, commutator, and wiring',
      subtitle: 'A complete and armed circuit is required before the HMS release can create a valid observation.',
      steps: [
        ['Auto Connect', 'Use Auto Connect when learning the procedure. It creates the required connections automatically.'],
        ['Manual Connect', 'Use Manual Connect to practise wiring. Join the highlighted terminals in the required circuit route and verify the status message.'],
        ['Clear Wires', 'Use Clear Wires only when you intentionally want to rebuild the circuit. It opens the circuit and invalidates an in-progress setup.'],
        ['Tapping switch', 'Open it only after all wires are correct; this arms the BG path. Close it before altering any wire or resistance value.'],
        ['Commutator', 'Keep the commutator terminal path consistent with the diagram. A missing terminal prevents the circuit from becoming complete.']
      ],
      tip: 'Always use the on-screen circuit-status message as the final check; a visually connected wire is not enough if it is attached to the wrong terminal.'
    },
    mobile: {
      title: 'Using the lab on a phone or small screen',
      subtitle: 'The lab works on smaller screens, but landscape is strongly recommended.',
      steps: [
        ['Use landscape mode', 'Rotate the phone horizontally before using Simulation, Diagram, or the manual-wiring controls. It gives the apparatus and control panels enough width.'],
        ['Use the bottom navigation', 'On a phone, the section icons become a fixed bottom bar. Tap an icon to replace the current workspace.'],
        ['Scroll inside the active view', 'Tables, diagrams, and the calculation panel may scroll horizontally or vertically. This is expected on a narrow screen.'],
        ['Use fullscreen for the apparatus', 'Use the fullscreen control when you need to inspect or manipulate the 3D laboratory more precisely.'],
        ['Avoid tiny interactions in portrait', 'Portrait is fine for reading Formula, Observation, and Results, but landscape is better for wiring and apparatus manipulation.']
      ],
      tip: 'If controls feel cramped, rotate to landscape first rather than reducing browser zoom.'
    },
    troubleshooting: {
      title: 'Troubleshooting and good practice',
      subtitle: 'Use these checks whenever a throw is not recorded or a result looks unreliable.',
      steps: [
        ['Circuit remains open', 'Use Auto Connect or inspect the manual route. Then open the tapping switch and look for the armed status.'],
        ['No valid throw', 'Raise the HMS coil fully, wait for it to settle, then release it. Check that the galvanometer has returned to zero before trying again.'],
        ['No spot reading', 'Select the ballistic galvanometer and correct the optical alignment before repeating the observation.'],
        ['Reset safely', 'Use Reset observations in Calculation only when you intend to discard the trial set and begin a new calibration.']
      ],
      tip: 'A careful two- or three-trial set at different resistance values is more useful than many rushed releases.'
    }
  };

  const content = document.getElementById('faqProcedureContent');
  const items = [...document.querySelectorAll('.faq-q-item')];
  if (!content || !items.length) return;

  const renderGuide = key => {
    const guide = guides[key] || guides.experiment;
    content.innerHTML = `<header class="faq-content-header"><h3>${guide.title}</h3><p class="faq-content-subtitle">${guide.subtitle}</p></header><div class="faq-steps-list">${guide.steps.map(([title, description], index) => `<section class="faq-step-card"><span class="step-badge">${index + 1}</span><div class="step-body"><h4 class="step-title">${title}</h4><p class="step-desc">${description}</p></div></section>`).join('')}</div><aside class="faq-callout-tip"><strong>Important:</strong> ${guide.tip}</aside>`;
    items.forEach(item => item.classList.toggle('is-active', item.dataset.question === key));
  };

  items.forEach(item => item.addEventListener('click', () => renderGuide(item.dataset.question)));
  document.getElementById('closeHelpButton')?.addEventListener('click', () => renderGuide('experiment'));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      const overlay = document.getElementById('helpOverlay');
      if (overlay) { overlay.hidden = true; overlay.setAttribute('aria-hidden', 'true'); }
    }
  });
  renderGuide('experiment');
})();

const apparatusOptions = document.querySelectorAll('[data-apparatus]');
const simulationWindow = document.getElementById('simulationWindow');
const apparatusStages = [...document.querySelectorAll('.apparatus-stage')];

const apparatusPanels = {
  'laboratory': document.getElementById('lab-ui-container'),
  'resistance-box': document.getElementById('resistance-ui'),
  'hms': document.getElementById('hms-hud'),
  'ballistic-galvanometer': document.getElementById('ballistic-galvanometer-ui-panel'),
  'tapping-switch': document.getElementById('tapping-switch-control-panel'),
  'commutator': document.getElementById('commutator-control-panel')
};

function selectApparatus(apparatus) {
  const isExternalApparatus = apparatus !== 'laboratory';

  apparatusOptions.forEach((option) => {
    option.setAttribute('aria-selected', String(option.dataset.apparatus === apparatus));
  });

  if (simulationWindow) {
    simulationWindow.classList.toggle('external-apparatus-mode', isExternalApparatus);
  }

  apparatusStages.forEach((stage) => {
    stage.classList.toggle('is-active', stage.id === `${apparatus}-stage`);
  });

  // Switch the active apparatus control panel in the right sidebar
  Object.entries(apparatusPanels).forEach(([name, panel]) => {
    if (!panel) return;
    const isSelected = name === apparatus;
    panel.dataset.apparatusOpen = String(isSelected);

    if (isSelected) {
      panel.style.display = 'block';
      panel.hidden = false;
    } else {
      panel.style.display = 'none';
      panel.hidden = true;
    }
  });

  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('apparatus:resize'));
    window.dispatchEvent(new Event('resize'));
  });
  window.setTimeout(() => {
    window.dispatchEvent(new Event('apparatus:resize'));
    window.dispatchEvent(new Event('resize'));
  }, 120);
}

apparatusOptions.forEach((option) => {
  option.addEventListener('click', () => selectApparatus(option.dataset.apparatus));
  option.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', option.dataset.apparatus);
    e.dataTransfer.effectAllowed = 'copy';
  });
});

const requestedApparatus = new URLSearchParams(window.location.search).get('apparatus');
const initialApparatus = requestedApparatus && [...apparatusOptions].some((option) => option.dataset.apparatus === requestedApparatus)
  ? requestedApparatus
  : 'laboratory';

window.addEventListener('load', () => {
  selectApparatus(initialApparatus);
}, { once: true });

const workspaceSections = [...document.querySelectorAll('.main__task-div')];
const workspaceLinks = [...document.querySelectorAll('.workspace-link')];
const workspaceTitle = document.getElementById('workspaceTitle');

function showWorkspace(name) {
  if (!document.body.classList.contains('dashboard-active') && !document.getElementById('simulation').hidden && name !== 'simulation') window.dispatchEvent(new Event('simulation:reset-view'));
  // Dismiss dashboard if active
  document.body.classList.remove('dashboard-active');
  workspaceSections.forEach((section) => {
    const isFooter = section.tagName === 'FOOTER';
    const isSelected = section.id === name;
    const shouldShow = isFooter || isSelected;
    section.hidden = !shouldShow;
    /* Some legacy component styles use display: flex !important. Set the
       workspace state inline so inactive views can never leak into the page. */
    section.style.setProperty('display', shouldShow ? (isFooter ? 'block' : 'flex') : 'none', 'important');
  });

  workspaceLinks.forEach((link) => {
    link.classList.toggle('is-active', link.dataset.workspace === name);
  });

  if (workspaceTitle && name === 'simulation') {
    workspaceTitle.textContent = 'Simulation';
  }

  window.dispatchEvent(new CustomEvent('workspace:change', { detail: { name } }));
  // The renderers start while their containers are hidden on the dashboard.
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

workspaceLinks.forEach((link) => {
  link.addEventListener('click', () => showWorkspace(link.dataset.workspace));
});

window.showWorkspace = showWorkspace;

// Magnification changes only the display range, never the measured displacement.
(function () {
  const host = document.getElementById('simulationWindow');
  const panel = document.createElement('aside');
  panel.className = 'optical-readout';
  panel.setAttribute('aria-label', 'Magnified galvanometer scale');
  panel.innerHTML = '<div class="optical-heading"><strong>Galvanometer spot</strong><span class="optical-reading">0.000 cm</span></div><canvas width="640" height="110" aria-label="Magnified optical scale"></canvas><div class="optical-range"></div><p class="optical-status" role="status" aria-live="polite"></p>';
  host.appendChild(panel);
  const ctx = panel.querySelector('canvas').getContext('2d');
  const reading = panel.querySelector('.optical-reading');
  const rangeLabel = panel.querySelector('.optical-range');
  const status = panel.querySelector('.optical-status');
  let range = 1, previousEvent = null, lastStatus = '';
  function draw(state) {
    if (!host.getClientRects().length) return;
    const o = window.ballisticGalvanometerObservation;
    const visible = o?.visible && Number.isFinite(o.readingCm);
    const x = visible ? o.readingCm : 0;
    if (state.circuit.eventStartTime !== previousEvent) {
      previousEvent = state.circuit.eventStartTime;
      const expectedAngle = state.circuit.expectedCharge / state.calibration.mechanicalBallisticConstant;
      range = Math.max(0.01, Math.min(50, Math.abs(expectedAngle * 200) * 1.4 || 1));
    }
    if (Math.abs(x) > range) range = Math.min(50, Math.abs(x) * 1.25);
    reading.textContent = visible ? x.toFixed(3) + ' cm' : 'Spot off scale';
    rangeLabel.textContent = 'Magnified view · range ±' + range.toFixed(range < 1 ? 3 : 1) + ' cm';
    ctx.clearRect(0, 0, 640, 110);
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, 640, 110);
    ctx.strokeStyle = '#64748b'; ctx.fillStyle = '#334155'; ctx.font = '18px sans-serif'; ctx.textAlign = 'center';
    ctx.beginPath(); ctx.moveTo(25, 48); ctx.lineTo(615, 48);
    for (let i = -4; i <= 4; i++) {
      const px = 320 + i * 73.75;
      ctx.moveTo(px, 39); ctx.lineTo(px, 57);
      ctx.fillText((i * range / 4).toFixed(range < 1 ? 3 : 1), px, 92);
    }
    ctx.stroke();
    if (visible) {
      const px = 320 + Math.max(-1, Math.min(1, x / range)) * 295;
      ctx.fillStyle = '#dc2626'; ctx.fillRect(px - 2, 17, 4, 50);
    }
    const busy = !window.ballisticReady?.();
    const message = busy ? 'Wait: let the spot settle at zero before the next throw.' :
      !visible ? 'Align the lamp and mirror until the spot is visible on the scale.' : state.validationMessage;
    if (message !== lastStatus) { status.textContent = message; lastStatus = message; }
    panel.classList.toggle('is-waiting', busy);
    document.querySelectorAll('#hms-pullUp, #hms-release, #hms-coilPosSlider, #lab-hms-drop, #lab-hms-manual, #lab-total-resistance, #res-input, #btn-toggle').forEach(control => {
      control.disabled = busy;
      control.title = busy ? 'Wait for the galvanometer to settle at zero.' : '';
    });
  }
  window.addEventListener('ballistic:statechange', e => draw(e.detail));
  window.addEventListener('workspace:change', () => { if (window.ballisticExperiment) draw(window.ballisticExperiment); });
})();

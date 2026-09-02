(() => {
  const guides = {
    experiment: {
      title: 'How to perform the experiment',
      subtitle: 'Follow the complete HMS procedure: two throws per direction, then repeat for new resistance settings.',
      steps: [
        ['Start in Laboratory view', 'Open Simulation and select Laboratory. Confirm that the room light is on and that the apparatus can be seen clearly.'],
        ['Prepare the resistance box', 'Begin with the protective high setting of 5 kΩ. Keep the number of HMS turns fixed for the complete set of observations.'],
        ['Make the circuit', 'Use Auto Connect for a guided ready-to-use circuit, or use Manual Connect to join every required terminal. The circuit route is HMS → resistance box → commutator → tapping switch → ballistic galvanometer → commutator.'],
        ['Arm the circuit', 'Close the tapping switch. The status message must say that the circuit is armed before a valid observation can be taken.'],
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
        ['Tapping switch', 'Opens or closes the circuit. Close it to arm the experiment; leave it open while changing connections.'],
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
        ['Tapping switch', 'Close it only after all wires are correct; this arms the experiment. Open it before altering any wire or resistance value.'],
        ['Commutator', 'Keep the commutator terminal path consistent with the diagram. A missing terminal prevents the circuit from becoming complete.']
      ],
      tip: 'Always use the on-screen circuit-status message as the final check; a visually connected wire is not enough if it is attached to the wrong terminal.'
    },
    graph: {
      title: 'Graphs, observations, calculations, and results',
      subtitle: 'Use these views after completing valid trials.',
      steps: [
        ['Observation', 'The automatic table stores R and the left/right θ₁, θ₃, and corrected throws. A row is complete only after the commutator has been reversed.'],
        ['Calibration graph', 'The upper graph plots 1/θ against R after complete readings are available for two or more resistance settings.'],
        ['Trajectory graph', 'The lower graph shows only the galvanometer’s motion during an actual throw. It is blank while the experiment is idle.'],
        ['Calculation', 'Check the live constants, total resistance, charge, and computed ballistic constant. Change instrument constants only when intentionally modelling a different instrument.'],
        ['Results', 'Use the mean ballistic constant only after complete readings at two or more resistance settings. A roughly straight calibration relation is a useful quality check.']
      ],
      tip: 'If the calibration points do not behave consistently, repeat the observation after the galvanometer settles and confirm that R was changed between trials.'
    },
    mobile: {
      title: 'Using the lab on a phone or small screen',
      subtitle: 'The lab works on smaller screens, but landscape is strongly recommended.',
      steps: [
        ['Use landscape mode', 'Rotate the phone horizontally before using Simulation, Diagram, Graph, or the manual-wiring controls. It gives the apparatus and control panels enough width.'],
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
        ['Circuit remains open', 'Use Auto Connect or inspect the manual route. Then close the tapping switch and look for the armed status.'],
        ['No valid throw', 'Raise the HMS coil fully, wait for it to settle, then release it. Check that the galvanometer has returned to zero before trying again.'],
        ['No spot reading', 'Select the ballistic galvanometer and correct the optical alignment before repeating the observation.'],
        ['Graph is blank', 'Complete both commutator directions at two or more distinct resistance values.'],
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

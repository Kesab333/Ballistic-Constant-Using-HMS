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
    if (name === apparatus) {
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

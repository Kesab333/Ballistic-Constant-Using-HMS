const workspaceSections = [...document.querySelectorAll('.main__task-div')];
const workspaceLinks = [...document.querySelectorAll('.workspace-link')];
const workspaceTitle = document.getElementById('workspaceTitle');

function showWorkspace(name) {
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
}

workspaceLinks.forEach((link) => {
  link.addEventListener('click', () => showWorkspace(link.dataset.workspace));
});

document.querySelectorAll('.dashboard-close-btn').forEach((button) => {
  button.addEventListener('click', () => showWorkspace('simulation'));
});

showWorkspace('simulation');

window.showWorkspace = showWorkspace;

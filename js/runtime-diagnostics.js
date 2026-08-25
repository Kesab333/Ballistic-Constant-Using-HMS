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

const closeBtn = document.getElementById('close-btn');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');

closeBtn.addEventListener('click', () => {
  window.close();
});

function setStatus(isHealthy) {
  statusIndicator.className = isHealthy ? 'status-green' : 'status-gray';
  statusText.textContent = isHealthy
    ? 'Extension ready'
    : 'Extension unavailable';
}

setStatus(true);

if (!globalThis.chrome?.runtime?.sendMessage) {
  setStatus(false);
} else {
  chrome.runtime.sendMessage({ type: 'getStatus' }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus(false);
      return;
    }

    setStatus(response?.healthy === true);
  });
}

const closeBtn = document.getElementById('close-btn');
const neutralizeBtn = document.getElementById('neutralize-btn');
const restoreBtn = document.getElementById('restore-btn');
const statusIndicator = document.getElementById('status-indicator');

// 關閉視窗
closeBtn.addEventListener('click', () => {
  window.close();
});

// 點擊 Neutralize 切換狀態
neutralizeBtn.addEventListener('click', () => {
  neutralizeBtn.classList.add('active');
  restoreBtn.classList.remove('active');
  console.log('[Dehype] Neutralize clicked');
});

// 點擊 Restore 切換狀態
restoreBtn.addEventListener('click', () => {
  restoreBtn.classList.add('active');
  neutralizeBtn.classList.remove('active');
  console.log('[Dehype] Restore clicked');
});

// 狀態更新
function setStatus(isHealthy) {
  if (isHealthy) {
    statusIndicator.className = 'status-green';
  } else {
    statusIndicator.className = 'status-gray';
  }
}

setStatus(true);

chrome.runtime.sendMessage({ type: 'getStatus' }, (response) => {
  if (chrome.runtime.lastError) {
     setStatus(false);
  } else {
     setStatus(response?.healthy ?? true);
  }
});
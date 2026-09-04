// extension/src/content/index.js

console.log('[Dehype] Content Script 模組已就位');

/**
 * 訊息處理核心邏輯 (抽離以利 Unit Test 呼叫)
 */
function handleMessage(message, sender, sendResponse) {
    const { type, payload } = message;

    if (type === 'REPLACE_TEXT') {
        if (window.dehypeReplacer) {
            window.dehypeReplacer.replace(payload);
        }
        if (sendResponse) sendResponse({ status: 'success', message: '文字替換完成' });
        return true;
    }

    if (type === 'RESTORE_TEXT') {
        if (window.dehypeReplacer) {
            window.dehypeReplacer.restore();
        }
        if (sendResponse) sendResponse({ status: 'success', message: '頁面已還原' });
        return true;
    }

    return false;
}

// 瀏覽器環境：掛載 Chrome 訊息監聽器
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(handleMessage);
}

// Node.js / Jest 單元測試環境匯出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { handleMessage };
}


// ===================================================
// 開發測試區 (測試完畢後註解)
// ===================================================
/*

function injectDevTestTools() {
  if (document.getElementById('dehype-dev-tools')) return;

  const container = document.createElement('div');
  container.id = 'dehype-dev-tools';
  container.style.cssText = `
    position: fixed !important;
    bottom: 20px !important;
    right: 20px !important;
    z-index: 2147483647 !important;
    background: #0f172a !important;
    color: white !important;
    padding: 12px 16px !important;
    border-radius: 8px !important;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3) !important;
    font-family: sans-serif !important;
    font-size: 13px !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
  `;

  container.innerHTML = `
    <div style="font-weight:bold; border-bottom:1px solid #334155; padding-bottom:4px;">
      🧪 Dehype 測試工具
    </div>
    <button id="dh-mock-run" style="cursor:pointer; padding:6px; background:#0284c7; color:white; border:none; border-radius:4px; font-weight:bold;">
      ▶ 執行 ProductInfo 替換
    </button>
    <button id="dh-mock-restore" style="cursor:pointer; padding:6px; background:#dc2626; color:white; border:none; border-radius:4px;">
      ↺ 還原所有文字
    </button>
  `;

  document.body.appendChild(container);

  document.getElementById('dh-mock-run').onclick = () => {
    const mockProductInfo = {
      name: { id: 'mock-name', value: '【中立化商品名稱】' }
    };
    handleMessage({ type: 'REPLACE_TEXT', payload: mockProductInfo }, {}, () => {});
  };

  document.getElementById('dh-mock-restore').onclick = () => {
    handleMessage({ type: 'RESTORE_TEXT' }, {}, () => {});
  };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectDevTestTools);
  } else {
    injectDevTestTools();
  }
}

*/

// extension/src/content/index.js

console.log('[Dehype] Content Script 模組已就位，等待接收指令...');

// ===================================================
// 1. 正式通訊邏輯 (交付時必須保留)
// ===================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { type, payload } = message;

    if (type === 'REPLACE_TEXT') {
        // payload 即為完整的 productInfo 物件 (內含 targets 陣列)
        window.dehypeReplacer.replace(payload);
        sendResponse({ status: 'success', message: '文字替換完成' });
    }

    if (type === 'RESTORE_TEXT') {
        window.dehypeReplacer.restore();
        sendResponse({ status: 'success', message: '頁面已還原' });
    }

    return true;
});


// ===================================================
// 2. 開發測試區 (測試完畢後，將此區塊整體註解或刪除)
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
      🧪 Dehype 模組測試器 (ProductInfo 版)
    </div>
    <button id="dh-mock-run" style="cursor:pointer; padding:6px; background:#0284c7; color:white; border:none; border-radius:4px; font-weight:bold;">
      ▶ 模擬接收 ProductInfo 並替換
    </button>
    <button id="dh-mock-restore" style="cursor:pointer; padding:6px; background:#dc2626; color:white; border:none; border-radius:4px;">
      ↺ 還原網頁
    </button>
  `;

    document.body.appendChild(container);

    // 模擬觸發替換
    document.getElementById('dh-mock-run').onclick = () => {
        // A. 模擬 Adapter 在目標元素貼上記號
        const mockTargetDOM = document.querySelector('h1, h2, h3, p') || document.body.firstElementChild;
        const mockAssignedId = 'adapter-target-999';
        mockTargetDOM.setAttribute('data-dehype-id', mockAssignedId);

        // B. 建構單一 ProductInfo 結構
        const mockProductInfo = {
            name: "高階電競筆電",
            originPrice: "$45,000",
            currentPrice: "$39,900",
            discount: "88折",
            image: "https://example.com/img.jpg",
            description: "高性能遊戲筆電",
            stockAmount: "5",
            targets: [
                {
                    id: mockAssignedId,
                    content: "【Dehype：成功替換為中立文字！】"
                }
            ]
        };

        // C. 呼叫你的核心模組
        window.dehypeReplacer.replace(mockProductInfo);
    };

    // 模擬觸發還原
    document.getElementById('dh-mock-restore').onclick = () => {
        window.dehypeReplacer.restore();
    };
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectDevTestTools);
} else {
    injectDevTestTools();
}

*/

// ===================================================
// 開發測試區結束
// ===================================================
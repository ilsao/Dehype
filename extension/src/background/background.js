// 后台服务脚本，可以维护扩展状态，供 popup 查询
// 目前仅作为占位，保持扩展完整性
console.log('[Dehype] Background service worker started.');

// 示例：监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getStatus') {
    // 返回健康状态（这里总是 true）
    sendResponse({ healthy: true });
  }
  return true; // 保持消息通道开放
});
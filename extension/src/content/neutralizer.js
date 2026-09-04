class DOMReplacer {
    constructor() {
        // 備份修改前的 DOM，確保 100% 可還原
        this.history = new Map();
    }

    /**
     * 核心替換方法
     * @param {Object} productInfo - 完整的商品資訊物件，內含 targets 陣列
     */
    replace(productInfo = {}) {
        // 從 productInfo 中直接取出 targets 陣列
        const targets = productInfo.targets || [];

        targets.forEach(({ id, content }) => {
            const element = this.findElement(id);

            if (!element) {
                console.warn(`[Dehype] 找不到標記 ID: ${id}`);
                return;
            }

            // 首次修改前備份原始狀態
            if (!this.history.has(id)) {
                this.history.set(id, {
                    element,
                    originalText: element.textContent,
                    originalStyle: element.getAttribute('style') || ''
                });
            }

            // 執行文字替換與視覺標記
            element.textContent = content;
            element.style.backgroundColor = '#fee2e2';
            element.style.color = '#991b1b';
            element.style.padding = '2px 6px';
            element.style.borderRadius = '4px';
            element.setAttribute('data-dehype-status', 'replaced');
        });
    }

    /**
     * 定位 DOM 節點
     */
    findElement(id) {
        return (
            document.querySelector(`[data-dehype-id="${id}"]`) ||
            document.getElementById(id)
        );
    }

    /**
     * 還原網頁原始文字
     */
    restore() {
        this.history.forEach(({ element, originalText, originalStyle }) => {
            if (element && document.body.contains(element)) {
                element.textContent = originalText;
                element.setAttribute('style', originalStyle);
                element.removeAttribute('data-dehype-status');
            }
        });
        this.history.clear();
    }
}

// 掛載至 window 全域
window.dehypeReplacer = new DOMReplacer();
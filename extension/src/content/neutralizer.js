// extension/src/content/neutralizer.js

class DOMReplacer {
    constructor() {
        this.history = new Map();
    }

    /**
     * 核心替換方法 (支援 ProductInfo 內包含 multiple Elem { id, value } 物件)
     * @param {Object} productInfo - 包含 name, originPrice, currentPrice 等 Elem 結構的物件
     */
    replace(productInfo = {}) {
        // 解析 ProductInfo 物件內所有符合 Elem { id, value } 結構的欄位
        const targets = [];

        Object.values(productInfo).forEach((item) => {
            if (item && typeof item === 'object' && item.id && item.value !== undefined) {
                targets.push({ id: item.id, content: item.value });
            }
        });

        targets.forEach(({ id, content }) => {
            const element = this.findElement(id);

            if (!element) {
                console.warn(`[Dehype] 找不到標記 ID: ${id}`);
                return;
            }

            // 備份原始文字
            if (!this.history.has(id)) {
                this.history.set(id, {
                    element,
                    originalText: element.textContent
                });
            }

            // 純文字覆寫
            element.textContent = content;
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
        this.history.forEach(({ element, originalText }) => {
            if (element && document.body.contains(element)) {
                element.textContent = originalText;
                element.removeAttribute('data-dehype-status');
            }
        });
        this.history.clear();
    }
}

window.dehypeReplacer = new DOMReplacer();
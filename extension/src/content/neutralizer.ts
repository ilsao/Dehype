interface ReplacementHistory {
    element: Element;
    originalText: string | null;
}

interface ReplacementTarget {
    id: unknown;
    content: unknown;
}

export interface DehypeReplacer {
    replace(productInfo?: unknown): void;
    restore(): void;
}

export class DOMReplacer implements DehypeReplacer {
    private readonly history = new Map<unknown, ReplacementHistory>();

    /**
     * 核心替換方法 (支援 ProductInfo 內包含 multiple ProductElement { id, value } 物件)
     * @param {Object} productInfo - 包含 name, originalPrice, currentPrice 等 ProductElement 結構的物件
     */
    replace(productInfo: unknown = {}) {
        // 解析 ProductInfo 物件內所有符合 ProductElement { id, value } 結構的欄位
        const targets: ReplacementTarget[] = [];

        Object.values(productInfo as object).forEach((item) => {
            if (isRecord(item) && item.id && item.value !== undefined) {
                targets.push({ id: item.id, content: item.value });
            }
        });

        targets.forEach(({ id, content }) => {
            const element = this.findElement(id);

            if (!element) {
                console.debug(`[Dehype] 略過不存在的標記 ID: ${id}`);
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
            element.textContent = content as string | null;
            element.setAttribute('data-dehype-status', 'replaced');
        });
    }

    /**
     * 定位 DOM 節點
     */
    findElement(id: unknown): Element | null {
        return (
            document.querySelector(`[data-dehype-id="${id}"]`) ||
            document.getElementById(id as string)
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

if (typeof window !== 'undefined') {
    window.dehypeReplacer = new DOMReplacer();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

declare global {
    interface Window {
        dehypeReplacer?: DehypeReplacer;
    }
}

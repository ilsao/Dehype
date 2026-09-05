import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Mock } from 'vitest';
import './legacyMessageHandler.js';

const handleMessage = globalThis.__dehypeHandleMessage;

describe('legacyMessageHandler.ts - Message Handler Unit Tests', () => {
    let mockReplacer: {
        replace: Mock<(productInfo?: unknown) => void>;
        restore: Mock<() => void>;
    };

    beforeEach(() => {
        // 模擬 window.dehypeReplacer 模組
        mockReplacer = {
            replace: vi.fn<(productInfo?: unknown) => void>(),
            restore: vi.fn<() => void>()
        };
        window.dehypeReplacer = mockReplacer;
    });

    test('收到 REPLACE_TEXT 時，應正確呼叫 window.dehypeReplacer.replace 並傳入 ProductInfo', () => {
        const mockSendResponse = vi.fn();
        const mockProductInfo = {
            name: { id: 'test-id-1', value: '測試名稱' },
            originalPrice: { id: 'test-id-2', value: 'NT$ 100' }
        };

        const result = handleMessage(
            { type: 'REPLACE_TEXT', payload: mockProductInfo },
            {},
            mockSendResponse
        );

        // 驗證模組方法調用與參數正確性
        expect(mockReplacer.replace).toHaveBeenCalledWith(mockProductInfo);
        expect(mockSendResponse).toHaveBeenCalledWith({ status: 'success', message: '文字替換完成' });
        expect(result).toBe(true);
    });

    test('收到 RESTORE_TEXT 時，應呼叫 window.dehypeReplacer.restore', () => {
        const mockSendResponse = vi.fn();

        const result = handleMessage(
            { type: 'RESTORE_TEXT' },
            {},
            mockSendResponse
        );

        expect(mockReplacer.restore).toHaveBeenCalledTimes(1);
        expect(mockSendResponse).toHaveBeenCalledWith({ status: 'success', message: '頁面已還原' });
        expect(result).toBe(true);
    });

    test('收到未知的 Message Type 時，應忽略不處理並回傳 false', () => {
        const mockSendResponse = vi.fn();

        const result = handleMessage(
            { type: 'INVALID_TYPE' },
            {},
            mockSendResponse
        );

        expect(mockReplacer.replace).not.toHaveBeenCalled();
        expect(mockReplacer.restore).not.toHaveBeenCalled();
        expect(mockSendResponse).not.toHaveBeenCalled();
        expect(result).toBe(false);
    });
});

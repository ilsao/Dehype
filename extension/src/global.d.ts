declare global {
  interface Window {
    __dehypeSkipInitialNeedMatch?: boolean;
    __dehypeContentScriptInitialized?: boolean;
    __dehypeNeedMatchHistoryPatched?: boolean;
    __dehypeStopNeedMatchAutomation?: () => void;
  }
}

export {};

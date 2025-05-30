import { AppLogs } from './applogs';
export type { LogEntry, AppLogsConfig, Context } from './types';

// Browser global export
if (typeof window !== 'undefined') {
  (window as any).AppLogs = AppLogs;
}

// CommonJS export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AppLogs };
  module.exports.default = AppLogs;
}

// ES Module export
export { AppLogs as default };
export { AppLogs }; 
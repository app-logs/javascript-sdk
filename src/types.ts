export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogMetadata {
  context: Record<string, unknown>;
  sdk: {
    version: string;
    environment: string;
  };
  log_metadata?: Record<string, unknown>;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  metadata?: LogMetadata;
  timestamp?: string;
  source: string;
  traceId?: string;
}

export interface AppLogsConfig {
  apiKey: string;
  endpoint?: string;
  batchSize?: number;
  flushInterval?: number;
  maxRetries?: number;
  retryDelay?: number;
  onError?: (error: Error, failedBatch: LogEntry[]) => void;
}

export interface Context {
  [key: string]: unknown;
} 
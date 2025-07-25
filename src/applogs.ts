import { LogEntry, AppLogsConfig, Context, LogLevel, LogMetadata } from './types';
import { Transport } from './transport';
import { LogQueue } from './queue';
import { ensureTraceId, generateTraceId } from './utils/trace';
import { VERSION } from './version';
import { serializeObject } from './serialize-complex';

export class AppLogs {
  private transport: Transport;
  private queue: LogQueue;
  private context: Context = {};
  private readonly version: string = VERSION;
  private readonly source: string = 'sdk';
  private currentTraceId: string;

  constructor(config: AppLogsConfig) {
    if (!config.apiKey) {
      throw new Error('API key is required');
    }
    if (!config.endpoint) {
      throw new Error('Endpoint is required');
    }

    this.transport = new Transport(config);
    this.queue = new LogQueue({
      ...config,
      transport: this.transport
    });
    this.currentTraceId = generateTraceId();
  }

  /**
   * Gets the current trace ID
   * @returns The current trace ID
   */
  public getTraceId(): string {
    return this.currentTraceId;
  }

  /**
   * Sets a new trace ID for subsequent logs
   * @param traceId The trace ID to use, or undefined to generate a new one
   * @returns The new trace ID
   */
  public setTraceId(traceId?: string): string {
    this.currentTraceId = ensureTraceId(traceId);
    return this.currentTraceId;
  }

  public setContext(context: Context): void {
    this.context = { ...this.context, ...context };
  }

  public log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
    traceId?: string
  ): void {
    const logMetadata: LogMetadata = {
      context: this.context,
      sdk: {
        version: this.version,
        environment: this.detectEnvironment()
      },
      log_metadata: serializeObject(metadata, {
        maxDepth: 5,
        includeNonEnumerable: true,
        includeFunctions: false
      })
    };

    // Use provided traceId, fallback to current traceId, or generate new one
    const finalTraceId = ensureTraceId(traceId || this.currentTraceId);

    // Update current traceId if a new one was generated
    if (!traceId && !this.currentTraceId) {
      this.currentTraceId = finalTraceId;
    }

    const logEntry: LogEntry = {
      level,
      message,
      metadata: logMetadata,
      timestamp: new Date().toISOString(),
      source: this.source,
      traceId: finalTraceId
    };

    this.queue.add(logEntry);
  }

  public debug(
    message: string,
    metadata?: Record<string, unknown>,
    traceId?: string
  ): void {
    this.log('debug', message, metadata, traceId);
  }

  public info(
    message: string,
    metadata?: Record<string, unknown>,
    traceId?: string
  ): void {
    this.log('info', message, metadata, traceId);
  }

  public warn(
    message: string,
    metadata?: Record<string, unknown>,
    traceId?: string
  ): void {
    this.log('warn', message, metadata, traceId);
  }

  public error(
    message: string,
    metadata?: Record<string, unknown>,
    traceId?: string
  ): void {
    this.log('error', message, metadata, traceId);
  }

  public destroy(): void {
    this.queue.destroy();
  }

  private detectEnvironment(): string {
    if (typeof window !== 'undefined') {
      return 'browser';
    } else if (typeof process !== 'undefined' && process.versions?.node) {
      return 'node';
    }
    return 'unknown';
  }
} 
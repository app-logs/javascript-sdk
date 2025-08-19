import { AppLogsConfig, LogEntry, LogLevel, Context } from './types';
import { LogQueue } from './queue';
import { Transport } from './transport';
import { serializeObject } from './serialize-complex';

export class AppLogs {
  private queue: LogQueue;
  private transport: Transport;
  private config: AppLogsConfig;
  private globalContext: Context = {};

  constructor(config: AppLogsConfig) {
    this.config = { ...config };
    this.transport = new Transport(config);
    this.queue = new LogQueue({ ...config, transport: this.transport });
  }

  /**
   * Set global context that will be included in all log entries
   */
  public setContext(context: Context): void {
    this.globalContext = { ...context };
  }

  /**
   * Add to existing global context
   */
  public addContext(context: Context): void {
    this.globalContext = { ...this.globalContext, ...context };
  }

  /**
   * Remove specific keys from global context
   */
  public removeContext(keys: string[]): void {
    const newContext = { ...this.globalContext };
    keys.forEach(key => delete newContext[key]);
    this.globalContext = newContext;
  }

  /**
   * Clear all global context
   */
  public clearContext(): void {
    this.globalContext = {};
  }

  /**
   * Get current global context
   */
  public getContext(): Context {
    return { ...this.globalContext };
  }

  /**
   * Log a message - standard async logging
   */
  public log(level: LogLevel, message: string, context?: Context): void {
    const logEntry = this.createLogEntry(level, message, context);
    this.queue.add(logEntry);
  }

  /**
   * Log a message and ensure it's sent immediately - critical for API routes
   */
  public async logAsync(level: LogLevel, message: string, context?: Context): Promise<void> {
    const logEntry = this.createLogEntry(level, message, context);
    await this.queue.addAsync(logEntry);
  }

  /**
   * Log with trace ID for distributed tracing
   */
  public logWithTrace(level: LogLevel, message: string, traceId: string, context?: Context): void {
    const logEntry = this.createLogEntry(level, message, context);
    logEntry.traceId = traceId;
    this.queue.add(logEntry);
  }

  public async logWithTraceAsync(level: LogLevel, message: string, traceId: string, context?: Context): Promise<void> {
    const logEntry = this.createLogEntry(level, message, context);
    logEntry.traceId = traceId;
    await this.queue.addAsync(logEntry);
  }
  public info(message: string, context?: Context): void {
    this.log('info', message, context);
  }

  public warn(message: string, context?: Context): void {
    this.log('warn', message, context);
  }

  public error(message: string, context?: Context): void {
    this.log('error', message, context);
  }

  public debug(message: string, context?: Context): void {
    this.log('debug', message, context);
  }

  /**
   * Asynchronous convenience methods - use in API routes
   */
  public async infoAsync(message: string, context?: Context): Promise<void> {
    await this.logAsync('info', message, context);
  }

  public async warnAsync(message: string, context?: Context): Promise<void> {
    await this.logAsync('warn', message, context);
  }

  public async errorAsync(message: string, context?: Context): Promise<void> {
    await this.logAsync('error', message, context);
  }

  public async debugAsync(message: string, context?: Context): Promise<void> {
    await this.logAsync('debug', message, context);
  }

  /**
   * Flush all pending logs - use before API route responses
   */
  public async flush(): Promise<void> {
    await this.queue.flushAndWait();
  }

  /**
   * Get diagnostic information
   */
  public getStatus(): {
    queueLength: number;
    isServerless: boolean;
    config: Partial<AppLogsConfig>;
  } {
    return {
      queueLength: this.queue.getQueueLength(),
      isServerless: this.queue.isServerless(),
      config: {
        batchSize: this.config.batchSize,
        flushInterval: this.config.flushInterval,
        maxRetries: this.config.maxRetries
      }
    };
  }

  /**
   * Create API route wrapper for automatic flushing
   */
  public wrapApiRoute<T extends any[], R>(
    handler: (...args: T) => Promise<R> | R
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      try {
        const result = await handler(...args);

        // Ensure logs are sent before response
        await this.flush();

        return result;
      } catch (error) {
        // Log the error
        await this.errorAsync('API route error', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });

        throw error;
      }
    };
  }

  /**
   * Create middleware for Express/Connect-style frameworks
   */
  public middleware() {
    return async (req: any, res: any, next: any) => {
      // Add logging methods to request object
      req.log = this.log.bind(this);
      req.logAsync = this.logAsync.bind(this);

      // Override res.end to flush logs before response
      const originalEnd = res.end;
      res.end = async (...args: any[]) => {
        try {
          await this.flush();
        } catch (error) {
          // Don't block response on logging errors
          console.error('Failed to flush logs:', error);
        }
        return originalEnd.apply(res, args);
      };

      next();
    };
  }

  private createLogEntry(level: LogLevel, message: string, context?: Context): LogEntry {
    const timestamp = new Date().toISOString();

    // Determine environment
    let environment = 'unknown';
    if (typeof process !== 'undefined' && process.env) {
      environment = process.env.NODE_ENV || 'production';
    } else if (typeof window !== 'undefined') {
      environment = 'browser';
    }

    // Merge global context with local context (local context takes precedence)
    const mergedContext = { ...this.globalContext, ...serializeObject(context) };

    const entry: LogEntry = {
      level,
      message,
      timestamp,
      source: 'javascript-sdk',
      metadata: {
        context: mergedContext,
        sdk: {
          version: '1.0.0',
          environment
        }
      }
    };

    // Add platform-specific metadata if available
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.VERCEL) {
        entry.metadata!.log_metadata = { ...entry.metadata!.log_metadata, platform: 'vercel' };
      }
      if (process.env.NETLIFY) {
        entry.metadata!.log_metadata = { ...entry.metadata!.log_metadata, platform: 'netlify' };
      }
      if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
        entry.metadata!.log_metadata = { ...entry.metadata!.log_metadata, platform: 'aws-lambda' };
      }
    }

    return entry;
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.queue.destroy();
  }
}
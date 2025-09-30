import { LogEntry, AppLogsConfig } from './types';
import { Transport } from './transport';

export class LogQueue {
  private queue: LogEntry[] = [];
  private isProcessing = false;
  private flushIntervalId?: ReturnType<typeof setInterval>;
  private isServerlessEnvironment = false;

  constructor(
    private config: AppLogsConfig & { transport: Transport }
  ) {
    this.detectEnvironment();
    this.setupAutoFlush();
  }

  private detectEnvironment(): void {
    this.isServerlessEnvironment =
      typeof process === 'undefined' ||
      !!(process.env.AWS_EXECUTION_ENV ||
        process.env.FUNCTION_NAME ||
        process.env.VERCEL ||
        process.env.NETLIFY ||
        process.env.CF_PAGES ||
        process.env.SERVERLESS ||
        process.env.LAMBDA_RUNTIME_DIR ||
        (typeof global !== 'undefined' && !global.process?.stdout?.isTTY));
  }

  public add(logEntry: LogEntry): void {
    this.queue.push(logEntry);

    const batchSize = this.isServerlessEnvironment
      ? (this.config.batchSize || 1)
      : (this.config.batchSize || 5);

    if (this.queue.length >= batchSize) {
      this.flush().catch(error => {
        if (this.config.onError) {
          this.config.onError(error, [logEntry]);
        }
      });
    }
  }

  public addAsync(logEntry: LogEntry): Promise<void> {
    this.queue.push(logEntry);

    if (this.isServerlessEnvironment || this.queue.length >= 1) {
      return this.flush();
    }

    return Promise.resolve();
  }

  public async flush(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const batch = this.queue.splice(0, this.queue.length);

    try {
      await this.config.transport.send(batch);
    } catch (error) {
      // NEVER THROW: Use onError callback for transport failures.

      if (!this.isServerlessEnvironment) {
        // Requeue failed batch (first 3 items if large batch)
        this.queue.unshift(...batch.slice(0, 3));
      }

      if (this.config.onError) {
        this.config.onError(error as Error, batch);
      }

    } finally {
      this.isProcessing = false;
    }
  }

  public async flushAndWait(): Promise<void> {
    let retries = 0;
    const maxRetries = 3;

    while (this.queue.length > 0 && retries < maxRetries) {
      try {
        await this.flush();
        if (this.queue.length === 0) {
          break;
        }
      } catch (error) {
        // This should only be hit for unexpected, non-transport-related errors.
        retries++;
        if (retries >= maxRetries) {
          // call the error callback
          this.config.onError?.(error as Error, this.queue);

          break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  private setupAutoFlush(): void {
    if (!this.isServerlessEnvironment) {
      this.flushIntervalId = setInterval(
        () => this.flush().catch(() => { }),
        this.config.flushInterval || 5000
      );
    }

    this.setupCleanupHandlers();
  }

  private setupCleanupHandlers(): void {
    // Browser environment
    if (typeof window !== 'undefined') {
      const flushOnUnload = () => {
        if ('navigator' in window && 'sendBeacon' in navigator) {
          this.flushWithBeacon();
        } else {
          this.flushSync();
        }
      };

      window.addEventListener('beforeunload', flushOnUnload);
      window.addEventListener('pagehide', flushOnUnload);

      // Node.js environment
    } else if (typeof process !== 'undefined') {
      const flushOnExit = () => {
        this.flushSync();
      };

      process.on('beforeExit', flushOnExit);
      process.on('exit', flushOnExit);
      process.on('SIGINT', () => {
        this.flushSync();
        process.exit(0);
      });
      process.on('SIGTERM', () => {
        this.flushSync();
        process.exit(0);
      });

      process.on('uncaughtException', (error) => {
        // call callback
        this.config.onError?.(error, [])
        // PER USER REQUEST
        this.flushSync();
        // Do not re-throw the error, letting the process continue/terminate naturally.
      });
    }
  }

  private flushWithBeacon(): void {
    if (this.queue.length === 0) return;

    try {
      const batch = this.queue.splice(0, this.queue.length);
      const payload = JSON.stringify(batch);

      if ((this.config.transport as any).cachedIngestUrl) {
        navigator.sendBeacon((this.config.transport as any).cachedIngestUrl, payload);
      }
    } catch (error) {
      this.flushSync();
    }
  }

  private flushSync(): void {
    if (this.queue.length === 0) return;

    try {
      const batch = this.queue.splice(0, this.queue.length);

      if (typeof XMLHttpRequest !== 'undefined') {
        this.flushWithXHR(batch);
      } else {
        this.flush().catch(() => { });
      }
    } catch (error) {
    }
  }

  private flushWithXHR(batch: LogEntry[]): void {
    try {
      const xhr = new XMLHttpRequest();
      const transport = this.config.transport as any;

      if (transport.cachedIngestUrl) {
        xhr.open('POST', transport.cachedIngestUrl, false);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('x-api-key', this.config.apiKey || '');
        xhr.setRequestHeader('User-Agent', 'app-logs.com Javascript SDK/1.0');
        xhr.send(JSON.stringify(batch));
      }
    } catch (error) {
    }
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public isServerless(): boolean {
    return this.isServerlessEnvironment;
  }

  public destroy(): void {
    if (this.queue.length > 0) {
      this.flushAndWait().catch(() => { });
    }

    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
      this.flushIntervalId = undefined;
    }
  }
}
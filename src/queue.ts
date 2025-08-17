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
    // Detect serverless/ephemeral environments
    this.isServerlessEnvironment = 
      // No persistent process (common in serverless)
      typeof process === 'undefined' ||
      // Short execution time indicators
      !!(process.env.AWS_EXECUTION_ENV ||
         process.env.FUNCTION_NAME ||
         process.env.VERCEL ||
         process.env.NETLIFY ||
         process.env.CF_PAGES ||
         // Generic serverless indicators
         process.env.SERVERLESS ||
         process.env.LAMBDA_RUNTIME_DIR ||
         // Check if we're in a function-as-a-service environment
         (typeof global !== 'undefined' && !global.process?.stdout?.isTTY));
  }

  public add(logEntry: LogEntry): void {
    this.queue.push(logEntry);
    
    // In serverless environments, be more aggressive about flushing
    const batchSize = this.isServerlessEnvironment 
      ? (this.config.batchSize || 1) 
      : (this.config.batchSize || 5);
    
    if (this.queue.length >= batchSize) {
      // Don't await here to avoid blocking the caller
      this.flush().catch(error => {
        if (this.config.onError) {
          this.config.onError(error, [logEntry]);
        }
      });
    }
  }

  public addSync(logEntry: LogEntry): Promise<void> {
    this.queue.push(logEntry);
    
    // For critical logs that need immediate sending
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
      // In serverless, don't requeue as function may terminate
      if (!this.isServerlessEnvironment) {
        // Requeue failed batch (first 3 items if large batch)
        this.queue.unshift(...batch.slice(0, 3));
      }
      
      if (this.config.onError) {
        this.config.onError(error as Error, batch);
      }
      
      // Re-throw in serverless to allow caller to handle
      if (this.isServerlessEnvironment) {
        throw error;
      }
    } finally {
      this.isProcessing = false;
    }
  }

  public async flushAndWait(): Promise<void> {
    // Ensure all logs are sent immediately - critical for serverless
    let retries = 0;
    const maxRetries = 3;
    
    while (this.queue.length > 0 && retries < maxRetries) {
      try {
        await this.flush();
        break;
      } catch (error) {
        retries++;
        if (retries >= maxRetries) {
          throw error;
        }
        // Brief delay before retry
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  private setupAutoFlush(): void {
    // Only set up intervals in persistent environments
    if (!this.isServerlessEnvironment) {
      this.flushIntervalId = setInterval(
        () => this.flush().catch(() => {}), // Silent catch to prevent unhandled rejections
        this.config.flushInterval || 5000
      );
    }
    
    // Set up cleanup handlers for different environments
    this.setupCleanupHandlers();
  }

  private setupCleanupHandlers(): void {
    // Browser environment
    if (typeof window !== 'undefined') {
      const flushOnUnload = () => {
        // Use sendBeacon if available for better reliability
        if ('navigator' in window && 'sendBeacon' in navigator) {
          this.flushWithBeacon();
        } else {
          // Synchronous flush as last resort
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
      
      // Multiple exit scenarios
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
      
      // Handle uncaught exceptions
      process.on('uncaughtException', (error) => {
        this.flushSync();
        throw error;
      });
    }
  }

  private flushWithBeacon(): void {
    if (this.queue.length === 0) return;
    
    try {
      const batch = this.queue.splice(0, this.queue.length);
      const payload = JSON.stringify(batch);
      
      // Try to get ingest URL synchronously from cache
      if ((this.config.transport as any).cachedIngestUrl) {
        navigator.sendBeacon((this.config.transport as any).cachedIngestUrl, payload);
      }
    } catch (error) {
      // Fallback to sync flush
      this.flushSync();
    }
  }

  private flushSync(): void {
    if (this.queue.length === 0) return;
    
    try {
      // This is a blocking operation - only use during cleanup
      const batch = this.queue.splice(0, this.queue.length);
      
      // Create synchronous request using available APIs
      if (typeof XMLHttpRequest !== 'undefined') {
        this.flushWithXHR(batch);
      } else {
        // Last resort: attempt async flush and hope it completes
        this.flush().catch(() => {});
      }
    } catch (error) {
      // Silent fail during cleanup
    }
  }

  private flushWithXHR(batch: LogEntry[]): void {
    try {
      const xhr = new XMLHttpRequest();
      const transport = this.config.transport as any;
      
      if (transport.cachedIngestUrl) {
        xhr.open('POST', transport.cachedIngestUrl, false); // Synchronous
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('x-api-key', this.config.apiKey || '');
        xhr.setRequestHeader('User-Agent', 'app-logs.com Javascript SDK/1.0');
        xhr.send(JSON.stringify(batch));
      }
    } catch (error) {
      // Silent fail
    }
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public isServerless(): boolean {
    return this.isServerlessEnvironment;
  }

  public destroy(): void {
    // Final flush attempt
    if (this.queue.length > 0) {
      this.flushAndWait().catch(() => {});
    }
    
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
      this.flushIntervalId = undefined;
    }
  }
}
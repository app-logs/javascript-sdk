import { LogEntry, AppLogsConfig } from './types';
import { Transport } from './transport';

export class LogQueue {
  private queue: LogEntry[] = [];
  private isProcessing: boolean = false;
  private flushIntervalId?: ReturnType<typeof setInterval>;
  
  constructor(
    private config: AppLogsConfig & { transport: Transport }
  ) {
    this.setupFlushInterval();
  }

  public add(logEntry: LogEntry): void {
    this.queue.push(logEntry);
    
    if (this.queue.length >= (this.config.batchSize || 5)) {
      this.flush();
    }
  }

  public async flush(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;
    
    this.isProcessing = true;
    const batch = this.queue.splice(0, this.queue.length);
    
    try {
      await this.config.transport.send(batch);
    } catch (error) {
      // Requeue failed batch (first 3 items if large batch)
      this.queue.unshift(...batch.slice(0, 3));
      
      if (this.config.onError) {
        this.config.onError(error as Error, batch);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private setupFlushInterval(): void {
    this.flushIntervalId = setInterval(
      () => this.flush(), 
      this.config.flushInterval || 5000
    );
    
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush());
    } else if (typeof process !== 'undefined') {
      process.on('beforeExit', () => this.flush());
    }
  }

  public destroy(): void {
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
    }
  }
} 
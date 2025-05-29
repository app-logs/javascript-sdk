import { LogEntry, AppLogsConfig } from './types';

export class Transport {
  private config: Required<Pick<AppLogsConfig, 'maxRetries' | 'retryDelay'>> & AppLogsConfig;
  
  constructor(config: AppLogsConfig) {
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      ...config
    };
  }

  public async send(payload: LogEntry | LogEntry[]): Promise<void> {
    const isBrowser = typeof window !== 'undefined';
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        if (isBrowser) {
          await this.sendBrowser(payload);
          return;
        } else {
          await this.sendNode(payload);
          return;
        }
      } catch (error) {
        if (attempt === this.config.maxRetries) throw error;
        await this.sleep(this.config.retryDelay * attempt);
      }
    }
  }

  private async sendBrowser(payload: LogEntry | LogEntry[]): Promise<Response> {
    const response = await fetch(this.config.endpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response;
  }

  private async sendNode(payload: LogEntry | LogEntry[]): Promise<void> {
    const http = await this.getNodeHttpModule();
    const data = JSON.stringify(payload);
    const url = new URL(this.config.endpoint!);
    
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Length': Buffer.byteLength(data)
      }
    };
    
    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk: Buffer) => {
          responseData += chunk.toString();
        });
        
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`HTTP error! status: ${res.statusCode}`));
          }
        });
      });
      
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  private async getNodeHttpModule(): Promise<typeof import('http') | typeof import('https')> {
    const url = this.config.endpoint!;
    return url.startsWith('https') 
      ? (await import('https')).default 
      : (await import('http')).default;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
} 
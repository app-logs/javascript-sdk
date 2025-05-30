import { LogEntry, AppLogsConfig, EndpointResponse } from './types';

export class Transport {
  private config: Required<Pick<AppLogsConfig, 'maxRetries' | 'retryDelay' | 'endpointCacheDuration'>> & AppLogsConfig;
  private cachedIngestUrl: string | null = null;
  private lastEndpointFetch: number = 0;
  
  constructor(config: AppLogsConfig) {
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      endpointCacheDuration: 3600000, // Default 1 hour cache
      ...config
    };
  }

  private async resolveIngestUrl(): Promise<string> {
    const now = Date.now();
    const cacheExpired = !this.cachedIngestUrl || 
      (now - this.lastEndpointFetch) > this.config.endpointCacheDuration!;

    if (cacheExpired) {
      const isBrowser = typeof window !== 'undefined';
      let response: EndpointResponse;

      if (isBrowser) {
        const res = await fetch(this.config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.config.apiKey
          }
        });

        if (!res.ok) {
          throw new Error(`Failed to resolve ingest URL: ${res.status}`);
        }

        response = await res.json();
      } else {
        const http = await this.getNodeHttpModule();
        const url = new URL(this.config.endpoint);
        
        response = await new Promise((resolve, reject) => {
          const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': this.config.apiKey
            }
          };

          const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk: Buffer) => data += chunk.toString());
            res.on('end', () => {
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                try {
                  resolve(JSON.parse(data));
                } catch (e) {
                  reject(new Error('Invalid JSON response'));
                }
              } else {
                reject(new Error(`Failed to resolve ingest URL: ${res.statusCode}`));
              }
            });
          });

          req.on('error', reject);
          req.end();
        });
      }

      if (!response.success || !response.ingestUrl) {
        throw new Error('Invalid endpoint response');
      }

      this.cachedIngestUrl = response.ingestUrl;
      this.lastEndpointFetch = now;
    }

    return this.cachedIngestUrl!;
  }

  public async send(payload: LogEntry | LogEntry[]): Promise<void> {
    const isBrowser = typeof window !== 'undefined';
    const payloadArray = Array.isArray(payload) ? payload : [payload];
    const ingestUrl = await this.resolveIngestUrl();
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        if (isBrowser) {
          await this.sendBrowser(ingestUrl, payloadArray);
          return;
        } else {
          await this.sendNode(ingestUrl, payloadArray);
          return;
        }
      } catch (error) {
        if (attempt === this.config.maxRetries) throw error;
        await this.sleep(this.config.retryDelay * attempt);
      }
    }
  }

  private async sendBrowser(endpoint: string, payload: LogEntry[]): Promise<Response> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response;
  }

  private async sendNode(endpoint: string, payload: LogEntry[]): Promise<void> {
    const http = await this.getNodeHttpModule();
    const data = JSON.stringify(payload);
    const url = new URL(endpoint);
    
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
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
    const url = this.config.endpoint;
    return url.startsWith('https') 
      ? (await import('https')).default 
      : (await import('http')).default;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
} 
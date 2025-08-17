import { AppLogsConfig, EndpointResponse, LogEntry } from './types';

export class Transport {
  private config: Required<Pick<AppLogsConfig, 'maxRetries' | 'retryDelay' | 'endpointCacheDuration'>> & AppLogsConfig;
  private cachedIngestUrl: string | null = null;
  private lastEndpointFetch = 0;

  constructor(config: AppLogsConfig) {
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      endpointCacheDuration: 3600000, // Default 1 hour cache
      ...config
    };
  }

  private getRuntimeEnvironment(): 'browser' | 'node' | 'edge' {
    // Check for Node.js environment first
    if (typeof process !== 'undefined' && process.versions?.node) {
      return 'node';
    }

    // Check for browser environment
    if (typeof window !== 'undefined') {
      return 'browser';
    }

    // Check for Edge Runtime characteristics
    if (typeof globalThis !== 'undefined' &&
      typeof fetch !== 'undefined' &&
      typeof process === 'undefined' &&
      typeof window === 'undefined') {
      return 'edge';
    }

    // Fallback to fetch-based approach (works in Edge Runtime and modern environments)
    return 'edge';
  }

  private async resolveIngestUrl(): Promise<string> {
    const now = Date.now();
    const cacheExpired = !this.cachedIngestUrl ||
      (now - this.lastEndpointFetch) > this.config.endpointCacheDuration!;

    if (cacheExpired) {
      const runtime = this.getRuntimeEnvironment();
      let response: EndpointResponse;

      if (runtime === 'node') {
        response = await this.fetchNodeEndpoint();
      } else {
        // Use fetch for browser, Edge Runtime, and fallback
        response = await this.fetchEndpoint();
      }

      if (!response.success || !response.ingestUrl) {
        throw new Error('Invalid endpoint response');
      }

      this.cachedIngestUrl = response.ingestUrl;
      this.lastEndpointFetch = now;
    }

    return this.cachedIngestUrl!;
  }

  private async fetchEndpoint(): Promise<EndpointResponse> {
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

    return await res.json();
  }

  private async fetchNodeEndpoint(): Promise<EndpointResponse> {
    const http = await this.getNodeHttpModule();
    const url = new URL(this.config.endpoint);

    return new Promise((resolve, reject) => {
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

  public async send(payload: LogEntry | LogEntry[]): Promise<void> {
    const runtime = this.getRuntimeEnvironment();
    const payloadArray = Array.isArray(payload) ? payload : [payload];
    const ingestUrl = await this.resolveIngestUrl();

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        if (runtime === 'node') {
          await this.sendNode(ingestUrl, payloadArray);
        } else {
          // Use fetch for browser, Edge Runtime, and fallback
          await this.sendFetch(ingestUrl, payloadArray);
        }
        return;
      } catch (error) {
        if (attempt === this.config.maxRetries) throw error;
        await this.sleep(this.config.retryDelay * attempt);
      }
    }
  }

  private async sendFetch(endpoint: string, payload: LogEntry[]): Promise<void> {
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
        'Content-Length': this.getContentLength(data)
      }
    };

    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let _responseData = '';

        res.on('data', (chunk: Buffer) => {
          _responseData += chunk.toString();
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

  private getContentLength(data: string): number {
    // Use TextEncoder for environments that don't have Buffer
    if (typeof Buffer !== 'undefined') {
      return Buffer.byteLength(data);
    } else if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(data).length;
    } else {
      // Fallback for older environments
      return data.length;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
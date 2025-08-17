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

  private getRuntimeEnvironment(): 'fetch' | 'node' {
    // Always prefer fetch if available (works in browsers, Edge Runtime, Node 18+, Next.js)
    if (typeof fetch !== 'undefined' && typeof globalThis !== 'undefined') {
      return 'fetch';
    }
    
    // Fallback to Node.js built-in modules only if fetch is unavailable
    if (typeof process !== 'undefined' && process.versions?.node) {
      return 'node';
    }
    
    // Default to fetch for any unknown environment
    return 'fetch';
  }

  private async resolveIngestUrl(): Promise<string> {
    const now = Date.now();
    const cacheExpired = !this.cachedIngestUrl ||
      (now - this.lastEndpointFetch) > this.config.endpointCacheDuration;

    if (cacheExpired) {
      try {
        const response = await this.fetchEndpoint();
        
        if (!response.success || !response.ingestUrl) {
          throw new Error('Invalid endpoint response: missing ingestUrl or success=false');
        }

        this.cachedIngestUrl = response.ingestUrl;
        this.lastEndpointFetch = now;
      } catch (error) {
        // Clear cache on error to force retry next time
        this.cachedIngestUrl = null;
        this.lastEndpointFetch = 0;
        throw new Error(`Failed to resolve ingest URL: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return this.cachedIngestUrl!;
  }

  private async fetchEndpoint(): Promise<EndpointResponse> {
    const runtime = this.getRuntimeEnvironment();
    
    if (runtime === 'fetch') {
      return this.fetchWithFetch();
    } else {
      return this.fetchWithNode();
    }
  }

  private async fetchWithFetch(): Promise<EndpointResponse> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const res = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'User-Agent': 'app-logs.com Javascript SDK/1.0'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      return data as EndpointResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout after 10 seconds');
      }
      throw error;
    }
  }

  private async fetchWithNode(): Promise<EndpointResponse> {
    try {
      const url = new URL(this.config.endpoint);
      const isHttps = url.protocol === 'https:';
      
      // Use require instead of dynamic import for better compatibility
      const http = isHttps ? require('https') : require('http');
      
      const postData = '';
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'User-Agent': 'app-logs.com Javascript SDK/1.0',
          'Content-Length': this.getByteLength(postData)
        }
      };

      return new Promise<EndpointResponse>((resolve, reject) => {
        const req = http.request(options, (res: any) => {
          let data = '';
          
          res.on('data', (chunk: Buffer) => {
            data += chunk.toString('utf8');
          });
          
          res.on('end', () => {
            try {
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                const parsed = JSON.parse(data);
                resolve(parsed as EndpointResponse);
              } else {
                reject(new Error(`HTTP ${res.statusCode}: ${data || 'Unknown error'}`));
              }
            } catch (e) {
              reject(new Error(`Invalid JSON response: ${data}`));
            }
          });
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout after 10 seconds'));
        });

        req.on('error', (error: Error) => {
          reject(new Error(`Request failed: ${error.message}`));
        });

        if (postData) {
          req.write(postData);
        }
        req.end();
      });
    } catch (error) {
      throw new Error(`Node request setup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async send(payload: LogEntry | LogEntry[]): Promise<void> {
    const payloadArray = Array.isArray(payload) ? payload : [payload];
    
    if (payloadArray.length === 0) {
      return; // Nothing to send
    }

    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const ingestUrl = await this.resolveIngestUrl();
        await this.sendPayload(ingestUrl, payloadArray);
        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on certain errors
        if (this.isNonRetryableError(lastError)) {
          throw lastError;
        }
        
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          await this.sleep(delay);
        }
      }
    }
    
    throw new Error(`Failed to send after ${this.config.maxRetries} attempts. Last error: ${lastError?.message}`);
  }

  private isNonRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('400') || // Bad request
           message.includes('401') || // Unauthorized
           message.includes('403') || // Forbidden
           message.includes('404') || // Not found
           message.includes('invalid json') ||
           message.includes('invalid endpoint response');
  }

  private async sendPayload(endpoint: string, payload: LogEntry[]): Promise<void> {
    const runtime = this.getRuntimeEnvironment();
    
    if (runtime === 'fetch') {
      return this.sendWithFetch(endpoint, payload);
    } else {
      return this.sendWithNode(endpoint, payload);
    }
  }

  private async sendWithFetch(endpoint: string, payload: LogEntry[]): Promise<void> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout for sending

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'User-Agent': 'app-logs.com Javascript SDK/1.0'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Consume response body to free up connection
      await response.text().catch(() => {});
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Send timeout after 15 seconds');
      }
      throw error;
    }
  }

  private async sendWithNode(endpoint: string, payload: LogEntry[]): Promise<void> {
    try {
      const url = new URL(endpoint);
      const isHttps = url.protocol === 'https:';
      const http = isHttps ? require('https') : require('http');
      
      const data = JSON.stringify(payload);
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'User-Agent': 'app-logs.com Javascript SDK/1.0',
          'Content-Length': this.getByteLength(data)
        }
      };

      return new Promise<void>((resolve, reject) => {
        const req = http.request(options, (res: any) => {
          let responseData = '';

          res.on('data', (chunk: Buffer) => {
            responseData += chunk.toString('utf8');
          });

          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve();
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${responseData || 'Unknown error'}`));
            }
          });
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Send timeout after 15 seconds'));
        });

        req.on('error', (error: Error) => {
          reject(new Error(`Send request failed: ${error.message}`));
        });

        req.write(data);
        req.end();
      });
    } catch (error) {
      throw new Error(`Node send setup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getByteLength(data: string): number {
    try {
      // Try Buffer first (Node.js)
      if (typeof Buffer !== 'undefined') {
        return Buffer.byteLength(data, 'utf8');
      }
      
      // Try TextEncoder (modern browsers, Node.js 18+)
      if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(data).length;
      }
      
      // Fallback: rough estimate (not accurate for multi-byte characters)
      let bytes = 0;
      for (let i = 0; i < data.length; i++) {
        const code = data.charCodeAt(i);
        if (code < 0x80) bytes += 1;
        else if (code < 0x800) bytes += 2;
        else if (code < 0x10000) bytes += 3;
        else bytes += 4;
      }
      return bytes;
    } catch {
      // Last resort fallback
      return data.length;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
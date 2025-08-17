# AppLogs JavaScript SDK

[![npm version](https://img.shields.io/npm/v/@applogs/javascript.svg)](https://www.npmjs.com/package/@applogs/javascript)

A powerful, bulletproof logging SDK for both browser and Node.js environments with automatic serverless detection. This SDK provides a robust interface for sending logs to the AppLogs platform with features like intelligent batching, retries, automatic environment detection, and bulletproof flushing for serverless environments.

## Features

- 🚀 **TypeScript support** with full type definitions
- 🌐 **Universal compatibility** - Works in browser, Node.js, and serverless environments
- 🔄 **Intelligent batching** - Smart batch sizes based on environment detection
- 🛡️ **Bulletproof flushing** - Ensures logs are sent even in short-lived serverless functions
- 🔄 **Automatic retries** with exponential backoff
- 🎯 **Serverless optimized** - Automatic detection and optimization for serverless environments
- 📝 **Global context support** for consistent metadata across all logs
- 🔗 **Optional trace ID support** for distributed tracing
- ⚡ **Zero dependencies**
- 🌟 **API route helpers** for Next.js and Express

## Installation

```bash
npm install @applogs/javascript
```

## Quick Start

### Basic Usage

```javascript
import { AppLogs } from '@applogs/javascript';

const logger = new AppLogs({
  apiKey: 'your-api-key',
  endpoint: 'your-project-ingest-endpoint',
  // Optional configuration
  batchSize: 5,         // Default: 5 (persistent env), 1 (serverless)
  flushInterval: 5000,  // Default: 5000ms (ignored in serverless)
  maxRetries: 3,        // Default: 3
  retryDelay: 1000,     // Default: 1000ms
  onError: (error, failedBatch) => {
    console.error('Failed to send logs:', error);
  }
});

// Set global context (applies to all future logs)
logger.setContext({
  service: 'user-api',
  version: '1.2.3',
  environment: 'production'
});

// Basic logging
logger.info('User logged in', { userId: 12345 });
logger.error('Payment failed', { orderId: 'order_123' });

// Clean up when done
logger.destroy();
```

### Next.js API Routes (Recommended Patterns)

```javascript
// Method 1: Manual flush (Most reliable)
export default async function handler(req, res) {
  const logger = new AppLogs({
    apiKey: process.env.APP_LOGS_API_KEY,
    endpoint: process.env.APP_LOGS_ENDPOINT
  });

  try {
    logger.log('info', 'API request started', {
      method: req.method,
      path: req.url
    });

    const result = await processRequest(req);

    logger.log('info', 'API request completed');

    // ✅ CRITICAL: Flush before response in serverless
    await logger.flush();

    return res.json(result);
  } catch (error) {
    await logger.errorAsync('API request failed', { error: error.message });
    return res.status(500).json({ error: 'Internal error' });
  }
}

// Method 2: Using sync methods (Alternative)
export default async function handler(req, res) {
  const logger = new AppLogs({
    apiKey: process.env.APP_LOGS_API_KEY,
    endpoint: process.env.APP_LOGS_ENDPOINT
  });

  try {
    // Async methods automatically send logs immediately
    await logger.infoAsync('Processing API request');
    
    const result = await processRequest(req);
    
    await logger.infoAsync('API request successful');
    
    return res.json(result);
  } catch (error) {
    await logger.errorAsync('API request failed', { error });
    return res.status(500).json({ error: 'Failed' });
  }
}

// Method 3: Using wrapper (Cleanest)
const logger = new AppLogs({
  apiKey: process.env.APP_LOGS_API_KEY,
  endpoint: process.env.APP_LOGS_ENDPOINT
});

export default logger.wrapApiRoute(async (req, res) => {
  logger.log('info', 'API called');
  const result = await processRequest(req);
  logger.log('info', 'API completed');
  return res.json(result);
  // Logs automatically flushed before response
});
```

### Express.js with Middleware

```javascript
import express from 'express';
import { AppLogs } from '@applogs/javascript';

const app = express();
const logger = new AppLogs({
  apiKey: process.env.APP_LOGS_API_KEY,
  endpoint: process.env.APP_LOGS_ENDPOINT
});

// Use middleware for automatic log flushing
app.use(logger.middleware());

app.get('/users', async (req, res) => {
  // Logging methods available on req
  req.log('info', 'Fetching users');
  
  const users = await getUsers();
  req.log('info', 'Users fetched', { count: users.length });
  
  res.json(users);
  // Logs automatically flushed before response
});
```

### Browser Usage

```javascript
const logger = new AppLogs({
  apiKey: 'your-client-api-key',
  endpoint: 'https://api.app-logs.com/ingest',
  batchSize: 10,
  flushInterval: 5000
});

logger.setContext({
  userId: getCurrentUserId(),
  sessionId: getSessionId()
});

// Standard logging (batched)
logger.info('Page loaded', { page: window.location.pathname });
logger.warn('Slow API response', { responseTime: 2000 });

// Critical logs (immediate)
try {
  await criticalOperation();
} catch (error) {
  await logger.errorAsync('Critical operation failed', { error });
}

// Automatic cleanup on page unload
window.addEventListener('beforeunload', async () => {
  await logger.flush();
});
```

## API Reference

### Configuration

```typescript
interface AppLogsConfig {
  apiKey: string;                    // Required: Your AppLogs API key
  endpoint: string;                  // Required: Your project's ingest endpoint URL
  batchSize?: number;                // Optional: Batch size (default: 5 persistent, 1 serverless)
  flushInterval?: number;            // Optional: Flush interval in ms (default: 5000)
  maxRetries?: number;               // Optional: Max retry attempts (default: 3)
  retryDelay?: number;               // Optional: Retry delay in ms (default: 1000)
  endpointCacheDuration?: number;    // Optional: Cache duration for ingest URL (default: 3600000)
  onError?: (error: Error, failedBatch: LogEntry[]) => void; // Optional: Error callback
}
```

### Core Logging Methods

#### Standard Async Logging (Persistent Environments)
```typescript
log(level: LogLevel, message: string, context?: Context): void
info(message: string, context?: Context): void
warn(message: string, context?: Context): void
error(message: string, context?: Context): void
debug(message: string, context?: Context): void
```

#### Asynchronous Immediate Logging (Serverless/Critical Logs)
```typescript
logAsync(level: LogLevel, message: string, context?: Context): Promise<void>
infoAsync(message: string, context?: Context): Promise<void>
warnAsync(message: string, context?: Context): Promise<void>
errorAsync(message: string, context?: Context): Promise<void>
debugAsync(message: string, context?: Context): Promise<void>
```

#### Trace ID Support
```typescript
logWithTrace(level: LogLevel, message: string, traceId: string, context?: Context): void
logWithTraceAsync(level: LogLevel, message: string, traceId: string, context?: Context): Promise<void>
```

### Context Management

```typescript
setContext(context: Context): void          // Replace all global context
addContext(context: Context): void          // Add to existing context
removeContext(keys: string[]): void         // Remove specific keys
clearContext(): void                        // Clear all context
getContext(): Context                       // Get current context
```

### Control Methods

```typescript
flush(): Promise<void>                      // Flush all pending logs
destroy(): void                             // Clean up resources
getStatus(): StatusInfo                     // Get diagnostic information
```

### Helpers

```typescript
wrapApiRoute<T>(handler: T): T             // Wrap API route with auto-flush
middleware()                               // Express/Connect middleware
```

### Types

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  metadata?: LogMetadata;
  timestamp?: string;
  source: string;
  traceId?: string;
}

interface LogMetadata {
  context: Record<string, unknown>;
  sdk: {
    version: string;
    environment: string;
  };
  log_metadata?: Record<string, unknown>;
}

interface Context {
  [key: string]: unknown;
}
```

## Environment Detection

The SDK automatically detects and optimizes for different environments:

- **Serverless Functions**: Uses smaller batch sizes (1), immediate flushing, no intervals
- **Persistent Environments**: Uses larger batch sizes (5), background flushing, intervals
- **Browser**: Uses sendBeacon for reliable log delivery during page transitions
- **Node.js**: Uses appropriate HTTP clients and cleanup handlers

## Best Practices

### For Serverless (Vercel, Netlify, AWS Lambda, etc.)

1. **Always flush before responses**:
   ```typescript
   await logger.flush(); // Before res.json()
   ```

2. **Use sync methods for critical logs**:
   ```typescript
   await logger.errorAsync('Critical error', context);
   ```

3. **Use API route wrapper**:
   ```typescript
   export default logger.wrapApiRoute(handler);
   ```

### For Persistent Environments

1. **Set global context once**:
   ```typescript
   logger.setContext({ service: 'api', version: '1.0' });
   ```

2. **Use async methods for performance**:
   ```typescript
   logger.info('Regular log'); // Non-blocking
   ```

3. **Clean up on shutdown**:
   ```typescript
   process.on('SIGTERM', () => logger.destroy());
   ```

### General

1. **Context hierarchy**: Local context overrides global context
2. **Error handling**: Implement `onError` callback for failed transmissions
3. **Trace IDs**: Use for distributed tracing across services
4. **Batch sizes**: Smaller for serverless (1), larger for persistent (5-10)

## Troubleshooting

### Logs not appearing in production serverless environments?

1. Ensure you're calling `await logger.flush()` before API responses
2. Use sync methods: `await logger.infoAsync()` instead of `logger.info()`
3. Use the API wrapper: `logger.wrapApiRoute(handler)`
4. Check that your API key and endpoint are correctly configured

### Performance concerns?

1. Use async methods in persistent environments: `logger.info()` vs `await logger.infoAsync()`
2. Adjust batch sizes based on your needs
3. Use global context to avoid repeating metadata

### Debugging?

```typescript
const status = logger.getStatus();
console.log({
  isServerless: status.isServerless,
  queueLength: status.queueLength,
  config: status.config
});
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details
# AppLogs JavaScript SDK

[![npm version](https://img.shields.io/npm/v/@applogs/javascript.svg)](https://www.npmjs.com/package/@applogs/javascript)

A powerful, type-safe logging SDK for both browser and Node.js environments. This SDK provides a simple yet powerful interface for sending logs to the AppLogs platform with features like batching, retries, and automatic environment detection.

## Features

- 🚀 TypeScript support with full type definitions
- 🌐 Works in both browser and Node.js environments
- 📦 Automatic batching of logs
- 🔄 Automatic retries with configurable delay
- 🔍 Environment detection (browser/node)
- 🛡️ Error handling with custom callbacks
- 📝 Context support for global metadata
- 🔗 Automatic trace ID generation and management
- ⚡ Zero dependencies

## Installation

```bash
npm install @applogs/javascript
```

## Quick Start

### Browser Usage

```javascript
// ES Modules
import { AppLogs } from '@applogs/javascript';

// Or CommonJS
const { AppLogs } = require('@applogs/javascript');

const logger = new AppLogs({
  apiKey: 'your-api-key',
  endpoint: 'https://www.applogs.com/api/v1/projects/:project_id/ingest-endpoint', // Optional
  batchSize: 10, // Optional, default: 5
  flushInterval: 5000, // Optional, default: 5000ms
  onError: (error, failedBatch) => {
    console.error('Failed to send logs:', error);
  }
});

// Set global context
logger.setContext({
  appVersion: '1.0.0',
  environment: 'production'
});

// Get the current trace ID to use in downstream services
const traceId = logger.getTraceId();
console.log('Current trace ID:', traceId);

// Log messages with the current trace ID
logger.info('User logged in', { userId: 12345 });
logger.error('Payment failed', { 
  orderId: 'order_123', 
  error: 'Insufficient funds' 
});

// Set a new trace ID for a new request
const newTraceId = logger.setTraceId();
logger.info('Starting new request', { requestId: 'req-123' });

// Or set a specific trace ID
logger.setTraceId('custom-trace-123');
logger.info('Processing with custom trace', { action: 'process' });

// Clean up when done
logger.destroy();
```

### Node.js Usage

```typescript
import { AppLogs } from '@applogs/javascript';

const logger = new AppLogs({
  apiKey: 'your-api-key',
  endpoint: 'https://api.applogs.com/v1/logs'
});

// Set context
logger.setContext({
  service: 'payment-service',
  region: 'us-east-1'
});

// Example of using trace ID in an Express middleware
app.use((req, res, next) => {
  // Set trace ID from request header or generate new one
  const traceId = req.headers['x-trace-id'] as string;
  logger.setTraceId(traceId);
  
  // Add trace ID to response for downstream services
  res.setHeader('x-trace-id', logger.getTraceId());
  next();
});

app.post('/payment', async (req, res) => {
  try {
    // Logs will automatically use the current trace ID
    logger.info('Processing payment', { orderId: req.body.orderId });
    
    // You can also get the current trace ID to use in other services
    const traceId = logger.getTraceId();
    await paymentService.process(req.body, traceId);
    
    logger.info('Payment processed successfully');
    res.json({ success: true });
  } catch (error) {
    logger.error('Payment processing failed', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Payment failed' });
  }
});

// Clean up
process.on('SIGTERM', () => {
  logger.destroy();
});
```

## API Reference

### Configuration

```typescript
interface AppLogsConfig {
  apiKey: string;              // Required: Your AppLogs API key
  endpoint: string;           // Required: Your project's ingest endpoint URL
  batchSize?: number;          // Optional: Number of logs to batch (default: 5)
  flushInterval?: number;      // Optional: Flush interval in ms (default: 5000)
  maxRetries?: number;         // Optional: Max retry attempts (default: 3)
  retryDelay?: number;         // Optional: Retry delay in ms (default: 1000)
  onError?: (error: Error, failedBatch: LogEntry[]) => void; // Optional: Error callback
}
```

### Methods

#### `constructor(config: AppLogsConfig)`
Creates a new AppLogs instance with an automatically generated trace ID.

#### `getTraceId(): string`
Gets the current trace ID that will be used for subsequent logs.

#### `setTraceId(traceId?: string): string`
Sets a new trace ID for subsequent logs. If no trace ID is provided, generates a new one.
Returns the new trace ID.

#### `setContext(context: Context): void`
Sets global context that will be included with every log entry.

#### `log(level: LogLevel, message: string, metadata?: Record<string, unknown>, traceId?: string): void`
Logs a message with the specified level, optional metadata, and optional trace ID.
If no trace ID is provided, uses the current trace ID.

#### `debug(message: string, metadata?: Record<string, unknown>, traceId?: string): void`
Logs a debug message.

#### `info(message: string, metadata?: Record<string, unknown>, traceId?: string): void`
Logs an info message.

#### `warn(message: string, metadata?: Record<string, unknown>, traceId?: string): void`
Logs a warning message.

#### `error(message: string, metadata?: Record<string, unknown>, traceId?: string): void`
Logs an error message.

#### `destroy(): void`
Cleans up resources and flushes any remaining logs.

### Types

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogMetadata {
  context: Record<string, unknown>;
  sdk: {
    version: string;
    environment: string;
  };
  log_metadata?: Record<string, unknown>;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  metadata?: LogMetadata;
  timestamp?: string;
  source: string;  // Always set to "sdk"
  traceId: string; // Always present, either provided or generated
}

interface Context {
  [key: string]: unknown;
}
```

## Best Practices

1. **Always call destroy()**: When shutting down your application, call `destroy()` to ensure all logs are sent.

2. **Use context wisely**: Set global context for information that applies to all logs (e.g., environment, version).

3. **Trace ID Management**:
   - Use `getTraceId()` to get the current trace ID for downstream services
   - Use `setTraceId()` to set a new trace ID for a new request/operation
   - Pass trace IDs between services using headers (e.g., `x-trace-id`)
   - Let the SDK handle trace ID generation when not explicitly set

4. **Error handling**: Implement the `onError` callback to handle failed log transmissions.

5. **Batch size**: Adjust `batchSize` based on your application's needs. Larger batches are more efficient but may delay log delivery.

6. **Environment detection**: The SDK automatically detects the environment (browser/node) and uses the appropriate transport.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details
import { config } from 'dotenv';
config();

import { AppLogs } from '@applogs/javascript';

const endpoint = process.env.APPLOGS_API_ENDPOINT || '';
const apiKey = process.env.APPLOGS_API_KEY || '';

const logger = new AppLogs({ endpoint, apiKey });

// Set some global context
logger.setContext({
  service: 'test-node-app',
  environment: process.env.NODE_ENV || 'development',
  version: '1.0.0'
});

interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
}

function randomLogEntry(): LogEntry {
  const entries: LogEntry[] = [
    {
      level: 'debug',
      message: 'Processing request',
      metadata: { requestId: `req_${Math.random().toString(36).substr(2, 9)}` }
    },
    {
      level: 'info',
      message: 'User action completed',
      metadata: { 
        userId: Math.floor(Math.random() * 1000),
        action: 'login',
        timestamp: new Date().toISOString()
      }
    },
    {
      level: 'warn',
      message: 'Resource usage high',
      metadata: {
        cpu: Math.random() * 100,
        memory: Math.random() * 1000,
        threshold: 80
      }
    },
    {
      level: 'error',
      message: 'Failed to process payment',
      metadata: {
        orderId: `order_${Math.random().toString(36).substr(2, 9)}`,
        error: 'Insufficient funds',
        amount: Math.floor(Math.random() * 1000)
      }
    }
  ];
  return entries[Math.floor(Math.random() * entries.length)];
}

setInterval(() => {
  const entry = randomLogEntry();
  logger.log(entry.level, entry.message, entry.metadata);
}, 2000);

console.log('AppLogs SDK Node Demo Up and Running');

// Clean up on process termination
process.on('SIGTERM', () => {
  logger.destroy();
}); 
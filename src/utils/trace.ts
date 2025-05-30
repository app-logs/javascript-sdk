// Use a conditional import that Vite can handle
const cryptoRandomBytes = typeof process !== 'undefined' && process.versions?.node
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ? require('crypto').randomBytes
  : null;

/**
 * Generates a unique trace ID based on the environment
 * In Node.js: Uses crypto.randomBytes for better entropy
 * In Browser: Uses crypto.getRandomValues if available, falls back to Math.random
 */
export function generateTraceId(): string {
  const isBrowser = typeof window !== 'undefined';

  if (!isBrowser && cryptoRandomBytes) {
    // Node.js environment
    return cryptoRandomBytes(16).toString('hex');
  }

  // Browser environment
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    // Modern browsers with crypto API
    const buffer = new Uint8Array(16);
    crypto.getRandomValues(buffer);
    return Array.from(buffer)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Fallback for older browsers
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

/**
 * Ensures a trace ID is present, generating one if not provided
 */
export function ensureTraceId(traceId?: string): string {
  return traceId || generateTraceId();
} 
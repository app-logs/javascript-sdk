# @applogs/javascript

## 0.1.5

### Patch Changes

- bcf30c8: Transport updates to ensure Edge and Serverless support.

  Key Improvements:

  - Fetch-First Strategy: Always prefers fetch when available, which works in browsers, Edge Runtime, Node.js 18+, and Next.js API routes.
  - Eliminated Dynamic Imports: Uses require() for Node.js modules to avoid serverless compatibility issues.
  - Better Environment Detection: Checks for Vercel environment and prioritizes fetch over Node.js modules.
  - Comprehensive Error Handling:
    - Proper timeout handling (10s for endpoint resolution, 15s for sending)
    - Distinguishes between retryable and non-retryable errors
    - Exponential backoff for retries
    - Clear error messages with context
  - Robust HTTP Implementation:
    - Proper abort controller usage for fetch
    - Timeout handling for Node.js requests
    - Response body consumption to free connections
    - UTF-8 encoding specification
  - Better Byte Length Calculation: Handles multi-byte UTF-8 characters correctly with fallbacks.
  - Enhanced Reliability:
    - Cache invalidation on errors
    - Empty payload validation
    - Connection cleanup
    - User-Agent headers for debugging

  Next.js/Vercel Optimized: Designed to work seamlessly in serverless environments while maintaining compatibility with other runtimes.

## 0.1.4

### Patch Changes

- f74ee30: Edge transport

## 0.1.3

### Patch Changes

- dba5c42: packages bugs fixing

## 0.1.2

### Patch Changes

- 2a8c67f: respository links updates

## 0.1.1

### Patch Changes

- 78e9675: bug fix in serialize-complex.ts

## 0.1.0

### Minor Changes

- ae9c518: Log metadata serialization introduced.

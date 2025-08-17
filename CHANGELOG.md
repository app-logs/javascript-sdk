# @applogs/javascript

## 0.1.8

### Patch Changes

- 2c5a746: Sync functions renamed to Async for naming convention accuracy

## 0.1.7

### Patch Changes

- 959b2cb: `setContext` is a common and useful feature in logging libraries that allows you to set persistent context that gets automatically added to all subsequent log entries.

  `setContext` is a **critical feature** that most logging libraries should have.

  ## What `setContext` Does:

  ### 1. **Global Context Storage**

  ```typescript
  // Sets persistent context for ALL future logs
  appLogs.setContext({
    service: "user-api",
    version: "1.2.3",
    environment: "production",
  });
  ```

  ### 2. **Context Merging**

  ```typescript
  // Global context gets merged with local context
  appLogs.info("User action", { action: "login", userId: "123" });
  // Results in both global context AND local context in the log
  ```

  ### 3. **Context Management Methods**

  - `setContext()` - Replace all global context
  - `addContext()` - Add to existing global context
  - `removeContext()` - Remove specific keys
  - `clearContext()` - Remove all global context
  - `getContext()` - View current global context

  ## Why This Was Missing (and Important):

  1. **Without `setContext`**, you'd have to manually pass the same context to every single log call
  2. **With `setContext`**, you set it once and it automatically appears in all logs
  3. **Essential for**:
     - Request tracing (requestId, userId, etc.)
     - Service identification (service name, version, etc.)
     - Environment context (region, deployment, etc.)

  ## Priority Order:

  Local context > Global context, so you can always override global values when needed.

  This was definitely a missing piece that makes the logging library much more practical to use!

## 0.1.6

### Patch Changes

- b303e55: Optimization for serverless environment

  Key Changes Made:

  1. Environment Detection

  Automatically detects serverless vs persistent environments
  Adjusts behavior accordingly without hardcoding platform names

  2. Bulletproof Flushing

  flushAndWait() method ensures logs are sent before function termination
  Multiple fallback mechanisms (sendBeacon, XHR, sync requests)
  Retry logic for failed flushes

  3. Dual Logging Methods

  log() - Standard async logging for persistent environments
  logSync() - Immediate sending for serverless environments
  Convenience methods for both approaches

  4. API Route Integration

  wrapApiRoute() method for automatic log flushing
  Middleware support for Express/Connect
  Manual flush methods for explicit control

  5. Enhanced Cleanup Handlers

  Multiple exit scenarios covered (beforeunload, pagehide, SIGTERM, etc.)
  Browser sendBeacon support for reliable logging during page transitions
  Synchronous fallbacks for critical shutdown scenarios

  6. Smart Batching

  Smaller batch sizes in serverless (default 1)
  Larger batches in persistent environments (default 5)
  Immediate flushing options

  7. Added Tracing Support

  logWithTrace() and logWithTraceSync() methods for distributed tracing
  Automatic trace ID generation in examples

  8. Environment Detection

  Properly detects browser vs Node.js environments
  Sets appropriate SDK environment values
  Adds platform metadata when detected

  How to Use in Next.js API Routes:

  ```typescript
  // Simply add this before your response:
  await appLogs.flush();

  // Or use sync methods:
  await appLogs.infoSync("message", context);

  // Or wrap your handler:
  export default appLogs.wrapApiRoute(yourHandler);
  ```

  This version will work reliably across all deployment environments without requiring platform-specific configuration.

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

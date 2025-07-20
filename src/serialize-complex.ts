/**
 * Comprehensive object serialization utility for complex objects including
 * Request, Response, Error, and other built-in types with special handling
 * for circular references, non-enumerable properties, and browser/Node.js compatibility
 */

interface SerializationOptions {
  /** Maximum depth to prevent infinite recursion */
  maxDepth?: number;
  /** Include non-enumerable properties */
  includeNonEnumerable?: boolean;
  /** Include function properties (serialized as string representation) */
  includeFunctions?: boolean;
  /** Custom serializers for specific types */
  customSerializers?: Map<string, (obj: any) => any>;
  /** Include prototype chain properties */
  includePrototype?: boolean;
}

interface SerializedObject {
  __type?: string;
  __circular?: boolean;
  [key: string]: any;
}

/**
 * Serializes complex objects including Request, Error, and other built-in types
 * Handles circular references, non-enumerable properties, and special object types
 */
export function serializeObject(
  obj: any, 
  options: SerializationOptions = {}
): any {
  const {
    maxDepth = 10,
    includeNonEnumerable = true,
    includeFunctions = false,
    customSerializers = new Map(),
    includePrototype = false
  } = options;

  const seen = new WeakSet();
  const circularRefs = new WeakMap();

  function serialize(value: any, depth: number = 0): any {
    // Handle primitive types
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
      return value;
    }

    if (typeof value === 'bigint') {
      return { __type: 'BigInt', value: value.toString() };
    }

    if (typeof value === 'symbol') {
      return { __type: 'Symbol', description: value.description };
    }

    if (typeof value === 'function') {
      if (!includeFunctions) return { __type: 'Function', name: value.name };
      return { 
        __type: 'Function', 
        name: value.name, 
        source: value.toString(),
        length: value.length
      };
    }

    // Check for circular references
    if (seen.has(value)) {
      const id = circularRefs.get(value) || Math.random().toString(36);
      circularRefs.set(value, id);
      return { __circular: true, __ref: id };
    }

    // Check max depth
    if (depth >= maxDepth) {
      return { __type: 'MaxDepthExceeded', constructor: value.constructor?.name };
    }

    seen.add(value);

    try {
      // Handle Date objects
      if (value instanceof Date) {
        return {
          __type: 'Date',
          value: value.toISOString(),
          timestamp: value.getTime()
        };
      }

      // Handle RegExp objects
      if (value instanceof RegExp) {
        return {
          __type: 'RegExp',
          source: value.source,
          flags: value.flags
        };
      }

      // Handle Error objects
      if (value instanceof Error) {
        const errorObj: SerializedObject = {
          __type: 'Error',
          name: value.name,
          message: value.message,
          stack: value.stack
        };

        // Include additional error properties
        const errorProps = Object.getOwnPropertyNames(value);
        for (const prop of errorProps) {
          if (!['name', 'message', 'stack'].includes(prop)) {
            try {
              errorObj[prop] = serialize((value as any)[prop], depth + 1);
            } catch (e) {
              errorObj[prop] = { __type: 'SerializationError', error: String(e) };
            }
          }
        }

        return errorObj;
      }

      // Handle Request objects (Web API)
      if (typeof Request !== 'undefined' && value instanceof Request) {
        return serializeRequest(value, depth);
      }

      // Handle Response objects (Web API)
      if (typeof Response !== 'undefined' && value instanceof Response) {
        return serializeResponse(value, depth);
      }

      // Handle Headers objects (Web API)
      if (typeof Headers !== 'undefined' && value instanceof Headers) {
        const headers: Record<string, string> = {};
        value.forEach((val, key) => {
          headers[key] = val;
        });
        return { __type: 'Headers', headers };
      }

      // Handle URL objects
      if (typeof URL !== 'undefined' && value instanceof URL) {
        return {
          __type: 'URL',
          href: value.href,
          origin: value.origin,
          protocol: value.protocol,
          host: value.host,
          hostname: value.hostname,
          port: value.port,
          pathname: value.pathname,
          search: value.search,
          hash: value.hash
        };
      }

      // Handle URLSearchParams
      if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) {
        const params: Record<string, string[]> = {};
        for (const [key, val] of value) {
          if (!params[key]) params[key] = [];
          params[key].push(val);
        }
        return { __type: 'URLSearchParams', params };
      }

      // Handle Map objects
      if (value instanceof Map) {
        const entries = Array.from(value.entries()).map(([k, v]) => [
          serialize(k, depth + 1),
          serialize(v, depth + 1)
        ]);
        return { __type: 'Map', entries };
      }

      // Handle Set objects
      if (value instanceof Set) {
        const values = Array.from(value).map(v => serialize(v, depth + 1));
        return { __type: 'Set', values };
      }

      // Handle Arrays
      if (Array.isArray(value)) {
        return value.map(item => serialize(item, depth + 1));
      }

      // Handle ArrayBuffer and TypedArrays
      if (value instanceof ArrayBuffer) {
        return {
          __type: 'ArrayBuffer',
          byteLength: value.byteLength,
          data: Array.from(new Uint8Array(value))
        };
      }

      if (ArrayBuffer.isView(value)) {
        const typedArray = value as any;
        return {
          __type: typedArray.constructor.name,
          data: Array.from(typedArray),
          byteOffset: typedArray.byteOffset,
          byteLength: typedArray.byteLength
        };
      }

      // Check for custom serializers
      const constructorName = value.constructor?.name;
      if (constructorName && customSerializers.has(constructorName)) {
        const customSerializer = customSerializers.get(constructorName)!;
        return customSerializer(value);
      }

      // Handle plain objects
      const result: SerializedObject = {};
      
      if (constructorName && constructorName !== 'Object') {
        result.__type = constructorName;
      }

      // Get property names
      const propNames = includeNonEnumerable 
        ? Object.getOwnPropertyNames(value)
        : Object.keys(value);

      for (const key of propNames) {
        try {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          if (descriptor && descriptor.get && !descriptor.set) {
            // Skip getter-only properties that might throw
            continue;
          }
          
          const propValue = value[key];
          result[key] = serialize(propValue, depth + 1);
        } catch (error) {
          result[key] = { 
            __type: 'PropertyAccessError', 
            error: String(error),
            key 
          };
        }
      }

      // Include prototype properties if requested
      if (includePrototype && value.constructor !== Object) {
        const proto = Object.getPrototypeOf(value);
        if (proto && proto !== Object.prototype) {
          result.__proto = serialize(proto, depth + 1);
        }
      }

      return result;

    } finally {
      seen.delete(value);
    }
  }

  return serialize(obj);
}

/**
 * Specialized serializer for Request objects
 */
async function serializeRequest(request: Request, depth: number): Promise<SerializedObject> {
  const result: SerializedObject = {
    __type: 'Request',
    url: request.url,
    method: request.method,
    headers: {},
    mode: request.mode,
    credentials: request.credentials,
    cache: request.cache,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    integrity: request.integrity,
    keepalive: request.keepalive,
    signal: request.signal ? {
      __type: 'AbortSignal',
      aborted: request.signal.aborted,
      reason: request.signal.reason
    } : null
  };

  // Serialize headers
  if (request.headers) {
    request.headers.forEach((value, key) => {
      (result.headers as any)[key] = value;
    });
  }

  // Handle body (note: this consumes the stream)
  try {
    if (request.body) {
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        result.body = await request.json();
        result.bodyType = 'json';
      } else if (contentType.includes('text/')) {
        result.body = await request.text();
        result.bodyType = 'text';
      } else {
        result.body = Array.from(new Uint8Array(await request.arrayBuffer()));
        result.bodyType = 'arrayBuffer';
      }
    }
  } catch (error) {
    result.body = { __type: 'BodySerializationError', error: String(error) };
  }

  return result;
}

/**
 * Specialized serializer for Response objects
 */
async function serializeResponse(response: Response, depth: number): Promise<SerializedObject> {
  const result: SerializedObject = {
    __type: 'Response',
    url: response.url,
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    redirected: response.redirected,
    type: response.type,
    headers: {}
  };

  // Serialize headers
  if (response.headers) {
    response.headers.forEach((value, key) => {
      (result.headers as any)[key] = value;
    });
  }

  // Handle body (note: this consumes the stream)
  try {
    if (response.body && !response.bodyUsed) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        result.body = await response.json();
        result.bodyType = 'json';
      } else if (contentType.includes('text/')) {
        result.body = await response.text();
        result.bodyType = 'text';
      } else {
        result.body = Array.from(new Uint8Array(await response.arrayBuffer()));
        result.bodyType = 'arrayBuffer';
      }
    }
  } catch (error) {
    result.body = { __type: 'BodySerializationError', error: String(error) };
  }

  return result;
}

/**
 * Deserializes objects back to their original form where possible
 */
export function deserializeObject(serialized: any): any {
  if (!serialized || typeof serialized !== 'object') {
    return serialized;
  }

  // Handle circular references
  if (serialized.__circular) {
    return { __circular_ref: serialized.__ref };
  }

  // Handle special types
  switch (serialized.__type) {
    case 'Date':
      return new Date(serialized.value);
    
    case 'RegExp':
      return new RegExp(serialized.source, serialized.flags);
    
    case 'BigInt':
      return BigInt(serialized.value);
    
    case 'Symbol':
      return Symbol(serialized.description);
    
    case 'Error':
      const error = new Error(serialized.message);
      error.name = serialized.name;
      if (serialized.stack) error.stack = serialized.stack;
      
      // Restore additional properties
      Object.keys(serialized).forEach(key => {
        if (!['__type', 'name', 'message', 'stack'].includes(key)) {
          (error as any)[key] = deserializeObject(serialized[key]);
        }
      });
      return error;
    
    case 'Map':
      return new Map(
        serialized.entries.map(([k, v]: [any, any]) => [
          deserializeObject(k),
          deserializeObject(v)
        ])
      );
    
    case 'Set':
      return new Set(serialized.values.map(deserializeObject));
    
    case 'ArrayBuffer':
      return new Uint8Array(serialized.data).buffer;
    
    case 'URL':
      return new URL(serialized.href);
    
    case 'URLSearchParams':
      const params = new URLSearchParams();
      Object.entries(serialized.params).forEach(([key, values]) => {
        (values as string[]).forEach(value => params.append(key, value));
      });
      return params;
  }

  // Handle arrays
  if (Array.isArray(serialized)) {
    return serialized.map(deserializeObject);
  }

  // Handle objects
  const result: any = {};
  Object.keys(serialized).forEach(key => {
    if (key !== '__type') {
      result[key] = deserializeObject(serialized[key]);
    }
  });

  return result;
}

// Example usage and tests
export function createCustomSerializer() {
  const customSerializers = new Map();
  
  // Example custom serializer for a hypothetical class
  customSerializers.set('CustomClass', (obj: any) => ({
    __type: 'CustomClass',
    customProp: obj.customProp,
    timestamp: Date.now()
  }));

  return customSerializers;
}

// Utility function for common use cases
export function serializeForLogging(obj: any): string {
  try {
    const serialized = serializeObject(obj, {
      maxDepth: 5,
      includeNonEnumerable: true,
      includeFunctions: false
    });
    return JSON.stringify(serialized, null, 2);
  } catch (error) {
    return `Serialization failed: ${error}`;
  }
}

export function serializeForTransport(obj: any): string {
  const serialized = serializeObject(obj, {
    maxDepth: 10,
    includeNonEnumerable: false,
    includeFunctions: false
  });
  return JSON.stringify(serialized);
}
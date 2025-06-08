interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyGenerator?: (identifier: string) => string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private cache = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  check(identifier: string, config: RateLimitConfig): boolean {
    const key = config.keyGenerator ? config.keyGenerator(identifier) : identifier;
    const now = Date.now();
    const entry = this.cache.get(key);

    if (!entry || now > entry.resetTime) {
      // First request or window has reset
      this.cache.set(key, {
        count: 1,
        resetTime: now + config.windowMs
      });
      return true;
    }

    if (entry.count >= config.maxRequests) {
      // Rate limit exceeded
      return false;
    }

    // Increment counter
    entry.count++;
    return true;
  }

  getRemainingTime(identifier: string, config: RateLimitConfig): number {
    const key = config.keyGenerator ? config.keyGenerator(identifier) : identifier;
    const entry = this.cache.get(key);
    
    if (!entry) return 0;
    
    return Math.max(0, entry.resetTime - Date.now());
  }

  reset(identifier: string, config: RateLimitConfig): void {
    const key = config.keyGenerator ? config.keyGenerator(identifier) : identifier;
    this.cache.delete(key);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.resetTime) {
        this.cache.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}

// Global rate limiter instance
const globalRateLimiter = new RateLimiter();

// Predefined rate limit configurations
export const RATE_LIMITS = {
  // Database operations
  DATABASE_QUERIES: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute
  },
  DATABASE_MUTATIONS: {
    maxRequests: 50,
    windowMs: 60 * 1000, // 1 minute
  },
  
  // Authentication
  AUTH_ATTEMPTS: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
  PASSWORD_RESET: {
    maxRequests: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  
  // Order operations
  ORDER_CREATION: {
    maxRequests: 10,
    windowMs: 60 * 1000, // 1 minute
  },
  ORDER_UPDATES: {
    maxRequests: 30,
    windowMs: 60 * 1000, // 1 minute
  },
  
  // General API
  API_CALLS: {
    maxRequests: 200,
    windowMs: 60 * 1000, // 1 minute
  }
} as const;

// Rate limiting decorator for functions
export function rateLimit<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  config: RateLimitConfig,
  getIdentifier: (...args: T) => string = () => 'default'
) {
  return async (...args: T): Promise<R> => {
    const identifier = getIdentifier(...args);
    
    if (!globalRateLimiter.check(identifier, config)) {
      const remainingTime = globalRateLimiter.getRemainingTime(identifier, config);
      throw new Error(
        `Rate limit exceeded. Please try again in ${Math.ceil(remainingTime / 1000)} seconds.`
      );
    }
    
    return fn(...args);
  };
}

// Hook for React components
export function useRateLimit(identifier: string, config: RateLimitConfig) {
  const check = () => globalRateLimiter.check(identifier, config);
  const getRemainingTime = () => globalRateLimiter.getRemainingTime(identifier, config);
  const reset = () => globalRateLimiter.reset(identifier, config);
  
  return { check, getRemainingTime, reset };
}

// User-specific rate limiting (based on IP or user ID)
export function getUserIdentifier(): string {
  // In a real app, you'd get this from authentication or IP
  // For now, use a browser fingerprint approach
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    new Date().getTimezoneOffset()
  ].join('|');
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return `user_${hash}`;
}

// Rate limit middleware for common operations
export const rateLimitedOperations = {
  // Database operations
  query: rateLimit(
    async (queryFn: () => Promise<any>) => queryFn(),
    RATE_LIMITS.DATABASE_QUERIES,
    () => getUserIdentifier()
  ),
  
  mutate: rateLimit(
    async (mutateFn: () => Promise<any>) => mutateFn(),
    RATE_LIMITS.DATABASE_MUTATIONS,
    () => getUserIdentifier()
  ),
  
  // Authentication
  authenticate: rateLimit(
    async (authFn: () => Promise<any>) => authFn(),
    RATE_LIMITS.AUTH_ATTEMPTS,
    () => getUserIdentifier()
  ),
  
  // Orders
  createOrder: rateLimit(
    async (createFn: () => Promise<any>) => createFn(),
    RATE_LIMITS.ORDER_CREATION,
    () => getUserIdentifier()
  ),
  
  updateOrder: rateLimit(
    async (updateFn: () => Promise<any>) => updateFn(),
    RATE_LIMITS.ORDER_UPDATES,
    () => getUserIdentifier()
  ),
};

// Cleanup function for app shutdown
export function cleanupRateLimit(): void {
  globalRateLimiter.destroy();
}

// Initialize cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanupRateLimit);
} 
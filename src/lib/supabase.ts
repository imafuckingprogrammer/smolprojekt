import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import { getEnvironmentConfig, getSafeEnvironmentConfig } from './environment';

// Get environment configuration with validation
let envConfig;
try {
  envConfig = getEnvironmentConfig();
} catch (error) {
  console.error('Environment validation failed, using safe fallbacks:', error);
  envConfig = getSafeEnvironmentConfig();
}

// Production-optimized Supabase client configuration
export const supabase = createClient<Database>(
  envConfig.supabaseUrl || '',
  envConfig.supabaseAnonKey || '',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        // Dynamic event rate based on environment
        eventsPerSecond: envConfig.environment === 'production' ? 15 : 10,
      },
      // Production-optimized timings
      heartbeatIntervalMs: envConfig.environment === 'production' ? 30000 : 15000,
      reconnectAfterMs: (tries: number) => {
        // Exponential backoff with max cap
        const baseDelay = envConfig.environment === 'production' ? 2000 : 1000;
        const delay = Math.min(baseDelay * Math.pow(2, tries), 30000);
        return delay;
      },
      // Connection timeout
      timeout: envConfig.environment === 'production' ? 10000 : 5000,
    },
    global: {
      // Production: Add request timeout
      fetch: (url, options = {}) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
        
        return fetch(url, {
          ...options,
          signal: controller.signal,
        }).finally(() => {
          clearTimeout(timeoutId);
        });
      },
    },
  }
);

// Helper function to handle database errors
export const handleSupabaseError = (error: any) => {
  console.error('Supabase error:', error);
  if (error?.message) {
    throw new Error(error.message);
  }
  throw new Error('An unexpected error occurred');
}; 
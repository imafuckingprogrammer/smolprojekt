import * as Sentry from '@sentry/react';
import React from 'react';
import { ENV } from './environment';

interface SentryConfig {
  dsn?: string;
  environment: string;
  sampleRate: number;
  enableInDevelopment: boolean;
}

const defaultConfig: SentryConfig = {
  dsn: ENV.sentryDsn,
  environment: ENV.environment || 'development',
  sampleRate: ENV.environment === 'production' ? 0.1 : 1.0,
  enableInDevelopment: false
};

export function initSentry(config: Partial<SentryConfig> = {}): void {
  const finalConfig = { ...defaultConfig, ...config };

  // Don't initialize in development unless explicitly enabled
  if (finalConfig.environment === 'development' && !finalConfig.enableInDevelopment) {
    console.log('Sentry disabled in development mode');
    return;
  }

  // Don't initialize without DSN
  if (!finalConfig.dsn) {
    console.warn('Sentry DSN not provided, error monitoring disabled');
    return;
  }

  try {
    Sentry.init({
      dsn: finalConfig.dsn,
      environment: finalConfig.environment,
      sampleRate: finalConfig.sampleRate,
      release: import.meta.env.VITE_APP_VERSION || 'unknown',
      
      // Error filtering
      beforeSend(event, hint) {
        // Filter out development errors
        if (finalConfig.environment === 'development') {
          console.log('Sentry event (dev):', event);
        }
        
        // Filter out known non-critical errors
        const error = hint.originalException;
        if (error instanceof Error) {
          // Skip network errors that are likely user connectivity issues
          if (error.message.includes('NetworkError') || 
              error.message.includes('Failed to fetch') ||
              error.message.includes('Load failed')) {
            return null;
          }
          
          // Skip authentication timeout errors (handled gracefully)
          if (error.message.includes('Authentication timed out')) {
            return null;
          }
        }
        
        return event;
      },
      
      // Additional configuration
      attachStacktrace: true,
      sendDefaultPii: false,
      debug: finalConfig.environment === 'development',
    });

    // Set user context if available
    Sentry.setUser({
      id: 'anonymous', // Replace with actual user ID when available
      ip_address: '{{auto}}',
    });

    console.log(`Sentry initialized for ${finalConfig.environment} environment`);
    
  } catch (error) {
    console.error('Failed to initialize Sentry:', error);
  }
}

// Error reporting utilities
export const sentryUtils = {
  // Manual error reporting
  captureError: (error: Error, context?: Record<string, any>) => {
    Sentry.captureException(error, {
      extra: context,
      tags: {
        component: 'manual-report'
      }
    });
  },
  
  // User context
  setUser: (user: { id: string; email?: string; username?: string }) => {
    Sentry.setUser(user);
  },
  
  // Custom context
  setContext: (key: string, context: Record<string, any>) => {
    Sentry.setContext(key, context);
  },
  
  // Breadcrumbs
  addBreadcrumb: (message: string, category: string = 'custom', level: 'info' | 'warning' | 'error' = 'info') => {
    Sentry.addBreadcrumb({
      message,
      category,
      level,
      timestamp: Date.now() / 1000
    });
  }
};

// React Error Boundary with Sentry integration
export const SentryErrorBoundary = Sentry.ErrorBoundary;

// Initialize Sentry on module load
if (typeof window !== 'undefined') {
  initSentry();
} 
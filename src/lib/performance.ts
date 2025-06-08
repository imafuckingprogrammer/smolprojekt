import * as Sentry from '@sentry/react';
import React from 'react';

interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  url: string;
  rating: 'good' | 'needs-improvement' | 'poor';
  metadata?: Record<string, any>;
}

interface PerformanceConfig {
  enableConsoleLogging: boolean;
  enableSentry: boolean;
  sampleRate: number;
}

class PerformanceMonitor {
  private config: PerformanceConfig;
  private metrics: PerformanceMetric[] = [];
  private observer: PerformanceObserver | null = null;

  constructor(config: Partial<PerformanceConfig> = {}) {
    this.config = {
      enableConsoleLogging: process.env.NODE_ENV === 'development',
      enableSentry: process.env.NODE_ENV === 'production',
      sampleRate: 0.1, // Sample 10% of users
      ...config
    };

    this.init();
  }

  private init(): void {
    // Initialize custom performance tracking
    this.initCustomTracking();
    
    // Initialize resource timing
    this.initResourceTiming();
  }

  private initCustomTracking(): void {
    // Memory usage tracking
    if ('memory' in performance) {
      setInterval(() => {
        const memory = (performance as any).memory;
        if (memory) {
          this.recordMetric({
            name: 'memory-usage',
            value: memory.usedJSHeapSize,
            timestamp: Date.now(),
            url: window.location.href,
            rating: memory.usedJSHeapSize > 50 * 1024 * 1024 ? 'poor' : 'good',
            metadata: {
              totalJSHeapSize: memory.totalJSHeapSize,
              jsHeapSizeLimit: memory.jsHeapSizeLimit
            }
          });
        }
      }, 30000); // Every 30 seconds
    }

    // Connection quality tracking
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      if (connection) {
        this.recordMetric({
          name: 'connection-quality',
          value: connection.downlink,
          timestamp: Date.now(),
          url: window.location.href,
          rating: connection.downlink > 10 ? 'good' : connection.downlink > 1.5 ? 'needs-improvement' : 'poor',
          metadata: {
            effectiveType: connection.effectiveType,
            rtt: connection.rtt,
            saveData: connection.saveData
          }
        });
      }
    }
  }

  private initResourceTiming(): void {
    if ('PerformanceObserver' in window) {
      this.observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'resource') {
            const resource = entry as PerformanceResourceTiming;
            
            // Track slow resources
            if (resource.duration > 1000) { // > 1 second
              this.recordMetric({
                name: 'slow-resource',
                value: resource.duration,
                timestamp: Date.now(),
                url: window.location.href,
                rating: resource.duration > 3000 ? 'poor' : 'needs-improvement',
                metadata: {
                  resourceUrl: resource.name,
                  resourceType: this.getResourceType(resource.name),
                  transferSize: resource.transferSize,
                  encodedBodySize: resource.encodedBodySize
                }
              });
            }
          }
        });
      });

      this.observer.observe({ entryTypes: ['resource'] });
    }
  }

  private getResourceType(url: string): string {
    if (url.includes('.js')) return 'script';
    if (url.includes('.css')) return 'stylesheet';
    if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) return 'image';
    if (url.includes('/api/') || url.includes('supabase')) return 'api';
    return 'other';
  }

  private recordMetric(metric: PerformanceMetric): void {
    // Sample check
    if (Math.random() > this.config.sampleRate) return;

    this.metrics.push(metric);

    // Console logging
    if (this.config.enableConsoleLogging) {
      console.log(`📊 Performance Metric: ${metric.name}`, {
        value: metric.value,
        rating: metric.rating,
        metadata: metric.metadata
      });
    }

    // Sentry reporting
    if (this.config.enableSentry && typeof Sentry !== 'undefined') {
      Sentry.addBreadcrumb({
        category: 'performance',
        message: `${metric.name}: ${metric.value}`,
        level: metric.rating === 'poor' ? 'warning' : 'info',
        data: metric.metadata
      });

      // Report poor metrics as transactions
      if (metric.rating === 'poor') {
        Sentry.captureException(new Error(`Poor performance metric: ${metric.name}`), {
          tags: {
            metric: metric.name,
            rating: metric.rating
          },
          extra: {
            ...metric,
            // Convert to string index signature for Sentry
            metricName: metric.name,
            metricValue: metric.value.toString(),
            metricRating: metric.rating
          }
        });
      }
    }

    // Keep only last 100 metrics to prevent memory leaks
    if (this.metrics.length > 100) {
      this.metrics = this.metrics.slice(-50);
    }
  }

  // Public API methods
  public startTimer(name: string): () => void {
    const startTime = window.performance.now();
    
    return () => {
      const duration = window.performance.now() - startTime;
      this.recordMetric({
        name: `timer-${name}`,
        value: duration,
        timestamp: Date.now(),
        url: window.location.href,
        rating: duration > 1000 ? 'poor' : duration > 100 ? 'needs-improvement' : 'good'
      });
    };
  }

  public measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const stopTimer = this.startTimer(name);
    
    return fn().finally(() => {
      stopTimer();
    });
  }

  public getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  public clearMetrics(): void {
    this.metrics = [];
  }

  public destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.clearMetrics();
  }
}

// Global performance monitor instance
const performanceMonitor = new PerformanceMonitor();

// Export public API
export const performanceUtils = {
  // Timer utilities
  startTimer: (name: string) => performanceMonitor.startTimer(name),
  measureAsync: <T>(name: string, fn: () => Promise<T>) => performanceMonitor.measureAsync(name, fn),
  
  // Data access
  getMetrics: () => performanceMonitor.getMetrics(),
  clearMetrics: () => performanceMonitor.clearMetrics(),
  
  // Cleanup
  destroy: () => performanceMonitor.destroy()
};

// React Hook for performance monitoring
export function usePerformanceMonitor() {
  const startTimer = (name: string) => performanceMonitor.startTimer(name);
  const measureAsync = <T>(name: string, fn: () => Promise<T>) => performanceMonitor.measureAsync(name, fn);
  
  return { startTimer, measureAsync };
}

// Higher-order component for component performance tracking
export function withPerformanceTracking<P extends object>(
  Component: React.ComponentType<P>,
  componentName?: string
) {
  const WrappedComponent = (props: P) => {
    const name = componentName || Component.displayName || Component.name || 'Component';
    
    React.useEffect(() => {
      const stopTimer = performanceMonitor.startTimer(`render-${name}`);
      return stopTimer;
    }, [name]);
    
    return React.createElement(Component, props);
  };
  
  WrappedComponent.displayName = `withPerformanceTracking(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

// Cleanup on app shutdown
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    performanceMonitor.destroy();
  });
}

export default performanceMonitor; 
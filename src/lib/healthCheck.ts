import React from 'react';
import { healthCheck as envHealthCheck } from './environment';
import { supabase } from './supabase';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  environment: string;
  checks: {
    environment: HealthCheckResult;
    database: HealthCheckResult;
    authentication: HealthCheckResult;
    realtime: HealthCheckResult;
    performance: HealthCheckResult;
  };
  uptime: number;
  memory?: {
    used: number;
    total: number;
    percentage: number;
  };
}

interface HealthCheckResult {
  status: 'pass' | 'warn' | 'fail';
  responseTime: number;
  message?: string;
  details?: Record<string, any>;
}

class HealthChecker {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  async performHealthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();
    
    // Run all health checks in parallel
    const [
      environmentCheck,
      databaseCheck,
      authCheck,
      realtimeCheck,
      performanceCheck
    ] = await Promise.allSettled([
      this.checkEnvironment(),
      this.checkDatabase(),
      this.checkAuthentication(),
      this.checkRealtime(),
      this.checkPerformance()
    ]);

    // Determine overall status
    const checks = {
      environment: this.getResultFromSettled(environmentCheck),
      database: this.getResultFromSettled(databaseCheck),
      authentication: this.getResultFromSettled(authCheck),
      realtime: this.getResultFromSettled(realtimeCheck),
      performance: this.getResultFromSettled(performanceCheck)
    };

    const overallStatus = this.determineOverallStatus(checks);
    
    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: import.meta.env.VITE_APP_VERSION || 'unknown',
      environment: import.meta.env.NODE_ENV || 'unknown',
      checks,
      uptime: Date.now() - this.startTime,
      memory: this.getMemoryInfo()
    };
  }

  private async checkEnvironment(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const envHealth = await envHealthCheck();
      const responseTime = Date.now() - startTime;
      
      return {
        status: envHealth.status === 'healthy' ? 'pass' : envHealth.status === 'degraded' ? 'warn' : 'fail',
        responseTime,
        message: `Environment validation: ${envHealth.status}`,
        details: envHealth.details
      };
    } catch (error) {
      return {
        status: 'fail',
        responseTime: Date.now() - startTime,
        message: error instanceof Error ? error.message : 'Environment check failed'
      };
    }
  }

  private async checkDatabase(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Simple query to test database connectivity
      const { data, error } = await supabase
        .from('restaurants')
        .select('id')
        .limit(1);
      
      const responseTime = Date.now() - startTime;
      
      if (error) {
        return {
          status: 'fail',
          responseTime,
          message: `Database error: ${error.message}`,
          details: { error: error.code }
        };
      }
      
      return {
        status: responseTime > 1000 ? 'warn' : 'pass',
        responseTime,
        message: `Database connection successful`,
        details: { queryTime: responseTime }
      };
    } catch (error) {
      return {
        status: 'fail',
        responseTime: Date.now() - startTime,
        message: error instanceof Error ? error.message : 'Database check failed'
      };
    }
  }

  private async checkAuthentication(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Test auth session retrieval
      const { data, error } = await supabase.auth.getSession();
      const responseTime = Date.now() - startTime;
      
      if (error) {
        return {
          status: 'warn',
          responseTime,
          message: `Auth warning: ${error.message}`,
          details: { error: error.message }
        };
      }
      
      return {
        status: 'pass',
        responseTime,
        message: 'Authentication service operational',
        details: { hasSession: !!data.session }
      };
    } catch (error) {
      return {
        status: 'fail',
        responseTime: Date.now() - startTime,
        message: error instanceof Error ? error.message : 'Authentication check failed'
      };
    }
  }

  private async checkRealtime(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Test realtime connection
      const channel = supabase.channel('health-check');
      
      return new Promise<HealthCheckResult>((resolve) => {
        const timeout = setTimeout(() => {
          supabase.removeChannel(channel);
          resolve({
            status: 'warn',
            responseTime: Date.now() - startTime,
            message: 'Realtime connection timeout'
          });
        }, 5000);
        
        channel.subscribe((status) => {
          clearTimeout(timeout);
          supabase.removeChannel(channel);
          
          const responseTime = Date.now() - startTime;
          
          resolve({
            status: status === 'SUBSCRIBED' ? 'pass' : 'warn',
            responseTime,
            message: `Realtime status: ${status}`,
            details: { connectionStatus: status }
          });
        });
      });
    } catch (error) {
      return {
        status: 'fail',
        responseTime: Date.now() - startTime,
        message: error instanceof Error ? error.message : 'Realtime check failed'
      };
    }
  }

  private async checkPerformance(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Check memory usage
      const memory = this.getMemoryInfo();
      const responseTime = Date.now() - startTime;
      
      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = 'Performance metrics normal';
      
      if (memory && memory.percentage > 90) {
        status = 'fail';
        message = 'High memory usage detected';
      } else if (memory && memory.percentage > 75) {
        status = 'warn';
        message = 'Elevated memory usage';
      }
      
      return {
        status,
        responseTime,
        message,
        details: {
          memory,
          userAgent: navigator.userAgent,
          connection: this.getConnectionInfo()
        }
      };
    } catch (error) {
      return {
        status: 'warn',
        responseTime: Date.now() - startTime,
        message: error instanceof Error ? error.message : 'Performance check failed'
      };
    }
  }

  private getResultFromSettled(result: PromiseSettledResult<HealthCheckResult>): HealthCheckResult {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        status: 'fail',
        responseTime: 0,
        message: result.reason?.message || 'Check failed'
      };
    }
  }

  private determineOverallStatus(checks: HealthStatus['checks']): 'healthy' | 'degraded' | 'unhealthy' {
    const statuses = Object.values(checks).map(check => check.status);
    
    if (statuses.includes('fail')) {
      return 'unhealthy';
    } else if (statuses.includes('warn')) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  private getMemoryInfo() {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        percentage: Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100)
      };
    }
    return undefined;
  }

  private getConnectionInfo() {
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      return {
        effectiveType: connection?.effectiveType,
        downlink: connection?.downlink,
        rtt: connection?.rtt,
        saveData: connection?.saveData
      };
    }
    return undefined;
  }
}

// Global health checker instance
const healthChecker = new HealthChecker();

// Export health check function
export async function performHealthCheck(): Promise<HealthStatus> {
  return healthChecker.performHealthCheck();
}

// React hook for health monitoring
export function useHealthCheck(intervalMs: number = 60000) {
  const [healthStatus, setHealthStatus] = React.useState<HealthStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  
  React.useEffect(() => {
    let mounted = true;
    let intervalId: NodeJS.Timeout;
    
    const runHealthCheck = async () => {
      try {
        const status = await performHealthCheck();
        if (mounted) {
          setHealthStatus(status);
          setLoading(false);
        }
      } catch (error) {
        console.error('Health check failed:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    };
    
    // Initial check
    runHealthCheck();
    
    // Periodic checks
    intervalId = setInterval(runHealthCheck, intervalMs);
    
    return () => {
      mounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [intervalMs]);
  
  return { healthStatus, loading };
}

// Health check endpoint for monitoring services
export function createHealthEndpoint() {
  return {
    '/health': async () => {
      const health = await performHealthCheck();
      return {
        status: health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503,
        body: health
      };
    },
    
    '/health/live': async () => {
      // Liveness probe - just check if app is running
      return {
        status: 200,
        body: {
          status: 'alive',
          timestamp: new Date().toISOString()
        }
      };
    },
    
    '/health/ready': async () => {
      // Readiness probe - check if app is ready to serve traffic
      const health = await performHealthCheck();
      const isReady = health.status !== 'unhealthy';
      
      return {
        status: isReady ? 200 : 503,
        body: {
          status: isReady ? 'ready' : 'not-ready',
          timestamp: new Date().toISOString(),
          checks: health.checks
        }
      };
    }
  };
} 
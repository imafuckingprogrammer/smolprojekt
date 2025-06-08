interface EnvironmentConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  environment: 'development' | 'staging' | 'production';
  sentryDsn?: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  config: Partial<EnvironmentConfig>;
}

/**
 * Validates environment variables and returns configuration
 */
export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Required environment variables
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  
  // Optional environment variables
  const nodeEnv = import.meta.env.NODE_ENV || 'development';
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
  const logLevel = import.meta.env.VITE_LOG_LEVEL || 'info';
  
  // Validate required variables
  if (!supabaseUrl) {
    errors.push('VITE_SUPABASE_URL is required');
  } else if (!isValidUrl(supabaseUrl)) {
    errors.push('VITE_SUPABASE_URL must be a valid URL');
  }
  
  if (!supabaseAnonKey) {
    errors.push('VITE_SUPABASE_ANON_KEY is required');
  } else if (!isValidSupabaseKey(supabaseAnonKey)) {
    errors.push('VITE_SUPABASE_ANON_KEY appears to be invalid');
  }
  
  // Validate optional variables with warnings
  if (nodeEnv === 'production') {
    if (!sentryDsn) {
      warnings.push('VITE_SENTRY_DSN is recommended for production error monitoring');
    }
    
    if (logLevel === 'debug') {
      warnings.push('Debug logging is enabled in production');
    }
  }
  
  // Environment-specific validations
  const environment = nodeEnv as EnvironmentConfig['environment'];
  
  const config: Partial<EnvironmentConfig> = {
    supabaseUrl,
    supabaseAnonKey,
    environment,
    sentryDsn,
    logLevel: logLevel as EnvironmentConfig['logLevel']
  };
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    config
  };
}

/**
 * Gets validated environment configuration or throws error
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  const validation = validateEnvironment();
  
  if (!validation.isValid) {
    const errorMessage = `Environment validation failed:\n${validation.errors.join('\n')}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
  
  // Log warnings in development
  if (validation.warnings.length > 0 && validation.config.environment === 'development') {
    console.warn('Environment warnings:', validation.warnings);
  }
  
  return validation.config as EnvironmentConfig;
}

/**
 * Safe environment getter with fallbacks
 */
export function getSafeEnvironmentConfig(): Partial<EnvironmentConfig> {
  try {
    return getEnvironmentConfig();
  } catch (error) {
    console.error('Failed to validate environment, using fallbacks:', error);
    
    return {
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
      supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
      environment: 'development',
      logLevel: 'error' // Minimal logging when config is invalid
    };
  }
}

/**
 * Health check for environment
 */
export async function healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; details: Record<string, any> }> {
  const validation = validateEnvironment();
  const startTime = Date.now();
  
  const details: Record<string, any> = {
    timestamp: new Date().toISOString(),
    validationTime: 0,
    environment: validation.config.environment,
    errors: validation.errors,
    warnings: validation.warnings
  };
  
  // Test Supabase connection if config is valid
  if (validation.isValid && validation.config.supabaseUrl) {
    try {
      const response = await fetch(`${validation.config.supabaseUrl}/rest/v1/`, {
        method: 'HEAD',
        headers: {
          'apikey': validation.config.supabaseAnonKey!,
          'Authorization': `Bearer ${validation.config.supabaseAnonKey!}`
        }
      });
      
      details.supabaseConnection = response.ok ? 'connected' : 'failed';
      details.supabaseStatus = response.status;
    } catch (error) {
      details.supabaseConnection = 'error';
      details.supabaseError = error instanceof Error ? error.message : 'Unknown error';
    }
  }
  
  details.validationTime = Date.now() - startTime;
  
  // Determine overall health
  let status: 'healthy' | 'degraded' | 'unhealthy';
  
  if (validation.errors.length > 0) {
    status = 'unhealthy';
  } else if (validation.warnings.length > 0 || details.supabaseConnection === 'failed') {
    status = 'degraded';
  } else {
    status = 'healthy';
  }
  
  return { status, details };
}

// Utility functions
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function isValidSupabaseKey(key: string): boolean {
  // Basic validation for Supabase anon key format
  return key.length > 100 && key.includes('.') && !key.includes(' ');
}

// Export for use in other modules
export const ENV = getSafeEnvironmentConfig(); 
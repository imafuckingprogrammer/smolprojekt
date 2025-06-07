export function checkEnvironment() {
  const requiredVars = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY'
  ];

  const missing = requiredVars.filter(varName => !import.meta.env[varName]);
  
  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing);
    return false;
  }

  console.log('Environment check passed ✓');
  return true;
}

export function getEnvStatus() {
  return {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL ? '✓ Set' : '✗ Missing',
    supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY ? '✓ Set' : '✗ Missing',
    stripeKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ? '✓ Set' : '✗ Missing (optional)',
    environment: import.meta.env.MODE
  };
} 
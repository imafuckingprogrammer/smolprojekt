import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // Production optimizations
  build: {
    // Enable source maps for production debugging
    sourcemap: true,
    
    // Optimize bundle size
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching
        manualChunks: {
          // Vendor chunks
          'react-vendor': ['react', 'react-dom'],
          'router-vendor': ['react-router-dom'],
          'query-vendor': ['@tanstack/react-query'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'ui-vendor': ['@heroicons/react', 'lucide-react'],
          
          // App chunks
          'auth': [
            './src/hooks/useAuth.ts',
            './src/pages/auth/SignIn.tsx',
            './src/pages/auth/SignUp.tsx',
            './src/pages/auth/ForgotPassword.tsx'
          ],
          'dashboard': [
            './src/pages/dashboard/Dashboard.tsx'
          ],
          'kitchen': [
            './src/pages/kitchen/Kitchen.tsx',
            './src/hooks/useKitchenOrders.ts'
          ],
          'order': [
            './src/pages/order/CustomerOrder.tsx',
            './src/pages/order/OrderSuccess.tsx',
            './src/pages/order/OrderError.tsx'
          ]
        }
      }
    },
    
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1000,
    
    // Enable minification
    minify: 'terser',
    terserOptions: {
      compress: {
        // Remove console logs in production
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
  
  // Development server configuration
  server: {
    port: 3000,
    host: true, // Allow external connections
    cors: true,
  },
  
  // Preview server configuration
  preview: {
    port: 3000,
    host: true,
  },
  
  // Environment variables
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || 'unknown'),
  },
  
  // Dependency optimization
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      '@supabase/supabase-js',
      '@heroicons/react/24/outline',
      '@heroicons/react/24/solid',
      'lucide-react',
      'date-fns',
      'clsx',
      'tailwind-merge'
    ],
  },
})

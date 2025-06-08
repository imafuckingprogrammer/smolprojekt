import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient, cachePresistence } from './lib/queryClient';
import { useAuth } from './hooks/useAuth';
import { UserRoleProvider } from './contexts/UserRoleContext';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { AuthLayout } from './components/auth/AuthLayout';
import { SignIn } from './pages/auth/SignIn';
import { SignUp } from './pages/auth/SignUp';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { Dashboard } from './pages/dashboard/Dashboard';
import { Kitchen } from './pages/kitchen/Kitchen';
import { CustomerOrder } from './pages/order/CustomerOrder';
import { OrderSuccess } from './pages/order/OrderSuccess';
import { OrderError } from './pages/order/OrderError';
import { StaffAuth } from './pages/auth/StaffAuth';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { useEffect, useState } from 'react';

function AppContent() {
  const { user, loading } = useAuth();
  const [showFallback, setShowFallback] = useState(false);

  // Fallback mechanism to prevent infinite loading
  useEffect(() => {
    if (loading) {
      const timeoutId = setTimeout(() => {
        setShowFallback(true);
      }, 15000); // 15 seconds

      return () => clearTimeout(timeoutId);
    } else {
      setShowFallback(false);
    }
  }, [loading]);

  // If loading for too long, show error state
  if (showFallback) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-4">Loading Error</h1>
          <p className="text-gray-600 mb-6">
            The application is taking longer than expected to load. 
            Please refresh the page or try again later.
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition-colors"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <UserRoleProvider>
        <div className="min-h-screen bg-gray-50">
          <Routes>
          {/* Public Routes - Don't wait for auth loading */}
          <Route path="/order/:token" element={<CustomerOrder />} />
          <Route path="/order/:token/success" element={<OrderSuccess />} />
          <Route path="/order/:token/error" element={<OrderError />} />
          
          {/* Staff Authentication */}
          <Route path="/staff-auth" element={<StaffAuth />} />
          
          {/* Auth Routes */}
          <Route 
            path="/auth/*" 
            element={
              loading ? (
                <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                  <LoadingSpinner size="lg" />
                </div>
              ) : user ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <AuthRoutes />
              )
            } 
          />
          
          {/* Protected Routes */}
          <Route 
            path="/dashboard/*" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />
          
          <Route 
            path="/kitchen" 
            element={
              <ProtectedRoute>
                <Kitchen />
              </ProtectedRoute>
            }
          />
          
          {/* Default Redirects */}
          <Route 
            path="/" 
            element={
              loading ? (
                <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                  <LoadingSpinner size="lg" />
                </div>
              ) : user ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <Navigate to="/auth/signin" replace />
              )
            } 
          />
          
          {/* 404 */}
          <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </UserRoleProvider>
    </Router>
  );
}

function AuthRoutes() {
  return (
    <AuthLayout>
      <Routes>
        <Route path="signin" element={<SignIn />} />
        <Route path="signup" element={<SignUp />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="*" element={<Navigate to="signin" replace />} />
      </Routes>
    </AuthLayout>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
        <p className="text-lg text-gray-600 mb-8">Page not found</p>
        <a 
          href="/" 
          className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition-colors"
        >
          Go Home
        </a>
      </div>
      </div>
  );
}

// Main App component with React Query provider
function App() {
  const [cacheRestored, setCacheRestored] = useState(false);

  // Restore cache on app start
  useEffect(() => {
    const initializeCache = async () => {
      try {
        await cachePresistence.restore();
        setCacheRestored(true);
      } catch (error) {
        console.error('Failed to restore cache:', error);
        setCacheRestored(true); // Continue anyway
      }
    };

    initializeCache();
  }, []);

  if (!cacheRestored) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
      {/* Add React Query DevTools in development */}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}

export default App;

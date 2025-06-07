import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
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
import { ProtectedRoute } from './components/auth/ProtectedRoute';

function App() {
  const { user, restaurant, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          {/* Public Routes */}
          <Route path="/order/:token" element={<CustomerOrder />} />
          <Route path="/order/:token/success" element={<OrderSuccess />} />
          <Route path="/order/:token/error" element={<OrderError />} />
          
          {/* Auth Routes */}
          <Route 
            path="/auth/*" 
            element={
              user ? <Navigate to="/dashboard" replace /> : <AuthRoutes />
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
              user ? 
                <Navigate to="/dashboard" replace /> : 
                <Navigate to="/auth/signin" replace />
            } 
          />
          
          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
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

export default App;

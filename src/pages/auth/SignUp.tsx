import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { validateEmail, generateSlug } from '../../lib/utils';

export function SignUp() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    restaurantName: '',
    phone: '',
    address: '',
    tableCount: '10',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { signUp, loading, error, clearError } = useAuth();
  const navigate = useNavigate();

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (!formData.restaurantName) {
      newErrors.restaurantName = 'Restaurant name is required';
    }

    const tableCount = parseInt(formData.tableCount);
    if (!formData.tableCount || isNaN(tableCount) || tableCount < 1 || tableCount > 100) {
      newErrors.tableCount = 'Please enter a valid number of tables (1-100)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (!validateForm()) return;

    try {
      await signUp(formData.email, formData.password, {
        name: formData.restaurantName,
        slug: generateSlug(formData.restaurantName),
        phone: formData.phone || undefined,
        address: formData.address || undefined,
        subscription_status: 'active',
      });
      
      // Show success message and redirect
      navigate('/auth/signin', { 
        state: { 
          message: 'Account created successfully! Please check your email to verify your account.' 
        } 
      });
    } catch (error) {
      // Error is handled by the useAuth hook
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Create your restaurant account</h2>
        <p className="mt-2 text-sm text-gray-600">
          Already have an account?{' '}
          <Link to="/auth/signin" className="text-primary-600 hover:text-primary-500">
            Sign in here
          </Link>
        </p>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit}>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6">
          <div>
            <label htmlFor="restaurantName" className="label">
              Restaurant Name *
            </label>
            <input
              id="restaurantName"
              name="restaurantName"
              type="text"
              required
              className="input"
              value={formData.restaurantName}
              onChange={handleInputChange}
            />
            {errors.restaurantName && (
              <p className="mt-1 text-sm text-red-600">{errors.restaurantName}</p>
            )}
          </div>

          <div>
            <label htmlFor="email" className="label">
              Email Address *
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="input"
              value={formData.email}
              onChange={handleInputChange}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="password" className="label">
                Password *
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                className="input"
                value={formData.password}
                onChange={handleInputChange}
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="label">
                Confirm Password *
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                className="input"
                value={formData.confirmPassword}
                onChange={handleInputChange}
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="phone" className="label">
              Phone Number
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              className="input"
              value={formData.phone}
              onChange={handleInputChange}
            />
          </div>

          <div>
            <label htmlFor="address" className="label">
              Restaurant Address
            </label>
            <textarea
              id="address"
              name="address"
              rows={3}
              className="input"
              value={formData.address}
              onChange={handleInputChange}
            />
          </div>

          <div>
            <label htmlFor="tableCount" className="label">
              Number of Tables *
            </label>
            <input
              id="tableCount"
              name="tableCount"
              type="number"
              min="1"
              max="100"
              required
              className="input"
              value={formData.tableCount}
              onChange={handleInputChange}
            />
            {errors.tableCount && (
              <p className="mt-1 text-sm text-red-600">{errors.tableCount}</p>
            )}
            <p className="mt-1 text-sm text-gray-500">
              You can add or remove tables later from your dashboard
            </p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-900 mb-2">What's included:</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• QR codes for all your tables</li>
            <li>• Real-time order management</li>
            <li>• Kitchen display system</li>
            <li>• Monthly analytics reports</li>
            <li>• $20/month subscription</li>
          </ul>
        </div>

        <div>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? (
              <LoadingSpinner size="sm" className="mr-2" />
            ) : null}
            Create Account
          </button>
        </div>

        <p className="text-xs text-gray-500 text-center">
          By creating an account, you agree to our Terms of Service and Privacy Policy.
        </p>
      </form>
    </div>
  );
} 
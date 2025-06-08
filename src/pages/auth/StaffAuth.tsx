import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { validateEmail } from '../../lib/utils';

interface ApprovedRestaurant {
  id: string;
  name: string;
  role: string;
}

export function StaffAuth() {
  const navigate = useNavigate();
  const { user, signIn, signUp, loading: authLoading } = useAuth();
  
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [approvedRestaurants, setApprovedRestaurants] = useState<ApprovedRestaurant[]>([]);

  // If user is already authenticated, check their approved restaurants
  useEffect(() => {
    if (user?.email) {
      checkApprovedRestaurants(user.email);
    }
  }, [user]);

  const checkApprovedRestaurants = async (email: string) => {
    try {
      setLoading(true);
      
      // Check both database and staff invitations
      const [staffData, invitationData] = await Promise.allSettled([
        // Check actual staff records
        supabase
          .from('restaurant_staff')
          .select(`
            restaurant_id,
            role,
            restaurant:restaurants(id, name)
          `)
          .eq('email', email.toLowerCase())
          .eq('is_active', true),
        
        // Check pending invitations
        supabase
          .from('staff_invitations')
          .select(`
            restaurant_id,
            role,
            status,
            restaurant:restaurants(id, name)
          `)
          .eq('email', email.toLowerCase())
          .eq('status', 'pending')
      ]);

      let restaurants: ApprovedRestaurant[] = [];

      // Process staff records
      if (staffData.status === 'fulfilled' && staffData.value.data) {
        restaurants = staffData.value.data.map(item => ({
          id: item.restaurant_id,
          name: (item.restaurant as any)?.name || 'Unknown Restaurant',
          role: item.role
        }));
      }

      // Process invitations (as potential access)
      if (invitationData.status === 'fulfilled' && invitationData.value.data) {
        const inviteRestaurants = invitationData.value.data.map(item => ({
          id: item.restaurant_id,
          name: (item.restaurant as any)?.name || 'Unknown Restaurant',
          role: item.role + ' (pending)'
        }));
        
        // Add invitations that aren't already in staff records
        inviteRestaurants.forEach(invite => {
          if (!restaurants.some(r => r.id === invite.id)) {
            restaurants.push(invite);
          }
        });
      }

      setApprovedRestaurants(restaurants);
      console.log(`Found ${restaurants.length} approved restaurants for ${email}:`, restaurants);
    } catch (err) {
      console.error('Error checking approved restaurants:', err);
      setApprovedRestaurants([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!formData.email || !formData.password) {
      setError('Please fill in all required fields');
      setLoading(false);
      return;
    }

    if (!validateEmail(formData.email)) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }

    try {
      if (mode === 'signin') {
        await signIn(formData.email, formData.password);
        // After signin, check approved restaurants
        await checkApprovedRestaurants(formData.email);
      } else {
        // For signup, check if email is approved in either staff table or invitations
        const [staffCheck, invitationCheck] = await Promise.allSettled([
          supabase
            .from('restaurant_staff')
            .select('email')
            .eq('email', formData.email.toLowerCase())
            .eq('is_active', true)
            .limit(1),
          
          supabase
            .from('staff_invitations')
            .select('email, status')
            .eq('email', formData.email.toLowerCase())
            .eq('status', 'pending')
            .limit(1)
        ]);

        const hasStaffRecord = staffCheck.status === 'fulfilled' && staffCheck.value.data && staffCheck.value.data.length > 0;
        const hasInvitation = invitationCheck.status === 'fulfilled' && invitationCheck.value.data && invitationCheck.value.data.length > 0;

        if (!hasStaffRecord && !hasInvitation) {
          setError('This email is not approved by any restaurant. Please contact a restaurant manager to get approved first.');
          setLoading(false);
          return;
        }

        await signUp(formData.email, formData.password, {});
        
        // After signup, check approved restaurants
        await checkApprovedRestaurants(formData.email);
      }
    } catch (err: any) {
      setError(err.message || `${mode === 'signin' ? 'Sign in' : 'Sign up'} failed`);
    } finally {
      setLoading(false);
    }
  };

  const accessKitchen = async (restaurantId: string, restaurantName: string) => {
    if (!user?.email) return;

    try {
      setLoading(true);
      
      // Create a staff session (similar to your current system but with real auth)
      const sessionResponse = await supabase
        .from('active_sessions')
        .insert({
          restaurant_id: restaurantId,
          user_id: user.id,
          user_name: `${user.user_metadata?.first_name || ''} ${user.user_metadata?.last_name || ''}`.trim() || user.email,
          session_token: `staff_${user.id}_${Date.now()}`,
          status: 'active'
        })
        .select()
        .single();

      if (sessionResponse.error) throw sessionResponse.error;

      // Navigate to kitchen with query params to identify the restaurant
      navigate(`/kitchen?restaurant=${restaurantId}&session=${sessionResponse.data.id}`);
    } catch (err) {
      console.error('Error accessing kitchen:', err);
      setError('Failed to access kitchen. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // If user is authenticated and has approved restaurants, show restaurant selection
  if (user && approvedRestaurants.length > 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-2xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">👨‍🍳 Staff Dashboard</h1>
            <p className="text-gray-600">Welcome {user.user_metadata?.first_name || user.email}</p>
            <p className="text-sm text-gray-500">Select a restaurant to access the kitchen</p>
          </div>

          <div className="space-y-4 mb-8">
            {approvedRestaurants.map((restaurant) => (
              <div
                key={restaurant.id}
                className="border border-gray-300 rounded-lg p-6 hover:border-blue-500 hover:bg-blue-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{restaurant.name}</h3>
                    <p className="text-sm text-gray-600 capitalize">Role: {restaurant.role.replace('_', ' ')}</p>
                  </div>
                  <button
                    onClick={() => accessKitchen(restaurant.id, restaurant.name)}
                    disabled={loading}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Accessing...' : 'Access Kitchen'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center">
            <button
              onClick={() => navigate('/auth/signin')}
              className="text-gray-600 hover:text-gray-800 text-sm"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If user is authenticated but has no approved restaurants
  if (user && approvedRestaurants.length === 0 && !loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-4">No Restaurant Access</h1>
          <p className="text-gray-600 mb-6">
            Your email ({user.email}) is not approved by any restaurant yet.
          </p>
          <p className="text-sm text-gray-500 mb-8">
            Please contact a restaurant manager to get your email approved for kitchen access.
          </p>
          <button
            onClick={() => navigate('/auth/signin')}
            className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Authentication form
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            👨‍🍳 Staff {mode === 'signin' ? 'Sign In' : 'Sign Up'}
          </h1>
          <p className="text-gray-600">
            {mode === 'signin' 
              ? 'Access your approved restaurant kitchens'
              : 'Create your staff account'
            }
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {mode === 'signup' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  First Name
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Last Name
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="text-red-800 text-sm">{error}</div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || authLoading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading || authLoading ? (
              <span className="flex items-center justify-center">
                <LoadingSpinner size="sm" />
                <span className="ml-2">
                  {mode === 'signin' ? 'Signing in...' : 'Creating account...'}
                </span>
              </span>
            ) : (
              mode === 'signin' ? 'Sign In' : 'Create Account'
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            {mode === 'signin' 
              ? "Don't have an account? Sign up" 
              : "Already have an account? Sign in"
            }
          </button>
        </div>

        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            ⚠️ Your email must be approved by a restaurant manager before you can create an account
          </p>
        </div>
      </div>
    </div>
  );
} 
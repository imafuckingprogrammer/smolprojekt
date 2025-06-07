import { useState, useEffect, useCallback } from 'react';
import { AuthError } from '@supabase/supabase-js';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Restaurant } from '../types/database';

// Cache keys - will be made unique per user
const AUTH_CACHE_BASE = 'tabledirect_auth_cache';
const RESTAURANT_CACHE_BASE = 'tabledirect_restaurant_cache';

// Helper functions for unique cache keys
const getAuthCacheKey = (userId?: string) => `${AUTH_CACHE_BASE}_${userId || 'guest'}`;
const getRestaurantCacheKey = (userId?: string) => `${RESTAURANT_CACHE_BASE}_${userId || 'guest'}`;

interface AuthCache {
  user: User | null;
  restaurant: Restaurant | null;
  timestamp: number;
}

export interface AuthState {
  user: User | null;
  session: Session | null;
  restaurant: Restaurant | null;
  loading: boolean;
  error: string | null;
}

export interface AuthActions {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, restaurantData: Partial<Restaurant>) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  clearError: () => void;
}

// Helper functions for cache management
const getAuthCache = (userId?: string): AuthCache | null => {
  try {
    const cached = localStorage.getItem(getAuthCacheKey(userId));
    if (cached) {
      const parsed = JSON.parse(cached);
      // Cache valid for 5 minutes
      if (Date.now() - parsed.timestamp < 5 * 60 * 1000) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn('Failed to read auth cache:', error);
  }
  return null;
};

const setAuthCache = (user: User | null, restaurant: Restaurant | null) => {
  try {
    const cache: AuthCache = {
      user,
      restaurant,
      timestamp: Date.now()
    };
    localStorage.setItem(getAuthCacheKey(user?.id), JSON.stringify(cache));
  } catch (error) {
    console.warn('Failed to set auth cache:', error);
  }
};

const clearAuthCache = (userId?: string) => {
  try {
    localStorage.removeItem(getAuthCacheKey(userId));
    localStorage.removeItem(getRestaurantCacheKey(userId));
  } catch (error) {
    console.warn('Failed to clear auth cache:', error);
  }
};

export function useAuth(): AuthState & AuthActions {
  // Initialize with cached data for instant loading
  const initializeWithCache = () => {
    const cached = getAuthCache(); // Will get user-specific cache after session loads
    if (cached) {
      return {
        user: cached.user,
        session: null, // Will be updated when session loads
        restaurant: cached.restaurant,
        loading: false, // Start with false since we have cached data
        error: null,
      };
    }
    return {
      user: null,
      session: null,
      restaurant: null,
      loading: true,
      error: null,
    };
  };

  const [state, setState] = useState<AuthState>(initializeWithCache());

  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout;

    // Get initial session
    const initializeAuth = async () => {
      try {
        // If we have cached data, verify it in background
        const cached = getAuthCache();
        
        // Set a timeout to prevent infinite loading
        timeoutId = setTimeout(() => {
          if (mounted) {
            console.warn('Auth initialization timed out');
            setState(prev => ({ ...prev, loading: false, error: 'Authentication timed out' }));
          }
        }, 3000); // Reduced to 3 seconds

        const { data: { session } } = await supabase.auth.getSession();
        
        if (!mounted) return;
        
        setState(prev => ({ ...prev, session, user: session?.user ?? null }));
        
        if (session?.user) {
          // If we have cached restaurant and user matches, use it immediately
          if (cached && cached.user?.id === session.user.id && cached.restaurant) {
            setState(prev => ({ 
              ...prev, 
              user: session.user, 
              restaurant: cached.restaurant,
              loading: false 
            }));
            // Verify restaurant data in background
            fetchRestaurant(session.user.id, true);
          } else {
            await fetchRestaurant(session.user.id);
          }
        } else {
          setState(prev => ({ ...prev, loading: false }));
          clearAuthCache();
        }
        
        // Clear timeout if successful
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        if (mounted) {
          setState(prev => ({ ...prev, loading: false, error: 'Failed to initialize authentication' }));
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        
        setState(prev => ({ ...prev, session, user: session?.user ?? null }));
        
        if (session?.user) {
          await fetchRestaurant(session.user.id);
        } else {
          setState(prev => ({ ...prev, restaurant: null, loading: false }));
          clearAuthCache();
        }
      }
    );

    return () => {
      mounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      subscription.unsubscribe();
    };
  }, []);

  const fetchRestaurant = useCallback(async (userId: string, isBackgroundUpdate = false) => {
    try {
      console.log('🔥 Fetching restaurant for user:', userId);
      
      // Set a timeout for the restaurant fetch
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Restaurant fetch timed out')), 5000); // Increased to 5 seconds
      });

      // First, find restaurants where the user has access (simplified for now - get first restaurant)
      const fetchPromise = supabase
        .from('restaurants')
        .select('*')
        .limit(1)
        .maybeSingle(); // Use maybeSingle instead of single to handle no results gracefully

      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as any;

      if (error) {
        console.error('Restaurant fetch error:', error);
        throw error;
      }
      
      if (!data) {
        console.log('No restaurant found for user, user needs to complete onboarding');
        setState(prev => ({ ...prev, restaurant: null, loading: false }));
        clearAuthCache(userId);
      } else {
        console.log('✅ Restaurant loaded:', data);
        setState(prev => ({ ...prev, restaurant: data, loading: false }));
        // Cache the successful auth state
        setAuthCache(state.user, data);
      }
    } catch (error) {
      console.error('Error fetching restaurant:', error);
      
      // For development: If no restaurant found, continue without error
      // In production, you might want to redirect to onboarding
      setState(prev => ({ 
        ...prev, 
        restaurant: null,
        loading: false,
        error: isBackgroundUpdate ? prev.error : null // Don't show error for now
      }));
    }
  }, []);

  const signIn = async (email: string, password: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      
      // Don't set loading to false here - let the auth state change handler handle it
    } catch (error) {
      const message = error instanceof AuthError ? error.message : 'Sign in failed';
      setState(prev => ({ ...prev, error: message, loading: false }));
      throw error;
    }
  };

  const signUp = async (email: string, password: string, restaurantData: Partial<Restaurant>) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;
      
      if (data.user) {
        // Create restaurant record (let database generate UUID)
        const { error: restaurantError } = await supabase
          .from('restaurants')
          .insert({
            email: data.user.email!,
            ...restaurantData,
          });

        if (restaurantError) throw restaurantError;
      }
    } catch (error) {
      const message = error instanceof AuthError ? error.message : 'Sign up failed';
      setState(prev => ({ ...prev, error: message, loading: false }));
      throw error;
    }
  };

  const signOut = async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      const message = error instanceof AuthError ? error.message : 'Sign out failed';
      setState(prev => ({ ...prev, error: message, loading: false }));
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
    } catch (error) {
      const message = error instanceof AuthError ? error.message : 'Password reset failed';
      setState(prev => ({ ...prev, error: message, loading: false }));
      throw error;
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  };

  const clearError = () => {
    setState(prev => ({ ...prev, error: null }));
  };

  return {
    ...state,
    signIn,
    signUp,
    signOut,
    resetPassword,
    clearError,
  };
} 
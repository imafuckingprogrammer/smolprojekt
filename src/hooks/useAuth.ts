import { useState, useEffect, useCallback } from 'react';
import { AuthError } from '@supabase/supabase-js';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Restaurant } from '../types/database';

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

export function useAuth(): AuthState & AuthActions {
  // Initialize state
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    restaurant: null,
    loading: true,
    error: null,
  });

  // Stable fetchRestaurant function with no changing dependencies
  const fetchRestaurant = useCallback(async (userId: string) => {
    try {
      console.log('🔥 Fetching restaurant for user:', userId);
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Restaurant fetch timed out')), 5000);
      });

      // First, check if user owns a restaurant
      const ownerPromise = supabase
        .from('restaurants')
        .select('*')
        .eq('owner_id', userId)
        .maybeSingle();
      
      const { data: ownedRestaurant, error: ownerError } = await Promise.race([ownerPromise, timeoutPromise]);

      if (ownedRestaurant) {
        // User is a restaurant owner
        setState(prev => ({ 
          ...prev, 
          restaurant: ownedRestaurant, 
          loading: false,
          error: null
        }));
        console.log('✅ Restaurant owner data loaded:', ownedRestaurant.name);
        return;
      }

      // If not an owner, check if user is staff at a restaurant
      const staffPromise = supabase
        .from('restaurant_staff')
        .select(`
          *,
          restaurant:restaurants(*)
        `)
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();

      const { data: staffData, error: staffError } = await Promise.race([staffPromise, timeoutPromise]);

      if (staffData && staffData.restaurant) {
        // User is staff at a restaurant
        setState(prev => ({ 
          ...prev, 
          restaurant: staffData.restaurant, 
          loading: false,
          error: null
        }));
        console.log('✅ Staff restaurant data loaded:', staffData.restaurant.name);
        return;
      }

      // No restaurant found
      setState(prev => ({ 
        ...prev, 
        restaurant: null, 
        loading: false,
        error: null
      }));
      console.log('ℹ️ No restaurant found for user');

    } catch (error) {
      console.error('Error in fetchRestaurant:', error);
      setState(prev => ({ 
        ...prev, 
        restaurant: null, 
        loading: false, 
        error: 'Failed to load restaurant data' 
      }));
    }
  }, []); // Empty dependencies to prevent infinite loops

  // Single initialization effect
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        // Set loading timeout
        const timeoutId = setTimeout(() => {
          if (mounted) {
            console.warn('Auth initialization timed out');
            setState(prev => ({ ...prev, loading: false, error: 'Authentication timed out' }));
          }
        }, 3000);

        const { data: { session } } = await supabase.auth.getSession();
        
        if (!mounted) return;
        
        // Clear timeout
        clearTimeout(timeoutId);
        
        setState(prev => ({ ...prev, session, user: session?.user ?? null }));
        
        if (session?.user) {
          await fetchRestaurant(session.user.id);
        } else {
          setState(prev => ({ ...prev, loading: false }));
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        if (mounted) {
          setState(prev => ({ ...prev, loading: false, error: 'Failed to initialize authentication' }));
        }
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
    };
  }, []); // Empty dependencies - runs once only

  // Separate auth state change listener
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setState(prev => ({ ...prev, session, user: session?.user ?? null }));
        
        if (session?.user) {
          await fetchRestaurant(session.user.id);
        } else {
          setState(prev => ({ ...prev, restaurant: null, loading: false }));
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchRestaurant]); // fetchRestaurant is stable

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
        // Check if this email was invited as staff
        const { data: staffInvitation } = await supabase
          .from('restaurant_staff')
          .select('*')
          .eq('email', email)
          .is('user_id', null)
          .eq('is_active', true)
          .single();

        if (staffInvitation) {
          // Link the invitation to this user account
          const { error: linkError } = await supabase
            .from('restaurant_staff')
            .update({
              user_id: data.user.id,
              hire_date: new Date().toISOString()
            })
            .eq('id', staffInvitation.id);

          if (linkError) {
            console.error('Error linking staff invitation:', linkError);
          } else {
            console.log('✅ Staff invitation linked successfully');
          }
        } else {
          // Create restaurant record for new restaurant owner
          const { error: restaurantError } = await supabase
            .from('restaurants')
            .insert({
              owner_id: data.user.id,
              email: data.user.email!,
              ...restaurantData,
            });

          if (restaurantError) throw restaurantError;
        }
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
import { useState, useEffect } from 'react';
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
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    restaurant: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState(prev => ({ ...prev, session, user: session?.user ?? null }));
      if (session?.user) {
        fetchRestaurant(session.user.id);
      } else {
        setState(prev => ({ ...prev, loading: false }));
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setState(prev => ({ ...prev, session, user: session?.user ?? null }));
        
        if (session?.user) {
          await fetchRestaurant(session.user.id);
        } else {
          setState(prev => ({ ...prev, restaurant: null, loading: false }));
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const fetchRestaurant = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code !== 'PGRST116') { // Not found error
          throw error;
        }
        // Restaurant not found, user needs to complete onboarding
        setState(prev => ({ ...prev, restaurant: null, loading: false }));
      } else {
        setState(prev => ({ ...prev, restaurant: data, loading: false }));
      }
    } catch (error) {
      console.error('Error fetching restaurant:', error);
      setState(prev => ({ 
        ...prev, 
        error: 'Failed to load restaurant data',
        loading: false 
      }));
    }
  };

  const signIn = async (email: string, password: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
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
        // Create restaurant record
        const { error: restaurantError } = await supabase
          .from('restaurants')
          .insert({
            id: data.user.id,
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
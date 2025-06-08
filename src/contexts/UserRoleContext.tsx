import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

export type UserRoleType = 'owner' | 'kitchen' | 'customer';

export interface UserRole {
  type: UserRoleType;
  permissions: string[];
  sessionId?: string;
  userName?: string;
  deviceId?: string;
}

export interface UserRoleContextType {
  userRole: UserRole | null;
  switchToKitchen: (userName: string) => Promise<boolean>;
  switchToOwner: () => void;
  switchToCustomer: () => void;
  leaveCurrentRole: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

const UserRoleContext = createContext<UserRoleContextType | undefined>(undefined);

// Role definitions with permissions
const ROLE_PERMISSIONS = {
  owner: [
    'manage_menu',
    'view_analytics', 
    'manage_tables',
    'manage_restaurant',
    'view_orders',
    'update_order_status',
    'override_any_action'
  ],
  kitchen: [
    'view_orders',
    'update_order_status',
    'claim_orders',
    'release_orders'
  ],
  customer: [
    'view_menu',
    'place_order',
    'view_own_orders'
  ]
} as const;

// Generate device ID for session tracking
const getDeviceId = (): string => {
  let deviceId = localStorage.getItem('tabledirect_device_id');
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('tabledirect_device_id', deviceId);
  }
  return deviceId;
};

export const UserRoleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, restaurant } = useAuth();
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Auto-switch to owner role if user is authenticated and owns restaurant
  useEffect(() => {
    if (user && restaurant && user.email === restaurant.email && !userRole) {
      switchToOwner();
    } else if (!user && userRole) {
      // Clear role if user logs out
      setUserRole(null);
    }
  }, [user, restaurant, userRole]);

  const switchToKitchen = async (userName: string): Promise<boolean> => {
    if (!restaurant?.id) {
      setError('No restaurant context available.');
      return false;
    }

    if (!userName.trim()) {
      setError('Username is required to join kitchen.');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('🔥 Switching to kitchen role:', { userName, restaurantId: restaurant.id });
      
      const deviceId = getDeviceId();
      
      // Create kitchen session through RPC
      const { data: sessionId, error } = await supabase.rpc('join_kitchen_session', {
        restaurant_uuid: restaurant.id,
        user_name: userName.trim(),
        device_id: deviceId
      });

      if (error) throw error;

      if (sessionId) {
        const newRole: UserRole = {
          type: 'kitchen',
          permissions: [...ROLE_PERMISSIONS.kitchen],
          sessionId,
          userName: userName.trim(),
          deviceId
        };

        setUserRole(newRole);
        console.log('✅ Successfully switched to kitchen role');
        return true;
      } else {
        setError('Failed to create kitchen session.');
        return false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to join kitchen';
      console.error('❌ Error switching to kitchen:', err);
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const switchToOwner = () => {
    if (!user || !restaurant) {
      setError('Authentication required for owner role.');
      return;
    }

    if (restaurant.email !== user.email) {
      setError('You are not authorized as the restaurant owner.');
      return;
    }

    const newRole: UserRole = {
      type: 'owner',
      permissions: [...ROLE_PERMISSIONS.owner],
      deviceId: getDeviceId()
    };

    setUserRole(newRole);
    console.log('✅ Switched to owner role');
  };

  const switchToCustomer = () => {
    const newRole: UserRole = {
      type: 'customer',
      permissions: [...ROLE_PERMISSIONS.customer],
      deviceId: getDeviceId()
    };

    setUserRole(newRole);
    console.log('✅ Switched to customer role');
  };

  const leaveCurrentRole = async (): Promise<void> => {
    if (!userRole) return;

    setLoading(true);
    setError(null);

    try {
      // If leaving kitchen role, clean up session
      if (userRole.type === 'kitchen' && userRole.sessionId) {
        console.log('🔥 Leaving kitchen session:', userRole.sessionId);
        
        const { error } = await supabase.rpc('leave_kitchen_session', {
          session_uuid: userRole.sessionId
        });

        if (error) {
          console.error('Error leaving kitchen session:', error);
          // Continue anyway to clear local state
        }
      }

      setUserRole(null);
      console.log('✅ Left current role successfully');
    } catch (err) {
      console.error('❌ Error leaving role:', err);
      setError('Failed to leave role cleanly, but local state cleared.');
      setUserRole(null); // Clear anyway
    } finally {
      setLoading(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (userRole?.type === 'kitchen' && userRole.sessionId) {
        // Background cleanup - don't await
        const cleanup = async () => {
          try {
            await supabase.rpc('leave_kitchen_session', {
              session_uuid: userRole.sessionId
            });
            console.log('Background session cleanup successful');
          } catch (err: unknown) {
            console.error('Background session cleanup failed:', err);
          }
        };
        cleanup();
      }
    };
  }, [userRole?.sessionId, userRole?.type]);

  const contextValue: UserRoleContextType = {
    userRole,
    switchToKitchen,
    switchToOwner,
    switchToCustomer,
    leaveCurrentRole,
    loading,
    error
  };

  return (
    <UserRoleContext.Provider value={contextValue}>
      {children}
    </UserRoleContext.Provider>
  );
};

export const useUserRole = (): UserRoleContextType => {
  const context = useContext(UserRoleContext);
  if (context === undefined) {
    throw new Error('useUserRole must be used within a UserRoleProvider');
  }
  return context;
};

// Utility functions for permission checking
export const hasPermission = (userRole: UserRole | null, permission: string): boolean => {
  if (!userRole) return false;
  return userRole.permissions.includes(permission) || userRole.permissions.includes('override_any_action');
};

export const requiresRole = (allowedRoles: UserRoleType[]) => {
  return (userRole: UserRole | null): boolean => {
    if (!userRole) return false;
    return allowedRoles.includes(userRole.type);
  };
};

export const requiresPermission = (permission: string) => {
  return (userRole: UserRole | null): boolean => {
    return hasPermission(userRole, permission);
  };
}; 
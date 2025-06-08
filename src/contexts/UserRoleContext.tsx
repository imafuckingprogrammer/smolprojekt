import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useStaffStore } from '../stores/staffStore';
import { useSessionStore } from '../stores/sessionStore';

export type UserRoleType = 'owner' | 'kitchen' | 'customer';

export interface UserRole {
  type: UserRoleType;
  permissions: string[];
  sessionId?: string;
  userName?: string;
  email?: string;
  staffInfo?: {
    name: string;
    role: 'kitchen' | 'server' | 'manager';
  };
}

export interface UserRoleContextType {
  userRole: UserRole | null;
  switchToKitchen: (userName: string) => Promise<boolean>;
  switchToOwner: () => void;
  switchToCustomer: () => void;
  leaveCurrentRole: () => Promise<void>;
  loading: boolean;
  error: string | null;
  canAccessKitchen: boolean;
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
    'manage_staff'
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

export const UserRoleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, restaurant } = useAuth();
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Zustand stores
  const { isStaffMember, getStaffByEmail } = useStaffStore();
  const { 
    createSession, 
    endSession, 
    currentSession, 
    loading: sessionLoading,
    error: sessionError 
  } = useSessionStore();

  // Calculate if user can access kitchen
  const canAccessKitchen = Boolean(
    (user && restaurant && user.email === restaurant.email) || // Owner
    (user && restaurant && user.email && isStaffMember(user.email, restaurant.id)) // Staff member
  );

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

  // Sync session errors with local state
  useEffect(() => {
    if (sessionError) {
      setError(sessionError);
    }
  }, [sessionError]);

  const switchToKitchen = async (userName: string): Promise<boolean> => {
    if (!restaurant?.id) {
      setError('No restaurant context available.');
      return false;
    }

    if (!userName.trim()) {
      setError('Username is required to join kitchen.');
      return false;
    }

    if (!canAccessKitchen) {
      setError('You are not authorized to access the kitchen.');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('🔥 Switching to kitchen role:', { userName, restaurantId: restaurant.id });
      
      // End any existing session first
      if (currentSession) {
        await endSession();
      }

      // Create new kitchen session
      const sessionId = await createSession({
        restaurantId: restaurant.id,
        userName: userName.trim(),
        email: user?.email
      });

      if (sessionId) {
        // Get staff info if available
        const staffInfo = user?.email ? getStaffByEmail(user.email, restaurant.id) : null;
        
        const newRole: UserRole = {
          type: 'kitchen',
          permissions: [...ROLE_PERMISSIONS.kitchen],
          sessionId,
          userName: userName.trim(),
          email: user?.email,
          staffInfo: staffInfo ? {
            name: staffInfo.name,
            role: staffInfo.role
          } : undefined
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
      email: user.email
    };

    setUserRole(newRole);
    console.log('✅ Switched to owner role');
  };

  const switchToCustomer = () => {
    const newRole: UserRole = {
      type: 'customer',
      permissions: [...ROLE_PERMISSIONS.customer]
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
      if (userRole.type === 'kitchen' && currentSession) {
        console.log('🔥 Leaving kitchen session:', currentSession.id);
        await endSession();
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

  const value: UserRoleContextType = {
    userRole,
    switchToKitchen,
    switchToOwner,
    switchToCustomer,
    leaveCurrentRole,
    loading: loading || sessionLoading,
    error,
    canAccessKitchen
  };

  return (
    <UserRoleContext.Provider value={value}>
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

export const hasPermission = (userRole: UserRole | null, permission: string): boolean => {
  if (!userRole) return false;
  return userRole.permissions.includes(permission);
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
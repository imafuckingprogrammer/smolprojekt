import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useStaffStore } from '../stores/staffStore';

export type UserRole = 'customer' | 'owner' | 'staff';

interface UserRoleContextType {
  currentRole: UserRole;
  canAccessKitchen: boolean;
  canManageStaff: boolean;
  canManageOrders: boolean;
  staffInfo: any | null;
  isLoading: boolean;
}

const UserRoleContext = createContext<UserRoleContextType | undefined>(undefined);

interface UserRoleProviderProps {
  children: ReactNode;
}

export function UserRoleProvider({ children }: UserRoleProviderProps) {
  const { user, restaurant } = useAuth();
  const { checkStaffAccess } = useStaffStore();
  
  const [currentRole, setCurrentRole] = useState<UserRole>('customer');
  const [isLoading, setIsLoading] = useState(false);
  const [staffInfo, setStaffInfo] = useState<any>(null);
  const [isStaff, setIsStaff] = useState(false);

  // Determine user permissions
  const isOwner = Boolean(user && restaurant && user.email === restaurant.email);

  // Check staff access when user/restaurant changes
  useEffect(() => {
    const checkAccess = async () => {
      if (user?.email && restaurant) {
        const staffMember = await checkStaffAccess(user.email, restaurant.id);
        setStaffInfo(staffMember);
        setIsStaff(Boolean(staffMember));
      } else {
        setStaffInfo(null);
        setIsStaff(false);
      }
    };

    checkAccess();
  }, [user, restaurant, checkStaffAccess]);

  // Calculate capabilities
  const canAccessKitchen = isOwner || isStaff;
  const canManageStaff = isOwner;
  const canManageOrders = isOwner || isStaff;

  // Auto-determine role on auth changes
  useEffect(() => {
    if (!user || !restaurant) {
      setCurrentRole('customer');
      return;
    }

    if (isOwner) {
      setCurrentRole('owner');
    } else if (isStaff) {
      setCurrentRole('staff');
    } else {
      setCurrentRole('customer');
    }
  }, [user, restaurant, isOwner, isStaff]);

  const contextValue: UserRoleContextType = {
    currentRole,
    canAccessKitchen,
    canManageStaff,
    canManageOrders,
    staffInfo,
    isLoading
  };

  return (
    <UserRoleContext.Provider value={contextValue}>
      {children}
    </UserRoleContext.Provider>
  );
}

export function useUserRole(): UserRoleContextType {
  const context = useContext(UserRoleContext);
  if (context === undefined) {
    throw new Error('useUserRole must be used within a UserRoleProvider');
  }
  return context;
}

// Legacy helper functions removed - use context values instead 
import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useStaffStore } from '../stores/staffStore';
import { useSessionStore } from '../stores/sessionStore';

export type UserRole = 'customer' | 'owner' | 'staff' | 'kitchen';

interface UserRoleContextType {
  currentRole: UserRole;
  canAccessKitchen: boolean;
  canManageStaff: boolean;
  canManageOrders: boolean;
  staffInfo: any | null;
  switchToRole: (role: UserRole) => Promise<boolean>;
  createKitchenSession: (userName?: string) => Promise<boolean>;
  leaveKitchen: () => Promise<void>;
  isLoading: boolean;
}

const UserRoleContext = createContext<UserRoleContextType | undefined>(undefined);

interface UserRoleProviderProps {
  children: ReactNode;
}

export function UserRoleProvider({ children }: UserRoleProviderProps) {
  const { user, restaurant } = useAuth();
  const { isStaffMember, getStaffByEmail } = useStaffStore();
  const { currentSession, createSession, endSession, loading: sessionLoading } = useSessionStore();
  
  const [currentRole, setCurrentRole] = useState<UserRole>('customer');
  const [isLoading, setIsLoading] = useState(false);

  // Determine user permissions
  const isOwner = Boolean(user && restaurant && user.email === restaurant.email);
  const staffInfo = user?.email && restaurant ? getStaffByEmail(user.email, restaurant.id) : null;
  const isStaff = Boolean(user && restaurant && staffInfo);

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

    if (currentSession) {
      setCurrentRole('kitchen');
    } else if (isOwner) {
      setCurrentRole('owner');
    } else if (isStaff) {
      setCurrentRole('staff');
    } else {
      setCurrentRole('customer');
    }
  }, [user, restaurant, isOwner, isStaff, currentSession]);

  const switchToRole = async (role: UserRole): Promise<boolean> => {
    if (!user || !restaurant) return false;

    setIsLoading(true);

    try {
      switch (role) {
        case 'kitchen':
          if (!canAccessKitchen) {
            console.error('User does not have kitchen access');
            return false;
          }
          return await createKitchenSession();

        case 'owner':
          if (!isOwner) {
            console.error('User is not restaurant owner');
            return false;
          }
          if (currentSession) {
            await endSession();
          }
          setCurrentRole('owner');
          return true;

        case 'staff':
          if (!isStaff) {
            console.error('User is not staff member');
            return false;
          }
          if (currentSession) {
            await endSession();
          }
          setCurrentRole('staff');
          return true;

        case 'customer':
          if (currentSession) {
            await endSession();
          }
          setCurrentRole('customer');
          return true;

        default:
          console.error('Unknown role:', role);
          return false;
      }
    } catch (error) {
      console.error('Error switching roles:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const createKitchenSession = async (userName?: string): Promise<boolean> => {
    if (!user || !restaurant || !canAccessKitchen) {
      console.error('Cannot create kitchen session - insufficient permissions');
      return false;
    }

    setIsLoading(true);

    try {
      // End existing session first
      if (currentSession) {
        await endSession();
      }

      // Determine username
      const sessionUserName = userName || 
        staffInfo?.name || 
        user.email?.split('@')[0] || 
        'Kitchen User';

      // Create new kitchen session
      const sessionId = await createSession({
        restaurantId: restaurant.id,
        userName: sessionUserName,
        email: user.email
      });

      if (sessionId) {
        console.log('✅ Kitchen session created:', sessionId);
        setCurrentRole('kitchen');
        return true;
      } else {
        console.error('❌ Failed to create kitchen session');
        return false;
      }
    } catch (error) {
      console.error('❌ Error creating kitchen session:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const leaveKitchen = async (): Promise<void> => {
    setIsLoading(true);
    
    try {
      if (currentSession) {
        await endSession();
      }
      
      // Return to default role
      if (isOwner) {
        setCurrentRole('owner');
      } else if (isStaff) {
        setCurrentRole('staff');
      } else {
        setCurrentRole('customer');
      }
      
      console.log('✅ Left kitchen successfully');
    } catch (error) {
      console.error('❌ Error leaving kitchen:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const contextValue: UserRoleContextType = {
    currentRole,
    canAccessKitchen,
    canManageStaff,
    canManageOrders,
    staffInfo,
    switchToRole,
    createKitchenSession,
    leaveKitchen,
    isLoading: isLoading || sessionLoading
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
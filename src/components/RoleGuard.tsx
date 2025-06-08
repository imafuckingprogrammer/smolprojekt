import React, { type ReactNode } from 'react';
import { useUserRole, type UserRoleType, hasPermission, requiresRole } from '../contexts/UserRoleContext';

interface RoleGuardProps {
  allowedRoles?: UserRoleType[];
  requiredPermissions?: string[];
  requireAll?: boolean; // If true, user must have ALL permissions, if false, ANY permission
  children: ReactNode;
  fallback?: ReactNode;
  showError?: boolean;
}

interface AccessDeniedProps {
  message?: string;
  showLoginPrompt?: boolean;
}

const AccessDenied: React.FC<AccessDeniedProps> = ({ 
  message = "Access denied. You don't have permission to view this content.",
  showLoginPrompt = false 
}) => (
  <div className="flex items-center justify-center min-h-[200px] bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
    <div className="text-center p-6">
      <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
        <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Access Restricted</h3>
      <p className="text-gray-600 mb-4">{message}</p>
      {showLoginPrompt && (
        <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
          Switch Role or Login
        </button>
      )}
    </div>
  </div>
);

export const RoleGuard: React.FC<RoleGuardProps> = ({
  allowedRoles,
  requiredPermissions,
  requireAll = false,
  children,
  fallback,
  showError = true
}) => {
  const { userRole } = useUserRole();

  // Check role-based access
  if (allowedRoles && allowedRoles.length > 0) {
    const hasRequiredRole = requiresRole(allowedRoles)(userRole);
    if (!hasRequiredRole) {
      if (fallback) return <>{fallback}</>;
      if (!showError) return null;
      
      return (
        <AccessDenied 
          message={`This content requires one of the following roles: ${allowedRoles.join(', ')}`}
          showLoginPrompt={!userRole}
        />
      );
    }
  }

  // Check permission-based access
  if (requiredPermissions && requiredPermissions.length > 0) {
    const permissionChecks = requiredPermissions.map(permission => 
      hasPermission(userRole, permission)
    );

    const hasRequiredPermissions = requireAll 
      ? permissionChecks.every(Boolean) 
      : permissionChecks.some(Boolean);

    if (!hasRequiredPermissions) {
      if (fallback) return <>{fallback}</>;
      if (!showError) return null;
      
      const permissionText = requireAll 
        ? `all of these permissions: ${requiredPermissions.join(', ')}`
        : `one of these permissions: ${requiredPermissions.join(', ')}`;
      
      return (
        <AccessDenied 
          message={`This content requires ${permissionText}`}
          showLoginPrompt={!userRole}
        />
      );
    }
  }

  // If no specific requirements or all checks pass, render children
  return <>{children}</>;
};

// Convenience components for common use cases
export const OwnerOnly: React.FC<{ children: ReactNode; fallback?: ReactNode }> = ({ 
  children, 
  fallback 
}) => (
  <RoleGuard allowedRoles={['owner']} fallback={fallback}>
    {children}
  </RoleGuard>
);

export const KitchenOnly: React.FC<{ children: ReactNode; fallback?: ReactNode }> = ({ 
  children, 
  fallback 
}) => (
  <RoleGuard allowedRoles={['kitchen']} fallback={fallback}>
    {children}
  </RoleGuard>
);

export const StaffOnly: React.FC<{ children: ReactNode; fallback?: ReactNode }> = ({ 
  children, 
  fallback 
}) => (
  <RoleGuard allowedRoles={['owner', 'kitchen']} fallback={fallback}>
    {children}
  </RoleGuard>
);

export const CustomerOnly: React.FC<{ children: ReactNode; fallback?: ReactNode }> = ({ 
  children, 
  fallback 
}) => (
  <RoleGuard allowedRoles={['customer']} fallback={fallback}>
    {children}
  </RoleGuard>
);

// Higher-order component for role-based page protection
export const withRoleGuard = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  guardConfig: Omit<RoleGuardProps, 'children'>
) => {
  const GuardedComponent: React.FC<P> = (props) => (
    <RoleGuard {...guardConfig}>
      <WrappedComponent {...props} />
    </RoleGuard>
  );
  
  GuardedComponent.displayName = `withRoleGuard(${WrappedComponent.displayName || WrappedComponent.name})`;
  
  return GuardedComponent;
};

// Hook for checking permissions in components
export const usePermissionCheck = () => {
  const { userRole } = useUserRole();
  
  return {
    hasRole: (roles: UserRoleType[]) => requiresRole(roles)(userRole),
    hasPermission: (permission: string) => hasPermission(userRole, permission),
    hasAnyPermission: (permissions: string[]) => 
      permissions.some(permission => hasPermission(userRole, permission)),
    hasAllPermissions: (permissions: string[]) => 
      permissions.every(permission => hasPermission(userRole, permission)),
    userRole
  };
};

export default RoleGuard; 
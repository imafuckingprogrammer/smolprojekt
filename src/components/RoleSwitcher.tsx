import React, { useState } from 'react';
import { useUserRole } from '../contexts/UserRoleContext';
import { useAuth } from '../hooks/useAuth';
import { StaffLogin } from './StaffLogin';

export const RoleSwitcher: React.FC = () => {
  const { 
    userRole, 
    switchToKitchen, 
    switchToOwner, 
    switchToCustomer, 
    leaveCurrentRole, 
    loading, 
    error,
    canAccessKitchen 
  } = useUserRole();
  const { user, restaurant } = useAuth();
  const [kitchenUserName, setKitchenUserName] = useState('');
  const [showKitchenForm, setShowKitchenForm] = useState(false);
  const [showStaffLogin, setShowStaffLogin] = useState(false);

  const handleQuickKitchenJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kitchenUserName.trim()) return;

    const success = await switchToKitchen(kitchenUserName.trim());
    if (success) {
      setShowKitchenForm(false);
      setKitchenUserName('');
    }
  };

  const handleLeaveRole = async () => {
    await leaveCurrentRole();
    setShowKitchenForm(false);
    setShowStaffLogin(false);
  };

  const handleKitchenAccess = () => {
    if (canAccessKitchen) {
      // If user is already authorized (owner or staff), show quick form
      setShowKitchenForm(true);
    } else {
      // If user is not authorized, show staff login
      setShowStaffLogin(true);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Role Management</h3>
        {userRole && (
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            userRole.type === 'owner' ? 'bg-purple-100 text-purple-800' :
            userRole.type === 'kitchen' ? 'bg-green-100 text-green-800' :
            'bg-blue-100 text-blue-800'
          }`}>
            {userRole.type.charAt(0).toUpperCase() + userRole.type.slice(1)}
            {userRole.userName && ` (${userRole.userName})`}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        {!userRole ? (
          <div className="text-center py-4">
            <p className="text-gray-500 mb-4">No active role. Choose how you want to access the system:</p>
            <div className="space-y-2">
              {user && restaurant && user.email === restaurant.email && (
                <button
                  onClick={switchToOwner}
                  disabled={loading}
                  className="w-full bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Switching...' : 'Owner Dashboard'}
                </button>
              )}
              
              <button
                onClick={handleKitchenAccess}
                disabled={loading}
                className="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {canAccessKitchen ? 'Join Kitchen' : 'Staff Login'}
              </button>
              
              <button
                onClick={switchToCustomer}
                disabled={loading}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Customer View
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-gray-50 p-3 rounded-md">
              <h4 className="font-medium text-gray-900 mb-2">Current Role: {userRole.type}</h4>
              <div className="text-sm text-gray-600">
                <p><strong>Permissions:</strong></p>
                <ul className="list-disc list-inside mt-1">
                  {userRole.permissions.map(permission => (
                    <li key={permission}>{permission.replace(/_/g, ' ')}</li>
                  ))}
                </ul>
                {userRole.sessionId && (
                  <p className="mt-2"><strong>Session ID:</strong> {userRole.sessionId.slice(0, 8)}...</p>
                )}
                {userRole.email && (
                  <p className="mt-1"><strong>Email:</strong> {userRole.email}</p>
                )}
                {userRole.staffInfo && (
                  <p className="mt-1"><strong>Staff Role:</strong> {userRole.staffInfo.role}</p>
                )}
              </div>
            </div>
            
            <button
              onClick={handleLeaveRole}
              disabled={loading}
              className="w-full bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Leaving...' : 'Leave Current Role'}
            </button>
          </div>
        )}
      </div>

      {/* Quick Kitchen Join Form (for authorized users) */}
      {showKitchenForm && canAccessKitchen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Join Kitchen</h3>
            <form onSubmit={handleQuickKitchenJoin}>
              <div className="mb-4">
                <label htmlFor="userName" className="block text-sm font-medium text-gray-700 mb-2">
                  Your Kitchen Name
                </label>
                <input
                  type="text"
                  id="userName"
                  value={kitchenUserName}
                  onChange={(e) => setKitchenUserName(e.target.value)}
                  placeholder="Enter your name for kitchen display"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  required
                />
              </div>
              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={loading || !kitchenUserName.trim()}
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Joining...' : 'Join Kitchen'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowKitchenForm(false);
                    setKitchenUserName('');
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Staff Login Modal */}
      {showStaffLogin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <StaffLogin 
              onSuccess={() => {
                setShowStaffLogin(false);
              }}
              onCancel={() => {
                setShowStaffLogin(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}; 
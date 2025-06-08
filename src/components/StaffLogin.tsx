import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useStaffStore } from '../stores/staffStore';

interface StaffLoginProps {
  restaurantId: string;
  onStaffLogin: (staffEmail: string) => void;
  onClose: () => void;
}

export function StaffLogin({ restaurantId, onStaffLogin, onClose }: StaffLoginProps) {
  const { restaurant } = useAuth();
  const { getRestaurantStaff, isStaffMember } = useStaffStore();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  
  const restaurantStaff = getRestaurantStaff(restaurantId);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedEmail = email.trim().toLowerCase();
    
    if (!trimmedEmail) {
      setError('Please enter an email address');
      return;
    }
    
    if (!isStaffMember(trimmedEmail, restaurantId)) {
      setError('Email not found in staff list. Please contact the restaurant owner.');
      return;
    }
    
    // Staff member found - proceed with login
    onStaffLogin(trimmedEmail);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Staff Login</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>
        
        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-4">
            Enter your email to access the kitchen system for <strong>{restaurant?.name}</strong>.
          </p>
          
          {restaurantStaff.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-2">Authorized staff:</p>
              <div className="space-y-1">
                {restaurantStaff.slice(0, 3).map((staff) => (
                  <button
                    key={staff.email}
                    onClick={() => setEmail(staff.email)}
                    className="block text-left w-full p-2 text-sm bg-gray-50 hover:bg-gray-100 rounded border"
                  >
                    <div className="font-medium">{staff.name}</div>
                    <div className="text-xs text-gray-500">{staff.email}</div>
                  </button>
                ))}
                {restaurantStaff.length > 3 && (
                  <div className="text-xs text-gray-400 text-center">
                    +{restaurantStaff.length - 3} more staff members
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="text-red-800 text-sm">{error}</div>
            </div>
          )}
          
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Login
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 
import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useStaffStore } from '../stores/staffStore';
import { useSessionStore } from '../stores/sessionStore';

export function TestComponent() {
  const { user, restaurant, loading } = useAuth();
  const { getRestaurantStaff, addStaff } = useStaffStore();
  const { currentSession, loading: sessionLoading } = useSessionStore();
  const [testEmail, setTestEmail] = useState('');
  const [testName, setTestName] = useState('');

  const restaurantStaff = restaurant ? getRestaurantStaff(restaurant.id) : [];

  const handleAddTestStaff = () => {
    if (!restaurant || !testEmail || !testName) return;
    
    addStaff({
      email: testEmail,
      name: testName,
      role: 'kitchen',
      restaurantId: restaurant.id
    });
    
    setTestEmail('');
    setTestName('');
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow space-y-4">
      <h2 className="text-xl font-bold">System Status Test</h2>
      
      {/* Auth Status */}
      <div className="p-4 bg-gray-50 rounded">
        <h3 className="font-semibold mb-2">Authentication</h3>
        <div className="text-sm space-y-1">
          <div>Loading: {loading ? 'Yes' : 'No'}</div>
          <div>User: {user ? user.email : 'None'}</div>
          <div>Restaurant: {restaurant ? restaurant.name : 'None'}</div>
        </div>
      </div>

      {/* Session Status */}
      <div className="p-4 bg-blue-50 rounded">
        <h3 className="font-semibold mb-2">Session Store</h3>
        <div className="text-sm space-y-1">
          <div>Loading: {sessionLoading ? 'Yes' : 'No'}</div>
          <div>Current Session: {currentSession ? 'Active' : 'None'}</div>
          {currentSession && (
            <div className="ml-4 space-y-1">
              <div>User Name: {currentSession.userName}</div>
              <div>Restaurant: {currentSession.restaurantId}</div>
              <div>Status: {currentSession.status}</div>
            </div>
          )}
        </div>
      </div>

      {/* Staff Store Status */}
      <div className="p-4 bg-green-50 rounded">
        <h3 className="font-semibold mb-2">Staff Store</h3>
        <div className="text-sm space-y-1">
          <div>Staff Count: {restaurantStaff.length}</div>
          {restaurantStaff.map((staff, index) => (
            <div key={index} className="ml-4">
              {staff.name} ({staff.email})
            </div>
          ))}
        </div>
      </div>

      {/* Test Controls */}
      {restaurant && (
        <div className="p-4 bg-yellow-50 rounded">
          <h3 className="font-semibold mb-2">Test Controls</h3>
          <div className="space-y-2">
            <input
              type="email"
              placeholder="Test staff email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded"
            />
            <input
              type="text"
              placeholder="Test staff name"
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
              className="w-full px-3 py-2 border rounded"
            />
            <button
              onClick={handleAddTestStaff}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Add Test Staff
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 
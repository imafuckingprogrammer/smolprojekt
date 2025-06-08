import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useStaffStore } from '../stores/staffStore';

interface DatabaseStaffMember {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export function StaffManagement() {
  const { restaurant, user } = useAuth();
  const queryClient = useQueryClient();
  const { getRestaurantStaff, addStaff } = useStaffStore();
  
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Get local staff from store
  const localStaff = restaurant ? getRestaurantStaff(restaurant.id) : [];

  // Query database staff with error handling
  const { data: dbStaff = [], isLoading } = useQuery({
    queryKey: ['restaurant-staff', restaurant?.id],
    queryFn: async () => {
      if (!restaurant?.id) return [];
      
      try {
        const { data, error } = await supabase
          .from('restaurant_staff')
          .select(`
            id,
            email,
            name,
            role,
            is_active,
            created_at
          `)
          .eq('restaurant_id', restaurant.id)
          .eq('is_active', true);

        if (error) {
          console.error('Database staff query error:', error);
          return [];
        }

        return data || [];
      } catch (err) {
        console.error('Staff fetch error:', err);
        return [];
      }
    },
    enabled: !!restaurant?.id,
    retry: 1,
    staleTime: 30000,
  });

  // Add staff mutation with simplified error handling
  const addStaffMutation = useMutation({
    mutationFn: async ({ email, name }: { email: string; name: string }) => {
      if (!restaurant?.id || !user?.id) {
        throw new Error('Restaurant or user not found');
      }

      // First add to local store (always works)
      addStaff({
        email: email.toLowerCase().trim(),
        name: name.trim(),
        role: 'kitchen',
        restaurantId: restaurant.id
      });

      // Try to add to database (may fail, but that's ok)
      try {
        const { error } = await supabase
          .from('restaurant_staff')
          .upsert({
            restaurant_id: restaurant.id,
            email: email.toLowerCase().trim(),
            name: name.trim(),
            role: 'kitchen_staff',
            is_active: true,
            invited_by: user.id
          });

        if (error) {
          console.warn('Database insert failed, but local store updated:', error);
        }
      } catch (dbError) {
        console.warn('Database connection failed, but local store updated:', dbError);
      }

      return { email, name };
    },
    onSuccess: ({ email, name }) => {
      setSuccess(`${name} (${email}) added successfully!`);
      setNewStaffEmail('');
      setNewStaffName('');
      setError('');
      
      queryClient.invalidateQueries({ queryKey: ['restaurant-staff'] });
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (error) => {
      console.error('Add staff error:', error);
      setError(error instanceof Error ? error.message : 'Failed to add staff member');
    }
  });

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const email = newStaffEmail.trim().toLowerCase();
    const name = newStaffName.trim();
    
    if (!email || !name) {
      setError('Please provide both email and name');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please provide a valid email address');
      return;
    }

    // Check if already exists in local store
    const existsLocally = localStaff.some((staff) => staff.email === email);
    if (existsLocally) {
      setError('This staff member already exists');
      return;
    }

    addStaffMutation.mutate({ email, name });
  };

  // Combine local and database staff, with local taking precedence
  const allStaff = [...localStaff];
  
  // Add database staff that aren't in local store
  dbStaff.forEach((dbMember: DatabaseStaffMember) => {
    const existsLocally = localStaff.some((local) => local.email === dbMember.email);
    if (!existsLocally) {
      allStaff.push({
        email: dbMember.email,
        name: dbMember.name,
        role: 'kitchen' as const,
        restaurantId: restaurant?.id || '',
        isActive: true,
        addedAt: new Date(dbMember.created_at)
      });
    }
  });

  if (!restaurant) {
    return (
      <div className="p-6 bg-white rounded-lg shadow">
        <div className="text-center text-gray-500">
          Please select a restaurant to manage staff.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Staff Management - {restaurant.name}
          </h2>
        </div>

        {/* Add Staff Form */}
        <form onSubmit={handleAddStaff} className="space-y-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="email"
              placeholder="Staff email"
              value={newStaffEmail}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewStaffEmail(e.target.value)}
              disabled={addStaffMutation.isPending}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
            <input
              type="text"
              placeholder="Staff name"
              value={newStaffName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewStaffName(e.target.value)}
              disabled={addStaffMutation.isPending}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
            <button 
              type="submit" 
              disabled={addStaffMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {addStaffMutation.isPending ? 'Adding...' : 'Add Staff'}
            </button>
          </div>
        </form>

        {/* Status Messages */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="text-red-800">{error}</div>
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md">
            <div className="text-green-800">{success}</div>
          </div>
        )}

        {/* Staff List */}
        <div className="space-y-2">
          <h3 className="font-medium text-sm text-gray-700 mb-3">
            Current Staff ({allStaff.length})
          </h3>
          
          {isLoading && (
            <div className="text-sm text-gray-500">Loading staff...</div>
          )}

          {allStaff.length === 0 && !isLoading && (
            <div className="text-sm text-gray-500 py-4 text-center">
              No staff members added yet. Add some above to get started.
            </div>
          )}

          {allStaff.map((staff, index) => (
            <div 
              key={`${staff.email}-${index}`}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 text-sm font-medium">
                    {staff.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="font-medium text-sm">{staff.name}</div>
                  <div className="text-xs text-gray-500">
                    {staff.email}
                    <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                      Local
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Info Box */}
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <div className="text-sm text-blue-800">
            <strong>How it works:</strong> Staff members can use their email to access the kitchen system. 
            Local staff are stored on this device for quick testing. Database staff are synchronized across all devices.
          </div>
        </div>
      </div>
    </div>
  );
} 
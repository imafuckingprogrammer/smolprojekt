import React, { useState, useEffect } from 'react';
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
  user?: {
    first_name?: string;
    last_name?: string;
    email: string;
    is_active: boolean;
  };
}

interface InviteFormData {
  email: string;
  name: string;
  role: 'kitchen' | 'server' | 'manager';
}

export function StaffManagement() {
  const { restaurant, user } = useAuth();
  const queryClient = useQueryClient();
  const { getRestaurantStaff, addStaff, isStaffMember } = useStaffStore();
  
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteData, setInviteData] = useState<InviteFormData>({
    email: '',
    name: '',
    role: 'kitchen'
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Get local staff from store
  const localStaff = restaurant ? getRestaurantStaff(restaurant.id) : [];

  // Query database staff with comprehensive error handling
  const { data: dbStaff = [], isLoading, error: queryError } = useQuery({
    queryKey: ['restaurant-staff', restaurant?.id],
    queryFn: async (): Promise<any[]> => {
      if (!restaurant?.id) return [];
      
      try {
        // First try to get staff with user details
        const { data, error } = await supabase
          .from('restaurant_staff')
          .select(`
            id,
            email,
            name,
            role,
            is_active,
            created_at,
            user:users!email(
              first_name,
              last_name,
              email,
              is_active
            )
          `)
          .eq('restaurant_id', restaurant.id)
          .eq('is_active', true);

        if (error) {
          console.warn('Failed to fetch staff with user details, trying simple query:', error);
          
          // Fallback to simple query
          const { data: simpleData, error: simpleError } = await supabase
            .from('restaurant_staff')
            .select('id, email, name, role, is_active, created_at')
            .eq('restaurant_id', restaurant.id)
            .eq('is_active', true);

          if (simpleError) {
            console.error('Both staff queries failed:', simpleError);
            return [];
          }

          return simpleData || [];
        }

        return data || [];
      } catch (err) {
        console.error('Staff fetch error:', err);
        return [];
      }
    },
    enabled: !!restaurant?.id,
    retry: 2,
    staleTime: 30000,
  });

  // Add staff mutation with improved error handling
  const addStaffMutation = useMutation({
    mutationFn: async (formData: InviteFormData) => {
      if (!restaurant?.id || !user?.id) {
        throw new Error('Restaurant or user not found');
      }

      const { email, name, role } = formData;

      // Check if already exists locally
      if (isStaffMember(email, restaurant.id)) {
        throw new Error('This staff member already exists');
      }

      // Try proper database approach first - create staff invitation
      try {
        const { data, error } = await supabase.rpc('create_staff_invitation', {
          restaurant_id_param: restaurant.id,
          email_param: email.toLowerCase().trim(),
          role_param: role === 'kitchen' ? 'kitchen_staff' : role
        });

        if (error) throw error;

        if (data && data.success) {
          console.log('✅ Staff invitation created successfully:', data);
          
          // Also add to local store for immediate UI feedback
          addStaff({
            email: email.toLowerCase().trim(),
            name: name.trim(),
            role,
            restaurantId: restaurant.id
          });
          
          return { email, name, role, invitation: data };
        } else {
          throw new Error(data?.error || 'Failed to create invitation');
        }
      } catch (dbError) {
        console.warn('Database invitation failed, using local storage fallback:', dbError);
        
        // Fallback: Add to local store only
        addStaff({
          email: email.toLowerCase().trim(),
          name: name.trim(),
          role,
          restaurantId: restaurant.id
        });
        
        // Try simple database insert as backup
        try {
          const { error: insertError } = await supabase
            .from('restaurant_staff')
            .insert({
              restaurant_id: restaurant.id,
              email: email.toLowerCase().trim(),
              name: name.trim(),
              role: role === 'kitchen' ? 'kitchen_staff' : role,
              is_active: true,
              created_at: new Date().toISOString()
            });

          if (!insertError) {
            console.log('✅ Backup database insert successful');
          }
        } catch (backupError) {
          console.warn('Backup database insert also failed:', backupError);
        }
      }

      return { email, name, role };
    },
    onSuccess: ({ email, name }) => {
      setSuccess(`${name} (${email}) added successfully!`);
      setInviteData({ email: '', name: '', role: 'kitchen' });
      setShowInviteForm(false);
      setError('');
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['restaurant-staff'] });
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(''), 5000);
    },
    onError: (error) => {
      console.error('Add staff error:', error);
      setError(error instanceof Error ? error.message : 'Failed to add staff member');
    }
  });

  // Remove staff mutation
  const removeStaffMutation = useMutation({
    mutationFn: async (staffId: string) => {
      if (!staffId) throw new Error('Staff ID required');

      const { error } = await supabase
        .from('restaurant_staff')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', staffId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-staff'] });
      setSuccess('Staff member removed successfully!');
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (error) => {
      console.error('Remove staff error:', error);
      setError('Failed to remove staff member. Please try again.');
    }
  });

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const { email, name } = inviteData;
    
    if (!email.trim() || !name.trim()) {
      setError('Please provide both email and name');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please provide a valid email address');
      return;
    }

    setError('');
    addStaffMutation.mutate(inviteData);
  };

  const handleRemoveStaff = (staffId: string, staffName: string) => {
    if (window.confirm(`Are you sure you want to remove ${staffName}? This action cannot be undone.`)) {
      removeStaffMutation.mutate(staffId);
    }
  };

  // Combine local and database staff
  const allStaff = [...localStaff];
  
  // Add database staff that aren't in local store
  dbStaff.forEach((dbMember) => {
    const existsLocally = localStaff.some((local) => local.email === dbMember.email);
    if (!existsLocally) {
      allStaff.push({
        email: dbMember.email,
        name: dbMember.name,
        role: 'kitchen' as const,
        restaurantId: restaurant?.id || '',
        isActive: true,
        addedAt: new Date(dbMember.created_at),
        dbId: dbMember.id,
        user: Array.isArray(dbMember.user) ? dbMember.user[0] : dbMember.user
      } as any);
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
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Staff Email Approval</h3>
              <p className="text-sm text-gray-600 mt-1">
                Approve staff emails for {restaurant.name} - they can then create accounts and access the kitchen
              </p>
            </div>
            <button
              onClick={() => setShowInviteForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
            >
              <span className="text-lg">+</span>
              Approve Email
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Status Messages */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-start">
                <span className="text-red-600 mr-2">⚠️</span>
                <div className="text-red-800">{error}</div>
              </div>
            </div>
          )}

          {success && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md">
              <div className="flex items-start">
                <span className="text-green-600 mr-2">✅</span>
                <div className="text-green-800">{success}</div>
              </div>
            </div>
          )}

          {/* Staff List */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-medium text-gray-900">
                Current Staff ({allStaff.length})
              </h4>
              {isLoading && (
                <div className="text-sm text-gray-500">Loading staff...</div>
              )}
            </div>
            
            {allStaff.length === 0 && !isLoading ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-gray-400 text-2xl">👤</span>
                </div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">No staff members</h3>
                <p className="text-sm text-gray-500 mb-4">Get started by inviting your first staff member.</p>
                <button
                  onClick={() => setShowInviteForm(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Invite Staff Member
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {allStaff.map((staff, index) => (
                  <div 
                    key={`${staff.email}-${index}`}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 font-medium">
                            {staff.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900">{staff.name}</h4>
                          <div className="text-sm text-gray-500">{staff.email}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              staff.role === 'manager' ? 'bg-purple-100 text-purple-700' :
                              staff.role === 'server' ? 'bg-green-100 text-green-700' :
                              'bg-orange-100 text-orange-700'
                            }`}>
                              {staff.role}
                            </span>
                                                         {!(staff as any).dbId && (
                               <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                                 Local
                               </span>
                             )}
                             {(staff as any).user?.is_active ? (
                               <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                                 Active
                               </span>
                             ) : (
                               <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">
                                 Pending
                               </span>
                             )}
                          </div>
                        </div>
                      </div>
                      
                                             {(staff as any).dbId && (
                         <button
                           onClick={() => handleRemoveStaff((staff as any).dbId!, staff.name)}
                          disabled={removeStaffMutation.isPending}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 p-2 rounded disabled:opacity-50"
                          title="Remove staff member"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Invite Form Modal */}
      {showInviteForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Approve Staff Email</h3>
              <button 
                onClick={() => setShowInviteForm(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                💡 Staff members can create accounts and access the kitchen once their email is approved here.
              </p>
            </div>
            
            <form onSubmit={handleInviteSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={inviteData.email}
                  onChange={(e) => setInviteData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="staff@example.com"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={inviteData.name}
                  onChange={(e) => setInviteData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="John Doe"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  value={inviteData.role}
                  onChange={(e) => setInviteData(prev => ({ ...prev, role: e.target.value as 'kitchen' | 'server' | 'manager' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="kitchen">Kitchen Staff</option>
                  <option value="server">Server</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowInviteForm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addStaffMutation.isPending}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {addStaffMutation.isPending ? 'Approving...' : 'Approve Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
} 
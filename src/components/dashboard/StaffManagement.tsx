import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { PlusIcon, UserIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline';
import type { StaffWithUser, StaffRole } from '../../types/database';

interface StaffManagementProps {
  restaurantId: string;
}

export function StaffManagement({ restaurantId }: StaffManagementProps) {
  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);

  useEffect(() => {
    fetchStaff();
  }, [restaurantId]);

  const fetchStaff = async () => {
    try {
      const { data, error } = await supabase
        .from('restaurant_staff')
        .select(`
          *,
          user:users(*)
        `)
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('role');

      if (error) throw error;
      
      // Handle staff with and without user accounts
      const staffList = data?.map(member => ({
        ...member,
        user: member.user || {
          id: '',
          email: member.email || '',
          first_name: member.email?.split('@')[0] || 'Invited',
          last_name: 'User',
          created_at: '',
          updated_at: '',
          is_active: false,
          email_verified: false,
          timezone: 'UTC'
        }
      })) || [];
      
      setStaff(staffList as StaffWithUser[]);
    } catch (error) {
      console.error('Error fetching staff:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveStaff = async (staffId: string) => {
    if (!confirm('Are you sure you want to remove this staff member?')) return;

    try {
      const { error } = await supabase
        .from('restaurant_staff')
        .update({ is_active: false })
        .eq('id', staffId);

      if (error) throw error;
      
      setStaff(staff.filter(s => s.id !== staffId));
    } catch (error) {
      console.error('Error removing staff:', error);
      alert('Failed to remove staff member');
    }
  };

  const getRoleColor = (role: StaffRole) => {
    switch (role) {
      case 'owner': return 'bg-purple-100 text-purple-800';
      case 'manager': return 'bg-blue-100 text-blue-800';
      case 'head_chef': return 'bg-red-100 text-red-800';
      case 'chef': return 'bg-orange-100 text-orange-800';
      case 'kitchen_staff': return 'bg-yellow-100 text-yellow-800';
      case 'server': return 'bg-green-100 text-green-800';
      case 'cashier': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatRole = (role: StaffRole) => {
    return role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Staff Management</h2>
        <button
          onClick={() => setShowInviteModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          Invite Staff
        </button>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Team Members ({staff.length})
          </h3>
        </div>
        
        <div className="divide-y divide-gray-200">
          {staff.map((member) => (
            <div key={member.id} className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex-shrink-0">
                  {member.user.avatar_url ? (
                    <img
                      className="h-10 w-10 rounded-full"
                      src={member.user.avatar_url}
                      alt={`${member.user.first_name} ${member.user.last_name}`}
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                      <UserIcon className="h-6 w-6 text-gray-600" />
                    </div>
                  )}
                </div>
                
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {member.user.first_name} {member.user.last_name}
                    {!member.user_id && (
                      <span className="ml-2 px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                        Invitation Pending
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    {member.user.email || member.email}
                  </div>
                  {!member.user_id && (
                    <div className="text-xs text-yellow-600 mt-1">
                      Invited {member.invited_at ? new Date(member.invited_at).toLocaleDateString() : 'recently'}
                    </div>
                  )}
                </div>
                
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getRoleColor(member.role)}`}>
                  {formatRole(member.role)}
                </span>
                
                {member.hourly_rate && (
                  <div className="text-sm text-gray-500">
                    ${member.hourly_rate}/hr
                  </div>
                )}
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {/* TODO: Edit staff modal */}}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <PencilIcon className="h-5 w-5" />
                </button>
                
                {member.role !== 'owner' && (
                  <button
                    onClick={() => handleRemoveStaff(member.id)}
                    className="text-red-400 hover:text-red-600"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
          ))}
          
          {staff.length === 0 && (
            <div className="px-6 py-8 text-center">
              <UserIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No staff members</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by inviting your first team member.
              </p>
              <div className="mt-6">
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto"
                >
                  <PlusIcon className="w-5 h-5" />
                  Invite Staff
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showInviteModal && (
        <StaffInviteModal
          restaurantId={restaurantId}
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => {
            setShowInviteModal(false);
            fetchStaff();
          }}
        />
      )}
    </div>
  );
}

interface StaffInviteModalProps {
  restaurantId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function StaffInviteModal({ restaurantId, onClose, onSuccess }: StaffInviteModalProps) {
  const [formData, setFormData] = useState({
    email: '',
    role: 'kitchen_staff' as StaffRole,
    hourlyRate: '',
    permissions: [] as string[]
  });
  const [loading, setLoading] = useState(false);

  const roles: { value: StaffRole; label: string; description: string }[] = [
    { value: 'manager', label: 'Manager', description: 'Full restaurant management access' },
    { value: 'head_chef', label: 'Head Chef', description: 'Kitchen management and menu control' },
    { value: 'chef', label: 'Chef', description: 'Order preparation and kitchen operations' },
    { value: 'kitchen_staff', label: 'Kitchen Staff', description: 'Basic kitchen operations' },
    { value: 'server', label: 'Server', description: 'Table service and customer interaction' },
    { value: 'cashier', label: 'Cashier', description: 'Point of sale and payment processing' }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Check if email is already invited to this restaurant
      const { data: existingStaff } = await supabase
        .from('restaurant_staff')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .eq('email', formData.email)
        .eq('is_active', true)
        .single();

      if (existingStaff) {
        alert('This email is already invited to your restaurant.');
        setLoading(false);
        return;
      }

      // Add staff invitation (without creating user account yet)
      const { error: staffError } = await supabase
        .from('restaurant_staff')
        .insert({
          restaurant_id: restaurantId,
          email: formData.email, // Store email for later linking
          role: formData.role,
          permissions: formData.permissions,
          hourly_rate: formData.hourlyRate ? parseFloat(formData.hourlyRate) : null,
          is_active: true,
          invited_at: new Date().toISOString()
        });

      if (staffError) throw staffError;

      alert(`✅ Staff invitation created! 

Send this info to ${formData.email}:

1. Go to the TableDirect sign-up page
2. Create an account with email: ${formData.email}
3. You'll automatically get ${formData.role} access to the restaurant

They can now sign up and will have immediate access!`);
      
      onSuccess();
    } catch (error) {
      console.error('Error inviting staff:', error);
      alert('Failed to invite staff member. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Invite Staff Member</h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="staff@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as StaffRole })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {roles.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {roles.find(r => r.value === formData.role)?.description}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hourly Rate (Optional)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.hourlyRate}
                onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="15.00"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send Invite'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
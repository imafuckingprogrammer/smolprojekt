import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { 
  fetchRestaurantStaff, 
  addStaffMember,
  removeStaffMember
} from '../../api/users';
import type { StaffWithUser, StaffRole } from '../../types/database';
import { 
  PlusIcon, 
  XMarkIcon, 
  UserIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

export function StaffManagement() {
  const { restaurant } = useAuth();
  const [staff, setStaff] = useState<StaffWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInviteForm, setShowInviteForm] = useState(false);

  const fetchStaff = async () => {
    if (!restaurant?.id) {
      setLoading(false);
      return;
    }
    
    try {
      setError(null);
      const staffData = await fetchRestaurantStaff(restaurant.id);
      setStaff(staffData);
    } catch (error) {
      console.error('Error fetching staff:', error);
      setError('Failed to load staff. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, [restaurant?.id]);

  const handleInviteStaff = async (email: string, role: StaffRole) => {
    if (!restaurant?.id) return;
    
    try {
      setError(null);
      await addStaffMember({
        restaurantId: restaurant.id,
        userEmail: email,
        role,
        permissions: [],
        hourlyRate: 15.00
      });
      
      setShowInviteForm(false);
      fetchStaff(); // Refresh the list
    } catch (error) {
      console.error('Error inviting staff:', error);
      setError('Failed to invite staff member. Please try again.');
    }
  };

  const handleRemoveStaff = async (staffId: string) => {
    if (!confirm('Are you sure you want to remove this staff member?')) return;
    
    try {
      setError(null);
      await removeStaffMember(staffId);
      fetchStaff(); // Refresh the list
    } catch (error) {
      console.error('Error removing staff:', error);
      setError('Failed to remove staff member. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Staff Management</h3>
            <p className="text-sm text-gray-600">Manage your restaurant staff and their roles</p>
          </div>
          <button
            onClick={() => setShowInviteForm(true)}
            className="btn-primary flex items-center"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Invite Staff
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border-l-4 border-red-400">
          <div className="flex">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="p-6">
        {staff.length === 0 ? (
          <div className="text-center py-12">
            <UserIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No staff members</h3>
            <p className="mt-1 text-sm text-gray-500">Get started by inviting your first staff member.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {staff.map((member) => (
              <div key={member.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="bg-blue-100 rounded-full p-2">
                      <UserIcon className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">
                        {member.user?.first_name && member.user?.last_name 
                          ? `${member.user.first_name} ${member.user.last_name}`
                          : member.user?.email || 'Unknown User'
                        }
                      </h4>
                      <p className="text-sm text-gray-500">{member.user?.email}</p>
                      <div className="flex items-center mt-1 space-x-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          member.role === 'manager' 
                            ? 'bg-purple-100 text-purple-800'
                            : member.role === 'chef'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {member.role}
                        </span>
                        {member.user?.is_active ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircleIcon className="h-3 w-3 mr-1" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            <ClockIcon className="h-3 w-3 mr-1" />
                            Invitation Pending
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveStaff(member.id)}
                    className="btn-secondary text-red-600 hover:bg-red-50"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
                
                {member.hourly_rate && (
                  <div className="mt-3 text-sm text-gray-600">
                    Hourly Rate: ${member.hourly_rate.toFixed(2)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Invite Form Modal */}
        {showInviteForm && (
          <InviteStaffForm
            onInvite={handleInviteStaff}
            onCancel={() => setShowInviteForm(false)}
          />
        )}
      </div>
    </div>
  );
}

interface InviteStaffFormProps {
  onInvite: (email: string, role: StaffRole) => void;
  onCancel: () => void;
}

function InviteStaffForm({ onInvite, onCancel }: InviteStaffFormProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('server');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    
    setLoading(true);
    try {
      await onInvite(email.trim(), role);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Invite Staff Member</h3>
          
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field w-full"
                  placeholder="staff@example.com"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as StaffRole)}
                  className="input-field w-full"
                >
                  <option value="server">Server</option>
                  <option value="chef">Chef</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                type="button"
                onClick={onCancel}
                className="btn-secondary"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={loading || !email.trim()}
              >
                {loading ? 'Inviting...' : 'Send Invitation'}
              </button>
            </div>
          </form>
          
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <h4 className="text-sm font-medium text-blue-900 mb-2">How it works:</h4>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• We'll create a placeholder account for this email</li>
              <li>• When they sign up with this email, they'll automatically be linked</li>
              <li>• They'll have access to your restaurant dashboard and kitchen</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
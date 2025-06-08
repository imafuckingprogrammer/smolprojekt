import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';

export interface StaffMember {
  id: string;
  email: string;
  name: string;
  role: 'kitchen' | 'server' | 'manager' | 'chef' | 'kitchen_staff';
  restaurantId: string;
  isActive: boolean;
  addedAt: Date;
  userId?: string;
}

export interface StaffInvitation {
  id: string;
  restaurant_id: string;
  email: string;
  role: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  token: string;
  expires_at: string;
  created_at: string;
}

interface StaffStore {
  staffMembers: StaffMember[];
  staffInvitations: StaffInvitation[];
  loading: boolean;
  error: string | null;
  
  // Staff management
  loadStaff: (restaurantId: string) => Promise<void>;
  addStaff: (staff: Omit<StaffMember, 'addedAt' | 'isActive' | 'id'>) => void;
  removeStaff: (email: string, restaurantId: string) => void;
  getStaffByEmail: (email: string, restaurantId: string) => StaffMember | null;
  isStaffMember: (email: string, restaurantId: string) => boolean;
  getRestaurantStaff: (restaurantId: string) => StaffMember[];
  
  // Invitation management
  inviteStaff: (restaurantId: string, email: string, role: string) => Promise<boolean>;
  loadInvitations: (restaurantId: string) => Promise<void>;
  acceptInvitation: (token: string, userEmail: string) => Promise<boolean>;
  checkStaffAccess: (userEmail: string, restaurantId: string) => Promise<StaffMember | null>;
  
  // Utilities
  clearStaff: () => void;
  clearError: () => void;
}

export const useStaffStore = create<StaffStore>()(
  persist(
    (set, get) => ({
      staffMembers: [],
      staffInvitations: [],
      loading: false,
      error: null,
      
      // Load staff from database
      loadStaff: async (restaurantId: string) => {
        set({ loading: true, error: null });
        
        try {
          const { data, error } = await supabase
            .from('restaurant_staff')
            .select(`
              id,
              role,
              is_active,
              created_at,
              users!inner(
                id,
                email,
                first_name,
                last_name
              )
            `)
            .eq('restaurant_id', restaurantId)
            .eq('is_active', true);

          if (error) throw error;

          const staffMembers: StaffMember[] = (data || []).map((staff: any) => ({
            id: staff.id,
            email: staff.users.email,
            name: `${staff.users.first_name || ''} ${staff.users.last_name || ''}`.trim() || staff.users.email,
            role: staff.role,
            restaurantId: restaurantId,
            isActive: staff.is_active,
            addedAt: new Date(staff.created_at),
            userId: staff.users.id
          }));

          set({ staffMembers, loading: false });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to load staff';
          set({ error: errorMessage, loading: false });
          console.error('Error loading staff:', err);
        }
      },

      // Create staff invitation
      inviteStaff: async (restaurantId: string, email: string, role: string): Promise<boolean> => {
        set({ loading: true, error: null });
        
        try {
          const { data, error } = await supabase.rpc('create_staff_invitation', {
            restaurant_id_param: restaurantId,
            email_param: email,
            role_param: role
          });

          if (error) throw error;

          if (data.success) {
            console.log('✅ Staff invitation created:', data);
            await get().loadInvitations(restaurantId);
            set({ loading: false });
            return true;
          } else {
            set({ error: data.error, loading: false });
            return false;
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to invite staff';
          set({ error: errorMessage, loading: false });
          console.error('Error inviting staff:', err);
          return false;
        }
      },

      // Load invitations
      loadInvitations: async (restaurantId: string) => {
        try {
          const { data, error } = await supabase
            .from('staff_invitations')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .order('created_at', { ascending: false });

          if (error) throw error;

          set({ staffInvitations: data || [] });
        } catch (err) {
          console.error('Error loading invitations:', err);
        }
      },

      // Accept invitation
      acceptInvitation: async (token: string, userEmail: string): Promise<boolean> => {
        set({ loading: true, error: null });
        
        try {
          const { data, error } = await supabase.rpc('accept_staff_invitation', {
            invitation_token: token,
            user_email: userEmail
          });

          if (error) throw error;

          if (data.success) {
            console.log('✅ Staff invitation accepted:', data);
            set({ loading: false });
            return true;
          } else {
            set({ error: data.error, loading: false });
            return false;
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to accept invitation';
          set({ error: errorMessage, loading: false });
          console.error('Error accepting invitation:', err);
          return false;
        }
      },

      // Check if user has staff access
      checkStaffAccess: async (userEmail: string, restaurantId: string): Promise<StaffMember | null> => {
        try {
          const { data, error } = await supabase.rpc('get_staff_info', {
            check_restaurant_id: restaurantId
          });

          if (error) throw error;

          if (data) {
            const staffMember: StaffMember = {
              id: data.id,
              email: data.email,
              name: data.name,
              role: data.role,
              restaurantId: restaurantId,
              isActive: true,
              addedAt: new Date(data.hire_date || new Date()),
              userId: data.user_id
            };

            // Update local store if staff member found
            set(state => {
              const existingIndex = state.staffMembers.findIndex(s => s.id === staffMember.id);
              const updatedStaff = [...state.staffMembers];
              
              if (existingIndex >= 0) {
                updatedStaff[existingIndex] = staffMember;
              } else {
                updatedStaff.push(staffMember);
              }
              
              return { staffMembers: updatedStaff };
            });

            return staffMember;
          }

          return null;
        } catch (err) {
          console.error('Error checking staff access:', err);
          return null;
        }
      },
      
      // Local store methods (for fallback/cache)
      addStaff: (staff) => set((state) => {
        const filtered = state.staffMembers.filter(
          (s) => !(s.email === staff.email && s.restaurantId === staff.restaurantId)
        );
        
        return {
          staffMembers: [
            ...filtered,
            {
              ...staff,
              id: `local_${Date.now()}`,
              isActive: true,
              addedAt: new Date()
            }
          ]
        };
      }),
      
      removeStaff: (email, restaurantId) => set((state) => ({
        staffMembers: state.staffMembers.map((s) =>
          s.email === email && s.restaurantId === restaurantId
            ? { ...s, isActive: false }
            : s
        )
      })),
      
      getStaffByEmail: (email, restaurantId) => {
        const { staffMembers } = get();
        return staffMembers.find((s) => 
          s.email === email && 
          s.restaurantId === restaurantId && 
          s.isActive
        ) || null;
      },
      
      isStaffMember: (email, restaurantId) => {
        return get().getStaffByEmail(email, restaurantId) !== null;
      },
      
      getRestaurantStaff: (restaurantId) => {
        const { staffMembers } = get();
        return staffMembers.filter((s) => 
          s.restaurantId === restaurantId && s.isActive
        );
      },
      
      clearStaff: () => set({ staffMembers: [], staffInvitations: [] }),
      clearError: () => set({ error: null })
    }),
    {
      name: 'tabledirect-staff-store',
      version: 2
    }
  )
); 
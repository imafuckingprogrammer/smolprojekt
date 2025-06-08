import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface StaffMember {
  email: string;
  name: string;
  role: 'kitchen' | 'server' | 'manager';
  restaurantId: string;
  isActive: boolean;
  addedAt: Date;
}

interface StaffStore {
  staffMembers: StaffMember[];
  addStaff: (staff: Omit<StaffMember, 'addedAt' | 'isActive'>) => void;
  removeStaff: (email: string, restaurantId: string) => void;
  getStaffByEmail: (email: string, restaurantId: string) => StaffMember | null;
  isStaffMember: (email: string, restaurantId: string) => boolean;
  getRestaurantStaff: (restaurantId: string) => StaffMember[];
  clearStaff: () => void;
}

export const useStaffStore = create<StaffStore>()(
  persist(
    (set, get) => ({
      staffMembers: [],
      
      addStaff: (staff) => set((state) => {
        // Remove existing staff member with same email and restaurant
        const filtered = state.staffMembers.filter(
          (s) => !(s.email === staff.email && s.restaurantId === staff.restaurantId)
        );
        
        return {
          staffMembers: [
            ...filtered,
            {
              ...staff,
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
      
      clearStaff: () => set({ staffMembers: [] })
    }),
    {
      name: 'tabledirect-staff-store',
      version: 1
    }
  )
); 
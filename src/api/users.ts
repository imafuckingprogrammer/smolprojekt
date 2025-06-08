import { supabase } from '../lib/supabase';
import type { User, RestaurantStaff, WorkSession, StaffWithUser, WorkSessionWithStaff, StaffRole } from '../types/database';

/**
 * User Management API
 */

/**
 * Fetch user by ID
 */
export async function fetchUser(userId: string): Promise<User> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching user:', error);
    throw error;
  }
}

/**
 * Update user profile
 */
export async function updateUser(userId: string, updates: Partial<User>): Promise<User> {
  try {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
}

/**
 * Restaurant Staff Management
 */

/**
 * Fetch staff for a restaurant
 */
export async function fetchRestaurantStaff(restaurantId: string): Promise<StaffWithUser[]> {
  try {
    const { data, error } = await supabase
      .from('restaurant_staff')
      .select(`
        *,
        user:users(*)
      `)
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .order('role', { ascending: true });

    if (error) throw error;
    return data as StaffWithUser[];
  } catch (error) {
    console.error('Error fetching restaurant staff:', error);
    throw error;
  }
}

/**
 * Add staff member to restaurant
 */
export async function addStaffMember(variables: {
  restaurantId: string;
  userEmail: string;
  role: StaffRole;
  permissions?: string[];
  hourlyRate?: number;
}): Promise<StaffWithUser> {
  try {
    // First, find or create user by email
    let user: User;
    const { data: existingUser, error: userLookupError } = await supabase
      .from('users')
      .select('*')
      .eq('email', variables.userEmail)
      .single();

    if (userLookupError && userLookupError.code !== 'PGRST116') {
      throw userLookupError;
    }

    if (existingUser) {
      user = existingUser;
    } else {
      // Create new user (they'll need to set password later)
      const { data: newUser, error: createUserError } = await supabase
        .from('users')
        .insert({
          email: variables.userEmail,
          first_name: variables.userEmail.split('@')[0], // Temporary
          last_name: 'User', // Temporary
          is_active: true,
          email_verified: false,
          timezone: 'UTC'
        })
        .select()
        .single();

      if (createUserError) throw createUserError;
      user = newUser;
    }

    // Add staff relationship
    const { data: staff, error: staffError } = await supabase
      .from('restaurant_staff')
      .insert({
        restaurant_id: variables.restaurantId,
        user_id: user.id,
        role: variables.role,
        permissions: variables.permissions || [],
        hourly_rate: variables.hourlyRate,
        is_active: true
      })
      .select()
      .single();

    if (staffError) throw staffError;

    return {
      ...staff,
      user
    } as StaffWithUser;
  } catch (error) {
    console.error('Error adding staff member:', error);
    throw error;
  }
}

/**
 * Update staff member
 */
export async function updateStaffMember(variables: {
  staffId: string;
  updates: Partial<RestaurantStaff>;
}): Promise<RestaurantStaff> {
  try {
    const { data, error } = await supabase
      .from('restaurant_staff')
      .update(variables.updates)
      .eq('id', variables.staffId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating staff member:', error);
    throw error;
  }
}

/**
 * Remove staff member (deactivate)
 */
export async function removeStaffMember(staffId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('restaurant_staff')
      .update({ is_active: false })
      .eq('id', staffId);

    if (error) throw error;
  } catch (error) {
    console.error('Error removing staff member:', error);
    throw error;
  }
}

/**
 * Work Session Management
 */

/**
 * Start work session
 */
export async function startWorkSession(variables: {
  staffId: string;
  stationAssignment?: string;
  deviceInfo?: Record<string, any>;
}): Promise<WorkSession> {
  try {
    // Generate unique session token
    const sessionToken = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const { data, error } = await supabase
      .from('work_sessions')
      .insert({
        staff_id: variables.staffId,
        session_token: sessionToken,
        device_info: variables.deviceInfo || {},
        station_assignment: variables.stationAssignment,
        status: 'active'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error starting work session:', error);
    throw error;
  }
}

/**
 * Update session heartbeat
 */
export async function updateSessionHeartbeat(sessionId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('work_sessions')
      .update({ 
        last_heartbeat: new Date().toISOString(),
        status: 'active'
      })
      .eq('id', sessionId);

    if (error) throw error;
  } catch (error) {
    console.error('Error updating session heartbeat:', error);
    throw error;
  }
}

/**
 * End work session
 */
export async function endWorkSession(sessionId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('work_sessions')
      .update({ 
        ended_at: new Date().toISOString(),
        status: 'offline'
      })
      .eq('id', sessionId);

    if (error) throw error;
  } catch (error) {
    console.error('Error ending work session:', error);
    throw error;
  }
}

/**
 * Fetch active work sessions for restaurant
 */
export async function fetchActiveWorkSessions(restaurantId: string): Promise<WorkSessionWithStaff[]> {
  try {
    const { data, error } = await supabase
      .from('work_sessions')
      .select(`
        *,
        staff:restaurant_staff!inner(
          *,
          user:users(*)
        )
      `)
      .eq('staff.restaurant_id', restaurantId)
      .is('ended_at', null)
      .gte('last_heartbeat', new Date(Date.now() - 5 * 60 * 1000).toISOString()) // Active in last 5 minutes
      .order('started_at', { ascending: false });

    if (error) throw error;
    return data as WorkSessionWithStaff[];
  } catch (error) {
    console.error('Error fetching active work sessions:', error);
    throw error;
  }
}

/**
 * Cleanup old sessions (call this periodically)
 */
export async function cleanupOldSessions(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('cleanup_old_sessions');

    if (error) throw error;
    return data || 0;
  } catch (error) {
    console.error('Error cleaning up old sessions:', error);
    throw error;
  }
}

/**
 * Get staff member by user ID and restaurant
 */
export async function getStaffByUser(userId: string, restaurantId: string): Promise<StaffWithUser | null> {
  try {
    const { data, error } = await supabase
      .from('restaurant_staff')
      .select(`
        *,
        user:users(*)
      `)
      .eq('user_id', userId)
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data as StaffWithUser || null;
  } catch (error) {
    console.error('Error fetching staff by user:', error);
    throw error;
  }
} 
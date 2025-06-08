import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export interface KitchenSession {
  id: string;
  restaurantId: string;
  userName: string;
  email?: string;
  deviceId: string;
  status: 'active' | 'busy' | 'break' | 'offline';
  stationId?: string;
  claimedOrderIds: string[];
  lastActivity: Date;
  createdAt: Date;
}

interface SessionStore {
  currentSession: KitchenSession | null;
  activeSessions: KitchenSession[];
  loading: boolean;
  error: string | null;
  
  // Session management
  createSession: (params: {
    restaurantId: string;
    userName: string;
    email?: string;
    stationId?: string;
  }) => Promise<string | null>;
  
  updateSessionStatus: (status: KitchenSession['status']) => Promise<void>;
  endSession: () => Promise<void>;
  heartbeat: () => Promise<void>;
  
  // Order claiming
  claimOrder: (orderId: string) => Promise<boolean>;
  releaseOrder: (orderId: string) => Promise<boolean>;
  releaseAllOrders: () => Promise<void>;
  
  // Session queries
  fetchActiveSessions: (restaurantId: string) => Promise<void>;
  getActiveSessionsForRestaurant: (restaurantId: string) => KitchenSession[];
  canUserClaimOrders: () => boolean;
  
  // Cleanup
  clearError: () => void;
}

// Heartbeat management
let heartbeatInterval: NodeJS.Timeout | null = null;

const startHeartbeat = (heartbeatFn: () => Promise<void>) => {
  if (heartbeatInterval) return; // Already running
  
  heartbeatInterval = setInterval(() => {
    heartbeatFn();
  }, 30000); // Every 30 seconds
};

const stopHeartbeat = () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
};

export const useSessionStore = create<SessionStore>((set, get) => ({
  currentSession: null,
  activeSessions: [],
  loading: false,
  error: null,

  createSession: async (params) => {
    set({ loading: true, error: null });
    
    try {
      // Generate unique session
      const deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Try to create session in database
      const { data: dbSession, error: dbError } = await supabase
        .from('active_sessions')
        .insert({
          id: sessionId,
          restaurant_id: params.restaurantId,
          user_name: params.userName,
          session_token: sessionId,
          status: 'active',
          station_id: params.stationId,
          last_seen: new Date().toISOString()
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // Create local session
      const newSession: KitchenSession = {
        id: sessionId,
        restaurantId: params.restaurantId,
        userName: params.userName,
        email: params.email,
        deviceId,
        status: 'active',
        stationId: params.stationId,
        claimedOrderIds: [],
        lastActivity: new Date(),
        createdAt: new Date()
      };

      set({ 
        currentSession: newSession,
        loading: false
      });

      // Start heartbeat
      startHeartbeat(get().heartbeat);
      
      console.log('✅ Created kitchen session:', sessionId);
      return sessionId;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create session';
      set({ error: errorMessage, loading: false });
      console.error('❌ Failed to create session:', error);
      return null;
    }
  },

  updateSessionStatus: async (status) => {
    const { currentSession } = get();
    if (!currentSession) return;

    try {
      // Update in database
      const { error } = await supabase
        .from('active_sessions')
        .update({ 
          status,
          last_seen: new Date().toISOString()
        })
        .eq('id', currentSession.id);

      if (error) throw error;

      // Update local state
      set((state) => ({
        currentSession: state.currentSession 
          ? { ...state.currentSession, status, lastActivity: new Date() }
          : null
      }));

    } catch (error) {
      console.error('❌ Failed to update session status:', error);
    }
  },

  endSession: async () => {
    const { currentSession } = get();
    if (!currentSession) return;

    set({ loading: true });

    try {
      // Release all claimed orders first
      await get().releaseAllOrders();
      
      // Remove from database
      const { error } = await supabase
        .from('active_sessions')
        .delete()
        .eq('id', currentSession.id);

      if (error) throw error;

      // Clear local state
      set({ 
        currentSession: null,
        loading: false
      });

      stopHeartbeat();
      console.log('✅ Session ended successfully');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to end session';
      set({ error: errorMessage, loading: false });
      console.error('❌ Failed to end session:', error);
    }
  },

  heartbeat: async () => {
    const { currentSession } = get();
    if (!currentSession) return;

    try {
      const { error } = await supabase
        .from('active_sessions')
        .update({ 
          last_seen: new Date().toISOString()
        })
        .eq('id', currentSession.id);

      if (error) throw error;

      // Update local activity
      set((state) => ({
        currentSession: state.currentSession 
          ? { ...state.currentSession, lastActivity: new Date() }
          : null
      }));

    } catch (error) {
      console.error('❌ Heartbeat failed:', error);
    }
  },

  claimOrder: async (orderId) => {
    const { currentSession } = get();
    if (!currentSession) return false;

    try {
      // Use atomic claim function
      const { data: success, error } = await supabase.rpc('claim_order', {
        order_uuid: orderId,
        session_uuid: currentSession.id
      });

      if (error) throw error;

      if (success) {
        // Update local state
        set((state) => ({
          currentSession: state.currentSession 
            ? { 
                ...state.currentSession, 
                claimedOrderIds: [...state.currentSession.claimedOrderIds, orderId],
                status: 'busy'
              }
            : null
        }));

        // Update session status in database
        await get().updateSessionStatus('busy');
        console.log('✅ Successfully claimed order:', orderId);
        return true;
      }

      return false;

    } catch (error) {
      console.error('❌ Failed to claim order:', error);
      return false;
    }
  },

  releaseOrder: async (orderId) => {
    const { currentSession } = get();
    if (!currentSession) return false;

    try {
      // Use atomic release function
      const { data: success, error } = await supabase.rpc('release_order', {
        order_uuid: orderId,
        session_uuid: currentSession.id
      });

      if (error) throw error;

      if (success) {
        // Update local state
        set((state) => ({
          currentSession: state.currentSession 
            ? { 
                ...state.currentSession, 
                claimedOrderIds: state.currentSession.claimedOrderIds.filter(id => id !== orderId)
              }
            : null
        }));

        // Update session status if no more orders
        const updatedSession = get().currentSession;
        if (updatedSession && updatedSession.claimedOrderIds.length === 0) {
          await get().updateSessionStatus('active');
        }

        console.log('✅ Successfully released order:', orderId);
        return true;
      }

      return false;

    } catch (error) {
      console.error('❌ Failed to release order:', error);
      return false;
    }
  },

  releaseAllOrders: async () => {
    const { currentSession } = get();
    if (!currentSession || currentSession.claimedOrderIds.length === 0) return;

    const releasePromises = currentSession.claimedOrderIds.map(orderId => 
      get().releaseOrder(orderId)
    );

    await Promise.all(releasePromises);
  },

  fetchActiveSessions: async (restaurantId) => {
    try {
      const { data, error } = await supabase
        .from('active_sessions')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .gte('last_seen', new Date(Date.now() - 5 * 60 * 1000).toISOString()) // Active in last 5 minutes
        .order('created_at', { ascending: false });

      if (error) throw error;

      const sessions: KitchenSession[] = data.map(session => ({
        id: session.id,
        restaurantId: session.restaurant_id,
        userName: session.user_name,
        deviceId: session.session_token, // Using session_token as deviceId for now
        status: session.status,
        stationId: session.station_id,
        claimedOrderIds: [], // Will be populated by order data
        lastActivity: new Date(session.last_seen),
        createdAt: new Date(session.created_at)
      }));

      set({ activeSessions: sessions });

    } catch (error) {
      console.error('❌ Failed to fetch active sessions:', error);
    }
  },

  getActiveSessionsForRestaurant: (restaurantId) => {
    const { activeSessions } = get();
    return activeSessions.filter(session => session.restaurantId === restaurantId);
  },

  canUserClaimOrders: () => {
    const { currentSession } = get();
    return currentSession?.status === 'active' || currentSession?.status === 'busy';
  },

  clearError: () => set({ error: null })
})); 
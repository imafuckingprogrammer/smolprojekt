import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export interface KitchenStation {
  id: string;
  station_name: string;
  station_type: 'hot_food' | 'cold_food' | 'drinks' | 'desserts' | 'all';
  is_active: boolean;
  position_order: number;
}

export interface ActiveSession {
  id: string;
  user_name: string;
  station_id: string | null;
  status: 'active' | 'busy' | 'break' | 'offline';
  last_seen: string;
}

export interface OrderAssignment {
  order_id: string;
  assigned_to: string | null;
  station_id: string | null;
  estimated_completion: string | null;
}

interface MultiUserRealtimeState {
  stations: KitchenStation[];
  activeSessions: ActiveSession[];
  orderAssignments: Map<string, OrderAssignment>;
  currentStation: KitchenStation | null;
  isConnected: boolean;
  presenceUpdateInterval: NodeJS.Timeout | null;
}

export function useMultiUserRealtime(selectedStationId?: string) {
  const { restaurant, user } = useAuth();
  const sessionTokenRef = useRef<string | null>(null);
  
  const [state, setState] = useState<MultiUserRealtimeState>({
    stations: [],
    activeSessions: [],
    orderAssignments: new Map(),
    currentStation: null,
    isConnected: false,
    presenceUpdateInterval: null
  });

  // Generate unique session token
  const generateSessionToken = useCallback(() => {
    return `${user?.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, [user?.id]);

  // Initialize stations and session
  useEffect(() => {
    if (!restaurant || !user) return;

    initializeMultiUserSystem();
    
    return () => {
      cleanup();
    };
  }, [restaurant, user]);

  const initializeMultiUserSystem = async () => {
    try {
      // Load kitchen stations
      const { data: stations, error: stationsError } = await supabase
        .from('kitchen_stations')
        .select('*')
        .eq('restaurant_id', restaurant!.id)
        .eq('is_active', true)
        .order('position_order');

      console.log('Loading stations:', { stations, stationsError });

      if (stations && stations.length > 0) {
        setState(prev => ({ ...prev, stations }));
        
        // Set current station if specified
        if (selectedStationId) {
          const station = stations.find(s => s.id === selectedStationId);
          if (station) {
            setState(prev => ({ ...prev, currentStation: station }));
            await joinStation(station.id);
          }
        }
      } else {
        // Create default stations if none exist
        await createDefaultStations();
      }

      // Setup real-time subscriptions
      setupRealtimeSubscriptions();
      setupPresenceSystem();
      
    } catch (error) {
      console.error('Failed to initialize multi-user system:', error);
    }
  };

  const createDefaultStations = async () => {
    if (!restaurant) return;

    try {
      const defaultStations = [
        {
          restaurant_id: restaurant.id,
          station_name: 'Main Kitchen',
          station_type: 'all',
          position_order: 1
        },
        {
          restaurant_id: restaurant.id,
          station_name: 'Hot Food Station', 
          station_type: 'hot_food',
          position_order: 2
        },
        {
          restaurant_id: restaurant.id,
          station_name: 'Cold Food & Salads',
          station_type: 'cold_food', 
          position_order: 3
        },
        {
          restaurant_id: restaurant.id,
          station_name: 'Drinks & Beverages',
          station_type: 'drinks',
          position_order: 4
        }
      ];

      const { data, error } = await supabase
        .from('kitchen_stations')
        .insert(defaultStations)
        .select();

      if (error) {
        console.error('Error creating default stations:', error);
      } else {
        console.log('Created default stations:', data);
        setState(prev => ({ ...prev, stations: data || [] }));
      }
    } catch (error) {
      console.error('Error in createDefaultStations:', error);
    }
  };

  const setupRealtimeSubscriptions = () => {
    if (!restaurant) return;

    // For now, use basic real-time subscription for orders
    // Will enhance with station-specific channels once tables exist
    const channel = supabase
      .channel(`restaurant_${restaurant.id}_realtime`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurant.id}`
        },
        (payload) => {
          console.log('Order update received:', payload);
          handleOrderUpdate(payload);
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
        setState(prev => ({ ...prev, isConnected: status === 'SUBSCRIBED' }));
      });
  };

  const setupPresenceSystem = () => {
    // Update presence every 30 seconds
    const interval = setInterval(async () => {
      if (sessionTokenRef.current) {
        await updatePresence();
      }
    }, 30000);

    setState(prev => ({ ...prev, presenceUpdateInterval: interval }));
  };

  const joinStation = async (stationId: string) => {
    if (!user || !restaurant) return;

    try {
      sessionTokenRef.current = generateSessionToken();
      
      const { error } = await supabase
        .from('active_sessions')
        .insert({
          user_id: user.id,
          restaurant_id: restaurant.id,
          station_id: stationId,
          session_token: sessionTokenRef.current,
          user_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Kitchen Staff',
          status: 'active'
        });

      if (error) throw error;
      console.log(`Joined station: ${stationId}`);
      
    } catch (error) {
      console.error('Failed to join station:', error);
    }
  };

  const leaveStation = async () => {
    if (!sessionTokenRef.current) return;

    try {
      await supabase
        .from('active_sessions')
        .delete()
        .eq('session_token', sessionTokenRef.current);
        
      sessionTokenRef.current = null;
      setState(prev => ({ ...prev, currentStation: null }));
      
    } catch (error) {
      console.error('Failed to leave station:', error);
    }
  };

  const updatePresence = async () => {
    if (!sessionTokenRef.current) return;

    try {
      await supabase
        .from('active_sessions')
        .update({ last_seen: new Date().toISOString() })
        .eq('session_token', sessionTokenRef.current);
    } catch (error) {
      console.error('Failed to update presence:', error);
    }
  };

  const claimOrder = async (orderId: string, stationId: string) => {
    // Simplified for now - just update order status
    try {
      await supabase
        .from('orders')
        .update({ 
          status: 'preparing',
          assigned_chef: user?.email || 'kitchen_staff'
        })
        .eq('id', orderId);

      return true;
      
    } catch (error) {
      console.error('Failed to claim order:', error);
      return false;
    }
  };

  const releaseOrder = async (orderId: string) => {
    try {
      await supabase
        .from('orders')
        .update({ 
          status: 'pending',
          assigned_chef: null
        })
        .eq('id', orderId);
        
    } catch (error) {
      console.error('Failed to release order:', error);
    }
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    try {
      await supabase
        .from('orders')
        .update({ status })
        .eq('id', orderId);

      // If marking as served/cancelled, release assignment
      if (['served', 'cancelled'].includes(status)) {
        await supabase
          .from('order_assignments')
          .update({ is_active: false })
          .eq('order_id', orderId);
      }
      
    } catch (error) {
      console.error('Failed to update order status:', error);
    }
  };

  const setPriority = async (orderId: string, priority: number) => {
    try {
      await supabase
        .from('orders')
        .update({ priority: Math.max(1, Math.min(10, priority)) })
        .eq('id', orderId);
    } catch (error) {
      console.error('Failed to set priority:', error);
    }
  };

  const handleOrderUpdate = (payload: any) => {
    // Real-time order updates handled by existing order hooks
    console.log('Order update received:', payload);
  };

  const handleSessionUpdate = async (payload: any) => {
    // Refresh active sessions
    if (!restaurant) return;
    
    const { data: sessions } = await supabase
      .from('active_sessions')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('status', 'active')
      .gte('last_seen', new Date(Date.now() - 5 * 60 * 1000).toISOString()); // Active in last 5 minutes

    if (sessions) {
      setState(prev => ({ ...prev, activeSessions: sessions }));
    }
  };

  const handleAssignmentUpdate = async (payload: any) => {
    // Refresh order assignments
    if (!restaurant) return;
    
    const { data: assignments } = await supabase
      .from('order_assignments')
      .select('*')
      .eq('is_active', true);

    if (assignments) {
      const assignmentMap = new Map();
      assignments.forEach(assignment => {
        assignmentMap.set(assignment.order_id, assignment);
      });
      setState(prev => ({ ...prev, orderAssignments: assignmentMap }));
    }
  };

  const cleanup = async () => {
    if (state.presenceUpdateInterval) {
      clearInterval(state.presenceUpdateInterval);
    }
    
    await leaveStation();
    
    // Remove all subscriptions
    const channels = supabase.getChannels();
    channels.forEach(channel => {
      supabase.removeChannel(channel);
    });
  };

  return {
    ...state,
    joinStation,
    leaveStation,
    claimOrder,
    releaseOrder,
    updateOrderStatus,
    setPriority,
    isAssignedToMe: (orderId: string) => {
      // Will be implemented when order data is available
      return false;
    },
    getAssignedUser: (orderId: string) => {
      // Will be implemented when order data is available
      return null;
    }
  };
} 
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { realTimeManager } from '../lib/realTimeManager';
import type { OrderWithItems } from '../types/database';

export function useOrdersRealTime() {
  const { restaurant } = useAuth();
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Stable fetchOrders function - only depends on restaurant.id (not entire restaurant object)
  const fetchOrders = useCallback(async () => {
    if (!restaurant?.id) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items!inner(
            *,
            menu_item:menu_items(*)
          ),
          restaurant_table:restaurant_tables(*),
          claimed_session:active_sessions(user_name)
        `)
        .eq('restaurant_id', restaurant.id)
        .in('status', ['pending', 'preparing', 'ready'])
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      setOrders(data || []);
      setLastUpdate(new Date());
      console.log('✅ Orders fetched successfully:', data?.length || 0);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch orders';
      setError(errorMessage);
      console.error('❌ Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  }, [restaurant?.id]); // Only depend on restaurant.id, not entire object

  // Initial load - stable dependency
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Real-time subscription using singleton manager
  useEffect(() => {
    if (!restaurant?.id) return;

    console.log('🔥 Setting up real-time orders subscription for restaurant:', restaurant.id);

    // Single callback that handles all real-time changes
    const handleRealTimeChange = (payload: any) => {
      console.log('🔥 Real-time change:', payload.eventType, payload.table);
      fetchOrders(); // Refetch to get complete data with joins
    };

    // Subscribe through singleton manager
    const unsubscribeOrders = realTimeManager.subscribeToOrders(restaurant.id, handleRealTimeChange);
    const unsubscribeSessions = realTimeManager.subscribeToSessions(restaurant.id, handleRealTimeChange);

    return () => {
      console.log('🔥 Cleaning up orders subscription');
      unsubscribeOrders();
      unsubscribeSessions();
    };
  }, [restaurant?.id, fetchOrders]); // Both dependencies are stable

  // Session heartbeat with better error handling
  useEffect(() => {
    if (!currentSessionId) return;

    const heartbeat = async () => {
      try {
        const { error } = await supabase
          .from('active_sessions')
          .update({ 
            last_seen: new Date().toISOString(),
            status: 'active'
          })
          .eq('id', currentSessionId);
        
        if (error) {
          console.error('Heartbeat failed:', error);
          // If session doesn't exist anymore, clear it
          if (error.message.includes('No rows updated')) {
            setCurrentSessionId(null);
            setError('Session expired. Please rejoin the kitchen.');
          }
        }
      } catch (error) {
        console.error('Heartbeat failed:', error);
      }
    };

    // Initial heartbeat
    heartbeat();
    
    // Set up interval
    const heartbeatInterval = setInterval(heartbeat, 30000);

    return () => {
      clearInterval(heartbeatInterval);
    };
  }, [currentSessionId]);

  // Improved order claiming with better race condition handling
  const claimOrder = useCallback(async (orderId: string): Promise<boolean> => {
    if (!currentSessionId) {
      setError('No active session. Please join the kitchen first.');
      return false;
    }

    try {
      setError(null);
      console.log('🔥 Claiming order:', { orderId, sessionId: currentSessionId });
      
      // Use the stored procedure for atomic claiming
      const { data, error } = await supabase.rpc('claim_order', {
        order_uuid: orderId,
        session_uuid: currentSessionId
      });

      if (error) throw error;
      
      if (data) {
        console.log('✅ Order claimed successfully');
        // Fetch fresh data to update UI immediately
        await fetchOrders();
        return true;
      } else {
        setError('Order already claimed by someone else.');
        return false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to claim order';
      console.error('❌ Error claiming order:', err);
      setError(errorMessage);
      return false;
    }
  }, [currentSessionId, fetchOrders]);

  // Release order claim
  const releaseOrder = useCallback(async (orderId: string): Promise<boolean> => {
    if (!currentSessionId) {
      setError('No active session. Please join the kitchen first.');
      return false;
    }

    try {
      setError(null);
      console.log('🔥 Releasing order:', { orderId, sessionId: currentSessionId });
      
      const { data, error } = await supabase.rpc('release_order', {
        order_uuid: orderId,
        session_uuid: currentSessionId
      });

      if (error) throw error;
      
      if (data) {
        console.log('✅ Order released successfully');
        await fetchOrders();
        return true;
      } else {
        setError('Failed to release order. You may not be the claimant.');
        return false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to release order';
      console.error('❌ Error releasing order:', err);
      setError(errorMessage);
      return false;
    }
  }, [currentSessionId, fetchOrders]);

  // Update order status
  const updateOrderStatus = useCallback(async (orderId: string, status: string): Promise<boolean> => {
    if (!currentSessionId) {
      setError('No active session. Please join the kitchen first.');
      return false;
    }

    try {
      setError(null);
      console.log('🔥 Updating order status:', { orderId, status, sessionId: currentSessionId });
      
      const { data, error } = await supabase.rpc('update_order_status', {
        order_uuid: orderId,
        new_status: status,
        session_uuid: currentSessionId
      });

      if (error) throw error;
      
      if (data) {
        console.log('✅ Order status updated successfully');
        await fetchOrders();
        return true;
      } else {
        setError('Failed to update order status. You may not be authorized.');
        return false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update order status';
      console.error('❌ Error updating order status:', err);
      setError(errorMessage);
      return false;
    }
  }, [currentSessionId, fetchOrders]);

  // Kitchen session management
  const joinKitchen = useCallback(async (userName: string): Promise<boolean> => {
    if (!restaurant?.id) {
      setError('No restaurant context available.');
      return false;
    }

    try {
      setError(null);
      console.log('🔥 Joining kitchen:', { userName, restaurantId: restaurant.id });
      
      const { data, error } = await supabase.rpc('join_kitchen_session', {
        restaurant_uuid: restaurant.id,
        user_name: userName
      });

      if (error) throw error;
      
      if (data) {
        setCurrentSessionId(data);
        console.log('✅ Joined kitchen successfully, session ID:', data);
        return true;
      } else {
        setError('Failed to join kitchen session.');
        return false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to join kitchen';
      console.error('❌ Error joining kitchen:', err);
      setError(errorMessage);
      return false;
    }
  }, [restaurant?.id]);

  const leaveKitchen = useCallback(async (): Promise<boolean> => {
    if (!currentSessionId) return true;

    try {
      setError(null);
      console.log('🔥 Leaving kitchen:', { sessionId: currentSessionId });
      
      const { error } = await supabase.rpc('leave_kitchen_session', {
        session_uuid: currentSessionId
      });

      if (error) throw error;
      
      setCurrentSessionId(null);
      console.log('✅ Left kitchen successfully');
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to leave kitchen';
      console.error('❌ Error leaving kitchen:', err);
      setError(errorMessage);
      return false;
    }
  }, [currentSessionId]);

  return {
    orders,
    loading,
    error,
    lastUpdate,
    currentSessionId,
    claimOrder,
    releaseOrder,
    updateOrderStatus,
    joinKitchen,
    leaveKitchen,
    refetch: fetchOrders,
  };
} 
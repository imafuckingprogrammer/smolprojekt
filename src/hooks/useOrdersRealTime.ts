import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import type { OrderWithItems } from '../types/database';

export function useOrdersRealTime() {
  const { restaurant } = useAuth();
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Fixed fetchOrders with stable dependencies
  const fetchOrders = useCallback(async () => {
    if (!restaurant) return;

    try {
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
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  }, [restaurant]); // ONLY restaurant dependency

  // Initial load - FIXED: Only depends on restaurant, NOT fetchOrders
  useEffect(() => {
    fetchOrders();
  }, [restaurant]);

  // Real-time subscription - FIXED: Unique channel names, proper cleanup
  useEffect(() => {
    if (!restaurant) return;

    console.log('🔥 Setting up real-time orders subscription for restaurant:', restaurant.id);

    // Unique channel name with timestamp
    const channel = supabase
      .channel(`orders_realtime_${restaurant.id}_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurant.id}`
        },
        (payload) => {
          console.log('🔥 REAL-TIME Orders change:', payload);
          
          // Immediately refetch orders to get latest data
          fetchOrders();
          
          // Show notification for different events
          if (payload.eventType === 'INSERT') {
            console.log('🆕 New order received!', payload.new);
          } else if (payload.eventType === 'UPDATE') {
            console.log('📝 Order updated!', payload.new);
          }
        }
      )
      .subscribe((status) => {
        console.log('🔥 Real-time orders subscription status:', status);
      });

    return () => {
      console.log('🔥 Cleaning up orders subscription');
      supabase.removeChannel(channel);
    };
  }, [restaurant]); // ONLY restaurant dependency

  // Order claiming functions
  const claimOrder = useCallback(async (orderId: string): Promise<boolean> => {
    if (!currentSessionId) {
      setError('No active session. Please join the kitchen first.');
      return false;
    }

    try {
      console.log('🔥 Claiming order:', { orderId, sessionId: currentSessionId });
      
      const { data, error } = await supabase.rpc('claim_order', {
        order_uuid: orderId,
        session_uuid: currentSessionId
      });

      if (error) throw error;
      
      if (data) {
        console.log('✅ Order claimed successfully');
        return true;
      } else {
        setError('Failed to claim order. It may have been claimed by someone else.');
        return false;
      }
    } catch (err) {
      console.error('❌ Error claiming order:', err);
      setError(err instanceof Error ? err.message : 'Failed to claim order');
      return false;
    }
  }, [currentSessionId]);

  const releaseOrder = useCallback(async (orderId: string): Promise<boolean> => {
    if (!currentSessionId) {
      setError('No active session.');
      return false;
    }

    try {
      console.log('🔥 Releasing order:', { orderId, sessionId: currentSessionId });
      
      const { data, error } = await supabase.rpc('release_order', {
        order_uuid: orderId,
        session_uuid: currentSessionId
      });

      if (error) throw error;
      
      if (data) {
        console.log('✅ Order released successfully');
        return true;
      } else {
        setError('Failed to release order.');
        return false;
      }
    } catch (err) {
      console.error('❌ Error releasing order:', err);
      setError(err instanceof Error ? err.message : 'Failed to release order');
      return false;
    }
  }, [currentSessionId]);

  const updateOrderStatus = useCallback(async (orderId: string, status: string): Promise<boolean> => {
    try {
      console.log('🔥 Updating order status:', { orderId, status });
      
      const { error } = await supabase
        .from('orders')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (error) throw error;
      
      console.log('✅ Order status updated successfully');
      return true;
    } catch (err) {
      console.error('❌ Error updating order status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update order');
      return false;
    }
  }, []);

  // Session management
  const createSession = useCallback(async (userName: string): Promise<string | null> => {
    if (!restaurant) return null;

    try {
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const { error } = await supabase
        .from('active_sessions')
        .insert({
          id: sessionId,
          restaurant_id: restaurant.id,
          user_name: userName,
          session_token: sessionId,
          status: 'active'
        });

      if (error) throw error;
      
      setCurrentSessionId(sessionId);
      console.log('✅ Session created:', sessionId);
      return sessionId;
    } catch (err) {
      console.error('❌ Error creating session:', err);
      setError(err instanceof Error ? err.message : 'Failed to create session');
      return null;
    }
  }, [restaurant]);

  const endSession = useCallback(async (): Promise<void> => {
    if (!currentSessionId) return;

    try {
      const { error } = await supabase
        .from('active_sessions')
        .delete()
        .eq('id', currentSessionId);

      if (error) throw error;
      
      setCurrentSessionId(null);
      console.log('✅ Session ended');
    } catch (err) {
      console.error('❌ Error ending session:', err);
    }
  }, [currentSessionId]);

  return {
    orders,
    loading,
    error,
    lastUpdate,
    currentSessionId,
    updateOrderStatus,
    claimOrder,
    releaseOrder,
    createSession,
    endSession,
    refetch: fetchOrders
  };
} 
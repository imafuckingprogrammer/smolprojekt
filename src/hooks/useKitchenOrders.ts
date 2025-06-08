import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { OrderWithItems } from '../types/database';

export function useKitchenOrders(restaurantId: string | null) {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<any>(null);

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    if (!restaurantId) {
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
        .eq('restaurant_id', restaurantId)
        .in('status', ['pending', 'preparing', 'ready'])
        .order('created_at', { ascending: true }); // Oldest first

      if (error) throw error;

      setOrders(data || []);
      console.log('✅ Orders fetched:', data?.length || 0);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch orders';
      setError(errorMessage);
      console.error('❌ Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  // Claim order
  const claimOrder = useCallback(async (orderId: string, sessionId: string): Promise<boolean> => {
    try {
      setError(null);
      
      const { data, error } = await supabase.rpc('claim_order', {
        order_uuid: orderId,
        session_uuid: sessionId
      });

      if (error) throw error;
      
      if (data) {
        console.log('✅ Order claimed:', orderId);
        await fetchOrders(); // Refresh orders
        return true;
      } else {
        setError('Order already claimed by someone else');
        return false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to claim order';
      setError(errorMessage);
      console.error('❌ Error claiming order:', err);
      return false;
    }
  }, [fetchOrders]);

  // Release order
  const releaseOrder = useCallback(async (orderId: string, sessionId: string): Promise<boolean> => {
    try {
      setError(null);
      
      const { data, error } = await supabase.rpc('release_order', {
        order_uuid: orderId,
        session_uuid: sessionId
      });

      if (error) throw error;
      
      if (data) {
        console.log('✅ Order released:', orderId);
        await fetchOrders(); // Refresh orders
        return true;
      } else {
        setError('Failed to release order');
        return false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to release order';
      setError(errorMessage);
      console.error('❌ Error releasing order:', err);
      return false;
    }
  }, [fetchOrders]);

  // Update order status
  const updateOrderStatus = useCallback(async (orderId: string, newStatus: string): Promise<boolean> => {
    try {
      setError(null);
      
      const { error } = await supabase
        .from('orders')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (error) throw error;
      
      console.log('✅ Order status updated:', orderId, newStatus);
      await fetchOrders(); // Refresh orders
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update order status';
      setError(errorMessage);
      console.error('❌ Error updating order status:', err);
      return false;
    }
  }, [fetchOrders]);

  // Start preparing (claim + set to preparing)
  const startPreparing = useCallback(async (orderId: string, sessionId: string): Promise<boolean> => {
    const claimed = await claimOrder(orderId, sessionId);
    if (claimed) {
      return await updateOrderStatus(orderId, 'preparing');
    }
    return false;
  }, [claimOrder, updateOrderStatus]);

  // Mark ready
  const markReady = useCallback(async (orderId: string): Promise<boolean> => {
    return await updateOrderStatus(orderId, 'ready');
  }, [updateOrderStatus]);

  // Mark served
  const markServed = useCallback(async (orderId: string): Promise<boolean> => {
    return await updateOrderStatus(orderId, 'served');
  }, [updateOrderStatus]);

  // Initial load
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Real-time subscription
  useEffect(() => {
    if (!restaurantId) return;

    console.log('🔥 Setting up real-time orders subscription');

    // Clean up existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // Create new channel
    const channel = supabase
      .channel(`kitchen_orders_${restaurantId}_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`
        },
        (payload) => {
          console.log('🔥 Real-time order change:', payload.eventType);
          fetchOrders(); // Simple refresh - could be optimized
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'active_sessions',
          filter: `restaurant_id=eq.${restaurantId}`
        },
        (payload) => {
          console.log('🔥 Real-time session change:', payload.eventType);
          fetchOrders(); // Refresh to update claimed_session data
        }
      )
      .subscribe((status) => {
        console.log('🔥 Real-time subscription status:', status);
      });

    channelRef.current = channel;

    return () => {
      console.log('🔥 Cleaning up orders subscription');
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [restaurantId, fetchOrders]);

  // Group orders by status
  const groupedOrders = {
    pending: orders.filter(order => order.status === 'pending'),
    preparing: orders.filter(order => order.status === 'preparing'),
    ready: orders.filter(order => order.status === 'ready')
  };

  return {
    orders,
    groupedOrders,
    loading,
    error,
    fetchOrders,
    claimOrder,
    releaseOrder,
    updateOrderStatus,
    startPreparing,
    markReady,
    markServed
  };
} 
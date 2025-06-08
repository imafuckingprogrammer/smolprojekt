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

  // Claim order - Direct SQL implementation
  const claimOrder = useCallback(async (orderId: string, sessionId: string): Promise<boolean> => {
    try {
      setError(null);
      
      // Use atomic update with conditional where clause to prevent race conditions
      const { data, error } = await supabase
        .from('orders')
        .update({ 
          claimed_by: sessionId,
          claimed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .is('claimed_by', null) // Only update if not already claimed
        .select('id')
        .single();

      if (error) {
        console.error('Claim order error:', error);
        
        // Check if order is already claimed
        const { data: orderCheck } = await supabase
          .from('orders')
          .select('id, claimed_by, claimed_session:active_sessions(user_name)')
          .eq('id', orderId)
          .single();

        if (orderCheck?.claimed_by) {
          setError('Order already claimed by another staff member');
        } else {
          setError('Failed to claim order');
        }
        return false;
      }
      
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

  // Release order - Direct SQL implementation
  const releaseOrder = useCallback(async (orderId: string, sessionId: string): Promise<boolean> => {
    try {
      setError(null);
      
      // Only release if claimed by this session
      const { data, error } = await supabase
        .from('orders')
        .update({ 
          claimed_by: null,
          claimed_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .eq('claimed_by', sessionId) // Only release if claimed by this session
        .select('id')
        .single();

      if (error) {
        console.error('Release order error:', error);
        setError('Failed to release order');
        return false;
      }
      
      if (data) {
        console.log('✅ Order released:', orderId);
        await fetchOrders(); // Refresh orders
        return true;
      } else {
        setError('Order not claimed by your session');
        return false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to release order';
      setError(errorMessage);
      console.error('❌ Error releasing order:', err);
      return false;
    }
  }, [fetchOrders]);

  // Update order status with optimistic updates
  const updateOrderStatus = useCallback(async (orderId: string, newStatus: string): Promise<boolean> => {
    try {
      setError(null);
      
      // Optimistic update - update local state immediately
      setOrders(prevOrders => 
        prevOrders.map(order => 
          order.id === orderId 
            ? { ...order, status: newStatus as any, updated_at: new Date().toISOString() }
            : order
        )
      );
      
      // Then update database
      const { error } = await supabase
        .from('orders')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (error) {
        console.error('Update order status error:', error);
        
        // Rollback optimistic update on error
        await fetchOrders();
        throw error;
      }
      
      console.log('✅ Order status updated:', orderId, newStatus);
      
      // Refresh to ensure consistency
      setTimeout(() => fetchOrders(), 1000);
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update order status';
      setError(errorMessage);
      console.error('❌ Error updating order status:', err);
      return false;
    }
  }, [fetchOrders]);

  // Start preparing (claim + set to preparing) - Atomic operation
  const startPreparing = useCallback(async (orderId: string, sessionId: string): Promise<boolean> => {
    try {
      setError(null);
      
      // Atomic update: claim and set status in one operation
      const { data, error } = await supabase
        .from('orders')
        .update({ 
          claimed_by: sessionId,
          claimed_at: new Date().toISOString(),
          status: 'preparing',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .is('claimed_by', null) // Only if not already claimed
        .select('id')
        .single();

      if (error) {
        console.error('Start preparing error:', error);
        setError('Failed to start preparing - order may be claimed by someone else');
        return false;
      }
      
      if (data) {
        console.log('✅ Order preparation started:', orderId);
        await fetchOrders();
        return true;
      } else {
        setError('Order already claimed by someone else');
        return false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start preparing order';
      setError(errorMessage);
      console.error('❌ Error starting preparation:', err);
      return false;
    }
  }, [fetchOrders]);

  // Mark ready
  const markReady = useCallback(async (orderId: string): Promise<boolean> => {
    return await updateOrderStatus(orderId, 'ready');
  }, [updateOrderStatus]);

  // Mark served
  const markServed = useCallback(async (orderId: string): Promise<boolean> => {
    return await updateOrderStatus(orderId, 'served');
  }, [updateOrderStatus]);

  // Group orders by status
  const groupedOrders = {
    pending: orders.filter(order => order.status === 'pending'),
    preparing: orders.filter(order => order.status === 'preparing'),
    ready: orders.filter(order => order.status === 'ready')
  };

  // Initial load
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Real-time subscription with improved error handling
  useEffect(() => {
    if (!restaurantId) return;

    console.log('🔥 Setting up real-time orders subscription');

    // Clean up existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // Create new channel with unique name
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
          
          // Debounced refresh to avoid too many calls
          setTimeout(() => fetchOrders(), 500);
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
          
          // Refresh to update claimed_session data
          setTimeout(() => fetchOrders(), 500);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time kitchen subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time kitchen subscription error');
        }
      });

    channelRef.current = channel;

    // Cleanup on unmount
    return () => {
      if (channelRef.current) {
        console.log('🧹 Cleaning up kitchen real-time subscription');
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [restaurantId, fetchOrders]);

  return {
    orders,
    groupedOrders,
    loading,
    error,
    fetchOrders,
    claimOrder,
    releaseOrder,
    startPreparing,
    markReady,
    markServed,
    updateOrderStatus
  };
} 
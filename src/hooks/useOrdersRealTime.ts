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
          restaurant_table:restaurant_tables(*)
        `)
        .eq('restaurant_id', restaurant.id)
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
  }, [restaurant]);

  // Initial load
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Real-time subscription
  useEffect(() => {
    if (!restaurant) return;

    console.log('🔥 Setting up real-time orders subscription for restaurant:', restaurant.id);

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
  }, [restaurant, fetchOrders]);

  const updateOrderStatus = useCallback(async (orderId: string, status: string) => {
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
      
      // The real-time subscription will automatically update the UI
      return true;
    } catch (err) {
      console.error('❌ Error updating order status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update order');
      return false;
    }
  }, []);

  return {
    orders,
    loading,
    error,
    lastUpdate,
    updateOrderStatus,
    refetch: fetchOrders
  };
} 
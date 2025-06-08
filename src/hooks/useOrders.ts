import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { generateOrderNumber } from '../lib/utils';
import type { Order, OrderItem, OrderWithItems, CartItem } from '../types/database';

export interface OrdersState {
  orders: OrderWithItems[];
  loading: boolean;
  error: string | null;
}

export interface OrdersActions {
  fetchOrders: (restaurantId: string) => Promise<void>;
  createOrder: (
    restaurantId: string,
    tableId: string,
    items: CartItem[],
    customerName?: string,
    specialInstructions?: string
  ) => Promise<Order>;
  updateOrderStatus: (orderId: string, status: Order['status']) => Promise<void>;
  updateOrderItemStatus: (itemId: string, status: OrderItem['item_status']) => Promise<void>;
  assignChef: (orderId: string, chefName: string) => Promise<void>;
  assignChefToItem: (itemId: string, chefName: string) => Promise<void>;
  clearError: () => void;
}

export function useOrders(): OrdersState & OrdersActions {
  const [state, setState] = useState<OrdersState>({
    orders: [],
    loading: false,
    error: null,
  });

  const fetchOrders = useCallback(async (restaurantId: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          restaurant_table:restaurant_tables(*),
          order_items(
            *,
            menu_item:menu_items(*)
          )
        `)
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .limit(50); // Add reasonable limit for performance

      if (error) throw error;

      setState(prev => ({ 
        ...prev, 
        orders: data as OrderWithItems[], 
        loading: false 
      }));
    } catch (error) {
      console.error('Error fetching orders:', error);
      setState(prev => ({ 
        ...prev, 
        error: 'Failed to fetch orders', 
        loading: false 
      }));
    }
  }, []);

  const createOrder = useCallback(async (
    restaurantId: string,
    tableId: string,
    items: CartItem[],
    customerName?: string,
    specialInstructions?: string
  ): Promise<Order> => {
    try {
      const orderNumber = generateOrderNumber();
      const totalAmount = items.reduce((sum, item) => 
        sum + (item.menu_item.price * item.quantity), 0
      );

      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          restaurant_id: restaurantId,
          table_id: tableId,
          order_number: orderNumber,
          total_amount: totalAmount,
          customer_name: customerName,
          special_instructions: specialInstructions,
          status: 'pending',
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = items.map(item => ({
        order_id: order.id,
        menu_item_id: item.menu_item.id,
        quantity: item.quantity,
        unit_price: item.menu_item.price,
        special_instructions: item.special_instructions,
        item_status: 'pending' as const,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      return order;
    } catch (error) {
      console.error('Error creating order:', error);
      setState(prev => ({ 
        ...prev, 
        error: 'Failed to create order'
      }));
      throw error;
    }
  }, []);

  const updateOrderStatus = useCallback(async (orderId: string, status: Order['status']) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', orderId);

      if (error) throw error;

      // Update local state
      setState(prev => ({
        ...prev,
        orders: prev.orders.map(order =>
          order.id === orderId ? { ...order, status } : order
        ),
      }));
    } catch (error) {
      console.error('Error updating order status:', error);
      setState(prev => ({ 
        ...prev, 
        error: 'Failed to update order status'
      }));
    }
  }, []);

  const updateOrderItemStatus = useCallback(async (itemId: string, status: OrderItem['item_status']) => {
    try {
      const { error } = await supabase
        .from('order_items')
        .update({ item_status: status, updated_at: new Date().toISOString() })
        .eq('id', itemId);

      if (error) throw error;

      // Update local state
      setState(prev => ({
        ...prev,
        orders: prev.orders.map(order => ({
          ...order,
          order_items: order.order_items.map(item =>
            item.id === itemId ? { ...item, item_status: status } : item
          ),
        })),
      }));
    } catch (error) {
      console.error('Error updating order item status:', error);
      setState(prev => ({ 
        ...prev, 
        error: 'Failed to update item status'
      }));
    }
  }, []);

  const assignChef = useCallback(async (orderId: string, chefName: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ assigned_chef: chefName, updated_at: new Date().toISOString() })
        .eq('id', orderId);

      if (error) throw error;

      // Update local state
      setState(prev => ({
        ...prev,
        orders: prev.orders.map(order =>
          order.id === orderId ? { ...order, assigned_chef: chefName } : order
        ),
      }));
    } catch (error) {
      console.error('Error assigning chef:', error);
      setState(prev => ({ 
        ...prev, 
        error: 'Failed to assign chef'
      }));
    }
  }, []);

  const assignChefToItem = useCallback(async (itemId: string, chefName: string) => {
    try {
      const { error } = await supabase
        .from('order_items')
        .update({ assigned_chef: chefName, updated_at: new Date().toISOString() })
        .eq('id', itemId);

      if (error) throw error;

      // Update local state
      setState(prev => ({
        ...prev,
        orders: prev.orders.map(order => ({
          ...order,
          order_items: order.order_items.map(item =>
            item.id === itemId ? { ...item, assigned_chef: chefName } : item
          ),
        })),
      }));
    } catch (error) {
      console.error('Error assigning chef to item:', error);
      setState(prev => ({ 
        ...prev, 
        error: 'Failed to assign chef to item'
      }));
    }
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    fetchOrders,
    createOrder,
    updateOrderStatus,
    updateOrderItemStatus,
    assignChef,
    assignChefToItem,
    clearError,
  };
} 
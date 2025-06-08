import { supabase } from '../lib/supabase';
import type { Order, OrderWithItems, OrderItem, AutoAssignResult } from '../types/database';

export interface OrdersData {
  orders: OrderWithItems[];
  totalCount: number;
}

/**
 * Fetch orders for a restaurant with real-time capable query
 */
export async function fetchOrders(
  restaurantId: string,
  options: {
    status?: ('pending' | 'preparing' | 'ready' | 'served' | 'cancelled')[];
    limit?: number;
    offset?: number;
    includeHistory?: boolean;
  } = {}
): Promise<OrdersData> {
  try {
    const {
      status = ['pending', 'preparing', 'ready'],
      limit = 100,
      offset = 0,
      includeHistory = false
    } = options;

    let query = supabase
      .from('orders')
      .select(`
        *,
        order_items!inner(
          *,
          menu_item:menu_items(*)
        ),
        restaurant_table:restaurant_tables(*),
        claimed_session:active_sessions(user_name)
      `, { count: 'exact' })
      .eq('restaurant_id', restaurantId);

    if (!includeHistory) {
      query = query.in('status', status);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return {
      orders: (data || []) as OrderWithItems[],
      totalCount: count || 0
    };
  } catch (error) {
    console.error('Error fetching orders:', error);
    throw error;
  }
}

/**
 * Fetch a single order with all details
 */
export async function fetchOrder(
  restaurantId: string,
  orderId: string
): Promise<OrderWithItems> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items(
          *,
          menu_item:menu_items(*)
        ),
        restaurant_table:restaurant_tables(*),
        claimed_session:active_sessions(user_name)
      `)
      .eq('restaurant_id', restaurantId)
      .eq('id', orderId)
      .single();

    if (error) throw error;
    return data as OrderWithItems;
  } catch (error) {
    console.error('Error fetching order:', error);
    throw error;
  }
}

/**
 * Update order status using optimized database function
 */
export async function updateOrderStatus(variables: {
  restaurantId: string;
  orderId: string;
  status: string;
  staffId?: string;
}): Promise<Order> {
  try {
    // Use the optimized database function
    const { data, error } = await supabase.rpc('update_order_status_optimized', {
      p_order_id: variables.orderId,
      p_new_status: variables.status,
      p_staff_id: variables.staffId
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating order status:', error);
    // Fallback to manual update if RPC fails
    return updateOrderStatusFallback(variables);
  }
}

/**
 * Fallback order status update (manual)
 */
async function updateOrderStatusFallback(variables: {
  restaurantId: string;
  orderId: string;
  status: string;
  staffId?: string;
}): Promise<Order> {
  const updateData: any = {
    status: variables.status,
    updated_at: new Date().toISOString()
  };

  // Handle claiming logic
  if (variables.status === 'claimed' && variables.staffId) {
    updateData.claimed_by = variables.staffId;
    updateData.claimed_at = new Date().toISOString();
  } else if (variables.status === 'pending') {
    updateData.claimed_by = null;
    updateData.claimed_at = null;
  }

  // Handle timing fields
  if (variables.status === 'preparing' && !updateData.preparation_started_at) {
    updateData.preparation_started_at = new Date().toISOString();
  } else if (variables.status === 'ready' && !updateData.ready_at) {
    updateData.ready_at = new Date().toISOString();
  } else if (variables.status === 'served' && !updateData.served_at) {
    updateData.served_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('orders')
    .update(updateData)
    .eq('id', variables.orderId)
    .eq('restaurant_id', variables.restaurantId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Create a new order
 */
export async function createOrder(variables: {
  restaurantId: string;
  tableId: string;
  orderItems: Omit<OrderItem, 'id' | 'order_id' | 'created_at' | 'updated_at'>[];
  customerName?: string;
  specialInstructions?: string;
}): Promise<OrderWithItems> {
  try {
    // Calculate total amount
    const totalAmount = variables.orderItems.reduce(
      (sum, item) => sum + (item.unit_price * item.quantity), 
      0
    );

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        restaurant_id: variables.restaurantId,
        table_id: variables.tableId,
        order_number: orderNumber,
        status: 'pending',
        total_amount: totalAmount,
        customer_name: variables.customerName,
        special_instructions: variables.specialInstructions,
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // Create order items
    const orderItemsWithOrderId = variables.orderItems.map(item => ({
      ...item,
      order_id: order.id,
    }));

    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItemsWithOrderId)
      .select(`
        *,
        menu_item:menu_items(*)
      `);

    if (itemsError) throw itemsError;

    // Return complete order
    return {
      ...order,
      order_items: orderItems,
      restaurant_table: null,
      claimed_session: null
    } as OrderWithItems;
  } catch (error) {
    console.error('Error creating order:', error);
    throw error;
  }
}

/**
 * Cancel an order
 */
export async function cancelOrder(variables: {
  restaurantId: string;
  orderId: string;
  reason?: string;
}): Promise<Order> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        special_instructions: variables.reason 
          ? `${variables.reason}` 
          : undefined,
        updated_at: new Date().toISOString()
      })
      .eq('id', variables.orderId)
      .eq('restaurant_id', variables.restaurantId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error cancelling order:', error);
    throw error;
  }
}

/**
 * Claim an order for kitchen session
 */
export async function claimOrder(variables: {
  restaurantId: string;
  orderId: string;
  sessionId: string;
}): Promise<Order> {
  try {
    // Use RPC for atomic claiming if available
    const { data: rpcResult, error: rpcError } = await supabase.rpc('claim_order', {
      order_uuid: variables.orderId,
      session_uuid: variables.sessionId
    });

    if (!rpcError && rpcResult) {
      return rpcResult;
    }

    // Fallback to direct update
    return await updateOrderStatus({
      restaurantId: variables.restaurantId,
      orderId: variables.orderId,
      status: 'claimed',
      staffId: variables.sessionId
    });
  } catch (error) {
    console.error('Error claiming order:', error);
    throw error;
  }
}

/**
 * Release an order claim
 */
export async function releaseOrder(variables: {
  restaurantId: string;
  orderId: string;
  sessionId: string;
}): Promise<Order> {
  try {
    // Use RPC for atomic release if available
    const { data: rpcResult, error: rpcError } = await supabase.rpc('release_order', {
      order_uuid: variables.orderId,
      session_uuid: variables.sessionId
    });

    if (!rpcError && rpcResult) {
      return rpcResult;
    }

    // Fallback to direct update
    return await updateOrderStatus({
      restaurantId: variables.restaurantId,
      orderId: variables.orderId,
      status: 'pending'
    });
  } catch (error) {
    console.error('Error releasing order:', error);
    throw error;
  }
}

/**
 * Auto-assign order to best available chef
 */
export async function autoAssignOrder(variables: {
  restaurantId: string;
  orderId: string;
}): Promise<AutoAssignResult> {
  try {
    const { data, error } = await supabase.rpc('auto_assign_order', {
      p_order_id: variables.orderId,
      p_restaurant_id: variables.restaurantId
    });

    if (error) throw error;
    return data as AutoAssignResult;
  } catch (error) {
    console.error('Error auto-assigning order:', error);
    throw error;
  }
}

/**
 * Fetch order history for analytics
 */
export async function fetchOrderHistory(
  restaurantId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}
): Promise<OrdersData> {
  try {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      endDate = new Date(),
      limit = 100,
      offset = 0
    } = options;

    const { data, error, count } = await supabase
      .from('orders')
      .select(`
        *,
        order_items(
          *,
          menu_item:menu_items(name, price)
        )
      `, { count: 'exact' })
      .eq('restaurant_id', restaurantId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return {
      orders: (data || []) as OrderWithItems[],
      totalCount: count || 0
    };
  } catch (error) {
    console.error('Error fetching order history:', error);
    throw error;
  }
} 
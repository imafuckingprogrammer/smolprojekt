import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { formatCurrency, getOrderAge } from '../../lib/utils';
import type { OrderWithItems } from '../../types/database';
import {
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

export function Kitchen() {
  const { user, restaurant } = useAuth();
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authCheckLoading, setAuthCheckLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Check authorization on mount
  useEffect(() => {
    const checkAuth = async () => {
      setAuthCheckLoading(true);
      
      // Check authentication
      if (!user || !restaurant) {
        setAuthError('Authentication required. Please log in to access the kitchen.');
        setAuthCheckLoading(false);
        return;
      }

      setAuthError(null);
      setAuthCheckLoading(false);
    };

    checkAuth();
  }, [user, restaurant]);

  // Fetch orders function
  const fetchOrders = async () => {
    if (!restaurant?.id) return;

    try {
      setLoading(true);
      setError(null);
      
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
        .in('status', ['pending', 'preparing', 'ready'])
        .order('created_at', { ascending: true });

      if (error) throw error;
      setOrders(data || []);
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  // Load orders on mount and restaurant change
  useEffect(() => {
    if (!authError && !authCheckLoading) {
      fetchOrders();
      const interval = setInterval(fetchOrders, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [authError, authCheckLoading, restaurant?.id]);

  // Direct status update for authorized users
  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    if (!restaurant?.id) return;

    try {
      console.log('🔄 Updating order status:', { orderId, newStatus });
      
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId)
        .eq('restaurant_id', restaurant.id);
      
      if (error) throw error;
      
      console.log('✅ Status updated successfully');
      
      // Update local state immediately
      setOrders(prevOrders => 
        prevOrders.map(order => 
          order.id === orderId 
            ? { ...order, status: newStatus as any }
            : order
        )
      );

      // Refresh orders after a short delay
      setTimeout(fetchOrders, 1000);
    } catch (err) {
      console.error('❌ Error updating status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  // Show loading or authorization errors first
  if (authCheckLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Kitchen Access Required</h2>
          <p className="text-gray-600 mb-6">{authError}</p>
          <div className="space-y-2 text-sm text-gray-500 mb-6">
            <p>• Log in with proper credentials</p>
            <p>• Contact your restaurant manager for access</p>
          </div>
          <div className="flex gap-4 justify-center">
            <button 
              onClick={() => window.location.href = '/auth/signin'}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Sign In
            </button>
            <button 
              onClick={() => window.location.href = '/'}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const getActionButtons = (order: OrderWithItems) => {
    return (
      <select
        value={order.status}
        onChange={(e) => handleStatusUpdate(order.id, e.target.value)}
        className="w-full text-xs p-1 border rounded"
      >
        <option value="pending">Pending</option>
        <option value="preparing">Preparing</option>
        <option value="ready">Ready</option>
        <option value="served">Served</option>
        <option value="cancelled">Cancelled</option>
      </select>
    );
  };

  const getOrderStatusColor = (order: OrderWithItems) => {
    const age = getOrderAge(order.created_at);
    
    // Priority colors based on age
    if (age > 20) return 'border-red-500 bg-red-50';
    if (age > 10) return 'border-orange-400 bg-orange-50';
    
    // Default status colors
    switch (order.status) {
      case 'pending': return 'border-yellow-400 bg-yellow-50';
      case 'preparing': return 'border-blue-400 bg-blue-50';
      case 'ready': return 'border-green-400 bg-green-50';
      default: return 'border-gray-300 bg-white';
    }
  };

  // Filter orders by status
  const pendingOrders = orders.filter(order => order.status === 'pending');
  const preparingOrders = orders.filter(order => order.status === 'preparing');
  const readyOrders = orders.filter(order => order.status === 'ready');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold text-gray-900">Kitchen Dashboard</h1>
              {user && (
                <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                  {user.user_metadata?.first_name || user.email} • Staff
                </div>
              )}
              {restaurant && (
                <div className="text-sm text-gray-600">
                  {restaurant.name}
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={fetchOrders}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="text-red-800">{error}</div>
          </div>
        </div>
      )}

      {/* Kitchen Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Total Orders</h3>
            <p className="text-3xl font-bold text-gray-900">{orders.length}</p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Pending</h3>
            <p className="text-3xl font-bold text-yellow-600">{pendingOrders.length}</p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-2">In Progress</h3>
            <p className="text-3xl font-bold text-blue-600">{preparingOrders.length}</p>
          </div>
        </div>

        {/* Orders Grid */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <OrderColumn
            title="Pending Orders"
            count={pendingOrders.length}
            color="yellow"
            orders={pendingOrders}
            getActionButtons={getActionButtons}
            getStatusColor={getOrderStatusColor}
          />
          
          <OrderColumn
            title="Preparing"
            count={preparingOrders.length}
            color="blue"
            orders={preparingOrders}
            getActionButtons={getActionButtons}
            getStatusColor={getOrderStatusColor}
          />
          
          <OrderColumn
            title="Ready"
            count={readyOrders.length}
            color="green"
            orders={readyOrders}
            getActionButtons={getActionButtons}
            getStatusColor={getOrderStatusColor}
          />
        </div>
      </div>
    </div>
  );
}

interface OrderColumnProps {
  title: string;
  count: number;
  color: 'yellow' | 'blue' | 'green';
  orders: OrderWithItems[];
  getActionButtons: (order: OrderWithItems) => React.ReactNode;
  getStatusColor: (order: OrderWithItems) => string;
}

function OrderColumn({ title, count, color, orders, getActionButtons, getStatusColor }: OrderColumnProps) {
  const colorClasses = {
    yellow: 'bg-yellow-50 border-yellow-200',
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200'
  };

  return (
    <div className={`${colorClasses[color]} border rounded-lg p-4`}>
      <h3 className="font-medium text-gray-900 mb-4">
        {title} ({count})
      </h3>
      
      <div className="space-y-3">
        {orders.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No orders</p>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              statusColor={getStatusColor(order)}
              actionButtons={getActionButtons(order)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface OrderCardProps {
  order: OrderWithItems;
  statusColor: string;
  actionButtons: React.ReactNode;
}

function OrderCard({ order, statusColor, actionButtons }: OrderCardProps) {
  const orderAge = getOrderAge(order.created_at);
  
  return (
    <div className={`bg-white border rounded-lg p-3 ${statusColor}`}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <h4 className="font-medium text-gray-900">#{order.order_number}</h4>
          <p className="text-sm text-gray-600">Table {order.restaurant_table?.table_number}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-gray-900">{formatCurrency(order.total_amount)}</p>
          <p className="text-xs text-gray-500">{orderAge}m ago</p>
        </div>
      </div>
      
      <div className="mb-3">
        {order.order_items.map((item) => (
          <div key={item.id} className="text-sm text-gray-700">
            {item.quantity}x {item.menu_item?.name}
            {item.special_instructions && (
              <div className="text-xs text-gray-500 ml-2">
                Note: {item.special_instructions}
              </div>
            )}
          </div>
        ))}
      </div>
      
      {order.special_instructions && (
        <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
          <strong>Special Instructions:</strong> {order.special_instructions}
        </div>
      )}
      
      <div className="flex gap-2">
        {actionButtons}
      </div>
    </div>
  );
}
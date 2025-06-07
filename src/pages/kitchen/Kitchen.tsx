import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useOrders } from '../../hooks/useOrders';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { formatCurrency, getOrderAge, getOrderAgeColor } from '../../lib/utils';
import type { OrderWithItems } from '../../types/database';
import {
  ClockIcon,
  MapPinIcon,
  UserIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlayIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

export function Kitchen() {
  const { restaurant } = useAuth();
  const { orders, loading, fetchOrders, updateOrderStatus } = useOrders();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastOrderCount, setLastOrderCount] = useState(0);

  useEffect(() => {
    if (restaurant) {
      fetchOrders(restaurant.id);
    }
  }, [restaurant, fetchOrders]);

  // Set up real-time subscription and auto-refresh
  useEffect(() => {
    if (!restaurant) return;

    let subscription: any = null;

    // Set up real-time subscription for new orders
    const setupRealtimeSubscription = () => {
      subscription = supabase
        .channel('orders')
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
            fetchOrders(restaurant.id);
            
            // Play sound for new orders
            if (payload.eventType === 'INSERT' && soundEnabled) {
              playNotificationSound();
            }
          }
        )
        .subscribe();
    };

    setupRealtimeSubscription();

    // Set up auto-refresh
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchOrders(restaurant.id);
      }, 30000); // Refresh every 30 seconds
      setRefreshInterval(interval);
    }

    return () => {
      if (subscription) {
        supabase.removeChannel(subscription);
      }
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [restaurant, autoRefresh, soundEnabled, fetchOrders]);

  // Check for new orders and play sound
  useEffect(() => {
    const pendingOrders = orders.filter(order => order.status === 'pending').length;
    if (pendingOrders > lastOrderCount && lastOrderCount > 0 && soundEnabled) {
      playNotificationSound();
    }
    setLastOrderCount(pendingOrders);
  }, [orders, lastOrderCount, soundEnabled]);

  const playNotificationSound = () => {
    // Create a simple beep sound
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  };

  const handleStatusUpdate = async (orderId: string, newStatus: any) => {
    try {
      await updateOrderStatus(orderId, newStatus);
    } catch (error) {
      console.error('Error updating order status:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 border-yellow-300';
      case 'preparing': return 'bg-blue-100 border-blue-300';
      case 'ready': return 'bg-green-100 border-green-300';
      case 'served': return 'bg-gray-100 border-gray-300';
      default: return 'bg-red-100 border-red-300';
    }
  };

  const getActionButtons = (order: OrderWithItems) => {
    switch (order.status) {
      case 'pending':
        return (
          <div className="flex space-x-2">
            <button
              onClick={() => handleStatusUpdate(order.id, 'preparing')}
              className="btn-primary text-sm flex items-center"
            >
              <PlayIcon className="h-4 w-4 mr-1" />
              Start Preparing
            </button>
            <button
              onClick={() => handleStatusUpdate(order.id, 'cancelled')}
              className="btn-danger text-sm flex items-center"
            >
              <XCircleIcon className="h-4 w-4 mr-1" />
              Cancel
            </button>
          </div>
        );
      case 'preparing':
        return (
          <div className="flex space-x-2">
            <button
              onClick={() => handleStatusUpdate(order.id, 'ready')}
              className="btn-success text-sm flex items-center"
            >
              <CheckCircleIcon className="h-4 w-4 mr-1" />
              Mark Ready
            </button>
            <button
              onClick={() => handleStatusUpdate(order.id, 'cancelled')}
              className="btn-danger text-sm flex items-center"
            >
              <XCircleIcon className="h-4 w-4 mr-1" />
              Cancel
            </button>
          </div>
        );
      case 'ready':
        return (
          <button
            onClick={() => handleStatusUpdate(order.id, 'served')}
            className="btn-success text-sm flex items-center"
          >
            <CheckCircleIcon className="h-4 w-4 mr-1" />
            Mark Served
          </button>
        );
      default:
        return null;
    }
  };

  // Filter orders to show only active ones
  const activeOrders = orders.filter(order => 
    ['pending', 'preparing', 'ready'].includes(order.status)
  );

  const pendingOrders = activeOrders.filter(order => order.status === 'pending');
  const preparingOrders = activeOrders.filter(order => order.status === 'preparing');
  const readyOrders = activeOrders.filter(order => order.status === 'ready');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Kitchen Display</h1>
              <p className="text-sm text-gray-600">
                {restaurant?.name} • {activeOrders.length} active orders
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={soundEnabled}
                    onChange={(e) => setSoundEnabled(e.target.checked)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Sound</span>
                </label>
              </div>
              
              <div className="flex items-center">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Auto-refresh</span>
                </label>
              </div>
              
              <button
                onClick={() => restaurant && fetchOrders(restaurant.id)}
                className="btn-secondary text-sm flex items-center"
              >
                <ArrowPathIcon className="h-4 w-4 mr-1" />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Status Summary */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center">
              <ClockIcon className="h-6 w-6 text-yellow-600 mr-3" />
              <div>
                <p className="text-lg font-semibold text-yellow-900">{pendingOrders.length}</p>
                <p className="text-sm text-yellow-700">Pending Orders</p>
              </div>
            </div>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center">
              <PlayIcon className="h-6 w-6 text-blue-600 mr-3" />
              <div>
                <p className="text-lg font-semibold text-blue-900">{preparingOrders.length}</p>
                <p className="text-sm text-blue-700">Preparing</p>
              </div>
            </div>
          </div>
          
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center">
              <CheckCircleIcon className="h-6 w-6 text-green-600 mr-3" />
              <div>
                <p className="text-lg font-semibold text-green-900">{readyOrders.length}</p>
                <p className="text-sm text-green-700">Ready for Pickup</p>
              </div>
            </div>
          </div>
        </div>

        {/* Orders Grid */}
        {activeOrders.length === 0 ? (
          <div className="text-center py-12">
            <ClockIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No active orders</h3>
            <p className="mt-1 text-sm text-gray-500">
              All caught up! New orders will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {activeOrders
              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
              .map((order) => {
                const orderAge = getOrderAge(order.created_at);
                const ageColorClass = getOrderAgeColor(orderAge);
                const statusColorClass = getStatusColor(order.status);

                return (
                  <div
                    key={order.id}
                    className={`card border-2 ${statusColorClass} ${ageColorClass}`}
                  >
                    {/* Order Header */}
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">
                          Order #{order.order_number}
                        </h3>
                        <div className="flex items-center space-x-4 mt-1">
                          <span className={`badge badge-${order.status}`}>
                            {order.status.toUpperCase()}
                          </span>
                          <span className="text-sm text-gray-500 flex items-center">
                            <ClockIcon className="h-4 w-4 mr-1" />
                            {orderAge} min ago
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-gray-900">
                          {formatCurrency(order.total_amount)}
                        </p>
                      </div>
                    </div>

                    {/* Order Info */}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center text-sm text-gray-600">
                        <MapPinIcon className="h-4 w-4 mr-2" />
                        Table {order.restaurant_table?.table_number}
                      </div>
                      
                      {order.customer_name && (
                        <div className="flex items-center text-sm text-gray-600">
                          <UserIcon className="h-4 w-4 mr-2" />
                          {order.customer_name}
                        </div>
                      )}
                    </div>

                    {/* Special Instructions */}
                    {order.special_instructions && (
                      <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="flex items-start">
                          <ChatBubbleLeftRightIcon className="h-4 w-4 text-yellow-600 mt-0.5 mr-2 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-yellow-800">Special Instructions:</p>
                            <p className="text-sm text-yellow-700">{order.special_instructions}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Order Items */}
                    <div className="space-y-3 mb-6">
                      {order.order_items.map((item) => (
                        <div key={item.id} className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">
                              {item.quantity}x {item.menu_item?.name || 'Unknown Item'}
                            </p>
                            {item.special_instructions && (
                              <div className="mt-1 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                                <p className="text-yellow-800">
                                  <span className="font-medium">Note:</span> {item.special_instructions}
                                </p>
                              </div>
                            )}
                          </div>
                          <div className="text-sm text-gray-600 ml-4">
                            {formatCurrency(item.unit_price * item.quantity)}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Action Buttons */}
                    <div className="border-t border-gray-200 pt-4">
                      {getActionButtons(order)}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
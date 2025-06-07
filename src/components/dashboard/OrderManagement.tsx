import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useOrders } from '../../hooks/useOrders';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatCurrency, formatDate, getOrderAge, getOrderAgeColor } from '../../lib/utils';
import type { OrderWithItems } from '../../types/database';
import {
  ClockIcon,
  MapPinIcon,
  UserIcon,
  ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline';

export function OrderManagement() {
  const { restaurant } = useAuth();
  const { orders, loading, fetchOrders, updateOrderStatus } = useOrders();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);

  useEffect(() => {
    if (restaurant) {
      fetchOrders(restaurant.id);
    }
  }, [restaurant]); // Remove fetchOrders from dependencies to prevent loop

  const handleStatusUpdate = async (orderId: string, newStatus: any) => {
    try {
      await updateOrderStatus(orderId, newStatus);
      // Optionally refresh the orders
      if (restaurant) {
        fetchOrders(restaurant.id);
      }
    } catch (error) {
      console.error('Error updating order status:', error);
    }
  };

  const filteredOrders = statusFilter === 'all' 
    ? orders 
    : orders.filter(order => order.status === statusFilter);

  const getStatusOptions = (currentStatus: string) => {
    const allStatuses = ['pending', 'preparing', 'ready', 'served', 'cancelled'];
    return allStatuses.filter(status => status !== currentStatus);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Order Management</h1>
          <p className="mt-1 text-sm text-gray-600">
            View and manage all incoming orders
          </p>
        </div>
      </div>

      {/* Status Filter */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { key: 'all', label: 'All Orders', count: orders.length },
              { key: 'pending', label: 'Pending', count: orders.filter(o => o.status === 'pending').length },
              { key: 'preparing', label: 'Preparing', count: orders.filter(o => o.status === 'preparing').length },
              { key: 'ready', label: 'Ready', count: orders.filter(o => o.status === 'ready').length },
              { key: 'served', label: 'Served', count: orders.filter(o => o.status === 'served').length }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  statusFilter === tab.key
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="text-center py-12">
          <ClockIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No orders</h3>
          <p className="mt-1 text-sm text-gray-500">
            {statusFilter === 'all' ? 'No orders have been placed yet.' : `No ${statusFilter} orders.`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const orderAge = getOrderAge(order.created_at);
            const ageColorClass = getOrderAgeColor(orderAge);

            return (
              <div
                key={order.id}
                className={`card border-l-4 ${
                  order.status === 'pending' ? 'border-l-yellow-400' :
                  order.status === 'preparing' ? 'border-l-blue-400' :
                  order.status === 'ready' ? 'border-l-green-400' :
                  order.status === 'served' ? 'border-l-gray-400' :
                  'border-l-red-400'
                } ${ageColorClass}`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-4 mb-3">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Order #{order.order_number}
                      </h3>
                      <span className={`badge badge-${order.status}`}>
                        {order.status}
                      </span>
                      <span className="text-sm text-gray-500 flex items-center">
                        <ClockIcon className="h-4 w-4 mr-1" />
                        {orderAge} min ago
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
                      
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">{formatCurrency(order.total_amount)}</span>
                      </div>
                    </div>

                    {order.special_instructions && (
                      <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="flex items-start">
                          <ChatBubbleLeftRightIcon className="h-4 w-4 text-yellow-600 mt-0.5 mr-2" />
                          <div>
                            <p className="text-sm font-medium text-yellow-800">Special Instructions:</p>
                            <p className="text-sm text-yellow-700">{order.special_instructions}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Order Items */}
                    <div className="space-y-2">
                      {order.order_items.map((item) => (
                        <div key={item.id} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg">
                          <div className="flex-1">
                            <span className="font-medium text-gray-900">
                              {item.quantity}x {item.menu_item?.name || 'Unknown Item'}
                            </span>
                            {item.special_instructions && (
                              <p className="text-sm text-gray-600 mt-1">
                                Note: {item.special_instructions}
                              </p>
                            )}
                          </div>
                          <span className="text-sm text-gray-600">
                            {formatCurrency(item.unit_price * item.quantity)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="ml-6 flex flex-col space-y-2">
                    <select
                      value={order.status}
                      onChange={(e) => handleStatusUpdate(order.id, e.target.value)}
                      className="input text-sm"
                    >
                      <option value={order.status}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </option>
                      {getStatusOptions(order.status).map((status) => (
                        <option key={status} value={status}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </option>
                      ))}
                    </select>
                    
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="btn-secondary text-sm"
                    >
                      View Details
                    </button>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
                  Ordered at {formatDate(order.created_at)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-medium text-gray-900">
                Order #{selectedOrder.order_number} Details
              </h3>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              {/* Order Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Order Information</h4>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-500">Status:</span> 
                      <span className={`ml-2 badge badge-${selectedOrder.status}`}>
                        {selectedOrder.status}
                      </span>
                    </p>
                    <p><span className="text-gray-500">Table:</span> {selectedOrder.restaurant_table?.table_number}</p>
                    <p><span className="text-gray-500">Total:</span> {formatCurrency(selectedOrder.total_amount)}</p>
                    <p><span className="text-gray-500">Ordered:</span> {formatDate(selectedOrder.created_at)}</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Customer Information</h4>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-500">Name:</span> {selectedOrder.customer_name || 'Not provided'}</p>
                  </div>
                </div>
              </div>

              {/* Special Instructions */}
              {selectedOrder.special_instructions && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Special Instructions</h4>
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-700">{selectedOrder.special_instructions}</p>
                  </div>
                </div>
              )}

              {/* Order Items */}
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Order Items</h4>
                <div className="space-y-3">
                  {selectedOrder.order_items.map((item) => (
                    <div key={item.id} className="flex justify-between items-start p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <h5 className="font-medium text-gray-900">
                          {item.quantity}x {item.menu_item?.name || 'Unknown Item'}
                        </h5>
                        {item.menu_item?.description && (
                          <p className="text-sm text-gray-600 mt-1">{item.menu_item.description}</p>
                        )}
                        {item.special_instructions && (
                          <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                            <p className="text-sm text-yellow-700">
                              <span className="font-medium">Note:</span> {item.special_instructions}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="ml-4 text-right">
                        <p className="font-medium text-gray-900">
                          {formatCurrency(item.unit_price * item.quantity)}
                        </p>
                        <p className="text-sm text-gray-500">
                          {formatCurrency(item.unit_price)} each
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status Update */}
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Update Order Status</h4>
                <select
                  value={selectedOrder.status}
                  onChange={(e) => {
                    handleStatusUpdate(selectedOrder.id, e.target.value);
                    setSelectedOrder(prev => prev ? { ...prev, status: e.target.value as any } : null);
                  }}
                  className="input"
                >
                  <option value="pending">Pending</option>
                  <option value="preparing">Preparing</option>
                  <option value="ready">Ready</option>
                  <option value="served">Served</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

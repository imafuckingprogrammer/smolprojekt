import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ClockIcon, 
  UserIcon, 
  CheckCircleIcon, 
  XCircleIcon,
  PlayIcon,
  ExclamationTriangleIcon,
  BellIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';
import { useMultiUserRealtime } from '../../hooks/useMultiUserRealtime';
import { useOrders } from '../../hooks/useOrders';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import type { OrderWithItems } from '../../types/database';

export function KitchenStation() {
  const { stationId } = useParams<{ stationId: string }>();
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  const { 
    stations, 
    activeSessions, 
    orderAssignments,
    currentStation,
    isConnected,
    joinStation,
    leaveStation,
    claimOrder,
    releaseOrder,
    updateOrderStatus,
    setPriority,
    isAssignedToMe,
    getAssignedUser
  } = useMultiUserRealtime(stationId);
  
  const { orders, loading } = useOrders();

  // Filter orders for this station
  const stationOrders = orders.filter(order => {
    // Show orders assigned to this station OR unassigned orders that match station type
    if (order.assigned_station_id === stationId) return true;
    
    if (!order.assigned_station_id && currentStation?.station_type === 'all') return true;
    
    // Filter by menu item preferences
    if (!order.assigned_station_id && order.order_items.some(item => 
      item.menu_item?.preferred_station_id === stationId
    )) return true;
    
    return false;
  });

  const activeOrders = stationOrders.filter(order => 
    ['pending', 'preparing', 'ready'].includes(order.status)
  );

  const pendingOrders = activeOrders.filter(order => order.status === 'pending');
  const preparingOrders = activeOrders.filter(order => order.status === 'preparing');
  const readyOrders = activeOrders.filter(order => order.status === 'ready');

  // Calculate priority colors
  const getPriorityColor = (priority: number) => {
    if (priority >= 8) return 'border-red-500 bg-red-50';
    if (priority >= 6) return 'border-yellow-500 bg-yellow-50';
    return 'border-blue-500 bg-blue-50';
  };

  const getOrderAge = (createdAt: string) => {
    return Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60));
  };

  const handleClaimOrder = async (orderId: string) => {
    if (!currentStation) return;
    
    const success = await claimOrder(orderId, currentStation.id);
    if (success && soundEnabled) {
      playSuccessSound();
    }
  };

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    await updateOrderStatus(orderId, newStatus);
    if (soundEnabled) {
      playSuccessSound();
    }
  };

  const handlePriorityChange = async (orderId: string, priority: number) => {
    await setPriority(orderId, priority);
  };

  const playSuccessSound = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 600;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  };

  const renderOrderCard = (order: OrderWithItems) => {
    const isAssigned = isAssignedToMe(order.id);
    const assignedUser = getAssignedUser(order.id);
    const orderAge = getOrderAge(order.created_at);
    const ageColor = orderAge > 15 ? 'text-red-600' : orderAge > 10 ? 'text-yellow-600' : 'text-green-600';

    return (
      <div
        key={order.id}
        className={`card border-l-4 ${getPriorityColor(order.priority || 5)} ${
          isAssigned ? 'ring-2 ring-blue-500' : ''
        }`}
      >
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center space-x-3">
            <h3 className="text-lg font-bold text-gray-900">
              #{order.order_number}
            </h3>
            <span className={`badge badge-${order.status}`}>
              {order.status}
            </span>
            <span className={`text-sm ${ageColor} flex items-center`}>
              <ClockIcon className="h-4 w-4 mr-1" />
              {orderAge}m
            </span>
          </div>
          
          {/* Priority Controls */}
          <div className="flex items-center space-x-2">
            <select
              value={order.priority || 5}
              onChange={(e) => handlePriorityChange(order.id, parseInt(e.target.value))}
              className="input text-sm w-20"
            >
              {[1,2,3,4,5,6,7,8,9,10].map(p => (
                <option key={p} value={p}>P{p}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table & Customer Info */}
        <div className="grid grid-cols-2 gap-4 mb-3 text-sm text-gray-600">
          <div>Table {order.restaurant_table?.table_number}</div>
          {order.customer_name && (
            <div className="flex items-center">
              <UserIcon className="h-4 w-4 mr-1" />
              {order.customer_name}
            </div>
          )}
        </div>

        {/* Assignment Status */}
        {assignedUser && (
          <div className="mb-3 p-2 bg-blue-50 rounded-lg flex items-center">
            <UserIcon className="h-4 w-4 mr-2 text-blue-600" />
            <span className="text-sm text-blue-800">
              {isAssigned ? 'Assigned to you' : `Assigned to ${assignedUser.user_name}`}
            </span>
          </div>
        )}

        {/* Special Instructions */}
        {order.special_instructions && (
          <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start">
              <ExclamationTriangleIcon className="h-4 w-4 text-yellow-600 mt-0.5 mr-2" />
              <div>
                <p className="text-sm font-medium text-yellow-800">Special Instructions:</p>
                <p className="text-sm text-yellow-700">{order.special_instructions}</p>
              </div>
            </div>
          </div>
        )}

        {/* Order Items */}
        <div className="space-y-2 mb-4">
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
                {item.menu_item?.preparation_time_minutes || 10}min
              </span>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2">
          {order.status === 'pending' && !assignedUser && (
            <button
              onClick={() => handleClaimOrder(order.id)}
              className="btn-primary flex-1 flex items-center justify-center"
            >
              <PlayIcon className="h-4 w-4 mr-1" />
              Claim & Start
            </button>
          )}
          
          {order.status === 'pending' && isAssigned && (
            <button
              onClick={() => handleStatusUpdate(order.id, 'preparing')}
              className="btn-primary flex-1 flex items-center justify-center"
            >
              <PlayIcon className="h-4 w-4 mr-1" />
              Start Preparing
            </button>
          )}
          
          {order.status === 'preparing' && isAssigned && (
            <button
              onClick={() => handleStatusUpdate(order.id, 'ready')}
              className="btn-success flex-1 flex items-center justify-center"
            >
              <CheckCircleIcon className="h-4 w-4 mr-1" />
              Mark Ready
            </button>
          )}
          
          {order.status === 'ready' && (
            <button
              onClick={() => handleStatusUpdate(order.id, 'served')}
              className="btn-success flex-1 flex items-center justify-center"
            >
              <CheckCircleIcon className="h-4 w-4 mr-1" />
              Mark Served
            </button>
          )}
          
          {isAssigned && order.status !== 'ready' && (
            <button
              onClick={() => releaseOrder(order.id)}
              className="btn-secondary flex items-center justify-center"
            >
              Release
            </button>
          )}
          
          <button
            onClick={() => handleStatusUpdate(order.id, 'cancelled')}
            className="btn-danger flex items-center justify-center"
          >
            <XCircleIcon className="h-4 w-4 mr-1" />
            Cancel
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!currentStation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Station Not Found</h1>
          <Link to="/kitchen" className="btn-primary">
            Back to Kitchen
          </Link>
        </div>
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
              <h1 className="text-2xl font-bold text-gray-900">
                {currentStation.station_name}
              </h1>
              <p className="text-sm text-gray-600">
                {currentStation.station_type.replace('_', ' ').toUpperCase()} • {activeOrders.length} active orders
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Connection Status */}
              <div className="flex items-center space-x-2">
                <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm text-gray-600">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              
              {/* Active Staff */}
              <div className="flex items-center space-x-2">
                <UserGroupIcon className="h-4 w-4 text-gray-500" />
                <span className="text-sm text-gray-600">
                  {activeSessions.filter(s => s.station_id === stationId).length} active
                </span>
              </div>
              
              {/* Sound Toggle */}
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => setSoundEnabled(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <BellIcon className="h-4 w-4 ml-2 text-gray-500" />
              </label>
              
              <Link to="/kitchen" className="btn-secondary">
                All Stations
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Order Columns */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Pending Orders */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              Pending Orders 
              <span className="ml-2 badge badge-yellow">{pendingOrders.length}</span>
            </h2>
            {pendingOrders.length === 0 ? (
              <div className="card text-center py-8">
                <p className="text-gray-500">No pending orders</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingOrders
                  .sort((a, b) => (b.priority || 5) - (a.priority || 5))
                  .map(renderOrderCard)}
              </div>
            )}
          </div>

          {/* Preparing Orders */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              Preparing 
              <span className="ml-2 badge badge-blue">{preparingOrders.length}</span>
            </h2>
            {preparingOrders.length === 0 ? (
              <div className="card text-center py-8">
                <p className="text-gray-500">No orders in preparation</p>
              </div>
            ) : (
              <div className="space-y-4">
                {preparingOrders
                  .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                  .map(renderOrderCard)}
              </div>
            )}
          </div>

          {/* Ready Orders */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              Ready for Service 
              <span className="ml-2 badge badge-green">{readyOrders.length}</span>
            </h2>
            {readyOrders.length === 0 ? (
              <div className="card text-center py-8">
                <p className="text-gray-500">No orders ready</p>
              </div>
            ) : (
              <div className="space-y-4">
                {readyOrders
                  .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                  .map(renderOrderCard)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 
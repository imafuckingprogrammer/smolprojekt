import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useKitchenOrders } from '../../hooks/useKitchenOrders';
import { WorkSessionManager } from '../../components/kitchen/WorkSessionManager';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { formatCurrency, getOrderAge } from '../../lib/utils';
import type { OrderWithItems, WorkSessionWithStation } from '../../types/database';
import {
  ClockIcon,
  MapPinIcon,
  UserIcon,
  PlayIcon,
  CheckCircleIcon,
  XCircleIcon,
  HandThumbUpIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  ArrowPathIcon,
  UsersIcon,
  ExclamationTriangleIcon,
  ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline';

export function Kitchen() {
  const { restaurant } = useAuth();
  const { groupedOrders, loading, error: ordersError, fetchOrders, startPreparing, markReady, markServed, releaseOrder } = useKitchenOrders(restaurant?.id || null);
  
  const [session, setSession] = useState<WorkSessionWithStation | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastOrderCount, setLastOrderCount] = useState(0);

  // Sound notification for new orders
  useEffect(() => {
    const currentPendingCount = groupedOrders.pending.length;
    if (currentPendingCount > lastOrderCount && lastOrderCount > 0 && soundEnabled && session) {
      playNotificationSound();
    }
    setLastOrderCount(currentPendingCount);
  }, [groupedOrders.pending.length, lastOrderCount, soundEnabled, session]);

  const playNotificationSound = () => {
    try {
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
    } catch (error) {
      console.error('Failed to play notification sound:', error);
    }
  };

  const getOrderStatusColor = (order: OrderWithItems) => {
    const age = getOrderAge(order.created_at);
    const isClaimedByMe = order.claimed_by === session?.id;
    const isClaimedByOther = order.claimed_by && order.claimed_by !== session?.id;
    
    // Priority colors based on age
    let ageClass = '';
    if (age > 20) ageClass = 'border-red-500 bg-red-50';
    else if (age > 10) ageClass = 'border-orange-400 bg-orange-50';
    
    // Status colors
    if (ageClass) return ageClass; // Age takes priority
    
    if (isClaimedByMe) {
      switch (order.status) {
        case 'preparing': return 'border-blue-500 bg-blue-50';
        case 'ready': return 'border-green-500 bg-green-50';
        default: return 'border-gray-300 bg-white';
      }
    }
    
    if (isClaimedByOther) {
      return 'border-orange-300 bg-orange-50';
    }
    
    // Default status colors
    switch (order.status) {
      case 'pending': return 'border-yellow-400 bg-yellow-50';
      case 'ready': return 'border-green-400 bg-green-50';
      default: return 'border-gray-300 bg-white';
    }
  };

  const getActionButtons = (order: OrderWithItems) => {
    if (!session) {
      return (
        <div className="text-xs text-gray-500 italic">
          Join kitchen to manage orders
        </div>
      );
    }

    const isClaimedByMe = order.claimed_by === session.id;
    // const isClaimedByOther = order.claimed_by && order.claimed_by !== session.id;
    
    switch (order.status) {
      case 'pending':
        if (!order.claimed_by) {
          return (
            <button
              onClick={() => startPreparing(order.id, session.id)}
              className="btn-primary text-sm flex items-center w-full justify-center"
            >
              <PlayIcon className="h-4 w-4 mr-1" />
              Start Preparing
            </button>
          );
        } else if (isClaimedByMe) {
          return (
            <div className="space-y-2">
              <button
                onClick={() => markReady(order.id)}
                className="btn-success text-sm flex items-center w-full justify-center"
              >
                <CheckCircleIcon className="h-4 w-4 mr-1" />
                Mark Ready
              </button>
              <button
                onClick={() => releaseOrder(order.id, session.id)}
                className="btn-secondary text-sm flex items-center w-full justify-center"
              >
                <XCircleIcon className="h-4 w-4 mr-1" />
                Release
              </button>
            </div>
          );
        } else {
          return (
            <div className="text-xs text-gray-500 italic text-center">
              Claimed by {(order as any).claimed_session?.user_name || 'another chef'}
            </div>
          );
        }
        
      case 'preparing':
        if (isClaimedByMe) {
          return (
            <div className="space-y-2">
              <button
                onClick={() => markReady(order.id)}
                className="btn-success text-sm flex items-center w-full justify-center"
              >
                <CheckCircleIcon className="h-4 w-4 mr-1" />
                Mark Ready
              </button>
              <button
                onClick={() => releaseOrder(order.id, session.id)}
                className="btn-secondary text-sm flex items-center w-full justify-center"
              >
                <XCircleIcon className="h-4 w-4 mr-1" />
                Release
              </button>
            </div>
          );
        } else {
          return (
            <div className="text-xs text-gray-500 italic text-center">
              Being prepared by {(order as any).claimed_session?.user_name || 'another chef'}
            </div>
          );
        }
        
      case 'ready':
        return (
          <button
            onClick={() => markServed(order.id)}
            className="btn-success text-sm flex items-center w-full justify-center"
          >
            <HandThumbUpIcon className="h-4 w-4 mr-1" />
            Mark Served
          </button>
        );
    }
    
    return null;
  };

  const getClaimerBadge = (order: OrderWithItems) => {
    if (!order.claimed_by) return null;
    
    const claimerName = (order as any).claimed_session?.user_name || 'Unknown';
    const isMe = order.claimed_by === session?.id;
    
    return (
      <div className={`text-xs px-2 py-1 rounded-full ${isMe ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>
        {isMe ? 'You' : claimerName}
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

  const error = ordersError;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900">Kitchen Dashboard</h1>
              
              {/* Session Status */}
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${session ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm text-gray-600">
                  {session ? 'Active Session' : 'No Session'}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Sound Toggle */}
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`p-2 rounded-lg transition-colors ${soundEnabled ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}
                title={soundEnabled ? 'Disable sound' : 'Enable sound'}
              >
                {soundEnabled ? (
                  <SpeakerWaveIcon className="h-5 w-5" />
                ) : (
                  <SpeakerXMarkIcon className="h-5 w-5" />
                )}
              </button>

              {/* Refresh */}
              <button
                onClick={fetchOrders}
                className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                title="Refresh orders"
              >
                <ArrowPathIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Work Session Manager */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <WorkSessionManager
          restaurantId={restaurant?.id || ''}
          onSessionChange={setSession}
        />
      </div>

      {/* Error Display */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Orders Grid - Only show when session is active */}
      {session && session.status === 'active' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Pending Orders */}
            <OrderColumn
              title="Pending Orders"
              count={groupedOrders.pending.length}
              color="yellow"
              orders={groupedOrders.pending}
              getStatusColor={getOrderStatusColor}
              getActionButtons={getActionButtons}
              getClaimerBadge={getClaimerBadge}
            />

            {/* Preparing Orders */}
            <OrderColumn
              title="Preparing"
              count={groupedOrders.preparing.length}
              color="blue"
              orders={groupedOrders.preparing}
              getStatusColor={getOrderStatusColor}
              getActionButtons={getActionButtons}
              getClaimerBadge={getClaimerBadge}
            />

            {/* Ready Orders */}
            <OrderColumn
              title="Ready to Serve"
              count={groupedOrders.ready.length}
              color="green"
              orders={groupedOrders.ready}
              getStatusColor={getOrderStatusColor}
              getActionButtons={getActionButtons}
              getClaimerBadge={getClaimerBadge}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Order Column Component
interface OrderColumnProps {
  title: string;
  count: number;
  color: 'yellow' | 'blue' | 'green';
  orders: OrderWithItems[];
  getStatusColor: (order: OrderWithItems) => string;
  getActionButtons: (order: OrderWithItems) => React.ReactNode;
  getClaimerBadge: (order: OrderWithItems) => React.ReactNode;
}

function OrderColumn({ title, count, color, orders, getStatusColor, getActionButtons, getClaimerBadge }: OrderColumnProps) {
  const colorClasses = {
    yellow: 'bg-yellow-400',
    blue: 'bg-blue-400',
    green: 'bg-green-400'
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {title} ({count})
        </h2>
        <div className={`w-3 h-3 ${colorClasses[color]} rounded-full`}></div>
      </div>
      
      <div className="space-y-4">
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            statusColor={getStatusColor(order)}
            actionButtons={getActionButtons(order)}
            claimerBadge={getClaimerBadge(order)}
          />
        ))}
        
        {orders.length === 0 && (
          <p className="text-gray-500 text-center py-8">
            No {title.toLowerCase()}
          </p>
        )}
      </div>
    </div>
  );
}

// Order Card Component
interface OrderCardProps {
  order: OrderWithItems;
  statusColor: string;
  actionButtons: React.ReactNode;
  claimerBadge: React.ReactNode;
}

function OrderCard({ order, statusColor, actionButtons, claimerBadge }: OrderCardProps) {
  const orderAge = getOrderAge(order.created_at);
  
  return (
    <div className={`border-2 rounded-lg p-4 ${statusColor}`}>
      {/* Order Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <MapPinIcon className="h-4 w-4 text-gray-500" />
          <span className="font-medium">
            Table {order.restaurant_table?.table_number || 'N/A'}
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          {claimerBadge}
          <div className="flex items-center space-x-1 text-sm text-gray-500">
            <ClockIcon className="h-4 w-4" />
            <span className={orderAge > 15 ? 'text-red-600 font-medium' : ''}>
              {orderAge}m
            </span>
          </div>
        </div>
      </div>

      {/* Special Instructions */}
      {order.special_instructions && (
        <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
          <div className="flex items-start space-x-1">
            <ChatBubbleLeftRightIcon className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <span className="text-yellow-800">{order.special_instructions}</span>
          </div>
        </div>
      )}

      {/* Order Items */}
      <div className="space-y-1 mb-4">
        {order.order_items.map((item) => (
          <div key={item.id} className="text-sm">
            <span className="font-medium">{item.quantity}x</span>{' '}
            <span>{item.menu_item?.name || 'Unknown Item'}</span>
            {item.special_instructions && (
              <div className="text-xs text-gray-600 ml-4">
                Note: {item.special_instructions}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="text-sm font-medium text-gray-900 mb-3">
        Total: {formatCurrency(order.total_amount)}
      </div>

      {/* Actions */}
      <div>
        {actionButtons}
      </div>
    </div>
  );
}
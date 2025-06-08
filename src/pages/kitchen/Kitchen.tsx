import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useSessionStore } from '../../stores/sessionStore';
import { useStaffStore } from '../../stores/staffStore';
import { useKitchenOrders } from '../../hooks/useKitchenOrders';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { formatCurrency, getOrderAge } from '../../lib/utils';
import type { OrderWithItems } from '../../types/database';
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
  const { user, restaurant } = useAuth();
  const { 
    currentSession, 
    claimOrder, 
    releaseOrder, 
    updateSessionStatus,
    fetchActiveSessions,
    activeSessions,
    canUserClaimOrders
  } = useSessionStore();
  const { isStaffMember, getStaffByEmail } = useStaffStore();
  
  const { 
    groupedOrders, 
    loading, 
    error: ordersError, 
    fetchOrders, 
    startPreparing, 
    markReady, 
    markServed 
  } = useKitchenOrders(restaurant?.id || null);
  
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastOrderCount, setLastOrderCount] = useState(0);
  const [authCheckLoading, setAuthCheckLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Check if user has access to kitchen
  const hasKitchenAccess = Boolean(
    (user && restaurant && user.email === restaurant.email) || // Owner
    (user && restaurant && user.email && isStaffMember(user.email, restaurant.id)) // Staff
  );

  // Get staff info if available
  const staffInfo = user?.email && restaurant ? getStaffByEmail(user.email, restaurant.id) : null;

  // Check authorization on mount
  useEffect(() => {
    const checkAuth = async () => {
      setAuthCheckLoading(true);
      
      if (!user || !restaurant) {
        setAuthError('Please log in and select a restaurant');
        setAuthCheckLoading(false);
        return;
      }

      if (!hasKitchenAccess) {
        setAuthError('You do not have permission to access the kitchen. Please contact your manager.');
        setAuthCheckLoading(false);
        return;
      }

      if (!currentSession) {
        setAuthError('No active kitchen session. Please join the kitchen first.');
        setAuthCheckLoading(false);
        return;
      }

      setAuthError(null);
      setAuthCheckLoading(false);
    };

    checkAuth();
  }, [user, restaurant, hasKitchenAccess, currentSession]);

  // Fetch active sessions periodically
  useEffect(() => {
    if (restaurant?.id) {
      fetchActiveSessions(restaurant.id);
      
      const interval = setInterval(() => {
        fetchActiveSessions(restaurant.id);
      }, 30000); // Every 30 seconds

      return () => clearInterval(interval);
    }
  }, [restaurant?.id, fetchActiveSessions]);

  // Sound notification for new orders
  useEffect(() => {
    const currentPendingCount = groupedOrders.pending.length;
    if (currentPendingCount > lastOrderCount && lastOrderCount > 0 && soundEnabled && currentSession) {
      playNotificationSound();
    }
    setLastOrderCount(currentPendingCount);
  }, [groupedOrders.pending.length, lastOrderCount, soundEnabled, currentSession]);

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

  const handleClaimOrder = async (orderId: string) => {
    if (!currentSession || !canUserClaimOrders()) return;
    
    const success = await claimOrder(orderId);
    if (success) {
      // Refresh orders to get updated state
      fetchOrders();
    }
  };

  const handleReleaseOrder = async (orderId: string) => {
    if (!currentSession) return;
    
    const success = await releaseOrder(orderId);
    if (success) {
      // Refresh orders to get updated state
      fetchOrders();
    }
  };

  const handleStartPreparing = async (orderId: string) => {
    if (!currentSession) return;
    
    // First claim the order if not already claimed
    if (!currentSession.claimedOrderIds.includes(orderId)) {
      const claimSuccess = await claimOrder(orderId);
      if (!claimSuccess) return;
    }
    
         // Then start preparing
     await startPreparing(orderId, currentSession.id);
     updateSessionStatus('busy');
  };

  const handleMarkReady = async (orderId: string) => {
    await markReady(orderId);
    // Update session status if no more orders being prepared
    const stillPreparing = groupedOrders.preparing.some(order => 
      order.id !== orderId && currentSession?.claimedOrderIds.includes(order.id)
    );
    if (!stillPreparing) {
      updateSessionStatus('active');
    }
  };

  const handleMarkServed = async (orderId: string) => {
    await markServed(orderId);
    // Release the order from our session
    await handleReleaseOrder(orderId);
  };

  const getOrderStatusColor = (order: OrderWithItems) => {
    const age = getOrderAge(order.created_at);
    const isClaimedByMe = currentSession?.claimedOrderIds.includes(order.id);
    const isClaimedByOther = order.claimed_by && order.claimed_by !== currentSession?.id;
    
    // Priority colors based on age
    let ageClass = '';
    if (age > 20) ageClass = 'border-red-500 bg-red-50';
    else if (age > 10) ageClass = 'border-orange-400 bg-orange-50';
    
    // Age takes priority
    if (ageClass) return ageClass;
    
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
          <div className="space-y-2 text-sm text-gray-500">
            <p>• Make sure you have an active kitchen session</p>
            <p>• Contact your restaurant manager for access</p>
            <p>• Check that you're logged in with the correct account</p>
          </div>
          <button 
            onClick={() => window.location.href = '/'}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const getActionButtons = (order: OrderWithItems) => {
    if (!currentSession) {
      return (
        <div className="text-xs text-gray-500 italic">
          No active session
        </div>
      );
    }

    const isClaimedByMe = currentSession.claimedOrderIds.includes(order.id);
    const isClaimedByOther = order.claimed_by && order.claimed_by !== currentSession.id;
    
    switch (order.status) {
      case 'pending':
        if (!order.claimed_by) {
          return (
            <button
              onClick={() => handleStartPreparing(order.id)}
              disabled={!canUserClaimOrders()}
              className="w-full bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
            >
              <PlayIcon className="h-4 w-4" />
              Start
            </button>
          );
        } else if (isClaimedByMe) {
          return (
            <div className="flex gap-1">
              <button
                onClick={() => handleStartPreparing(order.id)}
                className="flex-1 bg-blue-600 text-white px-2 py-1.5 rounded-md text-sm hover:bg-blue-700 flex items-center justify-center gap-1"
              >
                <PlayIcon className="h-4 w-4" />
                Start
              </button>
              <button
                onClick={() => handleReleaseOrder(order.id)}
                className="bg-gray-500 text-white px-2 py-1.5 rounded-md text-sm hover:bg-gray-600"
              >
                <XCircleIcon className="h-4 w-4" />
              </button>
            </div>
          );
        } else if (isClaimedByOther) {
          return (
            <div className="text-xs text-orange-600 italic">
              Claimed by other staff
            </div>
          );
        }
        break;
        
      case 'preparing':
        if (isClaimedByMe) {
          return (
            <div className="flex gap-1">
              <button
                onClick={() => handleMarkReady(order.id)}
                className="flex-1 bg-green-600 text-white px-2 py-1.5 rounded-md text-sm hover:bg-green-700 flex items-center justify-center gap-1"
              >
                <CheckCircleIcon className="h-4 w-4" />
                Ready
              </button>
              <button
                onClick={() => handleReleaseOrder(order.id)}
                className="bg-gray-500 text-white px-2 py-1.5 rounded-md text-sm hover:bg-gray-600"
              >
                <XCircleIcon className="h-4 w-4" />
              </button>
            </div>
          );
        } else {
          return (
            <div className="text-xs text-blue-600 italic">
              Being prepared
            </div>
          );
        }
        
      case 'ready':
        if (isClaimedByMe) {
          return (
            <button
              onClick={() => handleMarkServed(order.id)}
              className="w-full bg-purple-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-purple-700 flex items-center justify-center gap-1"
            >
              <HandThumbUpIcon className="h-4 w-4" />
              Served
            </button>
          );
        } else {
          return (
            <div className="text-xs text-green-600 italic">
              Ready for pickup
            </div>
          );
        }
        
      default:
        return null;
    }
  };

  const getClaimerBadge = (order: OrderWithItems) => {
    if (!order.claimed_by) return null;
    
    const claimerSession = activeSessions.find(s => s.id === order.claimed_by);
    const isClaimedByMe = currentSession?.id === order.claimed_by;
    
    return (
      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
        isClaimedByMe 
          ? 'bg-blue-100 text-blue-800' 
          : 'bg-orange-100 text-orange-800'
      }`}>
        <UserIcon className="h-3 w-3" />
        {isClaimedByMe ? 'You' : (claimerSession?.userName || 'Unknown')}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold text-gray-900">Kitchen Dashboard</h1>
              {currentSession && (
                <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                  {currentSession.userName} • {currentSession.status}
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              {/* Active Sessions */}
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <UsersIcon className="h-4 w-4" />
                <span>{activeSessions.length} active</span>
              </div>

              {/* Sound Toggle */}
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`p-2 rounded-md ${soundEnabled ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}
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
                disabled={loading}
                className="p-2 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
              >
                <ArrowPathIcon className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {ordersError && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error loading orders</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{ordersError}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Order Columns */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <OrderColumn
            title="Pending Orders"
            count={groupedOrders.pending.length}
            color="yellow"
            orders={groupedOrders.pending}
            getStatusColor={getOrderStatusColor}
            getActionButtons={getActionButtons}
            getClaimerBadge={getClaimerBadge}
          />
          
          <OrderColumn
            title="Preparing"
            count={groupedOrders.preparing.length}
            color="blue"
            orders={groupedOrders.preparing}
            getStatusColor={getOrderStatusColor}
            getActionButtons={getActionButtons}
            getClaimerBadge={getClaimerBadge}
          />
          
          <OrderColumn
            title="Ready"
            count={groupedOrders.ready.length}
            color="green"
            orders={groupedOrders.ready}
            getStatusColor={getOrderStatusColor}
            getActionButtons={getActionButtons}
            getClaimerBadge={getClaimerBadge}
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
  getStatusColor: (order: OrderWithItems) => string;
  getActionButtons: (order: OrderWithItems) => React.ReactNode;
  getClaimerBadge: (order: OrderWithItems) => React.ReactNode;
}

function OrderColumn({ title, count, color, orders, getStatusColor, getActionButtons, getClaimerBadge }: OrderColumnProps) {
  const colorClasses = {
    yellow: 'bg-yellow-500',
    blue: 'bg-blue-500',
    green: 'bg-green-500'
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <span className={`${colorClasses[color]} text-white px-2 py-1 rounded-full text-sm font-medium`}>
            {count}
          </span>
        </div>
      </div>
      
      <div className="p-4 space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto">
        {orders.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <ChatBubbleLeftRightIcon className="mx-auto h-12 w-12 text-gray-300 mb-3" />
            <p>No orders in this stage</p>
          </div>
        ) : (
          orders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              statusColor={getStatusColor(order)}
              actionButtons={getActionButtons(order)}
              claimerBadge={getClaimerBadge(order)}
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
  claimerBadge: React.ReactNode;
}

function OrderCard({ order, statusColor, actionButtons, claimerBadge }: OrderCardProps) {
  const age = getOrderAge(order.created_at);
  
  return (
    <div className={`rounded-lg border-2 p-4 ${statusColor}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-lg text-gray-900">
            Order #{order.order_number || order.id.slice(0, 8)}
          </h3>
          <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
            <div className="flex items-center gap-1">
              <ClockIcon className="h-4 w-4" />
              <span>{age} min ago</span>
            </div>
                         {order.restaurant_table?.table_number && (
               <div className="flex items-center gap-1">
                 <MapPinIcon className="h-4 w-4" />
                 <span>Table {order.restaurant_table.table_number}</span>
               </div>
             )}
          </div>
        </div>
        {claimerBadge}
      </div>
      
      <div className="space-y-2 mb-4">
                 {order.order_items?.map((item, index) => (
           <div key={index} className="flex justify-between text-sm">
             <span>{item.quantity}x {item.menu_item?.name || 'Unknown item'}</span>
             <span className="font-medium">{formatCurrency((item.menu_item?.price || 0) * item.quantity)}</span>
           </div>
         ))}
      </div>
      
      <div className="flex justify-between items-center pt-3 border-t border-gray-200">
        <span className="font-semibold text-lg">
          Total: {formatCurrency(order.total_amount)}
        </span>
      </div>
      
      <div className="mt-3">
        {actionButtons}
      </div>
    </div>
  );
}
import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useOrdersRealTime } from '../../hooks/useOrdersRealTime';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { formatCurrency, getOrderAge, getOrderAgeColor } from '../../lib/utils';
import type { OrderWithItems } from '../../types/database';
import {
  ClockIcon,
  MapPinIcon,
  UserIcon,
  PlayIcon,
  CheckCircleIcon,
  XCircleIcon,
  HandRaisedIcon,
  HandThumbUpIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  ArrowPathIcon,
  UsersIcon
} from '@heroicons/react/24/outline';

export function Kitchen() {
  const { restaurant, user } = useAuth();
  const { 
    orders, 
    loading, 
    error,
    currentSessionId,
    updateOrderStatus, 
    claimOrder, 
    releaseOrder,
    createSession,
    endSession,
    refetch 
  } = useOrdersRealTime();
  
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [userName, setUserName] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [lastOrderCount, setLastOrderCount] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');

  // Show join modal if no active session
  useEffect(() => {
    if (!currentSessionId && restaurant) {
      setShowJoinModal(true);
    }
  }, [currentSessionId, restaurant]);

  // Heartbeat to maintain session
  useEffect(() => {
    if (!currentSessionId) return;

    const heartbeat = setInterval(async () => {
      try {
        // Update last_seen timestamp using Supabase directly
        const { error } = await supabase
          .from('active_sessions')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', currentSessionId);
        
        if (error) throw error;
        setConnectionStatus('connected');
      } catch (error) {
        console.error('Heartbeat failed:', error);
        setConnectionStatus('disconnected');
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(heartbeat);
  }, [currentSessionId]);

  // Sound notification for new orders
  useEffect(() => {
    const pendingOrders = orders.filter(order => order.status === 'pending').length;
    if (pendingOrders > lastOrderCount && lastOrderCount > 0 && soundEnabled) {
      playNotificationSound();
    }
    setLastOrderCount(pendingOrders);
  }, [orders, lastOrderCount, soundEnabled]);

  // Cleanup session on unmount
  useEffect(() => {
    return () => {
      if (currentSessionId) {
        endSession();
      }
    };
  }, [currentSessionId, endSession]);

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

  const handleJoinKitchen = async () => {
    if (!userName.trim()) return;
    
    const sessionId = await createSession(userName.trim());
    if (sessionId) {
      setShowJoinModal(false);
      setConnectionStatus('connected');
    }
  };

  const handleClaimOrder = async (orderId: string) => {
    const success = await claimOrder(orderId);
    if (success) {
      playNotificationSound();
    }
  };

  const handleReleaseOrder = async (orderId: string) => {
    await releaseOrder(orderId);
  };

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    const success = await updateOrderStatus(orderId, newStatus);
    if (success && newStatus === 'ready') {
      playNotificationSound();
    }
  };

  const getOrderStatusColor = (order: OrderWithItems) => {
    const age = getOrderAge(order.created_at);
    
    // Old orders get red border
    if (age > 15) return 'border-red-400 bg-red-50';
    
    // Check if claimed by current user
    if (order.claimed_by === currentSessionId) {
      switch (order.status) {
        case 'preparing': return 'border-blue-400 bg-blue-50';
        case 'ready': return 'border-green-400 bg-green-50';
        default: return 'border-gray-300 bg-white';
      }
    }
    
    // Check if claimed by someone else
    if (order.claimed_by && order.claimed_by !== currentSessionId) {
      return 'border-orange-400 bg-orange-50';
    }
    
    // Unclaimed orders
    switch (order.status) {
      case 'pending': return 'border-yellow-400 bg-yellow-50';
      case 'ready': return 'border-green-400 bg-green-50';
      default: return 'border-gray-300 bg-white';
    }
  };

  const getActionButtons = (order: OrderWithItems) => {
    const isClaimedByMe = order.claimed_by === currentSessionId;
    const isClaimedByOther = order.claimed_by && order.claimed_by !== currentSessionId;
    
    switch (order.status) {
      case 'pending':
        if (!order.claimed_by) {
          return (
            <div className="flex space-x-2">
              <button
                onClick={() => handleClaimOrder(order.id)}
                className="btn-primary text-sm flex items-center"
                disabled={!currentSessionId}
              >
                <HandRaisedIcon className="h-4 w-4 mr-1" />
                Claim Order
              </button>
            </div>
          );
        } else if (isClaimedByMe) {
          return (
            <div className="flex space-x-2">
              <button
                onClick={() => handleStatusUpdate(order.id, 'preparing')}
                className="btn-success text-sm flex items-center"
              >
                <PlayIcon className="h-4 w-4 mr-1" />
                Start Preparing
              </button>
              <button
                onClick={() => handleReleaseOrder(order.id)}
                className="btn-secondary text-sm flex items-center"
              >
                <XCircleIcon className="h-4 w-4 mr-1" />
                Release
              </button>
            </div>
          );
        }
        break;
        
      case 'preparing':
        if (isClaimedByMe) {
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
                onClick={() => handleReleaseOrder(order.id)}
                className="btn-secondary text-sm flex items-center"
              >
                <XCircleIcon className="h-4 w-4 mr-1" />
                Release
              </button>
            </div>
          );
        }
        break;
        
      case 'ready':
        return (
          <button
            onClick={() => handleStatusUpdate(order.id, 'served')}
            className="btn-success text-sm flex items-center"
          >
            <HandThumbUpIcon className="h-4 w-4 mr-1" />
            Mark Served
          </button>
        );
    }
    
    return null;
  };

  const getClaimerInfo = (order: OrderWithItems) => {
    if (!order.claimed_by) return null;
    
    const claimerName = (order as any).claimed_session?.user_name || 'Unknown';
    const isMe = order.claimed_by === currentSessionId;
    
    return (
      <div className={`text-xs px-2 py-1 rounded ${isMe ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>
        {isMe ? 'Claimed by you' : `Claimed by ${claimerName}`}
      </div>
    );
  };

  // Filter and group orders
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
      {/* Join Kitchen Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold mb-4">Join Kitchen</h2>
            <p className="text-gray-600 mb-4">
              Enter your name to join the kitchen and start receiving orders.
            </p>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Your name..."
              className="w-full p-3 border border-gray-300 rounded-lg mb-4"
              onKeyPress={(e) => e.key === 'Enter' && handleJoinKitchen()}
            />
            <div className="flex space-x-3">
              <button
                onClick={handleJoinKitchen}
                disabled={!userName.trim()}
                className="flex-1 btn-primary"
              >
                Join Kitchen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900">Kitchen Dashboard</h1>
              
              {/* Connection Status */}
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-green-500' : 
                  connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
                }`} />
                <span className="text-sm text-gray-600">
                  {connectionStatus === 'connected' ? 'Connected' : 
                   connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Sound Toggle */}
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`p-2 rounded-lg ${soundEnabled ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}
              >
                {soundEnabled ? (
                  <SpeakerWaveIcon className="h-5 w-5" />
                ) : (
                  <SpeakerXMarkIcon className="h-5 w-5" />
                )}
              </button>

              {/* Refresh Button */}
              <button
                onClick={refetch}
                className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                <ArrowPathIcon className="h-5 w-5" />
              </button>

              {/* User Info */}
              {currentSessionId && (
                <div className="flex items-center space-x-2 bg-blue-50 px-3 py-2 rounded-lg">
                  <UserIcon className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">{userName}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Orders Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Pending Orders */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Pending Orders ({pendingOrders.length})
              </h2>
              <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
            </div>
            
            <div className="space-y-4">
              {pendingOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  statusColor={getOrderStatusColor(order)}
                  actionButtons={getActionButtons(order)}
                  claimerInfo={getClaimerInfo(order)}
                />
              ))}
              
              {pendingOrders.length === 0 && (
                <p className="text-gray-500 text-center py-8">No pending orders</p>
              )}
            </div>
          </div>

          {/* Preparing Orders */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Preparing ({preparingOrders.length})
              </h2>
              <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
            </div>
            
            <div className="space-y-4">
              {preparingOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  statusColor={getOrderStatusColor(order)}
                  actionButtons={getActionButtons(order)}
                  claimerInfo={getClaimerInfo(order)}
                />
              ))}
              
              {preparingOrders.length === 0 && (
                <p className="text-gray-500 text-center py-8">No orders being prepared</p>
              )}
            </div>
          </div>

          {/* Ready Orders */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Ready ({readyOrders.length})
              </h2>
              <div className="w-3 h-3 bg-green-400 rounded-full"></div>
            </div>
            
            <div className="space-y-4">
              {readyOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  statusColor={getOrderStatusColor(order)}
                  actionButtons={getActionButtons(order)}
                  claimerInfo={getClaimerInfo(order)}
                />
              ))}
              
              {readyOrders.length === 0 && (
                <p className="text-gray-500 text-center py-8">No ready orders</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Order Card Component
interface OrderCardProps {
  order: OrderWithItems;
  statusColor: string;
  actionButtons: React.ReactNode;
  claimerInfo: React.ReactNode;
}

function OrderCard({ order, statusColor, actionButtons, claimerInfo }: OrderCardProps) {
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
        
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <ClockIcon className="h-4 w-4" />
          <span className={getOrderAgeColor(orderAge)}>
            {orderAge}m ago
          </span>
        </div>
      </div>

      {/* Claimer Info */}
      {claimerInfo && (
        <div className="mb-3">
          {claimerInfo}
        </div>
      )}

      {/* Order Items */}
      <div className="space-y-2 mb-4">
        {order.order_items.map((item) => (
          <div key={item.id} className="flex justify-between items-center text-sm">
            <div>
              <span className="font-medium">{item.quantity}x</span>{' '}
              <span>{item.menu_item?.name || 'Unknown Item'}</span>
            </div>
            <span className="text-gray-500">
              {formatCurrency(item.price * item.quantity)}
            </span>
          </div>
        ))}
      </div>

      {/* Order Total */}
      <div className="flex justify-between items-center mb-4 pt-2 border-t border-gray-200">
        <span className="font-semibold">Total:</span>
        <span className="font-semibold">{formatCurrency(order.total_amount)}</span>
      </div>

      {/* Action Buttons */}
      {actionButtons && (
        <div className="mt-4">
          {actionButtons}
        </div>
      )}
    </div>
  );
}
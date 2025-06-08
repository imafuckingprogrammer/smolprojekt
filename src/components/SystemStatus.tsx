import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useUserRole } from '../contexts/UserRoleContext';
import { useStaffStore } from '../stores/staffStore';
import { useSessionStore } from '../stores/sessionStore';
import { supabase } from '../lib/supabase';
import { CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface SystemCheck {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: string[];
}

export const SystemStatus: React.FC = () => {
  const [checks, setChecks] = useState<SystemCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const { restaurant } = useAuth();
  const { currentRole, staffInfo } = useUserRole();
  const { staffMembers } = useStaffStore();
  const { currentSession } = useSessionStore();

  const runSystemChecks = async () => {
    const newChecks: SystemCheck[] = [];

    // 1. Authentication Check
    newChecks.push({
      name: 'Authentication System',
      status: restaurant ? 'pass' : 'fail',
      message: restaurant 
        ? `Authenticated as ${restaurant.name} (${restaurant.email})`
        : 'Not authenticated'
    });

    // 2. Role Context Check
    newChecks.push({
      name: 'Role Management',
      status: currentRole ? 'pass' : 'warning',
      message: currentRole 
        ? `Active role: ${currentRole}${staffInfo?.name ? ` (${staffInfo.name})` : ''}`
        : 'No active role selected',
      details: currentRole ? [
        `Role: ${currentRole}`,
        currentSession?.id ? `Session ID: ${currentSession.id.slice(0, 8)}...` : 'No session ID',
        staffInfo?.email ? `Email: ${staffInfo.email}` : 'No staff email'
      ] : undefined
    });

    // 3. Staff Store Check
    newChecks.push({
      name: 'Staff Management',
      status: 'pass',
      message: `Staff store loaded: ${staffMembers.length} staff members`,
      details: staffMembers.map((s: any) => `${s.email} - ${s.role} (${s.isActive ? 'active' : 'inactive'})`)
    });

    // 4. Session Store Check
    newChecks.push({
      name: 'Session Management',
      status: currentSession ? 'pass' : 'warning',
      message: currentSession 
        ? `Active session: ${currentSession.userName}`
        : 'No active session',
      details: currentSession ? [
        `Status: ${currentSession.status}`,
        `Device: ${currentSession.deviceId}`,
        `Claimed orders: ${currentSession.claimedOrderIds.length}`,
        `Last activity: ${currentSession.lastActivity.toLocaleString()}`
      ] : undefined
    });

    // 5. Database Connection Check
    try {
      const { data, error } = await supabase.from('restaurants').select('count').limit(1);
      newChecks.push({
        name: 'Database Connection',
        status: error ? 'fail' : 'pass',
        message: error ? `Database error: ${error.message}` : 'Database connection healthy'
      });
    } catch (err) {
      newChecks.push({
        name: 'Database Connection',
        status: 'fail',
        message: `Connection failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      });
    }

    // 6. Real-time Subscriptions Check
    if (restaurant) {
      try {
        // Test subscription by listening for changes
        const testChannel = supabase
          .channel(`system_test_${Date.now()}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurants' }, () => {})
          .subscribe((status) => {
            const subscriptionCheck: SystemCheck = {
              name: 'Real-time Subscriptions',
              status: status === 'SUBSCRIBED' ? 'pass' : 'fail',
              message: status === 'SUBSCRIBED' 
                ? 'Real-time subscriptions active'
                : `Subscription status: ${status}`
            };
            
            setChecks(prev => {
              const filtered = prev.filter(c => c.name !== 'Real-time Subscriptions');
              return [...filtered, subscriptionCheck];
            });

            // Clean up test channel
            setTimeout(() => supabase.removeChannel(testChannel), 1000);
          });
      } catch (err) {
        newChecks.push({
          name: 'Real-time Subscriptions',
          status: 'fail',
          message: `Subscription test failed: ${err instanceof Error ? err.message : 'Unknown error'}`
        });
      }
    }

    // 7. Orders System Check
    if (restaurant) {
      try {
        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .select('id, status, claimed_by')
          .eq('restaurant_id', restaurant.id)
          .limit(5);

        newChecks.push({
          name: 'Orders System',
          status: orderError ? 'fail' : 'pass',
          message: orderError 
            ? `Orders query failed: ${orderError.message}`
            : `Orders system operational (${orderData?.length || 0} recent orders)`,
          details: orderData?.map(o => `Order ${o.id.slice(0, 8)}: ${o.status}${o.claimed_by ? ' (claimed)' : ''}`)
        });
      } catch (err) {
        newChecks.push({
          name: 'Orders System',
          status: 'fail',
          message: `Orders check failed: ${err instanceof Error ? err.message : 'Unknown error'}`
        });
      }
    }

    // 8. Menu System Check
    if (restaurant) {
      try {
        const { data: menuData, error: menuError } = await supabase
          .from('menu_items')
          .select('id, name, is_available')
          .eq('restaurant_id', restaurant.id)
          .limit(5);

        newChecks.push({
          name: 'Menu System',
          status: menuError ? 'fail' : 'pass',
          message: menuError 
            ? `Menu query failed: ${menuError.message}`
            : `Menu system operational (${menuData?.length || 0} items)`,
          details: menuData?.map(m => `${m.name}: ${m.is_available ? 'available' : 'unavailable'}`)
        });
      } catch (err) {
        newChecks.push({
          name: 'Menu System',
          status: 'fail',
          message: `Menu check failed: ${err instanceof Error ? err.message : 'Unknown error'}`
        });
      }
    }

    setChecks(newChecks);
    setLoading(false);
  };

  useEffect(() => {
    runSystemChecks();
  }, [restaurant, currentRole, currentSession, staffMembers]);

  const getStatusIcon = (status: SystemCheck['status']) => {
    switch (status) {
      case 'pass':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'fail':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: SystemCheck['status']) => {
    switch (status) {
      case 'pass':
        return 'border-green-200 bg-green-50';
      case 'fail':
        return 'border-red-200 bg-red-50';
      case 'warning':
        return 'border-yellow-200 bg-yellow-50';
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const passCount = checks.filter(c => c.status === 'pass').length;
  const failCount = checks.filter(c => c.status === 'fail').length;
  const warningCount = checks.filter(c => c.status === 'warning').length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">System Status</h2>
        <div className="flex space-x-4 text-sm">
          <span className="flex items-center text-green-600">
            <CheckCircleIcon className="h-4 w-4 mr-1" />
            {passCount} Passing
          </span>
          {warningCount > 0 && (
            <span className="flex items-center text-yellow-600">
              <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
              {warningCount} Warnings
            </span>
          )}
          {failCount > 0 && (
            <span className="flex items-center text-red-600">
              <XCircleIcon className="h-4 w-4 mr-1" />
              {failCount} Failing
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {checks.map((check, index) => (
          <div
            key={index}
            className={`border rounded-lg p-4 ${getStatusColor(check.status)}`}
          >
            <div className="flex items-start">
              <div className="flex-shrink-0 mt-0.5">
                {getStatusIcon(check.status)}
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-gray-900">
                  {check.name}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {check.message}
                </p>
                {check.details && check.details.length > 0 && (
                  <ul className="mt-2 text-xs text-gray-500 space-y-1">
                    {check.details.map((detail, detailIndex) => (
                      <li key={detailIndex} className="flex items-center">
                        <span className="w-1 h-1 bg-gray-400 rounded-full mr-2"></span>
                        {detail}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-center">
        <button
          onClick={() => {
            setLoading(true);
            runSystemChecks();
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Refresh Status
        </button>
      </div>
    </div>
  );
}; 
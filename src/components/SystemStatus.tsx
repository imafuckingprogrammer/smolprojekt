import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useUserRole } from '../contexts/UserRoleContext';
import { useStaffStore } from '../stores/staffStore';
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

    // 4. Database Connection Check
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

    // 5. Real-time Subscriptions Check
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

    // 6. Orders System Check
    if (restaurant) {
      try {
        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .select('id, status')
          .eq('restaurant_id', restaurant.id)
          .limit(5);

        newChecks.push({
          name: 'Orders System',
          status: orderError ? 'fail' : 'pass',
          message: orderError 
            ? `Orders query failed: ${orderError.message}`
            : `Orders system operational (${orderData?.length || 0} recent orders)`,
          details: orderData?.map(o => `Order ${o.id.slice(0, 8)}: ${o.status}`)
        });
      } catch (err) {
        newChecks.push({
          name: 'Orders System',
          status: 'fail',
          message: `Orders check failed: ${err instanceof Error ? err.message : 'Unknown error'}`
        });
      }
    }

    // 7. Menu System Check
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
  }, [restaurant, currentRole, staffMembers]);

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

  const overallStatus = checks.length === 0 ? 'warning' : 
    checks.some(c => c.status === 'fail') ? 'fail' :
    checks.some(c => c.status === 'warning') ? 'warning' : 'pass';

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">System Status</h3>
        <div className="animate-pulse space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-medium text-gray-900">System Status</h3>
        <div className="flex items-center gap-2">
          {getStatusIcon(overallStatus)}
          <span className={`text-sm font-medium ${
            overallStatus === 'pass' ? 'text-green-700' :
            overallStatus === 'fail' ? 'text-red-700' : 'text-yellow-700'
          }`}>
            {overallStatus === 'pass' ? 'All Systems Operational' :
             overallStatus === 'fail' ? 'System Issues Detected' : 'Warning Conditions'}
          </span>
        </div>
        <button
          onClick={runSystemChecks}
          className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-4">
        {checks.map((check, index) => (
          <div key={index} className={`border rounded-lg p-4 ${getStatusColor(check.status)}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(check.status)}
                <div>
                  <h4 className="font-medium text-gray-900">{check.name}</h4>
                  <p className="text-sm text-gray-600">{check.message}</p>
                </div>
              </div>
            </div>
            
            {check.details && check.details.length > 0 && (
              <div className="mt-3 pl-8">
                <details className="group">
                  <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                    View details ({check.details.length} items)
                  </summary>
                  <div className="mt-2 space-y-1">
                    {check.details.map((detail, detailIndex) => (
                      <div key={detailIndex} className="text-xs text-gray-600 font-mono bg-white bg-opacity-50 p-2 rounded">
                        {detail}
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-500">
        Last updated: {new Date().toLocaleString()}
      </div>
    </div>
  );
}; 
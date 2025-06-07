import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  FireIcon,
  BeakerIcon,
  CakeIcon,
  CubeIcon,
  UserGroupIcon,
  ClockIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import { useMultiUserRealtime } from '../../hooks/useMultiUserRealtime';
import { useOrders } from '../../hooks/useOrders';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

const STATION_ICONS = {
  hot_food: FireIcon,
  cold_food: BeakerIcon,
  drinks: BeakerIcon,
  desserts: CakeIcon,
  all: CubeIcon
};

const STATION_COLORS = {
  hot_food: 'bg-red-50 border-red-200 text-red-800',
  cold_food: 'bg-blue-50 border-blue-200 text-blue-800',
  drinks: 'bg-green-50 border-green-200 text-green-800',
  desserts: 'bg-purple-50 border-purple-200 text-purple-800',
  all: 'bg-gray-50 border-gray-200 text-gray-800'
};

export function KitchenStations() {
  const { stations, activeSessions, isConnected } = useMultiUserRealtime();
  const { orders, loading } = useOrders();
  const [showCreateStation, setShowCreateStation] = useState(false);

  const getStationStats = (stationId: string, stationType: string) => {
    let stationOrders;
    
    if (stationType === 'all') {
      stationOrders = orders;
    } else {
      stationOrders = orders.filter(order => 
        order.assigned_station_id === stationId ||
        (!order.assigned_station_id && order.order_items.some(item => 
          item.menu_item?.preferred_station_id === stationId
        ))
      );
    }

    const activeOrders = stationOrders.filter(order => 
      ['pending', 'preparing', 'ready'].includes(order.status)
    );

    const activeStaff = activeSessions.filter(session => 
      session.station_id === stationId && session.status === 'active'
    );

    const avgWaitTime = activeOrders.length > 0 
      ? Math.round(activeOrders.reduce((sum, order) => 
          sum + (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60), 0
        ) / activeOrders.length)
      : 0;

    return {
      activeOrders: activeOrders.length,
      pendingOrders: activeOrders.filter(o => o.status === 'pending').length,
      preparingOrders: activeOrders.filter(o => o.status === 'preparing').length,
      readyOrders: activeOrders.filter(o => o.status === 'ready').length,
      activeStaff: activeStaff.length,
      avgWaitTime,
      urgentOrders: activeOrders.filter(o => (o.priority || 5) >= 8).length
    };
  };

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
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Kitchen Stations</h1>
              <p className="mt-2 text-gray-600">
                Select a station to start working on orders
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Connection Status */}
              <div className="flex items-center space-x-2">
                <div className={`h-3 w-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm text-gray-600">
                  {isConnected ? 'Real-time Connected' : 'Disconnected'}
                </span>
              </div>
              
              {/* Total Active Staff */}
              <div className="flex items-center space-x-2 bg-blue-50 px-3 py-2 rounded-lg">
                <UserGroupIcon className="h-5 w-5 text-blue-600" />
                <span className="text-sm font-medium text-blue-800">
                  {activeSessions.filter(s => s.status === 'active').length} Staff Online
                </span>
              </div>
              
              <Link to="/dashboard" className="btn-secondary">
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Stations Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stations.map((station) => {
            const stats = getStationStats(station.id, station.station_type);
            const Icon = STATION_ICONS[station.station_type] || CubeIcon;
            const colorClass = STATION_COLORS[station.station_type] || STATION_COLORS.all;
            
            return (
              <Link
                key={station.id}
                to={`/kitchen/station/${station.id}`}
                className="block transform hover:scale-105 transition-all duration-200"
              >
                <div className={`card border-2 hover:shadow-lg ${colorClass}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 rounded-lg bg-white">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">{station.station_name}</h3>
                        <p className="text-sm opacity-75">
                          {station.station_type.replace('_', ' ').toUpperCase()}
                        </p>
                      </div>
                    </div>
                    
                    {stats.urgentOrders > 0 && (
                      <div className="flex items-center space-x-1 bg-red-100 text-red-800 px-2 py-1 rounded-full">
                        <span className="text-xs font-medium">URGENT</span>
                        <span className="text-xs">{stats.urgentOrders}</span>
                      </div>
                    )}
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-white rounded-lg p-3">
                      <div className="text-2xl font-bold text-gray-900">{stats.activeOrders}</div>
                      <div className="text-xs text-gray-600">Active Orders</div>
                    </div>
                    
                    <div className="bg-white rounded-lg p-3">
                      <div className="text-2xl font-bold text-gray-900">{stats.activeStaff}</div>
                      <div className="text-xs text-gray-600">Staff Online</div>
                    </div>
                  </div>

                  {/* Order Breakdown */}
                  <div className="flex justify-between text-sm mb-4">
                    <div className="text-center">
                      <div className="font-semibold text-yellow-700">{stats.pendingOrders}</div>
                      <div className="text-xs text-gray-600">Pending</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-blue-700">{stats.preparingOrders}</div>
                      <div className="text-xs text-gray-600">Preparing</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-green-700">{stats.readyOrders}</div>
                      <div className="text-xs text-gray-600">Ready</div>
                    </div>
                  </div>

                  {/* Average Wait Time */}
                  {stats.avgWaitTime > 0 && (
                    <div className="flex items-center justify-center space-x-2 bg-white rounded-lg p-2">
                      <ClockIcon className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-700">
                        Avg wait: {stats.avgWaitTime}min
                      </span>
                    </div>
                  )}

                  {/* Active Staff List */}
                  {stats.activeStaff > 0 && (
                    <div className="mt-3 pt-3 border-t border-white">
                      <div className="text-xs text-gray-600 mb-1">Active Staff:</div>
                      <div className="flex flex-wrap gap-1">
                        {activeSessions
                          .filter(session => session.station_id === station.id && session.status === 'active')
                          .slice(0, 3)
                          .map((session) => (
                            <span
                              key={session.id}
                              className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-white text-gray-800"
                            >
                              {session.user_name}
                            </span>
                          ))}
                        {stats.activeStaff > 3 && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-white text-gray-800">
                            +{stats.activeStaff - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}

          {/* Create New Station Card */}
          <button
            onClick={() => setShowCreateStation(true)}
            className="card border-2 border-dashed border-gray-300 hover:border-gray-400 transition-colors bg-white hover:bg-gray-50 flex flex-col items-center justify-center text-gray-500 hover:text-gray-700 min-h-[300px]"
          >
            <PlusIcon className="h-12 w-12 mb-4" />
            <span className="text-lg font-medium">Add New Station</span>
            <span className="text-sm">Create a specialized kitchen station</span>
          </button>
        </div>

        {/* Quick Stats Summary */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Kitchen Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900">
                {orders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status)).length}
              </div>
              <div className="text-sm text-gray-600">Total Active Orders</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-600">
                {orders.filter(o => o.status === 'pending').length}
              </div>
              <div className="text-sm text-gray-600">Waiting for Kitchen</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">
                {orders.filter(o => o.status === 'preparing').length}
              </div>
              <div className="text-sm text-gray-600">In Preparation</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {orders.filter(o => o.status === 'ready').length}
              </div>
              <div className="text-sm text-gray-600">Ready for Service</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
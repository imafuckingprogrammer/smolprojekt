import { useEffect, useState, memo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useInitialSetup } from '../../hooks/useInitialSetup';

import { supabase } from '../../lib/supabase';
import { DashboardSkeleton } from '../ui/SkeletonLoader';
import { formatCurrency } from '../../lib/utils';
import {
  ChartBarIcon,
  ClipboardDocumentListIcon,
  CubeIcon,
  QrCodeIcon,
  UsersIcon,
  PlusIcon,
  TrashIcon,
  FireIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';

interface DashboardStats {
  totalOrders: number;
  todayOrders: number;
  totalRevenue: number;
  todayRevenue: number;
  activeMenuItems: number;
  totalTables: number;
  pendingOrders: number;
}

export const DashboardHome = memo(function DashboardHome() {
  const { restaurant } = useAuth();
  useInitialSetup(); // Set up initial kitchen stations
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [newStationName, setNewStationName] = useState('');
  const [newStationType, setNewStationType] = useState('hot_food');
  const [isCreatingStation, setIsCreatingStation] = useState(false);
  const [showStationForm, setShowStationForm] = useState(false);

  useEffect(() => {
    if (restaurant) {
      // Check if we have cached data first
      const cacheKey = `dashboard_${restaurant.id}`;
      const cached = localStorage.getItem(cacheKey);
      
      if (cached) {
        try {
          const parsedCache = JSON.parse(cached);
          if (Date.now() - parsedCache.timestamp < 2 * 60 * 1000) { // 2 minute cache
            setStats(parsedCache.stats);
            setRecentOrders(parsedCache.recentOrders);
            setLoading(false);
            
            // Fetch fresh data in background
            fetchDashboardData(true);
            return;
          }
        } catch (error) {
          console.warn('Failed to parse dashboard cache:', error);
        }
      }
      
      fetchDashboardData();
      fetchStations();
      fetchActiveSessions();
    }
  }, [restaurant]);

  const fetchDashboardData = useCallback(async (isBackgroundUpdate = false) => {
    if (!restaurant) return;

    try {
      if (!isBackgroundUpdate) {
        setLoading(true);
      }

      // Get today's date boundaries
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Fetch all data in parallel for better performance
      const [
        { data: orders },
        { count: menuItemsCount },
        { count: tablesCount },
        { data: recentOrdersData }
      ] = await Promise.all([
        supabase
          .from('orders')
          .select('*, created_at, total_amount, status')
          .eq('restaurant_id', restaurant.id)
          .order('created_at', { ascending: false })
          .limit(100), // Limit to last 100 orders for performance
        supabase
          .from('menu_items')
          .select('*', { count: 'exact', head: true })
          .eq('restaurant_id', restaurant.id)
          .eq('is_available', true),
        supabase
          .from('restaurant_tables')
          .select('*', { count: 'exact', head: true })
          .eq('restaurant_id', restaurant.id)
          .eq('is_active', true),
        supabase
          .from('orders')
          .select(`
            *,
            restaurant_table:restaurant_tables(table_number)
          `)
          .eq('restaurant_id', restaurant.id)
          .order('created_at', { ascending: false })
          .limit(5)
      ]);

      if (orders) {
        const todayOrders = orders.filter(order => 
          new Date(order.created_at) >= today && new Date(order.created_at) < tomorrow
        );

        const newStats: DashboardStats = {
          totalOrders: orders.length,
          todayOrders: todayOrders.length,
          totalRevenue: orders.reduce((sum, order) => sum + order.total_amount, 0),
          todayRevenue: todayOrders.reduce((sum, order) => sum + order.total_amount, 0),
          activeMenuItems: menuItemsCount || 0,
          totalTables: tablesCount || 0,
          pendingOrders: orders.filter(order => 
            order.status === 'pending' || order.status === 'preparing'
          ).length,
        };

        setStats(newStats);
        setRecentOrders(recentOrdersData || []);

        // Cache the data
        const cacheKey = `dashboard_${restaurant.id}`;
        try {
          localStorage.setItem(cacheKey, JSON.stringify({
            stats: newStats,
            recentOrders: recentOrdersData || [],
            timestamp: Date.now()
          }));
        } catch (error) {
          console.warn('Failed to cache dashboard data:', error);
        }
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [restaurant]);

  const fetchStations = async () => {
    if (!restaurant) return;
    
    try {
      const { data, error } = await supabase
        .from('kitchen_stations')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('is_active', true)
        .order('position_order');
      
      if (error) throw error;
      setStations(data || []);
    } catch (error) {
      console.error('Error fetching stations:', error);
    }
  };

  const fetchActiveSessions = async () => {
    if (!restaurant) return;
    
    try {
      const { data, error } = await supabase
        .from('work_sessions')
        .select(`
          *,
          station:kitchen_stations(station_name),
          staff:restaurant_staff(
            user:users(first_name, last_name)
          )
        `)
        .eq('restaurant_id', restaurant.id)
        .eq('status', 'active')
        .order('started_at', { ascending: false });
      
      if (error) throw error;
      
      // Transform data to match expected format
      const transformedData = data?.map(session => ({
        id: session.id,
        user_name: `${session.staff?.user?.first_name || 'Unknown'} ${session.staff?.user?.last_name || 'User'}`.trim(),
        station: session.station,
        status: session.status
      })) || [];
      
      setActiveSessions(transformedData);
    } catch (error) {
      console.error('Error fetching work sessions:', error);
    }
  };

  const createStation = async () => {
    if (!restaurant || !newStationName.trim()) return;
    
    setIsCreatingStation(true);
    try {
      const { error } = await supabase
        .from('kitchen_stations')
        .insert({
          restaurant_id: restaurant.id,
          station_name: newStationName.trim(),
          station_type: newStationType,
          is_active: true,
          position_order: stations.length
        });
      
      if (error) throw error;
      
      setNewStationName('');
      setShowStationForm(false);
      await fetchStations();
    } catch (error) {
      console.error('Error creating station:', error);
    } finally {
      setIsCreatingStation(false);
    }
  };

  const deleteStation = async (stationId: string) => {
    if (!confirm('Are you sure you want to delete this station?')) return;
    
    try {
      const { error } = await supabase
        .from('kitchen_stations')
        .update({ is_active: false })
        .eq('id', stationId);
      
      if (error) throw error;
      await fetchStations();
    } catch (error) {
      console.error('Error deleting station:', error);
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back!</h1>
        <p className="mt-1 text-sm text-gray-600">
          Here's what's happening with {restaurant?.name} today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ClipboardDocumentListIcon className="h-6 w-6 text-primary-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Today's Orders</dt>
                <dd className="text-lg font-medium text-gray-900">{stats?.todayOrders || 0}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ChartBarIcon className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Today's Revenue</dt>
                <dd className="text-lg font-medium text-gray-900">
                  {formatCurrency(stats?.todayRevenue || 0)}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <UsersIcon className="h-6 w-6 text-yellow-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Pending Orders</dt>
                <dd className="text-lg font-medium text-gray-900">{stats?.pendingOrders || 0}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <QrCodeIcon className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Active Tables</dt>
                <dd className="text-lg font-medium text-gray-900">{stats?.totalTables || 0}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <Link
              to="/dashboard/orders"
              className="flex items-center p-3 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
            >
              <ClipboardDocumentListIcon className="h-5 w-5 text-primary-600 mr-3" />
              <span className="text-sm font-medium text-primary-900">View All Orders</span>
            </Link>
            <Link
              to="/dashboard/menu"
              className="flex items-center p-3 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
            >
              <CubeIcon className="h-5 w-5 text-green-600 mr-3" />
              <span className="text-sm font-medium text-green-900">Manage Menu</span>
            </Link>
            <Link
              to="/dashboard/tables"
              className="flex items-center p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <QrCodeIcon className="h-5 w-5 text-blue-600 mr-3" />
              <span className="text-sm font-medium text-blue-900">Manage Tables & QR Codes</span>
            </Link>
            <Link
              to="/kitchen"
              className="flex items-center p-3 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors"
            >
              <UsersIcon className="h-5 w-5 text-orange-600 mr-3" />
              <span className="text-sm font-medium text-orange-900">Kitchen Display</span>
            </Link>
            <Link
              to="/dashboard/staff"
              className="flex items-center p-3 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
            >
              <Cog6ToothIcon className="h-5 w-5 text-purple-600 mr-3" />
              <span className="text-sm font-medium text-purple-900">Staff Management</span>
            </Link>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Orders</h3>
          {recentOrders.length > 0 ? (
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Order #{order.order_number}
                    </p>
                    <p className="text-xs text-gray-500">
                      Table {order.restaurant_table?.table_number} • {formatCurrency(order.total_amount)}
                    </p>
                  </div>
                  <span className={`badge badge-${order.status}`}>
                    {order.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No orders yet today.</p>
          )}
        </div>
      </div>

      {/* Overview Stats */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Total Orders</h3>
          <p className="text-3xl font-bold text-primary-600">{stats?.totalOrders || 0}</p>
          <p className="text-sm text-gray-500">All time</p>
        </div>

        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Total Revenue</h3>
          <p className="text-3xl font-bold text-green-600">
            {formatCurrency(stats?.totalRevenue || 0)}
          </p>
          <p className="text-sm text-gray-500">All time</p>
        </div>

        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Menu Items</h3>
          <p className="text-3xl font-bold text-blue-600">{stats?.activeMenuItems || 0}</p>
          <p className="text-sm text-gray-500">Currently available</p>
        </div>
      </div>

      {/* Kitchen Management Section */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Kitchen Stations */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <FireIcon className="h-5 w-5 text-orange-500 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Kitchen Stations</h2>
            </div>
            <button
              onClick={() => setShowStationForm(!showStationForm)}
              className="btn-primary text-sm flex items-center"
            >
              <PlusIcon className="h-4 w-4 mr-1" />
              Add Station
            </button>
          </div>
          
          {showStationForm && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <div className="space-y-3">
                <input
                  type="text"
                  value={newStationName}
                  onChange={(e) => setNewStationName(e.target.value)}
                  placeholder="Station name (e.g., Grill Station)"
                  className="w-full p-2 border border-gray-300 rounded-lg"
                />
                <select
                  value={newStationType}
                  onChange={(e) => setNewStationType(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                >
                  <option value="hot_food">Hot Food</option>
                  <option value="cold_food">Cold Food</option>
                  <option value="drinks">Drinks</option>
                  <option value="desserts">Desserts</option>
                  <option value="all">All Items</option>
                </select>
                <div className="flex space-x-2">
                  <button
                    onClick={createStation}
                    disabled={!newStationName.trim() || isCreatingStation}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    {isCreatingStation ? 'Creating...' : 'Create Station'}
                  </button>
                  <button
                    onClick={() => setShowStationForm(false)}
                    className="btn-secondary text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
          
          <div className="space-y-3">
            {stations.length === 0 ? (
              <p className="text-gray-500 text-sm">No stations created yet</p>
            ) : (
              stations.map((station) => (
                <div key={station.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <h3 className="font-medium text-gray-900">{station.station_name}</h3>
                    <p className="text-sm text-gray-600 capitalize">{station.station_type.replace('_', ' ')}</p>
                  </div>
                  <button
                    onClick={() => deleteStation(station.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete station"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Active Kitchen Staff */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <UsersIcon className="h-5 w-5 text-blue-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Active Kitchen Staff</h2>
          </div>
          
          <div className="space-y-3">
            {activeSessions.length === 0 ? (
              <p className="text-gray-500 text-sm">No active kitchen staff</p>
            ) : (
              activeSessions.map((session) => (
                <div key={session.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div>
                    <h3 className="font-medium text-gray-900">{session.user_name}</h3>
                    <p className="text-sm text-gray-600">
                      {session.station?.station_name || 'No station assigned'}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-xs text-gray-500">Active</span>
                  </div>
                </div>
              ))
            )}
          </div>
          
          {activeSessions.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                {activeSessions.length} staff member{activeSessions.length !== 1 ? 's' : ''} currently in kitchen
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
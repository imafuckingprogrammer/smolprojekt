import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatCurrency } from '../../lib/utils';
import {
  ChartBarIcon,
  ClipboardDocumentListIcon,
  CubeIcon,
  QrCodeIcon,
  UsersIcon
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

export function DashboardHome() {
  const { restaurant } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);

  useEffect(() => {
    if (restaurant) {
      fetchDashboardData();
    }
  }, [restaurant]);

  const fetchDashboardData = async () => {
    if (!restaurant) return;

    try {
      setLoading(true);

      // Get today's date boundaries
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Fetch all orders
      const { data: orders } = await supabase
        .from('orders')
        .select('*, created_at, total_amount, status')
        .eq('restaurant_id', restaurant.id);

      // Fetch menu items count
      const { count: menuItemsCount } = await supabase
        .from('menu_items')
        .select('*', { count: 'exact', head: true })
        .eq('restaurant_id', restaurant.id)
        .eq('is_available', true);

      // Fetch tables count
      const { count: tablesCount } = await supabase
        .from('restaurant_tables')
        .select('*', { count: 'exact', head: true })
        .eq('restaurant_id', restaurant.id)
        .eq('is_active', true);

      // Fetch recent orders with table info
      const { data: recentOrdersData } = await supabase
        .from('orders')
        .select(`
          *,
          restaurant_table:restaurant_tables(table_number)
        `)
        .eq('restaurant_id', restaurant.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (orders) {
        const todayOrders = orders.filter(order => 
          new Date(order.created_at) >= today && new Date(order.created_at) < tomorrow
        );

        const stats: DashboardStats = {
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

        setStats(stats);
        setRecentOrders(recentOrdersData || []);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
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
    </div>
  );
} 
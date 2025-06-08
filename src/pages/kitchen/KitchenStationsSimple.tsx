
import { Link } from 'react-router-dom';
import { 
  FireIcon,
  BeakerIcon,
  CakeIcon,
  CubeIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';
import { useOrders } from '../../hooks/useOrders';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

const mockStations = [
  {
    id: 'station1',
    name: 'Main Kitchen',
    type: 'all',
    icon: CubeIcon,
    color: 'bg-gray-50 border-gray-200 text-gray-800'
  },
  {
    id: 'station2', 
    name: 'Hot Food Station',
    type: 'hot_food',
    icon: FireIcon,
    color: 'bg-red-50 border-red-200 text-red-800'
  },
  {
    id: 'station3',
    name: 'Cold Food & Salads', 
    type: 'cold_food',
    icon: BeakerIcon,
    color: 'bg-blue-50 border-blue-200 text-blue-800'
  },
  {
    id: 'station4',
    name: 'Drinks & Beverages',
    type: 'drinks', 
    icon: BeakerIcon,
    color: 'bg-green-50 border-green-200 text-green-800'
  }
];

export function KitchenStationsSimple() {
  const { orders, loading } = useOrders();

  const getStationStats = (stationType: string) => {
    const activeOrders = orders.filter(order => 
      ['pending', 'preparing', 'ready'].includes(order.status)
    );

    return {
      activeOrders: activeOrders.length,
      pendingOrders: activeOrders.filter(o => o.status === 'pending').length,
      preparingOrders: activeOrders.filter(o => o.status === 'preparing').length,
      readyOrders: activeOrders.filter(o => o.status === 'ready').length,
      urgentOrders: 0 // Will implement priority later
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
              {/* Real-time Status */}
              <div className="flex items-center space-x-2">
                <div className="h-3 w-3 rounded-full bg-green-500" />
                <span className="text-sm text-gray-600">Real-time Connected</span>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {mockStations.map((station) => {
            const stats = getStationStats(station.type);
            const Icon = station.icon;
            
            return (
              <Link
                key={station.id}
                to={`/kitchen/legacy`} // Use legacy kitchen for now
                className="block transform hover:scale-105 transition-all duration-200"
              >
                <div className={`card border-2 hover:shadow-lg ${station.color}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 rounded-lg bg-white">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">{station.name}</h3>
                        <p className="text-sm opacity-75">
                          {station.type.replace('_', ' ').toUpperCase()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-white rounded-lg p-3">
                      <div className="text-2xl font-bold text-gray-900">{stats.activeOrders}</div>
                      <div className="text-xs text-gray-600">Active Orders</div>
                    </div>
                    
                    <div className="bg-white rounded-lg p-3">
                      <div className="text-2xl font-bold text-gray-900">1</div>
                      <div className="text-xs text-gray-600">Staff Online</div>
                    </div>
                  </div>

                  {/* Order Breakdown */}
                  <div className="flex justify-between text-sm">
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
                </div>
              </Link>
            );
          })}
        </div>

        {/* Kitchen Overview */}
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
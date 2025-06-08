import { useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { MenuManagement } from '../../components/dashboard/MenuManagement';
import { TableManagement } from '../../components/dashboard/TableManagement';
import { OrderManagement } from '../../components/dashboard/OrderManagement';
import { StaffManagement } from '../../components/dashboard/StaffManagement';
import { DashboardHome } from '../../components/dashboard/DashboardHome';
import { 
  HomeIcon, 
  ClipboardDocumentListIcon, 
  QrCodeIcon, 
  CubeIcon,
  FireIcon,
  Bars3Icon,
  XMarkIcon,
  ArrowRightOnRectangleIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Orders', href: '/dashboard/orders', icon: ClipboardDocumentListIcon },
  { name: 'Menu', href: '/dashboard/menu', icon: CubeIcon },
  { name: 'Tables', href: '/dashboard/tables', icon: QrCodeIcon },
  { name: 'Staff', href: '/dashboard/staff', icon: Cog6ToothIcon },
  { name: 'Kitchen', href: '/kitchen', icon: FireIcon },
];

export function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { restaurant, signOut } = useAuth();
  const location = useLocation();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 flex z-40 md:hidden ${sidebarOpen ? '' : 'pointer-events-none'}`}>
        <div className={`fixed inset-0 bg-gray-600 bg-opacity-75 transition-opacity ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setSidebarOpen(false)} />
        <div className={`relative flex-1 flex flex-col max-w-xs w-full bg-white transform transition ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="absolute top-0 right-0 -mr-12 pt-2">
            <button
              type="button"
              className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
              onClick={() => setSidebarOpen(false)}
            >
              <XMarkIcon className="h-6 w-6 text-white" />
            </button>
          </div>
          <SidebarContent navigation={navigation} location={location} restaurant={restaurant} onSignOut={handleSignOut} />
        </div>
        <div className="flex-shrink-0 w-14" />
      </div>

      {/* Static sidebar for desktop */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
        <div className="flex-1 flex flex-col min-h-0 border-r border-gray-200 bg-white">
          <SidebarContent navigation={navigation} location={location} restaurant={restaurant} onSignOut={handleSignOut} />
        </div>
      </div>

      {/* Main content */}
      <div className="md:pl-64 flex flex-col flex-1">
        <div className="sticky top-0 z-10 md:hidden pl-1 pt-1 sm:pl-3 sm:pt-3 bg-gray-50">
          <button
            type="button"
            className="-ml-0.5 -mt-0.5 h-12 w-12 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
            onClick={() => setSidebarOpen(true)}
          >
            <Bars3Icon className="h-6 w-6" />
          </button>
        </div>

        <main className="flex-1">
          <Routes>
            <Route path="/" element={<DashboardHome />} />
            <Route path="/orders" element={<OrderManagement />} />
            <Route path="/menu" element={<MenuManagement />} />
            <Route path="/tables" element={<TableManagement />} />
            <Route path="/staff" element={<StaffManagement restaurantId={restaurant?.id || ''} />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function SidebarContent({ navigation, location, restaurant, onSignOut }: {
  navigation: any[];
  location: any;
  restaurant: any;
  onSignOut: () => void;
}) {
  return (
    <>
      <div className="flex items-center h-16 flex-shrink-0 px-4 bg-primary-600">
        <h1 className="text-white text-xl font-bold">TableDirect</h1>
      </div>
      <div className="flex-1 flex flex-col overflow-y-auto">
        <div className="px-4 py-4 border-b border-gray-200">
          <p className="text-sm font-medium text-gray-900">{restaurant?.name}</p>
          <p className="text-sm text-gray-500">{restaurant?.email}</p>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href || 
              (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
            
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? 'bg-primary-100 text-primary-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex-shrink-0 p-4 border-t border-gray-200">
        <button
          onClick={onSignOut}
          className="group flex items-center w-full px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <ArrowRightOnRectangleIcon className="mr-3 h-5 w-5 flex-shrink-0" />
          Sign out
        </button>
      </div>
    </>
  );
} 
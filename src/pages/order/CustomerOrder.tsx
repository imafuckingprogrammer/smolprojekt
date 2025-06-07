import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { parseQRToken } from '../../lib/qr-generator';
import { useOrders } from '../../hooks/useOrders';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { formatCurrency } from '../../lib/utils';
import type { MenuCategory, MenuItem, RestaurantTable, Restaurant, CartItem } from '../../types/database';
import {
  PlusIcon,
  MinusIcon,
  ShoppingCartIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

// Cache for menu data to avoid repeated fetches
const menuDataCache = new Map<string, {
  restaurant: Restaurant;
  table: RestaurantTable;
  categories: MenuCategory[];
  menuItems: MenuItem[];
  timestamp: number;
}>();

export function CustomerOrder() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { createOrder } = useOrders();
  
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [table, setTable] = useState<RestaurantTable | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [showCart, setShowCart] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      loadMenuData();
    }
  }, [token]);

  const loadMenuData = async () => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);

      // Check cache first (5 minute TTL)
      const cached = menuDataCache.get(token);
      if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
        setRestaurant(cached.restaurant);
        setTable(cached.table);
        setCategories(cached.categories);
        setMenuItems(cached.menuItems);
        if (cached.categories.length > 0) {
          setSelectedCategory(cached.categories[0].id);
        }
        setLoading(false);
        return;
      }

      // Parse QR token
      const qrData = parseQRToken(token);
      if (!qrData) {
        setError('Invalid QR code. Please scan a valid table QR code.');
        return;
      }

      // Fetch all data in parallel for better performance
      const [
        { data: tableData, error: tableError },
        { data: restaurantData, error: restaurantError }
      ] = await Promise.all([
        supabase
          .from('restaurant_tables')
          .select('*')
          .eq('qr_token', token)
          .eq('is_active', true)
          .single(),
        supabase
          .from('restaurants')
          .select('*')
          .eq('id', qrData.restaurant_id)
          .single()
      ]);

      if (tableError || !tableData) {
        setError('Table not found or is currently inactive.');
        return;
      }

      if (restaurantError || !restaurantData) {
        setError('Restaurant not found.');
        return;
      }

      // Fetch menu data in parallel
      const [
        { data: categoriesData, error: categoriesError },
        { data: itemsData, error: itemsError }
      ] = await Promise.all([
        supabase
          .from('menu_categories')
          .select('*')
          .eq('restaurant_id', restaurantData.id)
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('menu_items')
          .select('*')
          .eq('restaurant_id', restaurantData.id)
          .eq('is_available', true)
          .order('sort_order', { ascending: true })
      ]);

      if (categoriesError) {
        setError('Failed to load menu categories.');
        return;
      }

      if (itemsError) {
        setError('Failed to load menu items.');
        return;
      }

      const finalRestaurant = restaurantData;
      const finalTable = tableData;
      const finalCategories = categoriesData || [];
      const finalMenuItems = itemsData || [];

      // Cache the data
      menuDataCache.set(token, {
        restaurant: finalRestaurant,
        table: finalTable,
        categories: finalCategories,
        menuItems: finalMenuItems,
        timestamp: Date.now()
      });

      setRestaurant(finalRestaurant);
      setTable(finalTable);
      setCategories(finalCategories);
      setMenuItems(finalMenuItems);
      
      // Set first category as selected
      if (finalCategories.length > 0) {
        setSelectedCategory(finalCategories[0].id);
      }
    } catch (error) {
      console.error('Error loading menu data:', error);
      setError('Failed to load menu. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (menuItem: MenuItem) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.menu_item.id === menuItem.id);
      if (existingItem) {
        return prevCart.map(item =>
          item.menu_item.id === menuItem.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      } else {
        return [...prevCart, { menu_item: menuItem, quantity: 1 }];
      }
    });
  };

  const removeFromCart = (menuItemId: string) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.menu_item.id === menuItemId);
      if (existingItem && existingItem.quantity > 1) {
        return prevCart.map(item =>
          item.menu_item.id === menuItemId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        );
      } else {
        return prevCart.filter(item => item.menu_item.id !== menuItemId);
      }
    });
  };

  const getCartItemQuantity = (menuItemId: string) => {
    const item = cart.find(item => item.menu_item.id === menuItemId);
    return item ? item.quantity : 0;
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => total + (item.menu_item.price * item.quantity), 0);
  };

  const placeOrder = async () => {
    if (!restaurant || !table || cart.length === 0) return;

    try {
      setPlacing(true);
      
      await createOrder(
        restaurant.id,
        table.id,
        cart,
        customerName || undefined,
        specialInstructions || undefined
      );

      // Navigate to success page
      navigate(`/order/${token}/success`);
    } catch (error) {
      console.error('Error placing order:', error);
      alert('Failed to place order. Please try again.');
    } finally {
      setPlacing(false);
    }
  };

  const filteredItems = selectedCategory 
    ? menuItems.filter(item => item.category_id === selectedCategory)
    : menuItems;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md mx-auto text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
            <XMarkIcon className="h-6 w-6 text-red-600" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-gray-900">Oops!</h1>
          <p className="mt-2 text-gray-600">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 btn-primary"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-md mx-auto px-4 py-4">
          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-900">{restaurant?.name}</h1>
            <p className="text-sm text-gray-600">Table {table?.table_number}</p>
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-16 z-30">
        <div className="max-w-md mx-auto">
          <nav className="flex overflow-x-auto">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  selectedCategory === category.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {category.name}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Menu Items */}
      <div className="max-w-md mx-auto px-4 py-6 pb-32">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No items available in this category.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item) => {
              const quantity = getCartItemQuantity(item.id);
              
              return (
                <div key={item.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 pr-4">
                      <h3 className="font-medium text-gray-900">{item.name}</h3>
                      {item.description && (
                        <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                      )}
                      <p className="text-lg font-semibold text-primary-600 mt-2">
                        {formatCurrency(item.price)}
                      </p>
                    </div>

                    {item.image_url && (
                      <div className="w-20 h-20 bg-gray-100 rounded-lg flex-shrink-0">
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-full h-full object-cover rounded-lg"
                          loading="lazy"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-gray-500">
                      {categories.find(cat => cat.id === item.category_id)?.name}
                    </div>
                    
                    {quantity === 0 ? (
                      <button
                        onClick={() => addToCart(item)}
                        className="btn-primary text-sm py-2 px-4"
                      >
                        Add to Cart
                      </button>
                    ) : (
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                        >
                          <MinusIcon className="h-4 w-4 text-gray-600" />
                        </button>
                        <span className="font-medium text-gray-900 min-w-[2rem] text-center">
                          {quantity}
                        </span>
                        <button
                          onClick={() => addToCart(item)}
                          className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center hover:bg-primary-700 transition-colors"
                        >
                          <PlusIcon className="h-4 w-4 text-white" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart Button */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-50">
          <div className="max-w-md mx-auto">
            <button
              onClick={() => setShowCart(true)}
              className="w-full btn-primary flex items-center justify-center"
            >
              <ShoppingCartIcon className="h-5 w-5 mr-2" />
              View Cart ({cart.length} items) • {formatCurrency(getCartTotal())}
            </button>
          </div>
        </div>
      )}

      {/* Cart Modal */}
      {showCart && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-end justify-center z-50">
          <div className="bg-white rounded-t-lg max-w-md w-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Your Order</h3>
              <button
                onClick={() => setShowCart(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {/* Cart Items */}
              <div className="space-y-4 mb-6">
                {cart.map((item) => (
                  <div key={item.menu_item.id} className="flex justify-between items-start">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{item.menu_item.name}</h4>
                      <p className="text-sm text-gray-600">
                        {formatCurrency(item.menu_item.price)} each
                      </p>
                    </div>
                    
                    <div className="flex items-center space-x-3 ml-4">
                      <button
                        onClick={() => removeFromCart(item.menu_item.id)}
                        className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
                      >
                        <MinusIcon className="h-4 w-4 text-gray-600" />
                      </button>
                      <span className="font-medium text-gray-900 min-w-[2rem] text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => addToCart(item.menu_item)}
                        className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center"
                      >
                        <PlusIcon className="h-4 w-4 text-white" />
                      </button>
                    </div>
                    
                    <div className="text-right ml-4">
                      <p className="font-medium text-gray-900">
                        {formatCurrency(item.menu_item.price * item.quantity)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Customer Details */}
              <div className="space-y-4 mb-6">
                <div>
                  <label htmlFor="customerName" className="label">
                    Your Name (optional)
                  </label>
                  <input
                    id="customerName"
                    type="text"
                    className="input"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter your name"
                  />
                </div>

                <div>
                  <label htmlFor="specialInstructions" className="label">
                    Special Instructions (optional)
                  </label>
                  <textarea
                    id="specialInstructions"
                    rows={3}
                    className="input"
                    value={specialInstructions}
                    onChange={(e) => setSpecialInstructions(e.target.value)}
                    placeholder="Any special requests or dietary requirements..."
                  />
                </div>
              </div>

              {/* Total */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex justify-between items-center text-lg font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(getCartTotal())}</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200">
              <button
                onClick={placeOrder}
                disabled={placing || cart.length === 0}
                className="w-full btn-primary"
              >
                {placing ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Placing Order...
                  </>
                ) : (
                  'Place Order'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 
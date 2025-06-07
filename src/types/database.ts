export interface Database {
  public: {
    Tables: {
      restaurants: {
        Row: Restaurant;
        Insert: Omit<Restaurant, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Restaurant, 'id' | 'created_at' | 'updated_at'>>;
      };
      restaurant_tables: {
        Row: RestaurantTable;
        Insert: Omit<RestaurantTable, 'id' | 'created_at'>;
        Update: Partial<Omit<RestaurantTable, 'id' | 'created_at'>>;
      };
      menu_categories: {
        Row: MenuCategory;
        Insert: Omit<MenuCategory, 'id' | 'created_at'>;
        Update: Partial<Omit<MenuCategory, 'id' | 'created_at'>>;
      };
      menu_items: {
        Row: MenuItem;
        Insert: Omit<MenuItem, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<MenuItem, 'id' | 'created_at' | 'updated_at'>>;
      };
      orders: {
        Row: Order;
        Insert: Omit<Order, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Order, 'id' | 'created_at' | 'updated_at'>>;
      };
      order_items: {
        Row: OrderItem;
        Insert: Omit<OrderItem, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<OrderItem, 'id' | 'created_at' | 'updated_at'>>;
      };
      active_sessions: {
        Row: ActiveSession;
        Insert: Omit<ActiveSession, 'id' | 'created_at'>;
        Update: Partial<Omit<ActiveSession, 'id' | 'created_at'>>;
      };
      monthly_analytics: {
        Row: MonthlyAnalytics;
        Insert: Omit<MonthlyAnalytics, 'id' | 'created_at'>;
        Update: Partial<Omit<MonthlyAnalytics, 'id' | 'created_at'>>;
      };
    };
  };
}

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone?: string;
  address?: string;
  subscription_status: 'active' | 'inactive' | 'cancelled';
  stripe_customer_id?: string;
  created_at: string;
  updated_at: string;
}

export interface RestaurantTable {
  id: string;
  restaurant_id: string;
  table_number: number;
  qr_token: string;
  is_active: boolean;
  created_at: string;
}

export interface MenuCategory {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface MenuItem {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  is_available: boolean;
  sort_order: number;
  preferred_station_id?: string;
  preparation_time_minutes?: number;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  restaurant_id: string;
  table_id: string;
  order_number: string;
  status: 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
  total_amount: number;
  special_instructions?: string;
  customer_name?: string;
  assigned_chef?: string;
  priority?: number;
  complexity_score?: number;
  estimated_time_minutes?: number;
  assigned_station_id?: string;
  claimed_by?: string;
  claimed_at?: string;
  auto_priority?: number;
  prep_time_estimate?: number;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  price: number; // Alias for unit_price for compatibility
  special_instructions?: string;
  item_status: 'pending' | 'preparing' | 'ready';
  assigned_chef?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface MonthlyAnalytics {
  id: string;
  restaurant_id: string;
  month: number;
  year: number;
  total_revenue: number;
  total_orders: number;
  average_order_value: number;
  popular_items?: any;
  peak_hours?: any;
  table_performance?: any;
  report_sent_at?: string;
  created_at: string;
}

export interface ActiveSession {
  id: string;
  user_id?: string;
  restaurant_id: string;
  station_id?: string;
  session_token: string;
  user_name?: string;
  status: 'active' | 'busy' | 'break' | 'offline';
  last_seen: string;
  created_at: string;
}

// Extended types for joins
export interface OrderWithItems extends Order {
  order_items: (OrderItem & {
    menu_item: MenuItem;
  })[];
  restaurant_table: RestaurantTable;
  claimed_session?: ActiveSession;
}

export interface MenuItemWithCategory extends MenuItem {
  menu_category: MenuCategory;
}

export interface CartItem {
  menu_item: MenuItem;
  quantity: number;
  special_instructions?: string;
}

export interface QRToken {
  restaurant_id: string;
  table_number: number;
  token: string;
} 
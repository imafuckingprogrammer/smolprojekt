export interface Database {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Omit<User, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>;
      };
      restaurants: {
        Row: Restaurant;
        Insert: Omit<Restaurant, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Restaurant, 'id' | 'created_at' | 'updated_at'>>;
      };
      restaurant_staff: {
        Row: RestaurantStaff;
        Insert: Omit<RestaurantStaff, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<RestaurantStaff, 'id' | 'created_at' | 'updated_at'>>;
      };
      work_sessions: {
        Row: WorkSession;
        Insert: Omit<WorkSession, 'id' | 'started_at'>;
        Update: Partial<Omit<WorkSession, 'id' | 'started_at'>>;
      };
      restaurant_tables: {
        Row: RestaurantTable;
        Insert: Omit<RestaurantTable, 'id' | 'created_at'>;
        Update: Partial<Omit<RestaurantTable, 'id' | 'created_at'>>;
      };
      kitchen_stations: {
        Row: KitchenStation;
        Insert: Omit<KitchenStation, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<KitchenStation, 'id' | 'created_at' | 'updated_at'>>;
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
      menu_item_stations: {
        Row: MenuItemStation;
        Insert: Omit<MenuItemStation, 'id' | 'created_at'>;
        Update: Partial<Omit<MenuItemStation, 'id' | 'created_at'>>;
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
      order_assignments: {
        Row: OrderAssignment;
        Insert: Omit<OrderAssignment, 'id' | 'created_at'>;
        Update: Partial<Omit<OrderAssignment, 'id' | 'created_at'>>;
      };
      order_item_assignments: {
        Row: OrderItemAssignment;
        Insert: Omit<OrderItemAssignment, 'id' | 'assigned_at'>;
        Update: Partial<Omit<OrderItemAssignment, 'id' | 'assigned_at'>>;
      };
      chef_performance: {
        Row: ChefPerformance;
        Insert: Omit<ChefPerformance, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ChefPerformance, 'id' | 'created_at' | 'updated_at'>>;
      };
      restaurant_settings: {
        Row: RestaurantSettings;
        Insert: Omit<RestaurantSettings, 'id' | 'updated_at'>;
        Update: Partial<Omit<RestaurantSettings, 'id' | 'updated_at'>>;
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
    Functions: {
      auto_assign_order: {
        Args: { p_order_id: string; p_restaurant_id: string };
        Returns: Json;
      };
      update_order_status_optimized: {
        Args: { p_order_id: string; p_new_status: string; p_staff_id?: string };
        Returns: Json;
      };
      cleanup_old_sessions: {
        Args: {};
        Returns: number;
      };
      create_default_kitchen_stations: {
        Args: { p_restaurant_id: string };
        Returns: void;
      };
    };
  };
}

// User Management Types
export type StaffRole = 'owner' | 'manager' | 'head_chef' | 'chef' | 'kitchen_staff' | 'server' | 'cashier' | 'admin';
export type SessionStatus = 'active' | 'idle' | 'break' | 'offline';
export type AssignmentStatus = 'assigned' | 'accepted' | 'in_progress' | 'completed' | 'rejected' | 'cancelled';
export type ItemAssignmentStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'on_hold' | 'cancelled';

export interface User {
  id: string;
  email: string;
  password_hash?: string;
  first_name: string;
  last_name: string;
  phone?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  last_login?: string;
  email_verified: boolean;
  timezone: string;
}

export interface RestaurantStaff {
  id: string;
  restaurant_id: string;
  user_id: string;
  role: StaffRole;
  permissions: string[];
  hourly_rate?: number;
  hire_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkSession {
  id: string;
  restaurant_id: string;
  user_id: string;
  station_id?: string;
  status: SessionStatus;
  started_at: string;
  ended_at?: string;
  break_started_at?: string;
  break_ended_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface WorkSessionWithStation extends WorkSession {
  station?: KitchenStation;
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
  owner_user_id?: string;
  timezone: string;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface KitchenStation {
  id: string;
  restaurant_id: string;
  station_name: string;
  station_type: string;
  position_order: number;
  max_concurrent_orders: number;
  average_prep_time_minutes: number;
  is_active: boolean;
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
  complexity_rating: number;
  allergens: string[];
  created_at: string;
  updated_at: string;
}

export interface MenuItemStation {
  id: string;
  menu_item_id: string;
  station_id: string;
  prep_time_minutes: number;
  complexity_score: number;
  is_primary_station: boolean;
  created_at: string;
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
  customer_phone?: string;
  rush_order: boolean;
  order_source: string;
  assigned_chef?: string;
  priority?: number;
  complexity_score?: number;
  estimated_time_minutes?: number;
  assigned_station_id?: string;
  claimed_by?: string;
  claimed_at?: string;
  auto_priority?: number;
  prep_time_estimate?: number;
  preparation_started_at?: string;
  ready_at?: string;
  served_at?: string;
  auto_assigned?: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  special_instructions?: string;
  item_status: 'pending' | 'preparing' | 'ready';
  assigned_chef?: string;
  started_at?: string;
  completed_at?: string;
  prep_started_at?: string;
  prep_completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface OrderAssignment {
  id: string;
  order_id: string;
  assigned_to: string;
  estimated_completion?: string;
  assigned_chef_id?: string;
  status: AssignmentStatus;
  accepted_at?: string;
  started_at?: string;
  completed_at?: string;
  auto_assigned: boolean;
  created_at: string;
}

export interface OrderItemAssignment {
  id: string;
  order_item_id: string;
  station_id?: string;
  assigned_chef?: string;
  assigned_at: string;
  started_at?: string;
  completed_at?: string;
  status: ItemAssignmentStatus;
}

export interface ChefPerformance {
  id: string;
  staff_id: string;
  date: string;
  orders_completed: number;
  orders_assigned: number;
  average_completion_time_minutes?: number;
  quality_score: number;
  efficiency_rating: number;
  created_at: string;
  updated_at: string;
}

export interface RestaurantSettings {
  id: string;
  restaurant_id: string;
  setting_key: string;
  setting_value: Record<string, any>;
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
  assigned_chef_staff?: RestaurantStaff;
  order_assignments?: OrderAssignment[];
}

export interface MenuItemWithCategory extends MenuItem {
  menu_category: MenuCategory;
  menu_item_stations?: MenuItemStation[];
}

export interface StaffWithUser extends RestaurantStaff {
  user: User;
}

export interface WorkSessionWithStaff extends WorkSession {
  staff: StaffWithUser;
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

// Database function return types
export interface AutoAssignResult {
  assigned_to: string;
  estimated_completion: string;
}

export interface OrderStatusUpdateResult extends Order {
  // Additional fields returned by the function
}

// JSON type for database functions
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]; 
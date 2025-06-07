-- Kitchen Stations Table
CREATE TABLE kitchen_stations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  station_name VARCHAR(100) NOT NULL,
  station_type VARCHAR(50) NOT NULL, -- 'hot_food', 'cold_food', 'drinks', 'desserts', 'all'
  is_active BOOLEAN DEFAULT true,
  position_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Sessions (Active Kitchen Staff)
CREATE TABLE active_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  station_id UUID REFERENCES kitchen_stations(id) ON DELETE SET NULL,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  user_name VARCHAR(100),
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'busy', 'break', 'offline'
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order Assignments (Who's working on what)
CREATE TABLE order_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES active_sessions(id) ON DELETE SET NULL,
  station_id UUID REFERENCES kitchen_stations(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  estimated_completion TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true
);

-- 1. Add missing columns to existing tables
ALTER TABLE orders ADD COLUMN IF NOT EXISTS claimed_by UUID REFERENCES active_sessions(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS auto_priority INTEGER DEFAULT 5;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS prep_time_estimate INTEGER DEFAULT 15;

-- Add restaurant-user relationship
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- Order Priority & Complexity (keep existing columns if they exist)
ALTER TABLE orders ADD COLUMN priority INTEGER DEFAULT 5; -- 1-10 scale
ALTER TABLE orders ADD COLUMN complexity_score INTEGER DEFAULT 5; -- Auto-calculated
ALTER TABLE orders ADD COLUMN estimated_time_minutes INTEGER DEFAULT 15;
ALTER TABLE orders ADD COLUMN assigned_station_id UUID REFERENCES kitchen_stations(id);

-- Menu Item Station Mapping
ALTER TABLE menu_items ADD COLUMN preferred_station_id UUID REFERENCES kitchen_stations(id);
ALTER TABLE menu_items ADD COLUMN preparation_time_minutes INTEGER DEFAULT 10;

-- 2. Add performance indexes
CREATE INDEX idx_orders_status_restaurant ON orders(restaurant_id, status, created_at DESC);
CREATE INDEX idx_orders_claimed ON orders(claimed_by, status) WHERE claimed_by IS NOT NULL;
CREATE INDEX idx_order_items_status ON order_items(order_id, item_status);
CREATE INDEX idx_active_sessions_station ON active_sessions(station_id, status, last_seen);
CREATE INDEX idx_active_sessions_restaurant ON active_sessions(restaurant_id, status);
CREATE INDEX idx_orders_priority_status ON orders(restaurant_id, priority DESC, status, created_at);

-- 3. Add order claiming constraints
ALTER TABLE orders ADD CONSTRAINT orders_claimed_by_fkey 
  FOREIGN KEY (claimed_by) REFERENCES active_sessions(id) ON DELETE SET NULL;

-- 4. Update RLS policies for new columns
DROP POLICY IF EXISTS "Public can create orders" ON orders;
CREATE POLICY "Public can create orders" ON orders 
  FOR INSERT WITH CHECK (claimed_by IS NULL);

-- 5. Add function for atomic order claiming
CREATE OR REPLACE FUNCTION claim_order(order_uuid UUID, session_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  success BOOLEAN := FALSE;
BEGIN
  UPDATE orders 
  SET claimed_by = session_uuid, 
      claimed_at = NOW(),
      status = 'preparing'
  WHERE id = order_uuid 
    AND claimed_by IS NULL 
    AND status = 'pending';
  
  GET DIAGNOSTICS success = FOUND;
  RETURN success;
END;
$$ LANGUAGE plpgsql;

-- 6. Add function for releasing order claims
CREATE OR REPLACE FUNCTION release_order(order_uuid UUID, session_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  success BOOLEAN := FALSE;
BEGIN
  UPDATE orders 
  SET claimed_by = NULL, 
      claimed_at = NULL,
      status = 'pending'
  WHERE id = order_uuid 
    AND claimed_by = session_uuid
    AND status IN ('preparing', 'ready');
  
  GET DIAGNOSTICS success = FOUND;
  RETURN success;
END;
$$ LANGUAGE plpgsql;

-- Real-time Functions for Instant Updates
CREATE OR REPLACE FUNCTION notify_order_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify specific station channel
  IF NEW.assigned_station_id IS NOT NULL THEN
    PERFORM pg_notify(
      'station_' || NEW.assigned_station_id::text, 
      json_build_object(
        'type', TG_OP,
        'order_id', NEW.id,
        'status', NEW.status,
        'priority', NEW.priority,
        'claimed_by', NEW.claimed_by,
        'table_number', (SELECT table_number FROM restaurant_tables WHERE id = NEW.table_id),
        'estimated_time', NEW.estimated_time_minutes
      )::text
    );
  END IF;
  
  -- Notify general restaurant channel
  PERFORM pg_notify(
    'restaurant_' || NEW.restaurant_id::text,
    json_build_object(
      'type', 'order_update', 
      'order_id', NEW.id,
      'status', NEW.status,
      'claimed_by', NEW.claimed_by
    )::text
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_change_trigger
  AFTER INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_order_change(); 
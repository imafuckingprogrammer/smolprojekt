-- Kitchen Stations Table
CREATE TABLE IF NOT EXISTS kitchen_stations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  station_name VARCHAR(100) NOT NULL,
  station_type VARCHAR(50) NOT NULL, -- 'hot_food', 'cold_food', 'drinks', 'desserts', 'all'
  is_active BOOLEAN DEFAULT true,
  position_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Sessions (Active Kitchen Staff)
CREATE TABLE IF NOT EXISTS active_sessions (
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
CREATE TABLE IF NOT EXISTS order_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES active_sessions(id) ON DELETE SET NULL,
  station_id UUID REFERENCES kitchen_stations(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  estimated_completion TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true
);

-- 1. Add missing columns to existing tables (only if they don't exist)
DO $$ 
BEGIN
  -- Add columns to orders table
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'claimed_by') THEN
    ALTER TABLE orders ADD COLUMN claimed_by UUID REFERENCES active_sessions(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'claimed_at') THEN
    ALTER TABLE orders ADD COLUMN claimed_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'auto_priority') THEN
    ALTER TABLE orders ADD COLUMN auto_priority INTEGER DEFAULT 5;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'prep_time_estimate') THEN
    ALTER TABLE orders ADD COLUMN prep_time_estimate INTEGER DEFAULT 15;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'priority') THEN
    ALTER TABLE orders ADD COLUMN priority INTEGER DEFAULT 5;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'complexity_score') THEN
    ALTER TABLE orders ADD COLUMN complexity_score INTEGER DEFAULT 5;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'estimated_time_minutes') THEN
    ALTER TABLE orders ADD COLUMN estimated_time_minutes INTEGER DEFAULT 15;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'assigned_station_id') THEN
    ALTER TABLE orders ADD COLUMN assigned_station_id UUID REFERENCES kitchen_stations(id);
  END IF;

  -- Add restaurant owner column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurants' AND column_name = 'owner_id') THEN
    ALTER TABLE restaurants ADD COLUMN owner_id UUID REFERENCES auth.users(id);
  END IF;

  -- Add order item tracking columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'started_at') THEN
    ALTER TABLE order_items ADD COLUMN started_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'completed_at') THEN
    ALTER TABLE order_items ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE;
  END IF;

  -- Add menu item station mapping
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'menu_items' AND column_name = 'preferred_station_id') THEN
    ALTER TABLE menu_items ADD COLUMN preferred_station_id UUID REFERENCES kitchen_stations(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'menu_items' AND column_name = 'preparation_time_minutes') THEN
    ALTER TABLE menu_items ADD COLUMN preparation_time_minutes INTEGER DEFAULT 10;
  END IF;
END $$;

-- 2. Create indexes for better performance (only if they don't exist)
CREATE INDEX IF NOT EXISTS idx_orders_status_restaurant ON orders(restaurant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_claimed ON orders(claimed_by, status) WHERE claimed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items(order_id, item_status);
CREATE INDEX IF NOT EXISTS idx_active_sessions_station ON active_sessions(station_id, status, last_seen);
CREATE INDEX IF NOT EXISTS idx_active_sessions_restaurant ON active_sessions(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_priority_status ON orders(restaurant_id, priority DESC, status, created_at);
CREATE INDEX IF NOT EXISTS idx_kitchen_stations_restaurant ON kitchen_stations(restaurant_id, is_active);

-- 3. Update RLS policies
DROP POLICY IF EXISTS "Public can create orders" ON orders;
CREATE POLICY "Public can create orders" ON orders 
  FOR INSERT WITH CHECK (claimed_by IS NULL);

-- Allow restaurant staff to view and update orders
DROP POLICY IF EXISTS "Restaurant staff can view orders" ON orders;
CREATE POLICY "Restaurant staff can view orders" ON orders 
  FOR SELECT USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Restaurant staff can update orders" ON orders;
CREATE POLICY "Restaurant staff can update orders" ON orders 
  FOR UPDATE USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );

-- RLS for active_sessions
DROP POLICY IF EXISTS "Restaurant staff can manage sessions" ON active_sessions;
CREATE POLICY "Restaurant staff can manage sessions" ON active_sessions 
  FOR ALL USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );

-- RLS for kitchen_stations
DROP POLICY IF EXISTS "Restaurant staff can manage stations" ON kitchen_stations;
CREATE POLICY "Restaurant staff can manage stations" ON kitchen_stations 
  FOR ALL USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );

-- 4. Improved atomic order claiming function
CREATE OR REPLACE FUNCTION claim_order(order_uuid UUID, session_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  success BOOLEAN := FALSE;
  session_exists BOOLEAN := FALSE;
BEGIN
  -- First check if session exists and is active
  SELECT EXISTS(
    SELECT 1 FROM active_sessions 
    WHERE id = session_uuid 
    AND status = 'active'
    AND last_seen > NOW() - INTERVAL '5 minutes'
  ) INTO session_exists;
  
  IF NOT session_exists THEN
    RAISE EXCEPTION 'Session not found or expired';
  END IF;

  -- Attempt to claim the order atomically
  UPDATE orders 
  SET 
    claimed_by = session_uuid, 
    claimed_at = NOW(),
    status = CASE 
      WHEN status = 'pending' THEN 'preparing'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = order_uuid 
    AND claimed_by IS NULL 
    AND status IN ('pending', 'ready');
  
  success := FOUND;
  
  -- Update session status to busy if claim was successful
  IF success THEN
    UPDATE active_sessions 
    SET status = 'busy', last_seen = NOW()
    WHERE id = session_uuid;
  END IF;
  
  RETURN success;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Improved order release function
CREATE OR REPLACE FUNCTION release_order(order_uuid UUID, session_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  success BOOLEAN := FALSE;
  order_status TEXT;
BEGIN
  -- Get current order status
  SELECT status INTO order_status
  FROM orders 
  WHERE id = order_uuid AND claimed_by = session_uuid;
  
  IF order_status IS NULL THEN
    RETURN FALSE; -- Order not found or not claimed by this session
  END IF;

  -- Release the order
  UPDATE orders 
  SET 
    claimed_by = NULL, 
    claimed_at = NULL,
    status = CASE 
      WHEN status = 'preparing' THEN 'pending'
      WHEN status = 'ready' THEN 'pending'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = order_uuid 
    AND claimed_by = session_uuid;
  
  success := FOUND;
  
  -- Update session status back to active
  IF success THEN
    UPDATE active_sessions 
    SET status = 'active', last_seen = NOW()
    WHERE id = session_uuid;
  END IF;
  
  RETURN success;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  cleaned_count INTEGER := 0;
BEGIN
  -- Release orders from expired sessions
  UPDATE orders 
  SET claimed_by = NULL, claimed_at = NULL, status = 'pending'
  WHERE claimed_by IN (
    SELECT id FROM active_sessions 
    WHERE last_seen < NOW() - INTERVAL '10 minutes'
  );
  
  -- Delete expired sessions
  DELETE FROM active_sessions 
  WHERE last_seen < NOW() - INTERVAL '10 minutes';
  
  GET DIAGNOSTICS cleaned_count = ROW_COUNT;
  
  RETURN cleaned_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Real-time notification function
CREATE OR REPLACE FUNCTION notify_order_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify specific station channel if assigned
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
      'claimed_by', NEW.claimed_by,
      'table_id', NEW.table_id
    )::text
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for order changes
DROP TRIGGER IF EXISTS order_change_trigger ON orders;
CREATE TRIGGER order_change_trigger
  AFTER INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_order_change();

-- 8. Function to auto-assign orders to stations based on menu items
CREATE OR REPLACE FUNCTION auto_assign_station()
RETURNS TRIGGER AS $$
DECLARE
  station_id UUID;
BEGIN
  -- Try to find a preferred station based on the order items
  SELECT DISTINCT mi.preferred_station_id INTO station_id
  FROM order_items oi
  JOIN menu_items mi ON oi.menu_item_id = mi.id
  WHERE oi.order_id = NEW.id 
    AND mi.preferred_station_id IS NOT NULL
  LIMIT 1;
  
  -- If found, assign the order to that station
  IF station_id IS NOT NULL THEN
    NEW.assigned_station_id := station_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto station assignment
DROP TRIGGER IF EXISTS auto_assign_station_trigger ON orders;
CREATE TRIGGER auto_assign_station_trigger
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION auto_assign_station();

-- 9. Create a scheduled job to clean up expired sessions (if pg_cron is available)
-- This would typically be set up separately in production
-- SELECT cron.schedule('cleanup-sessions', '*/5 * * * *', 'SELECT cleanup_expired_sessions();'); 
-- TableDirect Database Migration: Security & Constraints Fix
-- This migration fixes all critical database issues identified

-- =============================================================================
-- 1. FIX SESSION MANAGEMENT TABLES
-- =============================================================================

-- Drop conflicting tables and recreate with proper structure
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS kitchen_sessions CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;

-- Recreate active_sessions with proper constraints
ALTER TABLE active_sessions ADD CONSTRAINT IF NOT EXISTS active_sessions_unique_user_restaurant 
  UNIQUE (restaurant_id, user_name);

ALTER TABLE active_sessions ADD CONSTRAINT IF NOT EXISTS active_sessions_status_check 
  CHECK (status IN ('active', 'busy', 'break', 'offline'));

-- Add proper indexes for performance
CREATE INDEX IF NOT EXISTS idx_active_sessions_restaurant_status 
  ON active_sessions (restaurant_id, status) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_active_sessions_last_seen 
  ON active_sessions (last_seen) WHERE status = 'active';

-- =============================================================================
-- 2. FIX ORDERS TABLE CONSTRAINTS
-- =============================================================================

-- Add proper foreign key constraints
ALTER TABLE orders ADD CONSTRAINT IF NOT EXISTS orders_claimed_by_fk 
  FOREIGN KEY (claimed_by) REFERENCES active_sessions(id) ON DELETE SET NULL;

-- Add check constraints for order status
ALTER TABLE orders ADD CONSTRAINT IF NOT EXISTS orders_status_check 
  CHECK (status IN ('pending', 'preparing', 'ready', 'served', 'cancelled'));

-- Add constraint to prevent claiming by inactive sessions
CREATE OR REPLACE FUNCTION validate_order_claim() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.claimed_by IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM active_sessions 
      WHERE id = NEW.claimed_by AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Cannot claim order: session is not active';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_order_claim_trigger ON orders;
CREATE TRIGGER validate_order_claim_trigger
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION validate_order_claim();

-- =============================================================================
-- 3. FIX STAFF INVITATIONS SYSTEM
-- =============================================================================

-- Add proper constraints to staff invitations
ALTER TABLE staff_invitations ADD CONSTRAINT IF NOT EXISTS staff_invitations_status_check 
  CHECK (status IN ('pending', 'accepted', 'declined', 'expired'));

ALTER TABLE staff_invitations ADD CONSTRAINT IF NOT EXISTS staff_invitations_role_check 
  CHECK (role IN ('manager', 'chef', 'server', 'kitchen_staff'));

-- Add unique constraint to prevent duplicate invitations
ALTER TABLE staff_invitations ADD CONSTRAINT IF NOT EXISTS staff_invitations_unique_email_restaurant 
  UNIQUE (restaurant_id, email);

-- Add expiration handling
ALTER TABLE staff_invitations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days');

-- =============================================================================
-- 4. MENU MANAGEMENT CONSTRAINTS
-- =============================================================================

-- Add check constraint for menu item prices
ALTER TABLE menu_items ADD CONSTRAINT IF NOT EXISTS menu_items_price_positive 
  CHECK (price >= 0);

-- Add constraint for category sort order
ALTER TABLE menu_categories ADD CONSTRAINT IF NOT EXISTS menu_categories_sort_order_positive 
  CHECK (sort_order >= 0);

ALTER TABLE menu_items ADD CONSTRAINT IF NOT EXISTS menu_items_sort_order_positive 
  CHECK (sort_order >= 0);

-- =============================================================================
-- 5. RESTAURANT TABLES CONSTRAINTS
-- =============================================================================

-- Add check constraint for table numbers
ALTER TABLE restaurant_tables ADD CONSTRAINT IF NOT EXISTS restaurant_tables_number_positive 
  CHECK (table_number > 0);

-- Add unique constraint for table numbers per restaurant
ALTER TABLE restaurant_tables ADD CONSTRAINT IF NOT EXISTS restaurant_tables_unique_number_per_restaurant 
  UNIQUE (restaurant_id, table_number);

-- =============================================================================
-- 6. SECURITY POLICIES (Row Level Security)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;

-- Restaurant access policy
CREATE POLICY "restaurant_access" ON restaurants
  FOR ALL USING (auth.uid() = user_id);

-- Active sessions policy
CREATE POLICY "active_sessions_access" ON active_sessions
  FOR ALL USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE user_id = auth.uid()
    )
  );

-- Orders policy
CREATE POLICY "orders_access" ON orders
  FOR ALL USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE user_id = auth.uid()
    )
  );

-- Staff invitations policy
CREATE POLICY "staff_invitations_access" ON staff_invitations
  FOR ALL USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE user_id = auth.uid()
    )
  );

-- Menu categories policy
CREATE POLICY "menu_categories_access" ON menu_categories
  FOR ALL USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE user_id = auth.uid()
    )
  );

-- Menu items policy
CREATE POLICY "menu_items_access" ON menu_items
  FOR ALL USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE user_id = auth.uid()
    )
  );

-- Restaurant tables policy
CREATE POLICY "restaurant_tables_access" ON restaurant_tables
  FOR ALL USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE user_id = auth.uid()
    )
  );

-- =============================================================================
-- 7. CLEANUP FUNCTIONS
-- =============================================================================

-- Function to cleanup expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions() RETURNS void AS $$
BEGIN
  -- Release orders from expired sessions
  UPDATE orders 
  SET claimed_by = NULL, claimed_at = NULL
  WHERE claimed_by IN (
    SELECT id FROM active_sessions 
    WHERE last_seen < NOW() - INTERVAL '5 minutes'
  );
  
  -- Delete expired sessions
  DELETE FROM active_sessions 
  WHERE last_seen < NOW() - INTERVAL '5 minutes';
  
  -- Update expired invitations
  UPDATE staff_invitations 
  SET status = 'expired' 
  WHERE status = 'pending' AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup function (if pg_cron is available)
-- SELECT cron.schedule('cleanup-expired-sessions', '*/5 * * * *', 'SELECT cleanup_expired_sessions();');

-- =============================================================================
-- 8. PERFORMANCE INDEXES
-- =============================================================================

-- Orders performance indexes
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status 
  ON orders (restaurant_id, status) WHERE status IN ('pending', 'preparing', 'ready');

CREATE INDEX IF NOT EXISTS idx_orders_created_at 
  ON orders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_claimed_by 
  ON orders (claimed_by) WHERE claimed_by IS NOT NULL;

-- Menu items performance indexes
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_category 
  ON menu_items (restaurant_id, category_id) WHERE is_available = true;

-- Staff invitations performance indexes
CREATE INDEX IF NOT EXISTS idx_staff_invitations_email_status 
  ON staff_invitations (email, status) WHERE status = 'pending';

-- =============================================================================
-- 9. DATA INTEGRITY FUNCTIONS
-- =============================================================================

-- Function to validate menu item availability
CREATE OR REPLACE FUNCTION validate_menu_item_availability() RETURNS TRIGGER AS $$
BEGIN
  -- Check if category is active when item is set to available
  IF NEW.is_available = true THEN
    IF NOT EXISTS (
      SELECT 1 FROM menu_categories 
      WHERE id = NEW.category_id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Cannot make item available: category is inactive';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_menu_item_availability_trigger ON menu_items;
CREATE TRIGGER validate_menu_item_availability_trigger
  BEFORE UPDATE ON menu_items
  FOR EACH ROW
  EXECUTE FUNCTION validate_menu_item_availability();

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Log migration completion
INSERT INTO migrations (name, executed_at) VALUES ('security_constraints_fix', NOW())
  ON CONFLICT (name) DO UPDATE SET executed_at = NOW();

COMMIT; 
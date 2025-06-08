-- TableDirect Database Migration: Fixed SQL Syntax
-- This migration matches the ACTUAL schema and fixes staff login issues

-- =============================================================================
-- 1. CREATE MISSING STAFF INVITATIONS TABLE
-- =============================================================================

-- Create staff invitations table (missing from current schema)
CREATE TABLE IF NOT EXISTS public.staff_invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  email character varying NOT NULL,
  role character varying NOT NULL CHECK (role IN ('manager', 'chef', 'server', 'kitchen_staff')),
  status character varying DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  invited_by uuid,
  token character varying NOT NULL UNIQUE,
  expires_at timestamp with time zone DEFAULT (NOW() + INTERVAL '7 days'),
  created_at timestamp with time zone DEFAULT now(),
  accepted_at timestamp with time zone,
  CONSTRAINT staff_invitations_pkey PRIMARY KEY (id),
  CONSTRAINT staff_invitations_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id),
  CONSTRAINT staff_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id),
  CONSTRAINT staff_invitations_unique_email_restaurant UNIQUE (restaurant_id, email)
);

-- =============================================================================
-- 2. CREATE BUSINESS HOURS TABLE (MISSING)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.business_hours (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  open_time time NOT NULL,
  close_time time NOT NULL,
  is_closed boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT business_hours_pkey PRIMARY KEY (id),
  CONSTRAINT business_hours_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id),
  CONSTRAINT business_hours_unique_restaurant_day UNIQUE (restaurant_id, day_of_week)
);

-- =============================================================================
-- 3. FIX EXISTING CONSTRAINTS (COMPATIBLE SYNTAX)
-- =============================================================================

-- Fix active_sessions constraints using conditional logic
DO $$
BEGIN
  -- Add unique constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'active_sessions_unique_user_restaurant'
    AND table_name = 'active_sessions'
  ) THEN
    ALTER TABLE public.active_sessions 
    ADD CONSTRAINT active_sessions_unique_user_restaurant 
    UNIQUE (restaurant_id, user_name);
  END IF;

  -- Add status check constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'active_sessions_status_check'
    AND table_name = 'active_sessions'
  ) THEN
    ALTER TABLE public.active_sessions 
    ADD CONSTRAINT active_sessions_status_check 
    CHECK (status IN ('active', 'busy', 'break', 'offline'));
  END IF;
END $$;

-- Fix orders table - ensure proper claimed_by constraint
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'orders_claimed_by_fkey'
    AND table_name = 'orders'
  ) THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_claimed_by_fkey;
  END IF;

  -- Add the correct constraint
  ALTER TABLE public.orders 
  ADD CONSTRAINT orders_claimed_by_fkey 
  FOREIGN KEY (claimed_by) REFERENCES public.active_sessions(id) ON DELETE SET NULL;
END $$;

-- =============================================================================
-- 4. CREATE STAFF LOGIN FUNCTIONS (FIXED)
-- =============================================================================

-- Function to accept staff invitation and create staff record
CREATE OR REPLACE FUNCTION accept_staff_invitation(invitation_token text, user_email text)
RETURNS jsonb AS $$
DECLARE
  invitation_record record;
  staff_record record;
  user_record record;
  restaurant_owner_id uuid;
BEGIN
  -- Get invitation details
  SELECT * INTO invitation_record 
  FROM staff_invitations 
  WHERE token = invitation_token 
    AND status = 'pending' 
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;

  -- Check if email matches
  IF invitation_record.email != user_email THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email does not match invitation');
  END IF;

  -- Get current user ID from auth
  SELECT auth.uid() INTO user_record;
  
  IF user_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not authenticated');
  END IF;

  -- Check if staff record already exists
  SELECT * INTO staff_record 
  FROM restaurant_staff 
  WHERE restaurant_id = invitation_record.restaurant_id 
    AND user_id = user_record;

  IF NOT FOUND THEN
    -- Create staff record
    INSERT INTO restaurant_staff (
      restaurant_id,
      user_id,
      role,
      permissions,
      is_active,
      created_at,
      updated_at
    ) VALUES (
      invitation_record.restaurant_id,
      user_record,
      invitation_record.role::staff_role,
      ARRAY[]::text[],
      true,
      NOW(),
      NOW()
    );
  ELSE
    -- Update existing staff record
    UPDATE restaurant_staff 
    SET 
      role = invitation_record.role::staff_role,
      is_active = true,
      updated_at = NOW()
    WHERE id = staff_record.id;
  END IF;

  -- Mark invitation as accepted
  UPDATE staff_invitations 
  SET 
    status = 'accepted',
    accepted_at = NOW()
  WHERE id = invitation_record.id;

  RETURN jsonb_build_object(
    'success', true, 
    'restaurant_id', invitation_record.restaurant_id,
    'role', invitation_record.role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is staff member
CREATE OR REPLACE FUNCTION is_staff_member(check_restaurant_id uuid, check_user_id uuid DEFAULT auth.uid())
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM restaurant_staff 
    WHERE restaurant_id = check_restaurant_id 
      AND user_id = check_user_id 
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get staff info
CREATE OR REPLACE FUNCTION get_staff_info(check_restaurant_id uuid, check_user_id uuid DEFAULT auth.uid())
RETURNS jsonb AS $$
DECLARE
  staff_info record;
BEGIN
  SELECT rs.*, u.email, u.raw_user_meta_data->>'first_name' as first_name, u.raw_user_meta_data->>'last_name' as last_name
  INTO staff_info
  FROM restaurant_staff rs
  JOIN auth.users u ON rs.user_id = u.id
  WHERE rs.restaurant_id = check_restaurant_id 
    AND rs.user_id = check_user_id 
    AND rs.is_active = true;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', staff_info.id,
    'role', staff_info.role,
    'email', staff_info.email,
    'name', COALESCE(staff_info.first_name || ' ' || staff_info.last_name, staff_info.email),
    'permissions', staff_info.permissions,
    'hire_date', staff_info.hire_date
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create staff invitation
CREATE OR REPLACE FUNCTION create_staff_invitation(
  restaurant_id_param uuid,
  email_param text,
  role_param text,
  invited_by_param uuid DEFAULT auth.uid()
)
RETURNS jsonb AS $$
DECLARE
  invitation_token text;
  invitation_id uuid;
BEGIN
  -- Generate unique token
  invitation_token := encode(gen_random_bytes(32), 'base64');
  
  -- Insert invitation
  INSERT INTO staff_invitations (
    restaurant_id,
    email,
    role,
    invited_by,
    token,
    status,
    expires_at,
    created_at
  ) VALUES (
    restaurant_id_param,
    email_param,
    role_param,
    invited_by_param,
    invitation_token,
    'pending',
    NOW() + INTERVAL '7 days',
    NOW()
  ) 
  RETURNING id INTO invitation_id;

  RETURN jsonb_build_object(
    'success', true,
    'invitation_id', invitation_id,
    'token', invitation_token,
    'expires_at', NOW() + INTERVAL '7 days'
  );
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Staff member with this email already invited'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 5. ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Enable RLS on tables
ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;

-- Staff invitations policy (only restaurant owner can manage)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'staff_invitations' 
    AND policyname = 'staff_invitations_owner_access'
  ) THEN
    CREATE POLICY "staff_invitations_owner_access" ON public.staff_invitations
      FOR ALL USING (
        restaurant_id IN (
          SELECT id FROM restaurants WHERE owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Restaurant staff policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'restaurant_staff' 
    AND policyname = 'restaurant_staff_access'
  ) THEN
    CREATE POLICY "restaurant_staff_access" ON public.restaurant_staff
      FOR SELECT USING (
        restaurant_id IN (
          SELECT id FROM restaurants WHERE owner_id = auth.uid()
        ) OR (
          user_id = auth.uid() AND is_active = true
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'restaurant_staff' 
    AND policyname = 'restaurant_staff_owner_modify'
  ) THEN
    CREATE POLICY "restaurant_staff_owner_modify" ON public.restaurant_staff
      FOR ALL USING (
        restaurant_id IN (
          SELECT id FROM restaurants WHERE owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Business hours policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'business_hours' 
    AND policyname = 'business_hours_access'
  ) THEN
    CREATE POLICY "business_hours_access" ON public.business_hours
      FOR ALL USING (
        restaurant_id IN (
          SELECT id FROM restaurants WHERE owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- =============================================================================
-- 6. PERFORMANCE INDEXES
-- =============================================================================

-- Create indexes conditionally
DO $$
BEGIN
  -- Staff invitations indexes
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_staff_invitations_token') THEN
    CREATE INDEX idx_staff_invitations_token 
    ON staff_invitations (token) WHERE status = 'pending';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_staff_invitations_email_status') THEN
    CREATE INDEX idx_staff_invitations_email_status 
    ON staff_invitations (email, status, restaurant_id);
  END IF;

  -- Restaurant staff indexes
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_restaurant_staff_user_restaurant') THEN
    CREATE INDEX idx_restaurant_staff_user_restaurant 
    ON restaurant_staff (user_id, restaurant_id) WHERE is_active = true;
  END IF;

  -- Orders performance indexes
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_orders_restaurant_status') THEN
    CREATE INDEX idx_orders_restaurant_status 
    ON orders (restaurant_id, status) WHERE status IN ('pending', 'preparing', 'ready');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_orders_claimed_by') THEN
    CREATE INDEX idx_orders_claimed_by 
    ON orders (claimed_by) WHERE claimed_by IS NOT NULL;
  END IF;

  -- Active sessions indexes
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_active_sessions_restaurant_status') THEN
    CREATE INDEX idx_active_sessions_restaurant_status 
    ON active_sessions (restaurant_id, status) WHERE status = 'active';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_active_sessions_last_seen') THEN
    CREATE INDEX idx_active_sessions_last_seen 
    ON active_sessions (last_seen) WHERE status = 'active';
  END IF;
END $$;

-- =============================================================================
-- 7. CLEANUP FUNCTIONS
-- =============================================================================

-- Function to cleanup expired data
CREATE OR REPLACE FUNCTION cleanup_expired_data() RETURNS void AS $$
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
  
  -- Mark expired invitations
  UPDATE staff_invitations 
  SET status = 'expired' 
  WHERE status = 'pending' AND expires_at < NOW();

  -- Delete old expired invitations (older than 30 days)
  DELETE FROM staff_invitations 
  WHERE status = 'expired' AND expires_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 8. DATA VALIDATION TRIGGERS
-- =============================================================================

-- Trigger to prevent claiming orders with inactive sessions
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

-- Create trigger conditionally
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE trigger_name = 'validate_order_claim_trigger'
  ) THEN
    CREATE TRIGGER validate_order_claim_trigger
      BEFORE UPDATE ON orders
      FOR EACH ROW
      EXECUTE FUNCTION validate_order_claim();
  END IF;
END $$;

-- =============================================================================
-- MIGRATION COMPLETE - CREATE DEFAULT DATA
-- =============================================================================

-- Create default business hours for existing restaurants
INSERT INTO business_hours (restaurant_id, day_of_week, open_time, close_time, is_closed)
SELECT 
  r.id,
  dow.day,
  CASE WHEN dow.day = 0 THEN '00:00'::time ELSE '09:00'::time END,
  CASE WHEN dow.day = 0 THEN '00:00'::time ELSE '21:00'::time END,
  CASE WHEN dow.day = 0 THEN true ELSE false END
FROM restaurants r
CROSS JOIN (
  SELECT generate_series(0, 6) as day
) dow
WHERE NOT EXISTS (
  SELECT 1 FROM business_hours bh 
  WHERE bh.restaurant_id = r.id AND bh.day_of_week = dow.day
)
ON CONFLICT (restaurant_id, day_of_week) DO NOTHING;

COMMIT; 
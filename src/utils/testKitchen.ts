import { supabase } from '../lib/supabase';

export const testKitchenFunctions = {
  // Test session creation
  async testCreateSession(restaurantId: string, userName: string) {
    console.log('🧪 Testing session creation...');
    try {
      const { data, error } = await supabase
        .from('active_sessions')
        .insert({
          restaurant_id: restaurantId,
          user_name: userName,
          session_token: `test_${Date.now()}`,
          status: 'active',
          last_seen: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      console.log('✅ Session created:', data);
      return data;
    } catch (error) {
      console.error('❌ Session creation failed:', error);
      return null;
    }
  },

  // Test order claiming
  async testClaimOrder(orderId: string, sessionId: string) {
    console.log('🧪 Testing order claiming...');
    try {
      const { data, error } = await supabase.rpc('claim_order', {
        order_uuid: orderId,
        session_uuid: sessionId
      });

      if (error) throw error;
      console.log('✅ Order claim result:', data);
      return data;
    } catch (error) {
      console.error('❌ Order claiming failed:', error);
      return false;
    }
  },

  // Test order release
  async testReleaseOrder(orderId: string, sessionId: string) {
    console.log('🧪 Testing order release...');
    try {
      const { data, error } = await supabase.rpc('release_order', {
        order_uuid: orderId,
        session_uuid: sessionId
      });

      if (error) throw error;
      console.log('✅ Order release result:', data);
      return data;
    } catch (error) {
      console.error('❌ Order release failed:', error);
      return false;
    }
  },

  // Test station creation
  async testCreateStation(restaurantId: string, stationName: string, stationType: string) {
    console.log('🧪 Testing station creation...');
    try {
      const { data, error } = await supabase
        .from('kitchen_stations')
        .insert({
          restaurant_id: restaurantId,
          station_name: stationName,
          station_type: stationType,
          is_active: true,
          position_order: 0
        })
        .select()
        .single();

      if (error) throw error;
      console.log('✅ Station created:', data);
      return data;
    } catch (error) {
      console.error('❌ Station creation failed:', error);
      return null;
    }
  },

  // Test cleanup function
  async testCleanupSessions() {
    console.log('🧪 Testing session cleanup...');
    try {
      const { data, error } = await supabase.rpc('cleanup_expired_sessions');

      if (error) throw error;
      console.log('✅ Cleanup result:', data, 'sessions cleaned');
      return data;
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
      return 0;
    }
  },

  // Get all active sessions for debugging
  async debugActiveSessions(restaurantId: string) {
    console.log('🔍 Debugging active sessions...');
    try {
      const { data, error } = await supabase
        .from('active_sessions')
        .select('*')
        .eq('restaurant_id', restaurantId);

      if (error) throw error;
      console.log('📊 Active sessions:', data);
      return data;
    } catch (error) {
      console.error('❌ Debug failed:', error);
      return [];
    }
  },

  // Get all orders with claim info
  async debugOrders(restaurantId: string) {
    console.log('🔍 Debugging orders...');
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          claimed_session:active_sessions(user_name, status),
          restaurant_table:restaurant_tables(table_number)
        `)
        .eq('restaurant_id', restaurantId)
        .in('status', ['pending', 'preparing', 'ready'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      console.log('📊 Orders:', data);
      return data;
    } catch (error) {
      console.error('❌ Debug failed:', error);
      return [];
    }
  }
};

// Add to window for easy testing in browser console
if (typeof window !== 'undefined') {
  (window as any).testKitchen = testKitchenFunctions;
} 
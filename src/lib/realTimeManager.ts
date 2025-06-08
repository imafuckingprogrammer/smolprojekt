import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Ultra-simplified Real-time Manager
 * No singleton pattern, no complex state management, just simple subscriptions
 */

let subscriptionCounter = 0;

/**
 * Create a simple subscription for orders
 */
export function subscribeToOrders(restaurantId: string, callback: (payload: any) => void): () => void {
  const subscriptionId = `orders_${restaurantId}_${++subscriptionCounter}`;
  
  console.log(`🔥 Creating order subscription: ${subscriptionId}`);
  
  const channel = supabase
    .channel(subscriptionId)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'orders',
      filter: `restaurant_id=eq.${restaurantId}`
    }, (payload) => {
      console.log('📦 Order update:', payload.eventType);
      try {
        callback(payload);
      } catch (error) {
        console.error('Error in order callback:', error);
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`✅ Order subscription active: ${subscriptionId}`);
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        console.log(`❌ Order subscription ${status.toLowerCase()}: ${subscriptionId}`);
      }
    });

  // Return cleanup function
  return () => {
    console.log(`🧹 Cleaning up order subscription: ${subscriptionId}`);
    try {
      supabase.removeChannel(channel);
    } catch (error) {
      console.error('Error removing channel:', error);
    }
  };
}

/**
 * Create a simple subscription for sessions
 */
export function subscribeToSessions(restaurantId: string, callback: (payload: any) => void): () => void {
  const subscriptionId = `sessions_${restaurantId}_${++subscriptionCounter}`;
  
  console.log(`🔥 Creating session subscription: ${subscriptionId}`);
  
  const channel = supabase
    .channel(subscriptionId)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'active_sessions',
      filter: `restaurant_id=eq.${restaurantId}`
    }, (payload) => {
      console.log('👥 Session update:', payload.eventType);
      try {
        callback(payload);
      } catch (error) {
        console.error('Error in session callback:', error);
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`✅ Session subscription active: ${subscriptionId}`);
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        console.log(`❌ Session subscription ${status.toLowerCase()}: ${subscriptionId}`);
      }
    });

  // Return cleanup function
  return () => {
    console.log(`🧹 Cleaning up session subscription: ${subscriptionId}`);
    try {
      supabase.removeChannel(channel);
    } catch (error) {
      console.error('Error removing channel:', error);
    }
  };
}

/**
 * Create a simple subscription for menu items
 */
export function subscribeToMenu(restaurantId: string, callback: (payload: any) => void): () => void {
  const subscriptionId = `menu_${restaurantId}_${++subscriptionCounter}`;
  
  console.log(`🔥 Creating menu subscription: ${subscriptionId}`);
  
  const channel = supabase
    .channel(subscriptionId)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'menu_items',
      filter: `restaurant_id=eq.${restaurantId}`
    }, (payload) => {
      console.log('🍽️ Menu update:', payload.eventType);
      try {
        callback(payload);
      } catch (error) {
        console.error('Error in menu callback:', error);
      }
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'menu_categories',
      filter: `restaurant_id=eq.${restaurantId}`
    }, (payload) => {
      console.log('📂 Menu category update:', payload.eventType);
      try {
        callback(payload);
      } catch (error) {
        console.error('Error in menu category callback:', error);
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`✅ Menu subscription active: ${subscriptionId}`);
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        console.log(`❌ Menu subscription ${status.toLowerCase()}: ${subscriptionId}`);
      }
    });

  // Return cleanup function
  return () => {
    console.log(`🧹 Cleaning up menu subscription: ${subscriptionId}`);
    try {
      supabase.removeChannel(channel);
    } catch (error) {
      console.error('Error removing channel:', error);
    }
  };
}

/**
 * Emergency cleanup - remove all channels (use sparingly)
 */
export function cleanupAllSubscriptions(): void {
  console.log('🚨 Emergency cleanup of all subscriptions');
  try {
    supabase.removeAllChannels();
    console.log('✅ All subscriptions cleaned up');
  } catch (error) {
    console.error('Error during emergency cleanup:', error);
  }
}

// Legacy exports for backward compatibility
export const realTimeManager = {
  subscribeToOrders,
  subscribeToSessions,
  subscribeToMenu,
  destroyAll: cleanupAllSubscriptions
}; 
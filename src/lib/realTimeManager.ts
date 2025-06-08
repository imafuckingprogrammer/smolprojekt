import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

type CallbackFunction = (payload: any) => void;

interface SubscriptionManager {
  channel: RealtimeChannel;
  listeners: Set<CallbackFunction>;
  lastActivity: Date;
}

/**
 * Singleton Real-time Manager to handle all Supabase real-time subscriptions
 * Prevents memory leaks and duplicate subscriptions
 */
class RealTimeManager {
  private static instance: RealTimeManager;
  private subscriptions: Map<string, SubscriptionManager> = new Map();
  private cleanup: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {
    // Private constructor for singleton pattern
  }

  static getInstance(): RealTimeManager {
    if (!RealTimeManager.instance) {
      RealTimeManager.instance = new RealTimeManager();
    }
    return RealTimeManager.instance;
  }

  /**
   * Subscribe to order changes for a specific restaurant
   */
  subscribeToOrders(restaurantId: string, callback: CallbackFunction): () => void {
    const key = `orders_${restaurantId}`;
    return this.subscribe(key, callback, () => {
      const channel = supabase
        .channel(key)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`
        }, callback)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'order_items',
          filter: `order_id=in.(select id from orders where restaurant_id = ${restaurantId})`
        }, callback)
        .subscribe();
      
      return channel;
    });
  }

  /**
   * Subscribe to session changes for a specific restaurant
   */
  subscribeToSessions(restaurantId: string, callback: CallbackFunction): () => void {
    const key = `sessions_${restaurantId}`;
    return this.subscribe(key, callback, () => {
      const channel = supabase
        .channel(key)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'active_sessions',
          filter: `restaurant_id=eq.${restaurantId}`
        }, callback)
        .subscribe();
      
      return channel;
    });
  }

  /**
   * Subscribe to menu changes for a specific restaurant
   */
  subscribeToMenu(restaurantId: string, callback: CallbackFunction): () => void {
    const key = `menu_${restaurantId}`;
    return this.subscribe(key, callback, () => {
      const channel = supabase
        .channel(key)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'menu_items',
          filter: `restaurant_id=eq.${restaurantId}`
        }, callback)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'menu_categories',
          filter: `restaurant_id=eq.${restaurantId}`
        }, callback)
        .subscribe();
      
      return channel;
    });
  }

  /**
   * Generic subscription method
   */
  private subscribe(
    key: string, 
    callback: CallbackFunction, 
    channelFactory: () => RealtimeChannel
  ): () => void {
    // Add listener to existing subscription
    if (this.subscriptions.has(key)) {
      const manager = this.subscriptions.get(key)!;
      manager.listeners.add(callback);
      manager.lastActivity = new Date();
      
      // Cancel any pending cleanup
      const cleanupTimer = this.cleanup.get(key);
      if (cleanupTimer) {
        clearTimeout(cleanupTimer);
        this.cleanup.delete(key);
      }
    } else {
      // Create new subscription
      const channel = channelFactory();
      const manager: SubscriptionManager = {
        channel,
        listeners: new Set([callback]),
        lastActivity: new Date()
      };
      
      this.subscriptions.set(key, manager);
      
      console.log(`✅ Created real-time subscription: ${key}`);
    }

    // Return cleanup function
    return () => {
      this.unsubscribe(key, callback);
    };
  }

  /**
   * Remove a specific callback from a subscription
   */
  private unsubscribe(key: string, callback: CallbackFunction): void {
    const manager = this.subscriptions.get(key);
    if (!manager) return;

    manager.listeners.delete(callback);
    manager.lastActivity = new Date();

    // If no more listeners, schedule cleanup
    if (manager.listeners.size === 0) {
      const cleanupTimer = setTimeout(() => {
        this.cleanupSubscription(key);
      }, 5000); // Wait 5 seconds before cleaning up

      this.cleanup.set(key, cleanupTimer);
    }
  }

  /**
   * Clean up a subscription that has no listeners
   */
  private cleanupSubscription(key: string): void {
    const manager = this.subscriptions.get(key);
    if (!manager || manager.listeners.size > 0) return;

    try {
      supabase.removeChannel(manager.channel);
      this.subscriptions.delete(key);
      this.cleanup.delete(key);
      console.log(`🧹 Cleaned up real-time subscription: ${key}`);
    } catch (error) {
      console.error(`Failed to cleanup subscription ${key}:`, error);
    }
  }

  /**
   * Force cleanup of all subscriptions (for testing/debugging)
   */
  destroyAll(): void {
    for (const [key, manager] of this.subscriptions) {
      try {
        supabase.removeChannel(manager.channel);
      } catch (error) {
        console.error(`Failed to cleanup subscription ${key}:`, error);
      }
    }
    
    for (const timer of this.cleanup.values()) {
      clearTimeout(timer);
    }
    
    this.subscriptions.clear();
    this.cleanup.clear();
    console.log('🧹 Destroyed all real-time subscriptions');
  }

  /**
   * Get current subscription stats (for debugging)
   */
  getStats(): { [key: string]: number } {
    const stats: { [key: string]: number } = {};
    for (const [key, manager] of this.subscriptions) {
      stats[key] = manager.listeners.size;
    }
    return stats;
  }
}

export const realTimeManager = RealTimeManager.getInstance();
export default realTimeManager; 
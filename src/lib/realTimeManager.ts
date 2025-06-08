import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

type CallbackFunction = (payload: any) => void;

interface SubscriptionManager {
  channel: RealtimeChannel;
  listeners: Map<string, CallbackFunction>;
  lastActivity: Date;
  subscriptionType: string;
  restaurantId: string;
}

/**
 * Singleton Real-time Manager to handle all Supabase real-time subscriptions
 * Fixed recursive call stack issue and simplified cleanup
 */
class RealTimeManager {
  private static instance: RealTimeManager;
  private subscriptions: Map<string, SubscriptionManager> = new Map();
  private listenerIdCounter = 0;
  private isDestroying = false;

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
   * Generate compound key to prevent collisions
   */
  private generateKey(type: string, restaurantId: string): string {
    return `${type}:${restaurantId}`;
  }

  /**
   * Generate unique listener ID
   */
  private generateListenerId(): string {
    return `listener_${++this.listenerIdCounter}_${Date.now()}`;
  }

  /**
   * Subscribe to order changes for a specific restaurant
   */
  subscribeToOrders(restaurantId: string, callback: CallbackFunction): () => void {
    if (this.isDestroying) return () => {};
    
    const key = this.generateKey('orders', restaurantId);
    const listenerId = this.generateListenerId();
    
    return this.subscribe(key, listenerId, callback, 'orders', restaurantId, () => {
      return supabase
        .channel(`orders_${restaurantId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`
        }, (payload) => {
          this.handlePayload(key, payload);
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'order_items'
        }, (payload) => {
          this.handlePayload(key, payload);
        });
    });
  }

  /**
   * Subscribe to session changes for a specific restaurant
   */
  subscribeToSessions(restaurantId: string, callback: CallbackFunction): () => void {
    if (this.isDestroying) return () => {};
    
    const key = this.generateKey('sessions', restaurantId);
    const listenerId = this.generateListenerId();
    
    return this.subscribe(key, listenerId, callback, 'sessions', restaurantId, () => {
      return supabase
        .channel(`sessions_${restaurantId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'active_sessions',
          filter: `restaurant_id=eq.${restaurantId}`
        }, (payload) => {
          this.handlePayload(key, payload);
        });
    });
  }

  /**
   * Subscribe to menu changes for a specific restaurant
   */
  subscribeToMenu(restaurantId: string, callback: CallbackFunction): () => void {
    if (this.isDestroying) return () => {};
    
    const key = this.generateKey('menu', restaurantId);
    const listenerId = this.generateListenerId();
    
    return this.subscribe(key, listenerId, callback, 'menu', restaurantId, () => {
      return supabase
        .channel(`menu_${restaurantId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'menu_items',
          filter: `restaurant_id=eq.${restaurantId}`
        }, (payload) => {
          this.handlePayload(key, payload);
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'menu_categories',
          filter: `restaurant_id=eq.${restaurantId}`
        }, (payload) => {
          this.handlePayload(key, payload);
        });
    });
  }

  /**
   * Handle payload and call all listeners
   */
  private handlePayload(key: string, payload: any) {
    const manager = this.subscriptions.get(key);
    if (manager && !this.isDestroying) {
      manager.lastActivity = new Date();
      manager.listeners.forEach((listener) => {
        try {
          listener(payload);
        } catch (error) {
          console.error('Error in real-time listener:', error);
        }
      });
    }
  }

  /**
   * Generic subscription method with simplified error handling
   */
  private subscribe(
    key: string, 
    listenerId: string,
    callback: CallbackFunction,
    subscriptionType: string,
    restaurantId: string,
    channelFactory: () => RealtimeChannel
  ): () => void {
    
    if (this.isDestroying) return () => {};
    
    // Add listener to existing subscription
    if (this.subscriptions.has(key)) {
      const manager = this.subscriptions.get(key)!;
      manager.listeners.set(listenerId, callback);
      manager.lastActivity = new Date();
      
      console.log(`✅ Added listener to existing subscription: ${key}`);
      
    } else {
      // Create new subscription
      try {
        const channel = channelFactory();
        const manager: SubscriptionManager = {
          channel,
          listeners: new Map([[listenerId, callback]]),
          lastActivity: new Date(),
          subscriptionType,
          restaurantId
        };
        
        // Subscribe with simple error handling
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`✅ Created real-time subscription: ${key}`);
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            console.log(`❌ Subscription ${status.toLowerCase()}: ${key}`);
            // Don't attempt automatic recovery to avoid recursion
          }
        });
        
        this.subscriptions.set(key, manager);
        
      } catch (error) {
        console.error(`Failed to create subscription ${key}:`, error);
        return () => {}; // Return empty cleanup function
      }
    }

    // Return cleanup function
    return () => {
      this.unsubscribe(key, listenerId);
    };
  }

  /**
   * Remove a specific callback from a subscription
   */
  private unsubscribe(key: string, listenerId: string): void {
    if (this.isDestroying) return;
    
    const manager = this.subscriptions.get(key);
    if (!manager) return;

    manager.listeners.delete(listenerId);
    console.log(`🗑️ Removed listener ${listenerId} from ${key}`);

    // If no more listeners, cleanup immediately
    if (manager.listeners.size === 0) {
      this.cleanupSubscription(key);
    }
  }

  /**
   * Clean up a subscription - simplified to avoid recursion
   */
  private cleanupSubscription(key: string): void {
    if (this.isDestroying) return;
    
    const manager = this.subscriptions.get(key);
    if (!manager || manager.listeners.size > 0) return;

    try {
      // Simple synchronous cleanup
      supabase.removeChannel(manager.channel);
      this.subscriptions.delete(key);
      console.log(`🧹 Cleaned up real-time subscription: ${key}`);
    } catch (error) {
      console.error(`Failed to cleanup subscription ${key}:`, error);
      // Still remove from our map even if Supabase cleanup failed
      this.subscriptions.delete(key);
    }
  }

  /**
   * Force cleanup of all subscriptions - simplified
   */
  async destroyAll(): Promise<void> {
    this.isDestroying = true;
    console.log('🧹 Destroying all real-time subscriptions...');
    
    try {
      // Simple cleanup without recursion
      for (const [key, manager] of this.subscriptions) {
        try {
          supabase.removeChannel(manager.channel);
        } catch (error) {
          console.error(`Failed to cleanup subscription ${key}:`, error);
        }
      }
      
      this.subscriptions.clear();
      console.log('🧹 All real-time subscriptions destroyed');
    } finally {
      this.isDestroying = false;
    }
  }

  /**
   * Get statistics about current subscriptions
   */
  getStats(): { 
    totalSubscriptions: number;
    subscriptionsByType: Record<string, number>;
    totalListeners: number;
  } {
    const stats = {
      totalSubscriptions: this.subscriptions.size,
      subscriptionsByType: {} as Record<string, number>,
      totalListeners: 0
    };

    for (const [, manager] of this.subscriptions) {
      const type = manager.subscriptionType;
      stats.subscriptionsByType[type] = (stats.subscriptionsByType[type] || 0) + 1;
      stats.totalListeners += manager.listeners.size;
    }

    return stats;
  }
}

export const realTimeManager = RealTimeManager.getInstance();
export default realTimeManager; 
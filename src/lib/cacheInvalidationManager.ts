import { QueryClient } from '@tanstack/react-query';
import { queryKeys, invalidateQueries } from './queryClient';
import { realTimeManager } from './realTimeManager';
import { cacheManager } from './cacheManager';

export class CacheInvalidationManager {
  private static instance: CacheInvalidationManager;
  private queryClient: QueryClient;
  private subscriptions = new Map<string, () => void>();
  private isSetup = false;

  private constructor(queryClient: QueryClient) {
    this.queryClient = queryClient;
  }

  static getInstance(queryClient: QueryClient): CacheInvalidationManager {
    if (!CacheInvalidationManager.instance) {
      CacheInvalidationManager.instance = new CacheInvalidationManager(queryClient);
    }
    return CacheInvalidationManager.instance;
  }

  /**
   * Set up global cache invalidation for a restaurant
   */
  setupGlobalInvalidation(restaurantId: string): void {
    if (this.subscriptions.has(`global-${restaurantId}`)) {
      console.log('🔄 Global invalidation already set up for restaurant:', restaurantId);
      return;
    }

    console.log('🔄 Setting up global cache invalidation for restaurant:', restaurantId);

    // Order changes invalidation
    const unsubscribeOrders = realTimeManager.subscribeToOrders(
      restaurantId,
      this.handleOrderChange.bind(this, restaurantId)
    );

    // Menu changes invalidation
    const unsubscribeMenu = realTimeManager.subscribeToMenu(
      restaurantId,
      this.handleMenuChange.bind(this, restaurantId)
    );

    // Session changes invalidation
    const unsubscribeSessions = realTimeManager.subscribeToSessions(
      restaurantId,
      this.handleSessionChange.bind(this, restaurantId)
    );

    // Combined cleanup function
    const cleanup = () => {
      console.log('🔄 Cleaning up global invalidation for restaurant:', restaurantId);
      unsubscribeOrders();
      unsubscribeMenu();
      unsubscribeSessions();
    };

    this.subscriptions.set(`global-${restaurantId}`, cleanup);
    this.isSetup = true;
  }

  /**
   * Handle order-related changes
   */
  private async handleOrderChange(restaurantId: string, payload: any): Promise<void> {
    const { eventType, table, new: newData, old: oldData } = payload;
    
    console.log('🔄 Processing order change:', {
      eventType,
      table,
      orderId: newData?.id || oldData?.id,
      status: newData?.status
    });

    switch (table) {
      case 'orders':
        await this.invalidateOrderQueries(restaurantId, newData?.id || oldData?.id);
        break;
      
      case 'order_items':
        // Order items changed, invalidate the parent order
        const orderId = newData?.order_id || oldData?.order_id;
        if (orderId) {
          await this.invalidateOrderQueries(restaurantId, orderId);
        }
        break;
    }

    // Also invalidate analytics if order status changed to completed states
    if (newData?.status && ['served', 'cancelled'].includes(newData.status)) {
      this.queryClient.invalidateQueries({
        queryKey: queryKeys.dashboardStats(restaurantId)
      });
    }

    // Invalidate our custom cache manager's order-related data
    await cacheManager.invalidateByTag(`orders-${restaurantId}`);
  }

  /**
   * Handle menu-related changes
   */
  private async handleMenuChange(restaurantId: string, payload: any): Promise<void> {
    const { eventType, table, new: newData, old: oldData } = payload;
    
    console.log('🔄 Processing menu change:', {
      eventType,
      table,
      itemId: newData?.id || oldData?.id
    });

    switch (table) {
      case 'menu_items':
        invalidateQueries.menu(restaurantId);
        break;
      
      case 'menu_categories':
        invalidateQueries.menu(restaurantId);
        break;
      
      case 'restaurants':
        // Restaurant info changed
        this.queryClient.invalidateQueries({
          queryKey: queryKeys.restaurant(restaurantId)
        });
        break;
    }

    // Invalidate our custom cache manager's menu-related data
    await cacheManager.invalidateByTag(`menu-${restaurantId}`);
  }

  /**
   * Handle session-related changes
   */
  private async handleSessionChange(restaurantId: string, payload: any): Promise<void> {
    const { eventType, table, new: newData, old: oldData } = payload;
    
    console.log('🔄 Processing session change:', {
      eventType,
      table,
      sessionId: newData?.id || oldData?.id
    });

    // Session changes affect claimed orders
    this.queryClient.invalidateQueries({
      queryKey: queryKeys.orders(restaurantId),
      exact: false // Invalidate all order variants
    });

    this.queryClient.invalidateQueries({
      queryKey: queryKeys.kitchenSessions(restaurantId)
    });

    // Invalidate our custom cache manager's session-related data
    await cacheManager.invalidateByTag(`sessions-${restaurantId}`);
  }

  /**
   * Invalidate all order-related queries for a specific order
   */
  private async invalidateOrderQueries(restaurantId: string, orderId?: string): Promise<void> {
    // Invalidate orders list
    this.queryClient.invalidateQueries({
      queryKey: queryKeys.orders(restaurantId),
      exact: false // This will invalidate all variants (different filters, etc.)
    });

    // Invalidate specific order if we have ID
    if (orderId) {
      this.queryClient.invalidateQueries({
        queryKey: queryKeys.order(restaurantId, orderId)
      });
    }

    // Invalidate order history
    this.queryClient.invalidateQueries({
      queryKey: queryKeys.orderHistory(restaurantId)
    });
  }

  /**
   * Manual cache invalidation methods
   */
  async invalidateAllForRestaurant(restaurantId: string): Promise<void> {
    console.log('🔄 Manually invalidating all cache for restaurant:', restaurantId);
    
    invalidateQueries.restaurant(restaurantId);
    await cacheManager.invalidateByTag(`restaurant-${restaurantId}`);
  }

  async invalidateOrders(restaurantId: string): Promise<void> {
    console.log('🔄 Manually invalidating orders for restaurant:', restaurantId);
    
    invalidateQueries.orders(restaurantId);
    await cacheManager.invalidateByTag(`orders-${restaurantId}`);
  }

  async invalidateMenu(restaurantId: string): Promise<void> {
    console.log('🔄 Manually invalidating menu for restaurant:', restaurantId);
    
    invalidateQueries.menu(restaurantId);
    await cacheManager.invalidateByTag(`menu-${restaurantId}`);
  }

  async invalidateAnalytics(restaurantId: string): Promise<void> {
    console.log('🔄 Manually invalidating analytics for restaurant:', restaurantId);
    
    invalidateQueries.analytics(restaurantId);
    await cacheManager.invalidateByTag(`analytics-${restaurantId}`);
  }

  /**
   * Performance optimization: batch invalidations
   */
  private invalidationQueue = new Set<string>();
  private invalidationTimer: NodeJS.Timeout | null = null;

  private queueInvalidation(key: string): void {
    this.invalidationQueue.add(key);
    
    if (this.invalidationTimer) {
      clearTimeout(this.invalidationTimer);
    }

    // Batch invalidations over 100ms to avoid excessive refetching
    this.invalidationTimer = setTimeout(() => {
      this.processInvalidationQueue();
    }, 100);
  }

  private processInvalidationQueue(): void {
    if (this.invalidationQueue.size === 0) return;

    console.log('🔄 Processing batched invalidations:', Array.from(this.invalidationQueue));

    // Group by restaurant ID for efficient invalidation
    const restaurantGroups = new Map<string, Set<string>>();
    
    for (const key of this.invalidationQueue) {
      const [type, restaurantId] = key.split('-');
      if (!restaurantGroups.has(restaurantId)) {
        restaurantGroups.set(restaurantId, new Set());
      }
      restaurantGroups.get(restaurantId)!.add(type);
    }

    // Process each restaurant's invalidations
    for (const [restaurantId, types] of restaurantGroups) {
      if (types.has('orders')) {
        this.queryClient.invalidateQueries({
          queryKey: queryKeys.orders(restaurantId),
          exact: false
        });
      }

      if (types.has('menu')) {
        invalidateQueries.menu(restaurantId);
      }

      if (types.has('analytics')) {
        invalidateQueries.analytics(restaurantId);
      }
    }

    this.invalidationQueue.clear();
    this.invalidationTimer = null;
  }

  /**
   * Health check and diagnostics
   */
  getStats(): {
    subscriptions: number;
    queueSize: number;
    isSetup: boolean;
  } {
    return {
      subscriptions: this.subscriptions.size,
      queueSize: this.invalidationQueue.size,
      isSetup: this.isSetup
    };
  }

  /**
   * Cleanup all subscriptions
   */
  cleanup(): void {
    console.log('🔄 Cleaning up all cache invalidation subscriptions');
    
    for (const cleanup of this.subscriptions.values()) {
      cleanup();
    }
    
    this.subscriptions.clear();
    
    if (this.invalidationTimer) {
      clearTimeout(this.invalidationTimer);
      this.invalidationTimer = null;
    }
    
    this.invalidationQueue.clear();
    this.isSetup = false;
  }

  /**
   * Remove subscription for specific restaurant
   */
  removeSubscription(restaurantId: string): void {
    const key = `global-${restaurantId}`;
    const cleanup = this.subscriptions.get(key);
    
    if (cleanup) {
      console.log('🔄 Removing cache invalidation for restaurant:', restaurantId);
      cleanup();
      this.subscriptions.delete(key);
    }
  }
}

// Export singleton factory
export function createCacheInvalidationManager(queryClient: QueryClient): CacheInvalidationManager {
  return CacheInvalidationManager.getInstance(queryClient);
}

export default CacheInvalidationManager; 
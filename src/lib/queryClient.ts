import { QueryClient } from '@tanstack/react-query';
import { cacheManager } from './cacheManager';

// Create a custom QueryClient with proper configuration
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 2 minutes by default (shorter for real-time data)
      staleTime: 2 * 60 * 1000,
      // Keep in cache for 10 minutes
      gcTime: 10 * 60 * 1000,
      // Don't refetch on window focus for kitchen data
      refetchOnWindowFocus: false,
      // Don't refetch on mount if data is fresh
      refetchOnMount: false,
      // Custom retry logic for Supabase errors
      retry: (failureCount, error: any) => {
        // Don't retry on authentication errors
        if (error?.code === 'PGRST301' || error?.message?.includes('JWT')) {
          return false;
        }
        // Don't retry on 4xx errors (client errors)
        if (error?.status >= 400 && error?.status < 500) {
          return false;
        }
        // Don't retry on network errors more than once
        if (error?.message?.includes('network') && failureCount >= 1) {
          return false;
        }
        // Retry up to 2 times for other errors
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    },
    mutations: {
      // Retry mutations once on failure
      retry: (failureCount, error: any) => {
        // Don't retry on authentication or validation errors
        if (error?.code === 'PGRST301' || error?.status === 400) {
          return false;
        }
        return failureCount < 1;
      },
      retryDelay: 1000,
    },
  },
});

// Query key factory for consistent key generation
export const queryKeys = {
  // Restaurant queries
  restaurants: ['restaurants'] as const,
  restaurant: (id: string) => ['restaurants', id] as const,
  
  // Menu queries - more specific keys to prevent over-invalidation
  menu: (restaurantId: string) => ['menu', restaurantId] as const,
  menuCategories: (restaurantId: string) => ['menu', restaurantId, 'categories'] as const,
  menuItems: (restaurantId: string) => ['menu', restaurantId, 'items'] as const,
  menuItem: (restaurantId: string, itemId: string) => ['menu', restaurantId, 'items', itemId] as const,
  
  // Order queries - separate from restaurant to avoid conflicts
  orders: (restaurantId: string) => ['orders', restaurantId] as const,
  order: (restaurantId: string, orderId: string) => ['orders', restaurantId, orderId] as const,
  orderHistory: (restaurantId: string) => ['orders', restaurantId, 'history'] as const,
  kitchenOrders: (restaurantId: string) => ['orders', restaurantId, 'kitchen'] as const,
  
  // Table queries
  tables: (restaurantId: string) => ['tables', restaurantId] as const,
  table: (restaurantId: string, tableId: string) => ['tables', restaurantId, tableId] as const,
  tableByToken: (token: string) => ['tables', 'token', token] as const,
  
  // Analytics queries
  analytics: (restaurantId: string) => ['analytics', restaurantId] as const,
  dashboardStats: (restaurantId: string) => ['analytics', restaurantId, 'dashboard'] as const,
  
  // Session queries
  kitchenSessions: (restaurantId: string) => ['sessions', restaurantId] as const,
  
  // Staff queries
  staff: (restaurantId: string) => ['staff', restaurantId] as const,
} as const;

// Targeted cache invalidation helpers
export const invalidateQueries = {
  // Invalidate specific menu data only
  menuItems: (restaurantId: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.menuItems(restaurantId) });
  },
  
  menuCategories: (restaurantId: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.menuCategories(restaurantId) });
  },
  
  // Invalidate all menu data for a restaurant
  menu: (restaurantId: string) => {
    queryClient.invalidateQueries({ queryKey: ['menu', restaurantId] });
  },
  
  // Invalidate specific order data only
  orders: (restaurantId: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.orders(restaurantId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.kitchenOrders(restaurantId) });
  },
  
  // Invalidate specific order
  order: (restaurantId: string, orderId: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.order(restaurantId, orderId) });
    // Also invalidate order lists
    invalidateQueries.orders(restaurantId);
  },
  
  // Invalidate analytics data
  analytics: (restaurantId: string) => {
    queryClient.invalidateQueries({ queryKey: ['analytics', restaurantId] });
  },
  
  // Invalidate session data
  sessions: (restaurantId: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.kitchenSessions(restaurantId) });
  },
  
  // Invalidate staff data
  staff: (restaurantId: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.staff(restaurantId) });
  },
  
  // Emergency: invalidate everything (use sparingly)
  all: () => {
    queryClient.invalidateQueries();
  },
};

// Optimistic update helpers
export const optimisticUpdates = {
  // Update order status optimistically
  updateOrderStatus: (restaurantId: string, orderId: string, newStatus: string) => {
    const orderKey = queryKeys.order(restaurantId, orderId);
    const ordersKey = queryKeys.orders(restaurantId);
    const kitchenOrdersKey = queryKeys.kitchenOrders(restaurantId);
    
    // Update individual order
    queryClient.setQueryData(orderKey, (old: any) => {
      if (!old) return old;
      return { ...old, status: newStatus, updated_at: new Date().toISOString() };
    });
    
    // Update order lists
    [ordersKey, kitchenOrdersKey].forEach(key => {
      queryClient.setQueryData(key, (old: any) => {
        if (!old) return old;
        if (Array.isArray(old)) {
          return old.map((order: any) => 
            order.id === orderId 
              ? { ...order, status: newStatus, updated_at: new Date().toISOString() }
              : order
          );
        }
        return old;
      });
    });
  },
  
  // Add new order optimistically
  addOrder: (restaurantId: string, newOrder: any) => {
    const ordersKey = queryKeys.orders(restaurantId);
    const kitchenOrdersKey = queryKeys.kitchenOrders(restaurantId);
    
    [ordersKey, kitchenOrdersKey].forEach(key => {
      queryClient.setQueryData(key, (old: any) => {
        if (!old) return [newOrder];
        if (Array.isArray(old)) {
          return [newOrder, ...old];
        }
        return old;
      });
    });
  },
  
  // Update menu item optimistically
  updateMenuItem: (restaurantId: string, itemId: string, updates: any) => {
    const itemKey = queryKeys.menuItem(restaurantId, itemId);
    const itemsKey = queryKeys.menuItems(restaurantId);
    
    // Update individual item
    queryClient.setQueryData(itemKey, (old: any) => {
      if (!old) return old;
      return { ...old, ...updates, updated_at: new Date().toISOString() };
    });
    
    // Update items list
    queryClient.setQueryData(itemsKey, (old: any) => {
      if (!old) return old;
      if (Array.isArray(old)) {
        return old.map((item: any) => 
          item.id === itemId 
            ? { ...item, ...updates, updated_at: new Date().toISOString() }
            : item
        );
      }
      return old;
    });
  },
};

// Prefetch helpers for improved UX
export const prefetchQueries = {
  menu: async (restaurantId: string) => {
    try {
      await queryClient.prefetchQuery({
        queryKey: queryKeys.menu(restaurantId),
        queryFn: () => import('../api/menu').then(m => m.fetchMenu(restaurantId)),
        staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
      });
    } catch (error) {
      console.warn('Failed to prefetch menu:', error);
    }
  },
  
  orders: async (restaurantId: string) => {
    try {
      await queryClient.prefetchQuery({
        queryKey: queryKeys.orders(restaurantId),
        queryFn: () => import('../api/orders').then(o => o.fetchOrders(restaurantId)),
        staleTime: 30 * 1000, // Consider fresh for 30 seconds
      });
    } catch (error) {
      console.warn('Failed to prefetch orders:', error);
    }
  },
};

// Real-time update handlers
export const realTimeHandlers = {
  // Handle order changes from real-time subscriptions
  handleOrderChange: (payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    const restaurantId = newRecord?.restaurant_id || oldRecord?.restaurant_id;
    
    if (!restaurantId) return;
    
    switch (eventType) {
      case 'INSERT':
        // Add new order optimistically
        optimisticUpdates.addOrder(restaurantId, newRecord);
        break;
        
      case 'UPDATE':
        // Update existing order
        if (newRecord?.id) {
          optimisticUpdates.updateOrderStatus(restaurantId, newRecord.id, newRecord.status);
        }
        break;
        
      case 'DELETE':
        // Remove order from cache
        invalidateQueries.orders(restaurantId);
        break;
        
      default:
        // Fallback: invalidate orders
        invalidateQueries.orders(restaurantId);
    }
  },
  
  // Handle menu changes from real-time subscriptions
  handleMenuChange: (payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    const restaurantId = newRecord?.restaurant_id || oldRecord?.restaurant_id;
    
    if (!restaurantId) return;
    
    switch (eventType) {
      case 'INSERT':
      case 'UPDATE':
        if (newRecord?.id) {
          optimisticUpdates.updateMenuItem(restaurantId, newRecord.id, newRecord);
        }
        break;
        
      case 'DELETE':
        // Invalidate menu data
        invalidateQueries.menu(restaurantId);
        break;
        
      default:
        invalidateQueries.menu(restaurantId);
    }
  },
  
  // Handle session changes
  handleSessionChange: (payload: any) => {
    const { new: newRecord, old: oldRecord } = payload;
    const restaurantId = newRecord?.restaurant_id || oldRecord?.restaurant_id;
    
    if (restaurantId) {
      invalidateQueries.sessions(restaurantId);
    }
  },
};

// Cache health monitoring
export const cacheHealth = {
  getStats: () => {
    const cache = queryClient.getQueryCache();
    const queries = cache.getAll();
    
    return {
      totalQueries: queries.length,
      successfulQueries: queries.filter(q => q.state.status === 'success').length,
      errorQueries: queries.filter(q => q.state.status === 'error').length,
      loadingQueries: queries.filter(q => q.state.status === 'pending').length,
      staleQueries: queries.filter(q => q.isStale()).length,
      memoryUsage: queries.reduce((acc, q) => {
        return acc + (JSON.stringify(q.state.data || {}).length || 0);
      }, 0),
    };
  },
  
  cleanup: () => {
    // Remove stale queries older than 30 minutes
    const cache = queryClient.getQueryCache();
    const now = Date.now();
    const thirtyMinutes = 30 * 60 * 1000;
    
    cache.getAll().forEach(query => {
      if (now - query.state.dataUpdatedAt > thirtyMinutes) {
        cache.remove(query);
      }
    });
  },
};

// Set up automatic cache cleanup
if (typeof window !== 'undefined') {
  // Clean up cache every 10 minutes
  setInterval(() => {
    cacheHealth.cleanup();
  }, 10 * 60 * 1000);
}

// Cache persistence using our cache manager
export const cachePresistence = {
  async save() {
    try {
      const state = queryClient.getQueryCache().getAll();
      const serializable = state
        .filter(query => {
          // Only cache successful queries with data
          return query.state.status === 'success' && query.state.data;
        })
        .map(query => ({
          queryKey: query.queryKey,
          data: query.state.data,
          dataUpdatedAt: query.state.dataUpdatedAt,
        }));
      
      await cacheManager.set('react-query-cache', serializable, {
        ttl: 30 * 60 * 1000, // 30 minutes
        priority: 'high',
        dependencies: ['app-cache'],
      });
    } catch (error) {
      console.error('Failed to save query cache:', error);
    }
  },
  
  async restore() {
    try {
      const cached = await cacheManager.get<any[]>('react-query-cache');
      if (cached) {
        cached.forEach(({ queryKey, data, dataUpdatedAt }) => {
          queryClient.setQueryData(queryKey, data, {
            updatedAt: dataUpdatedAt,
          });
        });
      }
    } catch (error) {
      console.error('Failed to restore query cache:', error);
    }
  },
  
  async clear() {
    await cacheManager.invalidate('react-query-cache');
    queryClient.clear();
  },
};

// Set up automatic cache persistence
if (typeof window !== 'undefined') {
  // Save cache on page unload
  window.addEventListener('beforeunload', () => {
    cachePresistence.save();
  });
  
  // Save cache periodically
  setInterval(() => {
    cachePresistence.save();
  }, 5 * 60 * 1000); // Every 5 minutes
}

export default queryClient; 
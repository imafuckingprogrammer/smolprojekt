import { QueryClient } from '@tanstack/react-query';
import { cacheManager } from './cacheManager';

// Create a custom QueryClient with proper configuration
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 5 minutes by default
      staleTime: 5 * 60 * 1000,
      // Keep in cache for 30 minutes
      gcTime: 30 * 60 * 1000,
      // Don't refetch on window focus by default
      refetchOnWindowFocus: false,
      // Don't refetch on mount if data is fresh
      refetchOnMount: false,
      // Retry failed requests 3 times with exponential backoff
      retry: (failureCount, error: any) => {
        // Don't retry on 4xx errors (client errors)
        if (error?.status >= 400 && error?.status < 500) {
          return false;
        }
        // Retry up to 3 times for other errors
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
      retryDelay: 1000,
    },
  },
});

// Query key factory for consistent key generation
export const queryKeys = {
  // Restaurant queries
  restaurants: ['restaurants'] as const,
  restaurant: (id: string) => ['restaurants', id] as const,
  
  // Menu queries  
  menu: (restaurantId: string) => ['restaurants', restaurantId, 'menu'] as const,
  menuCategories: (restaurantId: string) => 
    ['restaurants', restaurantId, 'menu', 'categories'] as const,
  menuItems: (restaurantId: string) => 
    ['restaurants', restaurantId, 'menu', 'items'] as const,
  menuItem: (restaurantId: string, itemId: string) => 
    ['restaurants', restaurantId, 'menu', 'items', itemId] as const,
  
  // Order queries
  orders: (restaurantId: string) => 
    ['restaurants', restaurantId, 'orders'] as const,
  order: (restaurantId: string, orderId: string) => 
    ['restaurants', restaurantId, 'orders', orderId] as const,
  orderHistory: (restaurantId: string) => 
    ['restaurants', restaurantId, 'orders', 'history'] as const,
  
  // Table queries
  tables: (restaurantId: string) => 
    ['restaurants', restaurantId, 'tables'] as const,
  table: (restaurantId: string, tableId: string) => 
    ['restaurants', restaurantId, 'tables', tableId] as const,
  tableByToken: (token: string) => ['tables', 'token', token] as const,
  
  // Analytics queries
  analytics: (restaurantId: string) => 
    ['restaurants', restaurantId, 'analytics'] as const,
  dashboardStats: (restaurantId: string) => 
    ['restaurants', restaurantId, 'analytics', 'dashboard'] as const,
  monthlyStats: (restaurantId: string, year: number, month: number) => 
    ['restaurants', restaurantId, 'analytics', 'monthly', year, month] as const,
  
  // Session queries
  kitchenSessions: (restaurantId: string) => 
    ['restaurants', restaurantId, 'sessions'] as const,
} as const;

// Cache invalidation helpers
export const invalidateQueries = {
  // Invalidate all menu-related data
  menu: (restaurantId: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.menu(restaurantId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.menuCategories(restaurantId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.menuItems(restaurantId) });
  },
  
  // Invalidate all order-related data
  orders: (restaurantId: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.orders(restaurantId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.orderHistory(restaurantId) });
  },
  
  // Invalidate all analytics data
  analytics: (restaurantId: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.analytics(restaurantId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats(restaurantId) });
  },
  
  // Invalidate everything for a restaurant
  restaurant: (restaurantId: string) => {
    queryClient.invalidateQueries({ queryKey: ['restaurants', restaurantId] });
  },
  
  // Invalidate all data
  all: () => {
    queryClient.invalidateQueries();
  },
};

// Prefetch helpers for improved UX
export const prefetchQueries = {
  menu: async (restaurantId: string) => {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.menu(restaurantId),
      queryFn: () => import('../api/menu').then(m => m.fetchMenu(restaurantId)),
      staleTime: 10 * 60 * 1000, // Consider fresh for 10 minutes
    });
  },
  
  orders: async (restaurantId: string) => {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.orders(restaurantId),
      queryFn: () => import('../api/orders').then(o => o.fetchOrders(restaurantId)),
      staleTime: 1 * 60 * 1000, // Consider fresh for 1 minute
    });
  },
};

// Cache warming on app start
export const warmCache = async (restaurantId: string) => {
  try {
    // Pre-warm critical data
    await Promise.allSettled([
      prefetchQueries.menu(restaurantId),
      prefetchQueries.orders(restaurantId),
    ]);
  } catch (error) {
    console.warn('Failed to warm cache:', error);
  }
};

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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, invalidateQueries } from '../lib/queryClient';
import { realTimeManager } from '../lib/realTimeManager';
import { useEffect } from 'react';

// Import API functions
import { fetchMenu, fetchMenuCategories, fetchMenuItems, updateMenuItem } from '../api/menu';
import { 
  fetchOrders, 
  fetchOrder, 
  updateOrderStatus, 
  claimOrder, 
  releaseOrder, 
  createOrder,
  autoAssignOrder
} from '../api/orders';
import { 
  fetchRestaurantStaff, 
  fetchActiveWorkSessions, 
  startWorkSession, 
  endWorkSession
} from '../api/users';

// Menu hooks
export function useMenu(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.menu(restaurantId!),
    queryFn: () => fetchMenu(restaurantId!),
    enabled: !!restaurantId,
    staleTime: 10 * 60 * 1000, // 10 minutes - menu data changes infrequently
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

export function useMenuCategories(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.menuCategories(restaurantId!),
    queryFn: () => fetchMenuCategories(restaurantId!),
    enabled: !!restaurantId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

export function useMenuItems(restaurantId: string | undefined, categoryId?: string) {
  return useQuery({
    queryKey: categoryId 
      ? [...queryKeys.menuItems(restaurantId!), categoryId]
      : queryKeys.menuItems(restaurantId!),
    queryFn: () => fetchMenuItems(restaurantId!, categoryId),
    enabled: !!restaurantId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

// Orders hooks
export function useOrders(
  restaurantId: string | undefined,
  options: {
    status?: ('pending' | 'preparing' | 'ready' | 'served' | 'cancelled')[];
    includeHistory?: boolean;
  } = {}
) {
  return useQuery({
    queryKey: [
      ...queryKeys.orders(restaurantId!),
      { status: options.status, includeHistory: options.includeHistory }
    ],
    queryFn: () => fetchOrders(restaurantId!, options),
    enabled: !!restaurantId,
    staleTime: 30 * 1000, // 30 seconds - orders change frequently
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 30 * 1000, // Refetch every 30 seconds as backup to real-time
  });
}

export function useOrder(restaurantId: string | undefined, orderId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.order(restaurantId!, orderId!),
    queryFn: () => fetchOrder(restaurantId!, orderId!),
    enabled: !!restaurantId && !!orderId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Real-time integration hook
export function useRealTimeOrders(restaurantId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!restaurantId) return;

    console.log('🔄 Setting up real-time orders invalidation for:', restaurantId);

    const handleOrderChange = (payload: any) => {
      console.log('🔄 Real-time order change, invalidating cache:', payload.eventType);
      
      // Invalidate orders queries to trigger refetch
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.orders(restaurantId),
        exact: false // Invalidate all order-related queries
      });

      // If we have specific order info, invalidate that too
      if (payload.new?.id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.order(restaurantId, payload.new.id)
        });
      }
    };

    const handleSessionChange = (payload: any) => {
      console.log('🔄 Real-time session change, invalidating orders:', payload.eventType);
      
      // Sessions affect claimed_by data in orders
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.orders(restaurantId),
        exact: false
      });
    };

    // Subscribe to real-time changes
    const unsubscribeOrders = realTimeManager.subscribeToOrders(restaurantId, handleOrderChange);
    const unsubscribeSessions = realTimeManager.subscribeToSessions(restaurantId, handleSessionChange);

    return () => {
      console.log('🔄 Cleaning up real-time orders subscription');
      unsubscribeOrders();
      unsubscribeSessions();
    };
  }, [restaurantId, queryClient]);
}

// Real-time integration hook for menu
export function useRealTimeMenu(restaurantId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!restaurantId) return;

    console.log('🔄 Setting up real-time menu invalidation for:', restaurantId);

    const handleMenuChange = (payload: any) => {
      console.log('🔄 Real-time menu change, invalidating cache:', payload.table, payload.eventType);
      
      // Invalidate menu-related queries
      invalidateQueries.menu(restaurantId);
    };

    // Subscribe to menu changes
    const unsubscribeMenu = realTimeManager.subscribeToMenu(restaurantId, handleMenuChange);

    return () => {
      console.log('🔄 Cleaning up real-time menu subscription');
      unsubscribeMenu();
    };
  }, [restaurantId, queryClient]);
}

// Mutation hooks with optimistic updates
export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateOrderStatus,
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ 
        queryKey: queryKeys.orders(variables.restaurantId) 
      });

      // Snapshot the previous value
      const previousOrders = queryClient.getQueryData(
        queryKeys.orders(variables.restaurantId)
      );

      // Optimistically update the orders list
      queryClient.setQueryData(
        queryKeys.orders(variables.restaurantId),
        (old: any) => {
          if (!old?.orders) return old;
          
          return {
            ...old,
            orders: old.orders.map((order: any) =>
              order.id === variables.orderId
                ? { 
                    ...order, 
                    status: variables.status,
                    claimed_by: variables.status === 'claimed' ? variables.staffId : 
                               variables.status === 'pending' ? null : order.claimed_by,
                    claimed_at: variables.status === 'claimed' ? new Date().toISOString() :
                               variables.status === 'pending' ? null : order.claimed_at,
                    updated_at: new Date().toISOString()
                  }
                : order
            )
          };
        }
      );

      return { previousOrders };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousOrders) {
        queryClient.setQueryData(
          queryKeys.orders(variables.restaurantId),
          context.previousOrders
        );
      }
    },
    onSettled: (_data, _error, variables) => {
      // Always refetch after mutation to ensure consistency
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.orders(variables.restaurantId) 
      });
    },
  });
}

export function useClaimOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: claimOrder,
    onSuccess: (_data, variables) => {
      // Invalidate orders to refetch with updated claim info
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.orders(variables.restaurantId) 
      });
    },
  });
}

export function useReleaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: releaseOrder,
    onSuccess: (_data, variables) => {
      // Invalidate orders to refetch with updated claim info
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.orders(variables.restaurantId) 
      });
    },
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createOrder,
    onSuccess: (_data, variables) => {
      // Invalidate orders and analytics
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.orders(variables.restaurantId) 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.dashboardStats(variables.restaurantId) 
      });
    },
  });
}

export function useUpdateMenuItem() {
  return useMutation({
    mutationFn: updateMenuItem,
    onSuccess: (_data, variables) => {
      // Invalidate menu-related queries
      invalidateQueries.menu(variables.restaurantId);
    },
  });
}

// Staff Management Hooks
export function useRestaurantStaff(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.restaurant(restaurantId!),
    queryFn: () => fetchRestaurantStaff(restaurantId!),
    enabled: !!restaurantId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  });
}

export function useActiveWorkSessions(restaurantId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.kitchenSessions(restaurantId!), 'active'],
    queryFn: () => fetchActiveWorkSessions(restaurantId!),
    enabled: !!restaurantId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 60 * 1000, // Refetch every minute
  });
}

export function useStartWorkSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: startWorkSession,
    onSuccess: (_data, _variables) => {
      // Invalidate active sessions
      queryClient.invalidateQueries({
        queryKey: ['restaurants'],
        exact: false
      });
    },
  });
}

export function useEndWorkSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: endWorkSession,
    onSuccess: () => {
      // Invalidate active sessions
      queryClient.invalidateQueries({
        queryKey: ['restaurants'],
        exact: false
      });
    },
  });
}

export function useAutoAssignOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: autoAssignOrder,
    onSuccess: (_data, variables) => {
      // Invalidate orders to refetch with assignment data
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.orders(variables.restaurantId) 
      });
    },
  });
}

// Combined hook for order management with real-time updates
export function useOrderManagement(restaurantId: string | undefined) {
  const ordersQuery = useOrders(restaurantId);
  
  // Set up real-time updates
  useRealTimeOrders(restaurantId);

  const updateMutation = useUpdateOrderStatus();
  const claimMutation = useClaimOrder();
  const releaseMutation = useReleaseOrder();

  return {
    // Data
    orders: ordersQuery.data?.orders || [],
    loading: ordersQuery.isLoading,
    error: ordersQuery.error,
    refetch: ordersQuery.refetch,
    
    // Actions
    updateOrderStatus: updateMutation.mutate,
    claimOrder: claimMutation.mutate,
    releaseOrder: releaseMutation.mutate,
    
    // Action states
    updating: updateMutation.isPending || claimMutation.isPending || releaseMutation.isPending,
    updateError: updateMutation.error || claimMutation.error || releaseMutation.error,
  };
}

// Combined hook for menu management with real-time updates
export function useMenuManagement(restaurantId: string | undefined) {
  const menuQuery = useMenu(restaurantId);
  
  // Set up real-time updates
  useRealTimeMenu(restaurantId);

  const updateMutation = useUpdateMenuItem();

  return {
    // Data
    menu: menuQuery.data,
    categories: menuQuery.data?.categories || [],
    items: menuQuery.data?.items || [],
    itemsWithCategories: menuQuery.data?.itemsWithCategories || [],
    loading: menuQuery.isLoading,
    error: menuQuery.error,
    refetch: menuQuery.refetch,
    
    // Actions
    updateMenuItem: updateMutation.mutate,
    
    // Action states
    updating: updateMutation.isPending,
    updateError: updateMutation.error,
  };
} 
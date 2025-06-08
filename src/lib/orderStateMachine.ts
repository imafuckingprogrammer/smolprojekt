import { supabase } from './supabase';
import type { UserRole } from '../contexts/UserRoleContext';

export type OrderStatus = 'pending' | 'claimed' | 'preparing' | 'ready' | 'served' | 'cancelled';

export interface OrderTransition {
  from: OrderStatus | '*';
  to: OrderStatus;
  requiredRole: 'kitchen' | 'owner' | '*';
  requiredPermissions?: string[];
  conditions?: (order: OrderWithStatus, userRole: UserRole) => boolean;
  description: string;
}

export interface OrderWithStatus {
  id: string;
  status: OrderStatus;
  claimed_by?: string;
  claimed_at?: string;
  version?: number;
  restaurant_id: string;
  [key: string]: any;
}

// Define all valid order state transitions
export const ORDER_TRANSITIONS: OrderTransition[] = [
  // Kitchen staff transitions
  {
    from: 'pending',
    to: 'claimed',
    requiredRole: 'kitchen',
    requiredPermissions: ['claim_orders'],
    description: 'Kitchen staff can claim pending orders'
  },
  {
    from: 'claimed',
    to: 'preparing',
    requiredRole: 'kitchen',
    requiredPermissions: ['update_order_status'],
    conditions: (order, userRole) => {
      // Only the claimant can start preparing
      return order.claimed_by === userRole.sessionId;
    },
    description: 'Order claimant can start preparing'
  },
  {
    from: 'preparing',
    to: 'ready',
    requiredRole: 'kitchen',
    requiredPermissions: ['update_order_status'],
    conditions: (order, userRole) => {
      // Only the claimant can mark as ready
      return order.claimed_by === userRole.sessionId;
    },
    description: 'Order claimant can mark as ready'
  },
  {
    from: 'ready',
    to: 'served',
    requiredRole: 'kitchen',
    requiredPermissions: ['update_order_status'],
    description: 'Any kitchen staff can mark ready orders as served'
  },
  {
    from: 'claimed',
    to: 'pending',
    requiredRole: 'kitchen',
    requiredPermissions: ['release_orders'],
    conditions: (order, userRole) => {
      // Only the claimant can release their claim
      return order.claimed_by === userRole.sessionId;
    },
    description: 'Order claimant can release their claim'
  },
  {
    from: 'preparing',
    to: 'pending',
    requiredRole: 'kitchen',
    requiredPermissions: ['release_orders'],
    conditions: (order, userRole) => {
      // Only the claimant can release from preparing
      return order.claimed_by === userRole.sessionId;
    },
    description: 'Order claimant can release from preparing'
  },
  
  // Owner override transitions - owners can do anything
  {
    from: '*',
    to: 'pending',
    requiredRole: 'owner',
    requiredPermissions: ['override_any_action'],
    description: 'Owner can reset any order to pending'
  },
  {
    from: '*',
    to: 'claimed',
    requiredRole: 'owner',
    requiredPermissions: ['override_any_action'],
    description: 'Owner can claim any order'
  },
  {
    from: '*',
    to: 'preparing',
    requiredRole: 'owner',
    requiredPermissions: ['override_any_action'],
    description: 'Owner can set any order to preparing'
  },
  {
    from: '*',
    to: 'ready',
    requiredRole: 'owner',
    requiredPermissions: ['override_any_action'],
    description: 'Owner can mark any order as ready'
  },
  {
    from: '*',
    to: 'served',
    requiredRole: 'owner',
    requiredPermissions: ['override_any_action'],
    description: 'Owner can mark any order as served'
  },
  {
    from: '*',
    to: 'cancelled',
    requiredRole: 'owner',
    requiredPermissions: ['override_any_action'],
    description: 'Owner can cancel any order'
  }
];

export class OrderStateMachine {
  /**
   * Check if a user can perform a specific state transition
   */
  static canTransition(
    order: OrderWithStatus,
    newStatus: OrderStatus,
    userRole: UserRole
  ): { allowed: boolean; reason?: string; transition?: OrderTransition } {
    const validTransitions = ORDER_TRANSITIONS.filter(transition => {
      // Check status match
      const statusMatch = transition.from === '*' || transition.from === order.status;
      if (!statusMatch) return false;

      // Check target status
      if (transition.to !== newStatus) return false;

      // Check role
      const roleMatch = transition.requiredRole === '*' || 
                       transition.requiredRole === userRole.type;
      if (!roleMatch) return false;

      // Check permissions
      if (transition.requiredPermissions) {
        const hasRequiredPermissions = transition.requiredPermissions.every(permission =>
          userRole.permissions.includes(permission) || 
          userRole.permissions.includes('override_any_action')
        );
        if (!hasRequiredPermissions) return false;
      }

      // Check custom conditions
      if (transition.conditions && !transition.conditions(order, userRole)) {
        return false;
      }

      return true;
    });

    if (validTransitions.length === 0) {
      return {
        allowed: false,
        reason: `No valid transition from ${order.status} to ${newStatus} for role ${userRole.type}`
      };
    }

    // Return the first valid transition (they should be ordered by specificity)
    return {
      allowed: true,
      transition: validTransitions[0]
    };
  }

  /**
   * Get all possible transitions from current state for a user
   */
  static getAvailableTransitions(
    order: OrderWithStatus,
    userRole: UserRole
  ): { status: OrderStatus; transition: OrderTransition }[] {
    const availableStatuses: OrderStatus[] = ['pending', 'claimed', 'preparing', 'ready', 'served', 'cancelled'];
    
    return availableStatuses
      .map(status => {
        const result = this.canTransition(order, status, userRole);
        return result.allowed ? { status, transition: result.transition! } : null;
      })
      .filter((item): item is { status: OrderStatus; transition: OrderTransition } => item !== null);
  }

  /**
   * Perform an atomic order status update with version checking
   */
  static async updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    userRole: UserRole,
    options: {
      claimantSessionId?: string;
      expectedVersion?: number;
      reasonOverride?: string;
    } = {}
  ): Promise<{
    success: boolean;
    error?: string;
    order?: OrderWithStatus;
    conflictData?: any;
  }> {
    try {
      // First, get the current order state
      const { data: currentOrder, error: fetchError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (fetchError || !currentOrder) {
        return {
          success: false,
          error: 'Order not found or could not be fetched'
        };
      }

      // Check if user can make this transition
      const transitionCheck = this.canTransition(currentOrder, newStatus, userRole);
      
      if (!transitionCheck.allowed) {
        return {
          success: false,
          error: transitionCheck.reason || 'Transition not allowed'
        };
      }

      // Prepare update data
      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString()
      };

      // Handle claiming logic
      if (newStatus === 'claimed' && userRole.sessionId) {
        updateData.claimed_by = userRole.sessionId;
        updateData.claimed_at = new Date().toISOString();
      } else if (newStatus === 'pending') {
        // Releasing claim
        updateData.claimed_by = null;
        updateData.claimed_at = null;
      }

      // Use RPC for atomic updates if available
      const { data, error } = await supabase.rpc('update_order_status_atomic', {
        order_uuid: orderId,
        new_status: newStatus,
        session_uuid: userRole.sessionId || null,
        user_role: userRole.type,
        expected_version: options.expectedVersion || currentOrder.version || 0
      });

      if (error) {
        // Check if it's a version conflict
        if (error.message?.includes('version') || error.message?.includes('conflict')) {
          // Fetch current state for conflict resolution
          const { data: conflictOrder } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

          return {
            success: false,
            error: 'Order was modified by another user. Please refresh and try again.',
            conflictData: conflictOrder
          };
        }

        return {
          success: false,
          error: error.message || 'Failed to update order status'
        };
      }

      // If RPC not available, fall back to direct update
      if (!data) {
        const { data: updatedOrder, error: updateError } = await supabase
          .from('orders')
          .update(updateData)
          .eq('id', orderId)
          .select()
          .single();

        if (updateError) {
          return {
            success: false,
            error: updateError.message || 'Failed to update order status'
          };
        }

        return {
          success: true,
          order: updatedOrder
        };
      }

      return {
        success: true,
        order: data
      };

    } catch (error) {
      console.error('Error in updateOrderStatus:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Claim an order atomically
   */
  static async claimOrder(
    orderId: string,
    userRole: UserRole
  ): Promise<{ success: boolean; error?: string; order?: OrderWithStatus }> {
    if (!userRole.sessionId) {
      return {
        success: false,
        error: 'No active session. Please join the kitchen first.'
      };
    }

    return this.updateOrderStatus(orderId, 'claimed', userRole, {
      claimantSessionId: userRole.sessionId
    });
  }

  /**
   * Release an order claim atomically
   */
  static async releaseOrder(
    orderId: string,
    userRole: UserRole
  ): Promise<{ success: boolean; error?: string; order?: OrderWithStatus }> {
    return this.updateOrderStatus(orderId, 'pending', userRole);
  }

  /**
   * Get a human-readable description of what actions are available
   */
  static getActionDescriptions(
    order: OrderWithStatus,
    userRole: UserRole
  ): string[] {
    const transitions = this.getAvailableTransitions(order, userRole);
    return transitions.map(t => t.transition.description);
  }

  /**
   * Validate if an order can be updated by checking business rules
   */
  static validateOrderUpdate(
    order: OrderWithStatus,
    userRole: UserRole
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check if order is too old (e.g., more than 24 hours)
    const orderAge = Date.now() - new Date(order.created_at || 0).getTime();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    if (orderAge > maxAge && userRole.type !== 'owner') {
      issues.push('Order is too old to be modified by kitchen staff');
    }

    // Check if order is already served
    if (order.status === 'served' && userRole.type !== 'owner') {
      issues.push('Cannot modify orders that have been served');
    }

    // Check if order is cancelled
    if (order.status === 'cancelled') {
      issues.push('Cannot modify cancelled orders');
    }

    // Kitchen staff can only work on orders for their session
    if (userRole.type === 'kitchen' && order.claimed_by && 
        order.claimed_by !== userRole.sessionId && 
        !['pending', 'ready'].includes(order.status)) {
      issues.push('This order is claimed by another kitchen staff member');
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}

export default OrderStateMachine; 
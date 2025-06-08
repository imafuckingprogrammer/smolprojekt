import { supabase } from '../lib/supabase';
import type { MenuCategory, MenuItem, MenuItemWithCategory } from '../types/database';

export interface MenuData {
  categories: MenuCategory[];
  items: MenuItem[];
  itemsWithCategories: MenuItemWithCategory[];
}

/**
 * Fetch complete menu data for a restaurant
 */
export async function fetchMenu(restaurantId: string): Promise<MenuData> {
  try {
    // Fetch categories and items in parallel
    const [categoriesResult, itemsResult] = await Promise.all([
      supabase
        .from('menu_categories')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('sort_order'),
      
      supabase
        .from('menu_items')
        .select(`
          *,
          menu_category:menu_categories(*)
        `)
        .eq('restaurant_id', restaurantId)
        .eq('is_available', true)
        .order('sort_order')
    ]);

    if (categoriesResult.error) throw categoriesResult.error;
    if (itemsResult.error) throw itemsResult.error;

    const categories = categoriesResult.data || [];
    const items = itemsResult.data || [];
    const itemsWithCategories = items as MenuItemWithCategory[];

    return {
      categories,
      items,
      itemsWithCategories
    };
  } catch (error) {
    console.error('Error fetching menu:', error);
    throw error;
  }
}

/**
 * Fetch menu categories only
 */
export async function fetchMenuCategories(restaurantId: string): Promise<MenuCategory[]> {
  try {
    const { data, error } = await supabase
      .from('menu_categories')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .order('sort_order');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching menu categories:', error);
    throw error;
  }
}

/**
 * Fetch menu items for a specific category
 */
export async function fetchMenuItems(
  restaurantId: string, 
  categoryId?: string
): Promise<MenuItem[]> {
  try {
    let query = supabase
      .from('menu_items')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_available', true)
      .order('sort_order');

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching menu items:', error);
    throw error;
  }
}

/**
 * Fetch a single menu item
 */
export async function fetchMenuItem(
  restaurantId: string, 
  itemId: string
): Promise<MenuItemWithCategory> {
  try {
    const { data, error } = await supabase
      .from('menu_items')
      .select(`
        *,
        menu_category:menu_categories(*)
      `)
      .eq('restaurant_id', restaurantId)
      .eq('id', itemId)
      .single();

    if (error) throw error;
    return data as MenuItemWithCategory;
  } catch (error) {
    console.error('Error fetching menu item:', error);
    throw error;
  }
}

/**
 * Update menu item
 */
export async function updateMenuItem(variables: {
  restaurantId: string;
  itemId: string;
  updates: Partial<MenuItem>;
}): Promise<MenuItem> {
  try {
    const { data, error } = await supabase
      .from('menu_items')
      .update(variables.updates)
      .eq('id', variables.itemId)
      .eq('restaurant_id', variables.restaurantId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating menu item:', error);
    throw error;
  }
}

/**
 * Create new menu item
 */
export async function createMenuItem(variables: {
  restaurantId: string;
  menuItem: Omit<MenuItem, 'id' | 'created_at' | 'updated_at'>;
}): Promise<MenuItem> {
  try {
    const { data, error } = await supabase
      .from('menu_items')
      .insert({
        ...variables.menuItem,
        restaurant_id: variables.restaurantId
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating menu item:', error);
    throw error;
  }
}

/**
 * Delete menu item
 */
export async function deleteMenuItem(variables: {
  restaurantId: string;
  itemId: string;
}): Promise<void> {
  try {
    const { error } = await supabase
      .from('menu_items')
      .delete()
      .eq('id', variables.itemId)
      .eq('restaurant_id', variables.restaurantId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting menu item:', error);
    throw error;
  }
} 
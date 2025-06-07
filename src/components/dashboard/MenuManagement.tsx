import { useState, useEffect, memo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { MenuSkeleton } from '../ui/SkeletonLoader';
import { formatCurrency } from '../../lib/utils';
import type { MenuCategory, MenuItem } from '../../types/database';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  EyeSlashIcon,
  CheckCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

interface CategoryFormData {
  name: string;
}

interface MenuItemFormData {
  name: string;
  description: string;
  price: string;
  category_id: string;
  image_url: string;
}

export const MenuManagement = memo(function MenuManagement() {
  const { restaurant } = useAuth();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  
  const [categoryForm, setCategoryForm] = useState<CategoryFormData>({
    name: ''
  });
  
  const [itemForm, setItemForm] = useState<MenuItemFormData>({
    name: '',
    description: '',
    price: '',
    category_id: '',
    image_url: ''
  });

  useEffect(() => {
    if (restaurant) {
      loadMenuData();
      
      // Set up real-time subscription for menu changes
      const subscription = supabase
        .channel(`menu_changes_${restaurant.id}_${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'menu_categories',
            filter: `restaurant_id=eq.${restaurant.id}`
          },
          () => {
            loadMenuData();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'menu_items',
            filter: `restaurant_id=eq.${restaurant.id}`
          },
          () => {
            loadMenuData();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(subscription);
      };
    }
  }, [restaurant]);

  const loadMenuData = async () => {
    if (!restaurant) return;

    try {
      setLoading(true);

      // Load categories
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('menu_categories')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('sort_order', { ascending: true });

      if (categoriesError) throw categoriesError;

      // Load menu items
      const { data: itemsData, error: itemsError } = await supabase
        .from('menu_items')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('sort_order', { ascending: true });

      if (itemsError) throw itemsError;

      setCategories(categoriesData || []);
      setMenuItems(itemsData || []);
    } catch (error) {
      console.error('Error loading menu data:', error);
      alert('Failed to load menu data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurant) return;

    try {
      const nextSortOrder = Math.max(...categories.map(c => c.sort_order), 0) + 1;

      if (editingCategory) {
        // Update existing category
        const { error } = await supabase
          .from('menu_categories')
          .update({
            name: categoryForm.name
          })
          .eq('id', editingCategory.id);

        if (error) throw error;
      } else {
        // Create new category
        const { error } = await supabase
          .from('menu_categories')
          .insert({
            restaurant_id: restaurant.id,
            name: categoryForm.name,
            sort_order: nextSortOrder,
            is_active: true
          });

        if (error) throw error;
      }

      setCategoryForm({ name: '' });
      setShowCategoryForm(false);
      setEditingCategory(null);
      loadMenuData();
    } catch (error) {
      console.error('Error saving category:', error);
      alert('Failed to save category. Please try again.');
    }
  };

  const handleItemSubmit = async (e: React.FormEvent, closeAfter = false) => {
    e.preventDefault();
    if (!restaurant) return;

    try {
      setSubmitting(true);
      const price = parseFloat(itemForm.price);
      if (isNaN(price) || price < 0) {
        alert('Please enter a valid price');
        return;
      }

      const nextSortOrder = Math.max(...menuItems.map(i => i.sort_order), 0) + 1;

      if (editingItem) {
        // Update existing item
        const { error } = await supabase
          .from('menu_items')
          .update({
            name: itemForm.name,
            description: itemForm.description || null,
            price: price,
            category_id: itemForm.category_id,
            image_url: itemForm.image_url || null
          })
          .eq('id', editingItem.id);

        if (error) throw error;
        setSuccessMessage('Menu item updated successfully!');
        setShowItemForm(false);
        setEditingItem(null);
      } else {
        // Create new item
        const { error } = await supabase
          .from('menu_items')
          .insert({
            restaurant_id: restaurant.id,
            category_id: itemForm.category_id,
            name: itemForm.name,
            description: itemForm.description || null,
            price: price,
            image_url: itemForm.image_url || null,
            is_available: true,
            sort_order: nextSortOrder
          });

        if (error) throw error;
        setSuccessMessage('Menu item added successfully!');
        
        // Reset form for new item
        setItemForm({
          name: '',
          description: '',
          price: '',
          category_id: itemForm.category_id, // Keep category selected
          image_url: ''
        });
        
        // Close form if requested
        if (closeAfter) {
          setShowItemForm(false);
        }
      }

      loadMenuData();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error saving menu item:', error);
      alert('Failed to save menu item. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCategoryStatus = async (category: MenuCategory) => {
    try {
      const { error } = await supabase
        .from('menu_categories')
        .update({ is_active: !category.is_active })
        .eq('id', category.id);

      if (error) throw error;
      loadMenuData();
    } catch (error) {
      console.error('Error toggling category status:', error);
      alert('Failed to update category status.');
    }
  };

  const toggleItemAvailability = async (item: MenuItem) => {
    try {
      const { error } = await supabase
        .from('menu_items')
        .update({ is_available: !item.is_available })
        .eq('id', item.id);

      if (error) throw error;
      loadMenuData();
    } catch (error) {
      console.error('Error toggling item availability:', error);
      alert('Failed to update item availability.');
    }
  };

  const deleteCategory = async (category: MenuCategory) => {
    if (!confirm('Are you sure you want to delete this category? All items in this category will also be deleted.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('menu_categories')
        .delete()
        .eq('id', category.id);

      if (error) throw error;
      loadMenuData();
    } catch (error) {
      console.error('Error deleting category:', error);
      alert('Failed to delete category.');
    }
  };

  const deleteMenuItem = async (item: MenuItem) => {
    if (!confirm('Are you sure you want to delete this menu item?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('menu_items')
        .delete()
        .eq('id', item.id);

      if (error) throw error;
      loadMenuData();
    } catch (error) {
      console.error('Error deleting menu item:', error);
      alert('Failed to delete menu item.');
    }
  };

  const startEditCategory = (category: MenuCategory) => {
    setEditingCategory(category);
    setCategoryForm({ name: category.name });
    setShowCategoryForm(true);
  };

  const startEditItem = (item: MenuItem) => {
    setEditingItem(item);
    setItemForm({
      name: item.name,
      description: item.description || '',
      price: item.price.toString(),
      category_id: item.category_id,
      image_url: item.image_url || ''
    });
    setShowItemForm(true);
  };

  const cancelCategoryForm = () => {
    setCategoryForm({ name: '' });
    setShowCategoryForm(false);
    setEditingCategory(null);
  };

  const cancelItemForm = () => {
    setItemForm({
      name: '',
      description: '',
      price: '',
      category_id: '',
      image_url: ''
    });
    setShowItemForm(false);
    setEditingItem(null);
  };

  const getItemsByCategory = (categoryId: string) => {
    return menuItems.filter(item => item.category_id === categoryId);
  };

  if (loading) {
    return <MenuSkeleton />;
  }

  return (
    <div className="p-6">
      {/* Success Message */}
      {successMessage && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center">
          <CheckCircleIcon className="h-5 w-5 text-green-600 mr-3" />
          <span className="text-green-800">{successMessage}</span>
        </div>
      )}
      
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menu Management</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage your menu categories and items
          </p>
        </div>
        <div className="space-x-3">
          <button
            onClick={() => setShowCategoryForm(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Add Category
          </button>
          <button
            onClick={() => setShowItemForm(true)}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Add Item
          </button>
        </div>
      </div>

      {/* Category Form Modal */}
      {showCategoryForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-medium mb-4">
              {editingCategory ? 'Edit Category' : 'Add New Category'}
            </h2>
            <form onSubmit={handleCategorySubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category Name
                </label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ name: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g., Appetizers, Main Courses, Desserts"
                  required
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={cancelCategoryForm}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                >
                  {editingCategory ? 'Update' : 'Add'} Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Menu Item Form Modal */}
      {showItemForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium">
                {editingItem ? 'Edit Menu Item' : 'Add New Menu Item'}
              </h2>
              <button
                onClick={cancelItemForm}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={(e) => handleItemSubmit(e, false)}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category
                </label>
                <select
                  value={itemForm.category_id}
                  onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                >
                  <option value="">Select a category</option>
                  {categories.filter(c => c.is_active).map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Item Name
                </label>
                <input
                  type="text"
                  value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g., Margherita Pizza"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={itemForm.description}
                  onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Describe your menu item..."
                  rows={3}
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Price ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={itemForm.price}
                  onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Image URL (Optional)
                </label>
                <input
                  type="url"
                  value={itemForm.image_url}
                  onChange={(e) => setItemForm({ ...itemForm, image_url: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="https://..."
                />
              </div>
              <div className="flex justify-between space-x-3">
                <button
                  type="button"
                  onClick={cancelItemForm}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Close
                </button>
                <div className="flex space-x-2">
                  {!editingItem && (
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                      {submitting ? 'Adding...' : 'Add & Continue'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={submitting}
                    className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
                    onClick={(e) => handleItemSubmit(e, true)}
                  >
                    {submitting ? 'Saving...' : editingItem ? 'Update' : 'Add & Close'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Menu Content */}
      <div className="space-y-8">
        {categories.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No menu categories yet.</p>
            <button
              onClick={() => setShowCategoryForm(true)}
              className="btn-primary"
            >
              Create Your First Category
            </button>
          </div>
        ) : (
          categories.map(category => (
            <div key={category.id} className="card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {category.name}
                  </h2>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    category.is_active 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {category.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => toggleCategoryStatus(category)}
                    className="p-2 text-gray-400 hover:text-gray-600"
                    title={category.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {category.is_active ? (
                      <EyeIcon className="h-4 w-4" />
                    ) : (
                      <EyeSlashIcon className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => startEditCategory(category)}
                    className="p-2 text-gray-400 hover:text-gray-600"
                    title="Edit category"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteCategory(category)}
                    className="p-2 text-gray-400 hover:text-red-600"
                    title="Delete category"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {getItemsByCategory(category.id).map(item => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h3 className="font-medium text-gray-900">{item.name}</h3>
                        <span className="text-lg font-semibold text-green-600">
                          {formatCurrency(item.price)}
                        </span>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          item.is_available 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {item.is_available ? 'Available' : 'Unavailable'}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => toggleItemAvailability(item)}
                        className="p-2 text-gray-400 hover:text-gray-600"
                        title={item.is_available ? 'Mark unavailable' : 'Mark available'}
                      >
                        {item.is_available ? (
                          <EyeIcon className="h-4 w-4" />
                        ) : (
                          <EyeSlashIcon className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => startEditItem(item)}
                        className="p-2 text-gray-400 hover:text-gray-600"
                        title="Edit item"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteMenuItem(item)}
                        className="p-2 text-gray-400 hover:text-red-600"
                        title="Delete item"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                
                {getItemsByCategory(category.id).length === 0 && (
                  <div className="text-center py-6 text-gray-500">
                    No items in this category yet.
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});
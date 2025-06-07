import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { getEnvStatus } from '../../lib/env-check';

export function TestMenu() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const envStatus = getEnvStatus();

  const createSampleData = async () => {
    setLoading(true);
    setStatus('Creating sample data...');

    try {
      // First check if we have a restaurant
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setStatus('Error: Not authenticated');
        return;
      }

      // Create sample categories
      const { data: categories, error: catError } = await supabase
        .from('menu_categories')
        .insert([
          {
            restaurant_id: user.id,
            name: 'Appetizers',
            sort_order: 1,
            is_active: true
          },
          {
            restaurant_id: user.id,
            name: 'Main Courses',
            sort_order: 2,
            is_active: true
          },
          {
            restaurant_id: user.id,
            name: 'Desserts',
            sort_order: 3,
            is_active: true
          }
        ])
        .select();

      if (catError) throw catError;

      if (categories && categories.length > 0) {
        // Create sample menu items
        const { error: itemError } = await supabase
          .from('menu_items')
          .insert([
            {
              restaurant_id: user.id,
              category_id: categories[0].id,
              name: 'Caesar Salad',
              description: 'Fresh romaine lettuce with parmesan cheese and croutons',
              price: 12.99,
              is_available: true,
              sort_order: 1
            },
            {
              restaurant_id: user.id,
              category_id: categories[0].id,
              name: 'Buffalo Wings',
              description: 'Spicy chicken wings served with celery and blue cheese',
              price: 14.99,
              is_available: true,
              sort_order: 2
            },
            {
              restaurant_id: user.id,
              category_id: categories[1].id,
              name: 'Grilled Salmon',
              description: 'Fresh Atlantic salmon with lemon herb seasoning',
              price: 24.99,
              is_available: true,
              sort_order: 1
            },
            {
              restaurant_id: user.id,
              category_id: categories[1].id,
              name: 'Ribeye Steak',
              description: '12oz ribeye cooked to perfection',
              price: 32.99,
              is_available: true,
              sort_order: 2
            },
            {
              restaurant_id: user.id,
              category_id: categories[2].id,
              name: 'Chocolate Cake',
              description: 'Rich chocolate cake with vanilla ice cream',
              price: 8.99,
              is_available: true,
              sort_order: 1
            }
          ]);

        if (itemError) throw itemError;
      }

      setStatus('Sample data created successfully!');
    } catch (error) {
      console.error('Error creating sample data:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const clearData = async () => {
    setLoading(true);
    setStatus('Clearing all menu data...');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setStatus('Error: Not authenticated');
        return;
      }

      // Delete menu items first (due to foreign key constraints)
      const { error: itemError } = await supabase
        .from('menu_items')
        .delete()
        .eq('restaurant_id', user.id);

      if (itemError) throw itemError;

      // Then delete categories
      const { error: catError } = await supabase
        .from('menu_categories')
        .delete()
        .eq('restaurant_id', user.id);

      if (catError) throw catError;

      setStatus('All menu data cleared successfully!');
    } catch (error) {
      console.error('Error clearing data:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Menu Test Page</h1>
          
          {/* Environment Status */}
          <div className="mb-6 p-4 bg-gray-50 rounded-md">
            <h3 className="font-medium text-gray-900 mb-2">Environment Status</h3>
            <div className="text-sm space-y-1">
              <p>Supabase URL: <span className="font-mono">{envStatus.supabaseUrl}</span></p>
              <p>Supabase Key: <span className="font-mono">{envStatus.supabaseKey}</span></p>
              <p>Stripe Key: <span className="font-mono">{envStatus.stripeKey}</span></p>
              <p>Environment: <span className="font-mono">{envStatus.environment}</span></p>
            </div>
          </div>
          
          <div className="space-y-4">
            <button
              onClick={createSampleData}
              disabled={loading}
              className="w-full btn-primary"
            >
              {loading ? <LoadingSpinner size="sm" /> : 'Create Sample Menu Data'}
            </button>
            
            <button
              onClick={clearData}
              disabled={loading}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? <LoadingSpinner size="sm" /> : 'Clear All Menu Data'}
            </button>
          </div>

          {status && (
            <div className={`mt-4 p-4 rounded-md ${
              status.includes('Error') 
                ? 'bg-red-50 text-red-700' 
                : 'bg-green-50 text-green-700'
            }`}>
              {status}
            </div>
          )}

          <div className="mt-6 text-sm text-gray-600">
            <p>This page helps you:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Create sample menu categories and items</li>
              <li>Clear all menu data if needed</li>
              <li>Test that your database connection is working</li>
            </ul>
            <p className="mt-4">
              After creating sample data, you can:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Go to Menu Management to see and edit the data</li>
              <li>Create a table and generate a QR code</li>
              <li>Scan the QR code to test the ordering flow</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
} 
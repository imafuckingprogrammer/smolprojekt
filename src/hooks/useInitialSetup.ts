import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export function useInitialSetup() {
  const { restaurant } = useAuth();

  useEffect(() => {
    if (!restaurant) return;
    
    setupInitialStations();
  }, [restaurant]);

  const setupInitialStations = async () => {
    if (!restaurant) return;

    try {
      // Check if stations already exist
      const { data: existingStations } = await supabase
        .from('kitchen_stations')
        .select('id')
        .eq('restaurant_id', restaurant.id)
        .limit(1);

      if (existingStations && existingStations.length > 0) {
        return; // Stations already exist
      }

      // Create default stations
      const defaultStations = [
        {
          restaurant_id: restaurant.id,
          station_name: 'Main Kitchen',
          station_type: 'all',
          position_order: 1
        },
        {
          restaurant_id: restaurant.id,
          station_name: 'Hot Food Station',
          station_type: 'hot_food',
          position_order: 2
        },
        {
          restaurant_id: restaurant.id,
          station_name: 'Cold Food & Salads',
          station_type: 'cold_food',
          position_order: 3
        },
        {
          restaurant_id: restaurant.id,
          station_name: 'Drinks & Beverages',
          station_type: 'drinks',
          position_order: 4
        }
      ];

      const { error } = await supabase
        .from('kitchen_stations')
        .insert(defaultStations);

      if (error) {
        console.error('Error creating default stations:', error);
      } else {
        console.log('Default kitchen stations created successfully');
      }

    } catch (error) {
      console.error('Error in setupInitialStations:', error);
    }
  };
} 
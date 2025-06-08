import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface BusinessHours {
  id: string;
  restaurant_id: string;
  day_of_week: number; // 0 = Sunday, 1 = Monday, etc.
  open_time: string; // HH:MM format
  close_time: string; // HH:MM format
  is_closed: boolean;
  created_at: string;
  updated_at: string;
}

export interface BusinessHoursResponse {
  businessHours: BusinessHours[];
  loading: boolean;
  error: string | null;
  isOpen: boolean;
  nextOpenTime: Date | null;
  updateBusinessHours: (hours: Partial<BusinessHours>[]) => Promise<boolean>;
  checkIfOpen: () => boolean;
}

export function useBusinessHours(restaurantId: string | null): BusinessHoursResponse {
  const [businessHours, setBusinessHours] = useState<BusinessHours[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch business hours
  const fetchBusinessHours = async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const { data, error } = await supabase
        .from('business_hours')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('day_of_week');

      if (error) throw error;

      // If no business hours exist, create default ones (9 AM - 9 PM, closed Sundays)
      if (!data || data.length === 0) {
        const defaultHours = Array.from({ length: 7 }, (_, day) => ({
          restaurant_id: restaurantId,
          day_of_week: day,
          open_time: day === 0 ? '00:00' : '09:00', // Sunday closed
          close_time: day === 0 ? '00:00' : '21:00', // Sunday closed
          is_closed: day === 0 // Sunday closed
        }));

        const { data: createdHours, error: createError } = await supabase
          .from('business_hours')
          .insert(defaultHours)
          .select();

        if (createError) throw createError;
        setBusinessHours(createdHours || []);
      } else {
        setBusinessHours(data);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch business hours';
      setError(errorMessage);
      console.error('Error fetching business hours:', err);
    } finally {
      setLoading(false);
    }
  };

  // Check if restaurant is currently open
  const checkIfOpen = (): boolean => {
    if (businessHours.length === 0) return false;

    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday
    const currentTime = now.getHours() * 60 + now.getMinutes(); // Minutes since midnight

    const todayHours = businessHours.find(h => h.day_of_week === currentDay);
    if (!todayHours || todayHours.is_closed) return false;

    const [openHour, openMin] = todayHours.open_time.split(':').map(Number);
    const [closeHour, closeMin] = todayHours.close_time.split(':').map(Number);
    
    const openTime = openHour * 60 + openMin;
    const closeTime = closeHour * 60 + closeMin;

    // Handle overnight hours (e.g., 22:00 - 02:00)
    if (closeTime < openTime) {
      return currentTime >= openTime || currentTime < closeTime;
    }

    return currentTime >= openTime && currentTime < closeTime;
  };

  // Get next opening time
  const getNextOpenTime = (): Date | null => {
    if (businessHours.length === 0) return null;

    const now = new Date();
    const currentDay = now.getDay();
    
    // Check remaining days in the week
    for (let i = 0; i < 7; i++) {
      const checkDay = (currentDay + i) % 7;
      const dayHours = businessHours.find(h => h.day_of_week === checkDay);
      
      if (dayHours && !dayHours.is_closed) {
        const [openHour, openMin] = dayHours.open_time.split(':').map(Number);
        const nextOpen = new Date(now);
        nextOpen.setDate(now.getDate() + i);
        nextOpen.setHours(openHour, openMin, 0, 0);
        
        // If it's today and the time hasn't passed yet
        if (i === 0 && nextOpen > now) {
          return nextOpen;
        }
        // If it's a future day
        if (i > 0) {
          return nextOpen;
        }
      }
    }
    
    return null;
  };

  // Update business hours
  const updateBusinessHours = async (hours: Partial<BusinessHours>[]): Promise<boolean> => {
    if (!restaurantId) return false;

    try {
      setError(null);
      setLoading(true);

      // Update each hour entry
      for (const hour of hours) {
        if (!hour.id) continue;

        const { error } = await supabase
          .from('business_hours')
          .update({
            open_time: hour.open_time,
            close_time: hour.close_time,
            is_closed: hour.is_closed,
            updated_at: new Date().toISOString()
          })
          .eq('id', hour.id);

        if (error) throw error;
      }

      // Refresh business hours
      await fetchBusinessHours();
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update business hours';
      setError(errorMessage);
      console.error('Error updating business hours:', err);
      return false;
    }
  };

  // Load business hours on mount
  useEffect(() => {
    fetchBusinessHours();
  }, [restaurantId]);

  return {
    businessHours,
    loading,
    error,
    isOpen: checkIfOpen(),
    nextOpenTime: getNextOpenTime(),
    updateBusinessHours,
    checkIfOpen
  };
} 
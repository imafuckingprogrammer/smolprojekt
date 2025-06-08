import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface KitchenSession {
  id: string;
  userName: string;
  restaurantId: string;
  isActive: boolean;
}

export function useKitchenSession(restaurantId: string | null) {
  const [session, setSession] = useState<KitchenSession | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Join kitchen session
  const joinKitchen = useCallback(async (userName: string): Promise<boolean> => {
    if (!restaurantId || !userName.trim()) {
      setError('Restaurant ID and user name are required');
      return false;
    }

    setIsJoining(true);
    setError(null);

    try {
      // Create a unique session token
      const sessionToken = `kitchen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const { data, error } = await supabase
        .from('active_sessions')
        .insert({
          restaurant_id: restaurantId,
          user_name: userName.trim(),
          session_token: sessionToken,
          status: 'active',
          last_seen: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      const newSession: KitchenSession = {
        id: data.id,
        userName: userName.trim(),
        restaurantId: restaurantId,
        isActive: true
      };

      setSession(newSession);
      
      // Store session in localStorage for persistence
      localStorage.setItem('kitchen_session', JSON.stringify(newSession));
      
      // Start heartbeat
      startHeartbeat(data.id);
      
      console.log('✅ Kitchen session created:', newSession);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to join kitchen';
      console.error('❌ Failed to join kitchen:', err);
      setError(errorMessage);
      return false;
    } finally {
      setIsJoining(false);
    }
  }, [restaurantId]);

  // Leave kitchen session
  const leaveKitchen = useCallback(async (): Promise<void> => {
    if (!session) return;

    try {
      // Stop heartbeat
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      // Release any claimed orders first
      await supabase
        .from('orders')
        .update({ 
          claimed_by: null, 
          claimed_at: null,
          status: 'pending'
        })
        .eq('claimed_by', session.id);

      // Delete session
      await supabase
        .from('active_sessions')
        .delete()
        .eq('id', session.id);

      setSession(null);
      localStorage.removeItem('kitchen_session');
      
      console.log('✅ Kitchen session ended');
    } catch (err) {
      console.error('❌ Error leaving kitchen:', err);
    }
  }, [session]);

  // Start heartbeat to keep session alive
  const startHeartbeat = useCallback((sessionId: string) => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
    }

    heartbeatRef.current = setInterval(async () => {
      try {
        const { error } = await supabase
          .from('active_sessions')
          .update({ 
            last_seen: new Date().toISOString(),
            status: 'active'
          })
          .eq('id', sessionId);

        if (error) {
          console.error('Heartbeat failed:', error);
          // If session doesn't exist anymore, clear local session
          if (error.message.includes('No rows')) {
            setSession(null);
            localStorage.removeItem('kitchen_session');
          }
        }
      } catch (error) {
        console.error('Heartbeat error:', error);
      }
    }, 30000); // Every 30 seconds
  }, []);

  // Restore session from localStorage on mount
  useEffect(() => {
    if (!restaurantId) return;

    const stored = localStorage.getItem('kitchen_session');
    if (stored) {
      try {
        const parsedSession = JSON.parse(stored);
        if (parsedSession.restaurantId === restaurantId) {
          setSession(parsedSession);
          startHeartbeat(parsedSession.id);
          
          // Verify session still exists in database
          supabase
            .from('active_sessions')
            .select('id')
            .eq('id', parsedSession.id)
            .single()
            .then(({ data, error }) => {
              if (error || !data) {
                // Session doesn't exist, clear it
                setSession(null);
                localStorage.removeItem('kitchen_session');
              }
            });
        }
      } catch (error) {
        console.error('Failed to restore session:', error);
        localStorage.removeItem('kitchen_session');
      }
    }
  }, [restaurantId, startHeartbeat]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    };
  }, []);

  return {
    session,
    isJoining,
    error,
    joinKitchen,
    leaveKitchen
  };
} 
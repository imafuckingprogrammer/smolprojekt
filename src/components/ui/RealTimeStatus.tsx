import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export function RealTimeStatus() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    // Monitor Supabase connection status
    const channel = supabase.channel('connection_test')
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
        console.log('Connection status:', status);
      });

    // Test real-time with heartbeat
    const heartbeat = setInterval(() => {
      setLastUpdate(new Date());
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(heartbeat);
    };
  }, []);

  return (
    <div className="flex items-center space-x-2">
      <div 
        className={`h-3 w-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}
        title={isConnected ? 'Real-time connected' : 'Real-time disconnected'}
      />
      <span className="text-sm text-gray-600">
        {isConnected ? 'Live' : 'Offline'}
      </span>
      {lastUpdate && (
        <span className="text-xs text-gray-400">
          {lastUpdate.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
} 
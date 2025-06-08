import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import type { WorkSessionWithStation, KitchenStation, StaffWithUser } from '../../types/database';
import { 
  PlayIcon, 
  StopIcon, 
  ClockIcon, 
  MapPinIcon,
  UserIcon,
  CheckCircleIcon 
} from '@heroicons/react/24/outline';

interface WorkSessionManagerProps {
  restaurantId: string;
  onSessionChange: (session: WorkSessionWithStation | null) => void;
}

export function WorkSessionManager({ restaurantId, onSessionChange }: WorkSessionManagerProps) {
  const { user } = useAuth();
  const [currentSession, setCurrentSession] = useState<WorkSessionWithStation | null>(null);
  const [stations, setStations] = useState<KitchenStation[]>([]);
  const [selectedStation, setSelectedStation] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<StaffWithUser | null>(null);

  useEffect(() => {
    if (user && restaurantId) {
      fetchUserRole();
      fetchStations();
      fetchCurrentSession();
    }
  }, [user, restaurantId]);

  const fetchUserRole = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('restaurant_staff')
        .select(`
          *,
          user:users(*)
        `)
        .eq('restaurant_id', restaurantId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (error) {
        console.error('User not found in restaurant staff:', error);
        return;
      }
      
      setUserRole(data as StaffWithUser);
    } catch (error) {
      console.error('Error fetching user role:', error);
    }
  };

  const fetchStations = async () => {
    try {
      const { data, error } = await supabase
        .from('kitchen_stations')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('position_order');

      if (error) throw error;
      setStations(data || []);
    } catch (error) {
      console.error('Error fetching stations:', error);
    }
  };

  const fetchCurrentSession = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('work_sessions')
        .select(`
          *,
          station:kitchen_stations(*)
        `)
        .eq('restaurant_id', restaurantId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      const session = data as WorkSessionWithStation;
      setCurrentSession(session);
      onSessionChange(session);
    } catch (error) {
      console.error('Error fetching current session:', error);
    } finally {
      setLoading(false);
    }
  };

  const startSession = async () => {
    if (!user || !selectedStation) return;
    
    try {
      const { data, error } = await supabase
        .from('work_sessions')
        .insert({
          restaurant_id: restaurantId,
          user_id: user.id,
          station_id: selectedStation,
          status: 'active',
          started_at: new Date().toISOString()
        })
        .select(`
          *,
          station:kitchen_stations(*)
        `)
        .single();

             if (error) throw error;
       
       const session = data as WorkSessionWithStation;
       setCurrentSession(session);
       onSessionChange(session);
    } catch (error) {
      console.error('Error starting session:', error);
      alert('Failed to start work session');
    }
  };

  const endSession = async () => {
    if (!currentSession) return;
    
    if (!confirm('Are you sure you want to end your work session?')) return;
    
    try {
      const { error } = await supabase
        .from('work_sessions')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString()
        })
        .eq('id', currentSession.id);

      if (error) throw error;
      
      setCurrentSession(null);
      onSessionChange(null);
    } catch (error) {
      console.error('Error ending session:', error);
      alert('Failed to end work session');
    }
  };

  const takeBreak = async () => {
    if (!currentSession) return;
    
    try {
      const { error } = await supabase
        .from('work_sessions')
        .update({
          status: 'break',
          break_started_at: new Date().toISOString()
        })
        .eq('id', currentSession.id);

      if (error) throw error;
      
      setCurrentSession({
        ...currentSession,
        status: 'break',
        break_started_at: new Date().toISOString()
      });
      onSessionChange({
        ...currentSession,
        status: 'break',
        break_started_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error taking break:', error);
      alert('Failed to start break');
    }
  };

  const endBreak = async () => {
    if (!currentSession) return;
    
    try {
      const { error } = await supabase
        .from('work_sessions')
        .update({
          status: 'active',
          break_ended_at: new Date().toISOString()
        })
        .eq('id', currentSession.id);

      if (error) throw error;
      
      setCurrentSession({
        ...currentSession,
        status: 'active',
        break_ended_at: new Date().toISOString()
      });
      onSessionChange({
        ...currentSession,
        status: 'active',
        break_ended_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error ending break:', error);
      alert('Failed to end break');
    }
  };

  const getSessionDuration = () => {
    if (!currentSession?.started_at) return '0m';
    
    const start = new Date(currentSession.started_at);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 60) {
      return `${diffMins}m`;
    } else {
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      return `${hours}h ${mins}m`;
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-32 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (!userRole) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <UserIcon className="h-5 w-5 text-red-400 mr-2" />
          <div>
            <h3 className="text-sm font-medium text-red-800">Access Denied</h3>
            <p className="text-sm text-red-700">
              You don't have permission to access the kitchen. Please contact your manager.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!currentSession) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="text-center">
          <UserIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-medium text-gray-900">
            Welcome, {userRole.user.first_name}
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Role: {userRole.role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Start a work session to access kitchen orders
          </p>
          
          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Station
              </label>
              <select
                value={selectedStation}
                onChange={(e) => setSelectedStation(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Choose a station...</option>
                {stations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.station_name} ({station.station_type.replace('_', ' ')})
                  </option>
                ))}
              </select>
            </div>
            
            <button
              onClick={startSession}
              disabled={!selectedStation}
              className="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <PlayIcon className="h-5 w-5 mr-2" />
              Clock In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircleIcon className="h-6 w-6 text-green-600" />
            </div>
          </div>
          
          <div>
            <p className="text-sm font-medium text-gray-900">
              {userRole.user.first_name} {userRole.user.last_name}
            </p>
            <div className="flex items-center space-x-2 text-xs text-gray-500">
              <MapPinIcon className="h-3 w-3" />
              <span>{currentSession.station?.station_name}</span>
              <ClockIcon className="h-3 w-3 ml-2" />
              <span>{getSessionDuration()}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {currentSession.status === 'active' ? (
            <>
              <button
                onClick={takeBreak}
                className="text-sm bg-yellow-100 text-yellow-800 px-3 py-1 rounded-md hover:bg-yellow-200"
              >
                Take Break
              </button>
              <button
                onClick={endSession}
                className="text-sm bg-red-100 text-red-800 px-3 py-1 rounded-md hover:bg-red-200 flex items-center"
              >
                <StopIcon className="h-4 w-4 mr-1" />
                Clock Out
              </button>
            </>
          ) : (
            <>
              <span className="text-sm bg-yellow-100 text-yellow-800 px-3 py-1 rounded-md">
                On Break
              </span>
              <button
                onClick={endBreak}
                className="text-sm bg-green-100 text-green-800 px-3 py-1 rounded-md hover:bg-green-200"
              >
                End Break
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
} 
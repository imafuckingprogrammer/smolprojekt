import React from 'react';
import { UserIcon } from '@heroicons/react/24/outline';

interface UserAvatarProps {
  name: string;
  status?: 'active' | 'busy' | 'break' | 'offline';
  size?: 'sm' | 'md' | 'lg';
  showStatus?: boolean;
}

export function UserAvatar({ name, status = 'active', size = 'md', showStatus = true }: UserAvatarProps) {
  const sizeClasses = {
    sm: 'h-6 w-6 text-xs',
    md: 'h-8 w-8 text-sm', 
    lg: 'h-10 w-10 text-base'
  };

  const statusColors = {
    active: 'bg-green-500',
    busy: 'bg-yellow-500', 
    break: 'bg-gray-500',
    offline: 'bg-red-500'
  };

  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="relative inline-flex items-center">
      <div className={`${sizeClasses[size]} rounded-full bg-primary-600 text-white flex items-center justify-center font-medium relative`}>
        {initials || <UserIcon className="h-4 w-4" />}
        
        {showStatus && (
          <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${statusColors[status]}`} />
        )}
      </div>
    </div>
  );
} 
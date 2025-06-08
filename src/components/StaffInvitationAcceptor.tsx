import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useStaffStore } from '../stores/staffStore';
import { CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface StaffInvitationAcceptorProps {
  token?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export const StaffInvitationAcceptor: React.FC<StaffInvitationAcceptorProps> = ({
  token,
  onSuccess,
  onError
}) => {
  const { user } = useAuth();
  const { acceptInvitation, loading, error, clearError } = useStaffStore();
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  // Auto-accept invitation if token is provided and user is authenticated
  useEffect(() => {
    if (token && user?.email && status === 'idle') {
      handleAcceptInvitation();
    }
  }, [token, user?.email, status]);

  const handleAcceptInvitation = async () => {
    if (!token || !user?.email) {
      setStatus('error');
      setMessage('Missing invitation token or user email');
      onError?.('Missing invitation token or user email');
      return;
    }

    setStatus('processing');
    clearError();

    try {
      const success = await acceptInvitation(token, user.email);
      
      if (success) {
        setStatus('success');
        setMessage('Staff invitation accepted successfully! You now have access to kitchen features.');
        onSuccess?.();
      } else {
        setStatus('error');
        setMessage(error || 'Failed to accept invitation');
        onError?.(error || 'Failed to accept invitation');
      }
    } catch (err) {
      setStatus('error');
      const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
      setMessage(errorMsg);
      onError?.(errorMsg);
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'success':
        return <CheckCircleIcon className="h-12 w-12 text-green-500" />;
      case 'error':
        return <XCircleIcon className="h-12 w-12 text-red-500" />;
      case 'processing':
        return (
          <div className="h-12 w-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
        );
      default:
        return <ExclamationTriangleIcon className="h-12 w-12 text-yellow-500" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'processing':
        return 'bg-blue-50 border-blue-200';
      default:
        return 'bg-yellow-50 border-yellow-200';
    }
  };

  if (!user) {
    return (
      <div className="max-w-md mx-auto mt-8 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-center">
          <ExclamationTriangleIcon className="h-12 w-12 text-yellow-500" />
          <div className="ml-4">
            <h3 className="text-lg font-medium text-yellow-800">Authentication Required</h3>
            <p className="text-sm text-yellow-600 mt-1">
              Please sign in to accept the staff invitation.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-8">
      <div className={`p-6 border rounded-lg ${getStatusColor()}`}>
        <div className="flex items-start">
          <div className="flex-shrink-0">
            {getStatusIcon()}
          </div>
          <div className="ml-4 flex-1">
            <h3 className="text-lg font-medium text-gray-900">
              {status === 'processing' && 'Processing Invitation...'}
              {status === 'success' && 'Invitation Accepted!'}
              {status === 'error' && 'Invitation Failed'}
              {status === 'idle' && 'Staff Invitation'}
            </h3>
            <p className="text-sm text-gray-600 mt-2">
              {message || 'Processing your staff invitation...'}
            </p>
            
            {status === 'error' && (
              <button
                onClick={handleAcceptInvitation}
                disabled={loading}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Retrying...' : 'Try Again'}
              </button>
            )}
            
            {status === 'success' && (
              <div className="mt-4">
                <p className="text-sm text-green-700">
                  You can now access kitchen features and manage orders.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}; 
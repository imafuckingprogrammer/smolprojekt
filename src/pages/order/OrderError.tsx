import { Link, useParams } from 'react-router-dom';
import { XCircleIcon } from '@heroicons/react/24/outline';

export function OrderError() {
  const { token } = useParams<{ token: string }>();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md mx-auto text-center">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-6">
          <XCircleIcon className="h-8 w-8 text-red-600" />
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Order Failed</h1>
        
        <p className="text-gray-600 mb-8">
          We're sorry, but there was an issue processing your order. This could be due to a 
          temporary issue or the restaurant may be temporarily unavailable.
        </p>

        <div className="space-y-4">
          <Link
            to={`/order/${token}`}
            className="block w-full btn-primary"
          >
            Try Again
          </Link>
          
          <p className="text-sm text-gray-500">
            If the problem persists, please contact the restaurant staff for assistance.
          </p>
        </div>
      </div>
    </div>
  );
} 
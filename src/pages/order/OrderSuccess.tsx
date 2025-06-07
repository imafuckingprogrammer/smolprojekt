import { Link, useParams } from 'react-router-dom';
import { CheckCircleIcon } from '@heroicons/react/24/outline';

export function OrderSuccess() {
  const { token } = useParams<{ token: string }>();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md mx-auto text-center">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6">
          <CheckCircleIcon className="h-8 w-8 text-green-600" />
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Order Placed Successfully!</h1>
        
        <p className="text-gray-600 mb-8">
          Thank you for your order! We've received it and the kitchen will start preparing your food shortly. 
          You'll be notified when it's ready.
        </p>

        <div className="space-y-4">
          <Link
            to={`/order/${token}`}
            className="block w-full btn-primary"
          >
            Place Another Order
          </Link>
          
          <p className="text-sm text-gray-500">
            Your order has been sent to the kitchen and you should receive your food soon!
          </p>
        </div>
      </div>
    </div>
  );
} 
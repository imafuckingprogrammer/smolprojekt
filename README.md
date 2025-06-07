# TableDirect - QR Code Restaurant Ordering System

TableDirect is a complete restaurant QR code ordering system SaaS platform that allows restaurants to create QR codes for tables, customers scan to order, orders go to kitchen in real-time, with monthly analytics reports.

## 🚀 Features

### Restaurant Management
- **Restaurant Authentication & Onboarding** - Complete sign-up and login system
- **Dashboard** - Overview of orders, revenue, and restaurant stats
- **Menu Management** - Create categories and menu items with pricing
- **Table Management** - Generate QR codes for each table
- **Order Management** - View and manage all incoming orders
- **Kitchen Display** - Real-time order updates for kitchen staff

### Customer Experience
- **QR Code Scanning** - Customers scan table QR codes to access menu
- **Mobile-Optimized Ordering** - Responsive design for mobile devices
- **Real-time Menu** - Browse categories and add items to cart
- **Order Placement** - Easy checkout with optional customer details

### Real-time Features
- **Live Order Updates** - Kitchen receives orders instantly
- **Order Status Tracking** - Real-time status updates (pending → preparing → ready → served)
- **Sound Notifications** - Audio alerts for new orders in kitchen
- **Auto-refresh** - Automatic updates every 30 seconds

## 🛠 Tech Stack

### Frontend
- **Vite** - Fast build tool and dev server
- **React 18** - Latest React with hooks
- **TypeScript** - Type safety and better DX
- **Tailwind CSS** - Utility-first CSS framework
- **React Router DOM** - Client-side routing
- **Heroicons** - Beautiful SVG icons

### Backend & Database
- **Supabase** - PostgreSQL database with real-time subscriptions
- **Row Level Security (RLS)** - Secure data access policies
- **Real-time Subscriptions** - Live order updates

### Additional Libraries
- **QRCode** - QR code generation for tables
- **date-fns** - Date manipulation utilities
- **clsx & tailwind-merge** - Conditional CSS classes

## 📁 Project Structure

```
tabledirect/
├── src/
│   ├── components/
│   │   ├── auth/              # Authentication components
│   │   ├── dashboard/         # Dashboard components
│   │   └── ui/               # Reusable UI components
│   ├── hooks/                # Custom React hooks
│   │   ├── useAuth.ts        # Authentication logic
│   │   └── useOrders.ts      # Order management logic
│   ├── lib/                  # Utility libraries
│   │   ├── supabase.ts       # Supabase client configuration
│   │   ├── qr-generator.ts   # QR code utilities
│   │   └── utils.ts          # General utilities
│   ├── pages/                # Page components
│   │   ├── auth/             # Authentication pages
│   │   ├── dashboard/        # Restaurant dashboard
│   │   ├── kitchen/          # Kitchen display
│   │   └── order/            # Customer ordering flow
│   ├── types/                # TypeScript type definitions
│   │   └── database.ts       # Database schema types
│   ├── App.tsx               # Main app component with routing
│   ├── main.tsx              # App entry point
│   └── index.css             # Global styles and Tailwind
├── public/                   # Static assets
├── package.json              # Dependencies and scripts
├── tailwind.config.js        # Tailwind configuration
├── vite.config.ts            # Vite configuration
└── .env.example              # Environment variables template
```

## 🗄 Database Schema

The application uses Supabase PostgreSQL with the following tables:

### Core Tables
- **restaurants** - Restaurant information and settings
- **restaurant_tables** - Table definitions with QR tokens
- **menu_categories** - Menu category organization
- **menu_items** - Individual menu items with pricing
- **orders** - Customer orders with status tracking
- **order_items** - Line items for each order
- **monthly_analytics** - Monthly reporting data

### Key Features
- Row Level Security (RLS) policies for data isolation
- Real-time subscriptions for live updates
- Proper indexing for performance
- Foreign key relationships for data integrity

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- Supabase account
- Modern web browser

### 1. Clone and Install
```bash
cd tabledirect
npm install
```

### 2. Environment Setup
Create a `.env` file with your Supabase credentials:

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Application Configuration
VITE_APP_NAME=TableDirect
VITE_APP_URL=http://localhost:5173
```

### 3. Database Setup
1. Create a new Supabase project
2. Run the SQL schema from the database setup (available in project documentation)
3. Enable real-time for the `orders` table
4. Configure RLS policies for secure access

### 4. Development
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### 5. Build for Production
```bash
npm run build
npm run preview
```

## 📱 Usage

### For Restaurants

1. **Sign Up** - Create a restaurant account
2. **Setup Menu** - Add categories and menu items
3. **Create Tables** - Generate QR codes for each table
4. **Print QR Codes** - Print and place QR codes on tables
5. **Manage Orders** - Use dashboard and kitchen display to process orders

### For Customers

1. **Scan QR Code** - Use phone camera to scan table QR code
2. **Browse Menu** - View categories and menu items
3. **Add to Cart** - Select items and quantities
4. **Place Order** - Provide optional details and submit order
5. **Wait for Food** - Order appears in kitchen automatically

## 🔧 Key Components

### Authentication System
- Sign up/sign in with email and password
- Password reset functionality
- Protected routes for authenticated users
- Restaurant-specific data isolation

### QR Code System
- Unique tokens for each table
- QR code generation with restaurant/table info
- Print-optimized QR code layouts
- Token parsing and validation

### Real-time Order Management
- Live order updates using Supabase subscriptions
- Order status progression (pending → preparing → ready → served)
- Sound notifications for new orders
- Kitchen display with auto-refresh

### Mobile-First Design
- Responsive design optimized for mobile devices
- Touch-friendly interface for customers
- Fast loading and smooth interactions
- Progressive Web App (PWA) capabilities

## 🔒 Security Features

- Row Level Security (RLS) policies
- Restaurant data isolation
- Secure authentication with Supabase Auth
- Input validation and sanitization
- HTTPS-only in production

## 🎨 Customization

### Styling
- Tailwind CSS for easy customization
- Custom color schemes in tailwind.config.js
- Responsive design system
- Dark mode support (can be added)

### Features
- Modular component architecture
- Custom hooks for business logic
- TypeScript for type safety
- Easy to extend and modify

## 📊 Analytics (Future Enhancement)

The system includes foundations for:
- Monthly revenue reports
- Order volume analytics
- Popular menu items tracking
- Customer behavior insights

## 🚀 Deployment

### Recommended Deployment Platforms
- **Vercel** - Optimal for React/Vite applications
- **Netlify** - Great for static site generation
- **Supabase Hosting** - Integrated with backend

### Environment Variables for Production
```env
VITE_SUPABASE_URL=your_production_supabase_url
VITE_SUPABASE_ANON_KEY=your_production_anon_key
VITE_APP_URL=https://your-domain.com
```

## 🧪 Testing

The application is built with testing in mind:
- TypeScript for compile-time error checking
- Component-based architecture for easy unit testing
- Integration testing with Supabase
- E2E testing capabilities

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support, email support@tabledirect.com or create an issue in the repository.

## 🔮 Roadmap

- [ ] Stripe integration for subscription billing
- [ ] Advanced analytics dashboard
- [ ] Multi-language support
- [ ] Inventory management
- [ ] Customer loyalty program
- [ ] Table reservation system
- [ ] Staff management features
- [ ] Advanced reporting tools

---

**TableDirect** - Revolutionizing restaurant ordering with QR code technology.

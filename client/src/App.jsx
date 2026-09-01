import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import { ApplicationLayout } from './layouts/ApplicationLayout.jsx'
import { CustomerRoute } from './layouts/CustomerRoute.jsx'
import { ProtectedRoute } from './layouts/ProtectedRoute.jsx'
import { LoadingState } from './components/LoadingState.jsx'
import { CategoriesPage } from './pages/CategoriesPage.jsx'
import { HomePage } from './pages/HomePage.jsx'
import { LoginPage } from './pages/LoginPage.jsx'
import { NotFoundPage } from './pages/NotFoundPage.jsx'
import { ProductsPage } from './pages/ProductsPage.jsx'
import { ProductDetailsPage } from './pages/ProductDetailsPage.jsx'
import { RegisterPage } from './pages/RegisterPage.jsx'

// Everything above is the anonymous shopper's path and stays in the main bundle.
//
// Everything below is split out, because most visitors never reach it: the
// dashboards are for two small groups of users, and checkout pulls in the map
// library. Loading that on first paint made every shopper pay for screens they
// will not open.
const AdminRoute = lazy(() => import('./layouts/AdminRoute.jsx').then(withDefault('AdminRoute')))
const AdminDashboardLayout = lazy(() =>
  import('./layouts/AdminDashboardLayout.jsx').then(withDefault('AdminDashboardLayout')),
)
const AdminCategoriesPage = lazy(() =>
  import('./pages/admin/AdminCategoriesPage.jsx').then(withDefault('AdminCategoriesPage')),
)
const AdminCouponsPage = lazy(() =>
  import('./pages/admin/AdminCouponsPage.jsx').then(withDefault('AdminCouponsPage')),
)
const AdminCustomersPage = lazy(() =>
  import('./pages/admin/AdminCustomersPage.jsx').then(withDefault('AdminCustomersPage')),
)
const AdminInventoryPage = lazy(() =>
  import('./pages/admin/AdminInventoryPage.jsx').then(withDefault('AdminInventoryPage')),
)
const AdminOrdersPage = lazy(() =>
  import('./pages/admin/AdminOrdersPage.jsx').then(withDefault('AdminOrdersPage')),
)
const AdminOverviewPage = lazy(() =>
  import('./pages/admin/AdminOverviewPage.jsx').then(withDefault('AdminOverviewPage')),
)
const AdminProductsPage = lazy(() =>
  import('./pages/admin/AdminProductsPage.jsx').then(withDefault('AdminProductsPage')),
)
const AdminReviewsPage = lazy(() =>
  import('./pages/admin/AdminReviewsPage.jsx').then(withDefault('AdminReviewsPage')),
)
const AdminSellersPage = lazy(() =>
  import('./pages/admin/AdminSellersPage.jsx').then(withDefault('AdminSellersPage')),
)

const SellerRoute = lazy(() => import('./layouts/SellerRoute.jsx').then(withDefault('SellerRoute')))
const SellerDashboardLayout = lazy(() =>
  import('./layouts/SellerDashboardLayout.jsx').then(withDefault('SellerDashboardLayout')),
)
const SellerInventoryPage = lazy(() =>
  import('./pages/seller/SellerInventoryPage.jsx').then(withDefault('SellerInventoryPage')),
)
const SellerNotificationsPage = lazy(() =>
  import('./pages/seller/SellerNotificationsPage.jsx').then(withDefault('SellerNotificationsPage')),
)
const SellerOrdersPage = lazy(() =>
  import('./pages/seller/SellerOrdersPage.jsx').then(withDefault('SellerOrdersPage')),
)
const SellerOverviewPage = lazy(() =>
  import('./pages/seller/SellerOverviewPage.jsx').then(withDefault('SellerOverviewPage')),
)
const SellerProductFormPage = lazy(() =>
  import('./pages/seller/SellerProductFormPage.jsx').then(withDefault('SellerProductFormPage')),
)
const SellerProductsPage = lazy(() =>
  import('./pages/seller/SellerProductsPage.jsx').then(withDefault('SellerProductsPage')),
)
const SellerRevenuePage = lazy(() =>
  import('./pages/seller/SellerRevenuePage.jsx').then(withDefault('SellerRevenuePage')),
)
const SellerReviewsPage = lazy(() =>
  import('./pages/seller/SellerReviewsPage.jsx').then(withDefault('SellerReviewsPage')),
)
const SellerStorePage = lazy(() =>
  import('./pages/seller/SellerStorePage.jsx').then(withDefault('SellerStorePage')),
)

// Checkout owns Leaflet — the single largest dependency in the app.
const CheckoutPage = lazy(() =>
  import('./pages/CheckoutPage.jsx').then(withDefault('CheckoutPage')),
)
const AssistantPage = lazy(() =>
  import('./pages/AssistantPage.jsx').then(withDefault('AssistantPage')),
)
const CartPage = lazy(() => import('./pages/CartPage.jsx').then(withDefault('CartPage')))
const WishlistPage = lazy(() =>
  import('./pages/WishlistPage.jsx').then(withDefault('WishlistPage')),
)
const OrdersPage = lazy(() => import('./pages/OrdersPage.jsx').then(withDefault('OrdersPage')))
const OrderDetailsPage = lazy(() =>
  import('./pages/OrderDetailsPage.jsx').then(withDefault('OrderDetailsPage')),
)
const PaymentCancelPage = lazy(() =>
  import('./pages/PaymentCancelPage.jsx').then(withDefault('PaymentCancelPage')),
)
const PaymentSuccessPage = lazy(() =>
  import('./pages/PaymentSuccessPage.jsx').then(withDefault('PaymentSuccessPage')),
)
const ProfilePage = lazy(() => import('./pages/ProfilePage.jsx').then(withDefault('ProfilePage')))

// These modules use named exports; React.lazy needs a default. Declared as a
// function so it is hoisted above the lazy() calls that use it.
function withDefault(name) {
  return (module) => ({ default: module[name] })
}

function App() {
  return (
    // One boundary around the routes: a chunk is only fetched when its route is
    // first visited, and the fallback covers that fetch.
    <Suspense fallback={<LoadingState label="Loading" />}>
      <Routes>
        <Route element={<ApplicationLayout />}>
          <Route index element={<HomePage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/:productId" element={<ProductDetailsPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route element={<CustomerRoute />}>
            <Route path="assistant" element={<AssistantPage />} />
            <Route path="cart" element={<CartPage />} />
            <Route path="wishlist" element={<WishlistPage />} />
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="payment/success" element={<PaymentSuccessPage />} />
            <Route path="payment/cancelled" element={<PaymentCancelPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:orderId" element={<OrderDetailsPage />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="account" element={<ProfilePage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>
          <Route element={<SellerRoute />}>
            <Route path="seller" element={<SellerDashboardLayout />}>
              <Route index element={<SellerOverviewPage />} />
              <Route path="revenue" element={<SellerRevenuePage />} />
              <Route path="orders" element={<SellerOrdersPage />} />
              <Route path="products" element={<SellerProductsPage />} />
              <Route path="products/new" element={<SellerProductFormPage />} />
              <Route path="products/:productId" element={<SellerProductFormPage />} />
              <Route path="inventory" element={<SellerInventoryPage />} />
              <Route path="reviews" element={<SellerReviewsPage />} />
              <Route path="store" element={<SellerStorePage />} />
              <Route path="notifications" element={<SellerNotificationsPage />} />
            </Route>
          </Route>
          <Route element={<AdminRoute />}>
            <Route path="admin" element={<AdminDashboardLayout />}>
              <Route index element={<AdminOverviewPage />} />
              <Route path="orders" element={<AdminOrdersPage />} />
              <Route path="customers" element={<AdminCustomersPage />} />
              <Route path="sellers" element={<AdminSellersPage />} />
              <Route path="products" element={<AdminProductsPage />} />
              <Route path="inventory" element={<AdminInventoryPage />} />
              <Route path="reviews" element={<AdminReviewsPage />} />
              <Route path="coupons" element={<AdminCouponsPage />} />
              <Route path="categories" element={<AdminCategoriesPage />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default App

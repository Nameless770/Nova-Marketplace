import { Route, Routes } from 'react-router-dom'
import { ApplicationLayout } from './layouts/ApplicationLayout.jsx'
import { CustomerRoute } from './layouts/CustomerRoute.jsx'
import { ProtectedRoute } from './layouts/ProtectedRoute.jsx'
import { CategoriesPage } from './pages/CategoriesPage.jsx'
import { HomePage } from './pages/HomePage.jsx'
import { LoginPage } from './pages/LoginPage.jsx'
import { NotFoundPage } from './pages/NotFoundPage.jsx'
import { ProductsPage } from './pages/ProductsPage.jsx'
import { RegisterPage } from './pages/RegisterPage.jsx'
import { AdminDashboardLayout } from './layouts/AdminDashboardLayout.jsx'
import { AdminRoute } from './layouts/AdminRoute.jsx'
import { AdminCategoriesPage } from './pages/admin/AdminCategoriesPage.jsx'
import { AdminCouponsPage } from './pages/admin/AdminCouponsPage.jsx'
import { AdminCustomersPage } from './pages/admin/AdminCustomersPage.jsx'
import { AdminInventoryPage } from './pages/admin/AdminInventoryPage.jsx'
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage.jsx'
import { AdminOverviewPage } from './pages/admin/AdminOverviewPage.jsx'
import { AdminProductsPage } from './pages/admin/AdminProductsPage.jsx'
import { AdminReviewsPage } from './pages/admin/AdminReviewsPage.jsx'
import { AdminSellersPage } from './pages/admin/AdminSellersPage.jsx'
import { SellerDashboardLayout } from './layouts/SellerDashboardLayout.jsx'
import { SellerRoute } from './layouts/SellerRoute.jsx'
import { SellerInventoryPage } from './pages/seller/SellerInventoryPage.jsx'
import { SellerNotificationsPage } from './pages/seller/SellerNotificationsPage.jsx'
import { SellerOrdersPage } from './pages/seller/SellerOrdersPage.jsx'
import { SellerOverviewPage } from './pages/seller/SellerOverviewPage.jsx'
import { SellerProductFormPage } from './pages/seller/SellerProductFormPage.jsx'
import { SellerProductsPage } from './pages/seller/SellerProductsPage.jsx'
import { SellerRevenuePage } from './pages/seller/SellerRevenuePage.jsx'
import { SellerReviewsPage } from './pages/seller/SellerReviewsPage.jsx'
import { SellerStorePage } from './pages/seller/SellerStorePage.jsx'
import { ProductDetailsPage } from './pages/ProductDetailsPage.jsx'
import { AssistantPage } from './pages/AssistantPage.jsx'
import { CartPage } from './pages/CartPage.jsx'
import { WishlistPage } from './pages/WishlistPage.jsx'
import { CheckoutPage } from './pages/CheckoutPage.jsx'
import { OrdersPage } from './pages/OrdersPage.jsx'
import { OrderDetailsPage } from './pages/OrderDetailsPage.jsx'
import { PaymentCancelPage } from './pages/PaymentCancelPage.jsx'
import { PaymentSuccessPage } from './pages/PaymentSuccessPage.jsx'
import { ProfilePage } from './pages/ProfilePage.jsx'

function App() {
  return (
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
  )
}

export default App

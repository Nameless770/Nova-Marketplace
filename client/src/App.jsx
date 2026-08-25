import { Route, Routes } from 'react-router-dom'
import { ApplicationLayout } from './layouts/ApplicationLayout.jsx'
import { ProtectedRoute } from './layouts/ProtectedRoute.jsx'
import { CategoriesPage } from './pages/CategoriesPage.jsx'
import { HomePage } from './pages/HomePage.jsx'
import { LoginPage } from './pages/LoginPage.jsx'
import { NotFoundPage } from './pages/NotFoundPage.jsx'
import { ProductsPage } from './pages/ProductsPage.jsx'
import { ProductDetailsPage } from './pages/ProductDetailsPage.jsx'
import { CartPage } from './pages/CartPage.jsx'
import { WishlistPage } from './pages/WishlistPage.jsx'
import { CheckoutPage } from './pages/CheckoutPage.jsx'
import { OrdersPage } from './pages/OrdersPage.jsx'
import { OrderDetailsPage } from './pages/OrderDetailsPage.jsx'
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
        <Route element={<ProtectedRoute />}>
          <Route path="cart" element={<CartPage />} />
          <Route path="wishlist" element={<WishlistPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/:orderId" element={<OrderDetailsPage />} />
          <Route path="account" element={<ProfilePage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default App

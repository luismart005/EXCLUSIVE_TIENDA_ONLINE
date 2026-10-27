import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { SessionProvider } from './auth/session.jsx';
import { RequireAuth } from './auth/guards.jsx';
import { CartProvider } from './store/cart.jsx';
import { Loader } from './components/ui.jsx';
import StoreLayout from './components/StoreLayout.jsx';
import Home from './pages/store/Home.jsx';
import Shop from './pages/store/Shop.jsx';
import Product from './pages/store/Product.jsx';
import Cart from './pages/store/Cart.jsx';
import Checkout from './pages/store/Checkout.jsx';
import Help from './pages/store/Help.jsx';
import Policy from './pages/store/Policy.jsx';
import Mailbox from './pages/store/Mailbox.jsx';
import { Register, ForgotPassword, ResetPassword, Callback, NotFound } from './pages/store/AuthPages.jsx';
import { AccountLayout, Orders, Addresses, Profile, Notifications, PostSaleList } from './pages/account/Account.jsx';
import OrderDetail from './pages/account/OrderDetail.jsx';

const AdminApp = lazy(() => import('./pages/admin/AdminApp.jsx'));

export default function App() {
  return (
    <SessionProvider>
      <CartProvider>
        <Routes>
          <Route path="/callback" element={<Callback />} />
          <Route
            path="/admin/*"
            element={(
              <RequireAuth>
                <Suspense fallback={<Loader label="Cargando el panel…" />}>
                  <AdminApp />
                </Suspense>
              </RequireAuth>
            )}
          />
          <Route element={<StoreLayout />}>
            <Route index element={<Home />} />
            <Route path="tienda" element={<Shop />} />
            <Route path="tienda/:category" element={<Shop />} />
            <Route path="producto/:slug" element={<Product />} />
            <Route path="carrito" element={<Cart />} />
            <Route path="checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
            <Route path="registro" element={<Register />} />
            <Route path="recuperar" element={<ForgotPassword />} />
            <Route path="restablecer" element={<ResetPassword />} />
            <Route path="ayuda" element={<Help />} />
            <Route path="politicas/:slug" element={<Policy />} />
            <Route path="buzon" element={<Mailbox />} />
            <Route path="sesion-cerrada" element={<Navigate to="/" replace />} />
            <Route path="cuenta" element={<RequireAuth><AccountLayout /></RequireAuth>}>
              <Route index element={<Navigate to="pedidos" replace />} />
              <Route path="pedidos" element={<Orders />} />
              <Route path="pedidos/:code" element={<OrderDetail />} />
              <Route path="posventa" element={<PostSaleList />} />
              <Route path="direcciones" element={<Addresses />} />
              <Route path="notificaciones" element={<Notifications />} />
              <Route path="perfil" element={<Profile />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
        <Toaster position="bottom-right" richColors closeButton duration={4200} toastOptions={{ style: { fontFamily: 'var(--font)' } }} />
      </CartProvider>
    </SessionProvider>
  );
}

import axios from 'axios';
import Cookies from 'js-cookie';

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: ENGINE_URL,
  timeout: 30000,
});

// Attach token on every request
api.interceptors.request.use((config) => {
  const token = Cookies.get('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      const refresh = Cookies.get('admin_refresh');
      if (refresh) {
        try {
          const { data } = await axios.post(`${ENGINE_URL}/admin/auth/refresh`, { refreshToken: refresh });
          Cookies.set('admin_token', data.accessToken, { expires: 0.33 }); // 8h
          err.config.headers.Authorization = `Bearer ${data.accessToken}`;
          return api.request(err.config);
        } catch {
          Cookies.remove('admin_token');
          Cookies.remove('admin_refresh');
          window.location.href = '/login';
        }
      } else {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/admin/auth/login', { email, password }),
  verify2fa: (tempToken: string, totpCode: string) =>
    api.post('/admin/auth/verify-2fa', { tempToken, totpCode }),
  logout: () => api.post('/admin/auth/logout'),
  me: () => api.get('/admin/auth/me'),
  setupTotp: () => api.post('/admin/auth/setup-totp'),
  verifyTotp: (secret: string, token: string) =>
    api.post('/admin/auth/verify-totp', { secret, token }),
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const dashboardApi = {
  stats: (siteSlug?: string) =>
    api.get('/admin/analytics/dashboard', { params: { siteSlug } }),
  revenueChart: (siteSlug?: string, days = 30) =>
    api.get('/admin/analytics/revenue-chart', { params: { siteSlug, days } }),
  topProducts: (siteSlug?: string) =>
    api.get('/admin/analytics/top-products', { params: { siteSlug } }),
};

// ── Sites ─────────────────────────────────────────────────────────────────────
export const sitesApi = {
  list: () => api.get('/admin/sites'),
  create: (data: any) => api.post('/admin/sites', data),
  update: (siteSlug: string, data: any) => api.patch(`/admin/sites/${siteSlug}`, data),
  deploy: (siteSlug: string, zipBase64: string) =>
    api.post(`/admin/sites/${siteSlug}/deploy`, { zipBase64 }),
};

// ── Products ──────────────────────────────────────────────────────────────────
export const productsApi = {
  list: (siteSlug: string, params?: any) =>
    api.get(`/admin/products/${siteSlug}`, { params }),
  import: (siteSlug: string, meeshoUrl: string) =>
    api.post(`/admin/products/${siteSlug}/import`, { meeshoUrl }),
  update: (siteSlug: string, productId: string, data: any) =>
    api.patch(`/admin/products/${siteSlug}/${productId}`, data),
  bulkStatus: (siteSlug: string, ids: string[], status: string) =>
    api.post(`/admin/products/${siteSlug}/bulk-status`, { ids, status }),
  aiOptimize: (siteSlug: string, productId: string) =>
    api.post(`/admin/products/${siteSlug}/${productId}/ai-optimize`),
};

// ── Orders ────────────────────────────────────────────────────────────────────
export const ordersApi = {
  fulfillmentQueue: (siteSlug?: string) =>
    api.get('/admin/orders/fulfillment-queue', { params: { siteSlug } }),
  list: (siteSlug: string, params?: any) =>
    api.get(`/admin/orders/${siteSlug}`, { params }),
  fulfill: (orderId: string, accountId: string) =>
    api.post(`/admin/orders/${orderId}/fulfill`, { accountId }),
  updateStatus: (orderId: string, status: string, trackingId?: string) =>
    api.patch(`/admin/orders/${orderId}/status`, { status, trackingId }),
  cancelOrder: (orderId: string, reason: string) =>
    api.post(`/admin/orders/${orderId}/cancel`, { reason }),
};

// ── Customers ─────────────────────────────────────────────────────────────────
export const customersApi = {
  list: (params?: any) => api.get('/admin/customers', { params }),
  rfmSegments: (siteSlug?: string) =>
    api.get('/admin/customers/rfm', { params: { siteSlug } }),
  wallet: (customerId: string) => api.get(`/admin/customers/${customerId}/wallet`),
  adjustWallet: (customerId: string, amount: number, note: string) =>
    api.post(`/admin/customers/${customerId}/wallet/adjust`, { amount, note }),
};

// ── SEO ───────────────────────────────────────────────────────────────────────
export const seoApi = {
  auditRun: (siteSlug: string) => api.post(`/admin/seo/${siteSlug}/audit`),
  pages: (siteSlug: string) => api.get(`/admin/seo/${siteSlug}/pages`),
  keywords: (siteSlug: string) => api.get(`/admin/seo/${siteSlug}/keywords`),
  blogPosts: (siteSlug: string) => api.get(`/admin/seo/${siteSlug}/blog`),
  generateBlog: (siteSlug: string, topic: string, lang: 'en' | 'hi') =>
    api.post(`/admin/seo/${siteSlug}/blog/generate`, { topic, lang }),
};

// ── Marketing ─────────────────────────────────────────────────────────────────
export const marketingApi = {
  coupons: (siteSlug: string) => api.get(`/admin/marketing/${siteSlug}/coupons`),
  createCoupon: (siteSlug: string, data: any) =>
    api.post(`/admin/marketing/${siteSlug}/coupons`, data),
  adCopy: (siteSlug: string) => api.get(`/admin/marketing/${siteSlug}/ads`),
  generateAdCopy: (siteSlug: string, productId: string) =>
    api.post(`/admin/marketing/${siteSlug}/ads/generate`, { productId }),
};

// ── WhatsApp ──────────────────────────────────────────────────────────────────
export const whatsappApi = {
  logs: (siteSlug?: string, params?: any) =>
    api.get('/admin/whatsapp/logs', { params: { siteSlug, ...params } }),
  templates: (siteSlug: string) =>
    api.get(`/admin/whatsapp/${siteSlug}/templates`),
  sendTest: (phone: string, templateType: string) =>
    api.post('/admin/whatsapp/send-test', { phone, templateType }),
};

// ── AI Assistant ─────────────────────────────────────────────────────────────
export const assistantApi = {
  chat: (message: string, siteSlug?: string) =>
    api.post('/admin/assistant/chat', { message, siteSlug }),
  history: (limit = 20) => api.get('/admin/assistant/history', { params: { limit } }),
};

// ── Settings ──────────────────────────────────────────────────────────────────
export const settingsApi = {
  getSite: (siteSlug: string) => api.get(`/admin/settings/${siteSlug}`),
  updateSite: (siteSlug: string, data: any) =>
    api.patch(`/admin/settings/${siteSlug}`, data),
  meeshoAccounts: () => api.get('/admin/meesho-accounts'),
  addMeeshoAccount: (data: any) => api.post('/admin/meesho-accounts', data),
  apiKeys: () => api.get('/admin/api-keys'),
  updateApiKey: (service: string, value: string) =>
    api.put(`/admin/api-keys/${service}`, { value }),
};

// ── API Client ──────────────────────────────────────────────
const API = {
  base: '/api',

  token() { return localStorage.getItem('mimo_token'); },

  headers() {
    return {
      'Content-Type': 'application/json',
      ...(this.token() ? { Authorization: `Bearer ${this.token()}` } : {})
    };
  },

  async request(method, path, body) {
    const opts = { method, headers: this.headers() };
    if (body && !(body instanceof FormData)) opts.body = JSON.stringify(body);
    if (body instanceof FormData) {
      opts.headers = { Authorization: `Bearer ${this.token()}` };
      opts.body = body;
    }
    const res = await fetch(this.base + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || `Error ${res.status}`);
    return data;
  },

  get(path)        { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  put(path, body)  { return this.request('PUT', path, body); },
  del(path)        { return this.request('DELETE', path); },

  // Auth
  login(email, password) { return this.post('/auth/login', { email, password }); },
  me()                   { return this.get('/auth/me'); },
  notifications()        { return this.get('/auth/notifications'); },
  markNotifsRead()       { return this.put('/auth/notifications/read', {}); },

  // Dashboard
  dashStats()        { return this.get('/dashboard/stats'); },
  dashChart(days)    { return this.get(`/dashboard/chart?days=${days}`); },
  dashTopProducts()  { return this.get('/dashboard/top-products'); },
  dashRecentSales()  { return this.get('/dashboard/recent-sales'); },
  dashLowStock()     { return this.get('/dashboard/low-stock'); },
  dashTopCustomers() { return this.get('/dashboard/top-customers'); },

  // Products
  products(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/products${q ? '?' + q : ''}`);
  },
  product(id)              { return this.get(`/products/${id}`); },
  createProduct(data)      { return this.post('/products', data); },
  updateProduct(id, data)  { return this.put(`/products/${id}`, data); },
  deleteProduct(id)        { return this.del(`/products/${id}`); },
  categories()                    { return this.get('/products/categories'); },
  createCategory(data)            { return this.post('/products/categories', data); },
  updateCategory(id, data)        { return this.put(`/products/categories/${id}`, data); },
  deleteCategory(id)              { return this.del(`/products/categories/${id}`); },
  site()                          { return this.get('/site'); },
  siteDefaults()                  { return this.get('/site/defaults'); },
  saveSite(key, data)             { return this.put(`/site/${key}`, data); },
  uploadSiteImage(file)           { const fd = new FormData(); fd.append('image', file); return this.post('/site/images', fd); },
  aromas()                        { return this.get('/aromas'); },
  toppings()                      { return this.get('/toppings?all=1'); },
  createTopping(data)             { return this.post('/toppings', data); },
  updateTopping(id, data)         { return this.put(`/toppings/${id}`, data); },
  deleteTopping(id)               { return this.del(`/toppings/${id}`); },
  createAroma(data)               { return this.post('/aromas', data); },
  updateAroma(id, data)           { return this.put(`/aromas/${id}`, data); },
  deleteAroma(id)                 { return this.del(`/aromas/${id}`); },
  adjustStock(id, qty, type, notes) {
    return this.put(`/products/${id}/stock`, { quantity: qty, type, notes });
  },

  // Sales
  sales(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/sales${q ? '?' + q : ''}`);
  },
  sale(id)          { return this.get(`/sales/${id}`); },
  createSale(data)  { return this.post('/sales', data); },
  addPayment(id, amount) { return this.put(`/sales/${id}/payment`, { amount }); },
  deleteSale(id)     { return this.del(`/sales/${id}`); },

  // Customers
  customers(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/customers${q ? '?' + q : ''}`);
  },
  customer(id)              { return this.get(`/customers/${id}`); },
  createCustomer(data)      { return this.post('/customers', data); },
  updateCustomer(id, data)  { return this.put(`/customers/${id}`, data); },
  deleteCustomer(id)        { return this.del(`/customers/${id}`); },
  toggleVIP(id, is_vip)     { return this.put(`/customers/${id}/vip`, { is_vip }); },

  // Orders
  orders(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/orders${q ? '?' + q : ''}`);
  },
  order(id)             { return this.get(`/orders/${id}`); },
  createOrder(data)     { return this.post('/orders', data); },
  updateOrder(id, data) { return this.put(`/orders/${id}`, data); },
  deleteOrder(id)       { return this.del(`/orders/${id}`); },

  // Expenses
  expenses(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/expenses${q ? '?' + q : ''}`);
  },
  createExpense(data)  { return this.post('/expenses', data); },
  deleteExpense(id)    { return this.del(`/expenses/${id}`); },

  // Reports
  reportSummary(from, to) { return this.get(`/reports/summary?from=${from}&to=${to}`); },
  reportByCategory(from, to) { return this.get(`/reports/by-category?from=${from}&to=${to}`); },
  reportByProduct(from, to) { return this.get(`/reports/by-product?from=${from}&to=${to}`); },
  reportDaily(days) { return this.get(`/reports/daily?days=${days}`); },
  reportInactive() { return this.get('/reports/inactive-customers'); },
  reportStagnant() { return this.get('/reports/stagnant-products'); },
};

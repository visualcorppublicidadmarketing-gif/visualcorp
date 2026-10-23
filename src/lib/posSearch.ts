const SEARCH_CACHE = new WeakMap();

export function normalizePOSSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function normalizePOSDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function editDistance(left, right) {
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const saved = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      diagonal = saved;
    }
  }
  return previous[right.length];
}

function scoreText(value, query) {
  if (!value || !query) return 0;
  if (value === query) return 120;
  if (value.startsWith(query)) return 100 - Math.min(20, value.length - query.length);
  if (value.includes(query)) return 80 - Math.min(20, value.indexOf(query));
  const queryTokens = query.split(/\s+/).filter(Boolean);
  if (queryTokens.length > 1 && queryTokens.every((token) => value.includes(token))) return 72;
  if (query.length >= 4) {
    const candidate = value.slice(0, Math.max(query.length, Math.min(value.length, query.length + 3)));
    const similarity = 1 - (editDistance(candidate, query) / Math.max(candidate.length, query.length));
    if (similarity >= 0.62) return Math.round(similarity * 65);
  }
  return 0;
}

export function searchPOSCustomers(customers, query = '', limit = 7) {
  const normalizedQuery = normalizePOSSearch(query);
  const digitQuery = normalizePOSDigits(query);
  if (normalizedQuery.length < 2 && digitQuery.length < 3) return [];

  return (customers || [])
    .map((customer) => {
      const name = normalizePOSSearch([customer.name, customer.companyName].filter(Boolean).join(' '));
      const identification = normalizePOSDigits(customer.identification);
      const phone = normalizePOSDigits(customer.phone);
      const nameScore = scoreText(name, normalizedQuery);
      const identificationScore = digitQuery ? scoreText(identification, digitQuery) + 8 : 0;
      const phoneScore = digitQuery ? scoreText(phone, digitQuery) + 5 : 0;
      const score = Math.max(nameScore, identificationScore, phoneScore) + (customer.isVip ? 2 : 0);
      const matchField = score === identificationScore ? 'Cédula/RUC' : score === phoneScore ? 'Teléfono' : 'Nombre';
      return { customer, score, matchField };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || String(left.customer.name).localeCompare(String(right.customer.name), 'es'))
    .slice(0, limit);
}

export function findExactPOSCustomer(customers, customerData = {}) {
  const identification = normalizePOSDigits(customerData.identification);
  const phone = normalizePOSDigits(customerData.phone);
  const name = normalizePOSSearch(customerData.name);
  return (customers || []).find((customer) =>
    (customerData.id && customer.id === customerData.id)
    || (identification.length >= 6 && normalizePOSDigits(customer.identification) === identification)
    || (phone.length >= 7 && normalizePOSDigits(customer.phone) === phone)
    || (name.length >= 3 && normalizePOSSearch(customer.name) === name)
  ) || null;
}

function getProductIndex(products) {
  if (!Array.isArray(products)) return [];
  const cached = SEARCH_CACHE.get(products);
  if (cached) return cached;
  const index = products.map((product) => ({
    product,
    searchText: normalizePOSSearch([product.name, product.category, product.sku, product.code, product.description].filter(Boolean).join(' ')),
  }));
  SEARCH_CACHE.set(products, index);
  return index;
}

export function searchPOSProducts(products, query = '', category = 'all') {
  const normalizedQuery = normalizePOSSearch(query);
  return getProductIndex(products)
    .filter(({ product, searchText }) => {
      if (product.isActive === false) return false;
      if (category !== 'all' && product.category !== category) return false;
      return !normalizedQuery || searchText.includes(normalizedQuery);
    })
    .map(({ product }) => product);
}

export function searchPOSOrders(orders, query = '') {
  const normalizedQuery = normalizePOSSearch(query);
  return (orders || []).filter((order) => {
    const searchable = normalizePOSSearch([order.orderNumber, order.customerName, order.customerIdentification, order.jobName, order.customerPhone].filter(Boolean).join(' '));
    return !normalizedQuery || searchable.includes(normalizedQuery);
  });
}

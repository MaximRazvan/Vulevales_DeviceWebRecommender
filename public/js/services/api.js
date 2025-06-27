const BASE_URL = '/api';

async function _request(endpoint, options = {}, token = null) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(BASE_URL + endpoint, { ...options, headers });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.message || 'A aparut o eroare API.');
    }
    return data;
}

// --- Functii pentru Autentificare ---
export function login(username, password) {
    return _request('/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}
export function register(username, password, email) {
    return _request('/register', { method: 'POST', body: JSON.stringify({ username, password, email }) });
}

// --- Functii pentru Produse ---
export function getRecommendations(filters = {}) {
    const params = new URLSearchParams(filters);
    return _request(`/recommendations?${params.toString()}`);
}
export function getProductById(productId) {
    return _request(`/products/${productId}`);
}
export function getPopularStats() {
    return _request('/popular');
}
export function addProduct(productData, token) {
    return _request('/products', { method: 'POST', body: JSON.stringify(productData) }, token);
}

// --- Functii pentru Favorite ---
export function getFavorites(token) {
    return _request('/favorites', {}, token);
}
export function addFavorite(productId, token) {
    return _request('/favorites', { method: 'POST', body: JSON.stringify({ productId }) }, token);
}
export function removeFavorite(productId, token) {
    return _request(`/favorites/${productId}`, { method: 'DELETE' }, token);
}
export function checkFavoriteStatus(productId, token) {
    return _request(`/favorites/check/${productId}`, {}, token);
}

// --- Alte Functii ---
export function getSites() {
    return _request('/sites');
}
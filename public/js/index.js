import * as api from './services/api.js';
import { initAuth } from './auth.js';
import { initAdminActions, openEditModal } from './productAdmin.js';
import { createProductCard } from './ui.js';

// --- Referinte DOM ---
const recommendationsContainer = document.getElementById('recommendations');
const searchInput = document.getElementById('searchInput');
const minPriceInput = document.getElementById('minPrice');
const maxPriceInput = document.getElementById('maxPrice');
const batteryLifeInput = document.getElementById('batteryLife');
const deviceTypeInput = document.getElementById('deviceType');
const siteFilterSelect = document.getElementById('siteFilter');

// Butoanele de navigatie
const viewStatsButton = document.getElementById('viewStatsButton');
const viewDocsButton = document.getElementById('viewDocsButton');
const viewFavoritesButton = document.getElementById('viewFavoritesButton');

/**
 * Gestioneaza stergerea unui produs (doar pentru admin).
 * @param {string} productId - ID-ul produsului de sters.
 */
async function handleDeleteProduct(productId) {
    if (!confirm('Esti sigur ca vrei sa stergi definitiv acest produs? Actiunea este ireversibila!')) {
        return;
    }
    const token = localStorage.getItem('token');
    try {
        await api.deleteProduct(productId, token);
        alert('Produs sters cu succes!');
        fetchRecommendations(); // Reimprospatam lista
    } catch (error) {
        alert(`Eroare la stergere: ${error.message}`);
    }
}

/**
 * Gestioneaza adaugarea/stergerea unui produs de la favorite.
 * @param {string} productId - ID-ul produsului.
 * @param {boolean} isCurrentlyFavorited - Starea curenta de favorit.
 */
async function handleFavoriteToggle(productId, isCurrentlyFavorited) {
    const token = localStorage.getItem('token');
    if (!token) {
        alert('Trebuie sa fii autentificat.');
        return;
    }
    try {
        if (isCurrentlyFavorited) {
            await api.removeFavorite(productId, token);
        } else {
            await api.addFavorite(productId, token);
        }
        fetchRecommendations(); // Reimprospatam lista pentru a reflecta schimbarea
    } catch (error) {
        alert(`Eroare: ${error.message}`);
    }
}

/**
 * Preia produsele de la API si le afiseaza pe pagina, aplicand filtrele curente.
 */
async function fetchRecommendations() {
    const filters = {
        q: searchInput.value,
        minPrice: minPriceInput.value,
        maxPrice: maxPriceInput.value,
        batteryLife: batteryLifeInput.value,
        deviceType: deviceTypeInput.value,
        siteName: siteFilterSelect.value,
    };

    const token = localStorage.getItem('token');
    let favoriteProductIds = new Set();

    if (token) {
        try {
            const favProducts = await api.getFavorites(token);
            favProducts.forEach(fav => favoriteProductIds.add(fav.id));
        } catch (error) {
            console.warn('Nu s-a putut prelua lista de favorite:', error.message);
        }
    }

    try {
        const products = await api.getRecommendations(filters);
        recommendationsContainer.innerHTML = '';

        if (products.length === 0) {
            recommendationsContainer.innerHTML = '<p class="no-results">Nu s-au gasit recomandări conform filtrelor.</p>';
            return;
        }

        products.forEach(device => {
            device.isFavorited = favoriteProductIds.has(device.id);
            const card = createProductCard(device, {
                onEditClick: openEditModal,
                onDeleteClick: handleDeleteProduct,
                onFavoriteToggle: handleFavoriteToggle,
            });
            recommendationsContainer.appendChild(card);
        });

    } catch (error) {
        console.error('Eroare la preluarea recomandarilor:', error);
        recommendationsContainer.innerHTML = `<p class="no-results error">${error.message}</p>`;
    }
}

/**
 * Populeaza filtrul de site-uri.
 */
async function populateSiteFilter() {
    try {
        const sites = await api.getSites();
        siteFilterSelect.innerHTML = '<option value="">Toate site-urile</option>';
        sites.forEach(site => {
            const option = document.createElement('option');
            option.value = site;
            option.textContent = site;
            siteFilterSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Eroare la popularea filtrului de site-uri:', error);
    }
}

// --- Punctul de intrare (Main) ---
document.addEventListener('DOMContentLoaded', () => {
    // Initializam modulele si le pasam functii de callback
    initAuth({ onAuthChange: fetchRecommendations });
    initAdminActions({ onProductChange: fetchRecommendations });

    // Atasam listenerii pentru butoanele de navigatie
    if (viewStatsButton) {
        viewStatsButton.addEventListener('click', () => { window.location.href = '/stats.html'; });
    }
    if (viewDocsButton) {
        viewDocsButton.addEventListener('click', () => { window.location.href = '/documentation.html'; });
    }
    if (viewFavoritesButton) {
        viewFavoritesButton.addEventListener('click', () => { window.location.href = '/favorites.html'; });
    }

    // Incarcam datele initiale
    populateSiteFilter();
    fetchRecommendations();

    // Adaugam un singur event listener pentru toate filtrele
    const filterElements = [searchInput, minPriceInput, maxPriceInput, batteryLifeInput, deviceTypeInput, siteFilterSelect];
    filterElements.forEach(el => {
        const eventType = el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(eventType, fetchRecommendations);
    });
});
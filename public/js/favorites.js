import * as api from './services/api.js';
import { createProductCard } from './ui.js'; // Importam functia de creare a cardului

const favoritesGrid = document.getElementById('favoritesGrid');
const loadingMessage = document.getElementById('loadingMessage');
const errorMessage = document.getElementById('errorMessage');
const noFavoritesMessage = document.getElementById('noFavoritesMessage');
const backToHomeButton = document.getElementById('backToHome');

/**
 * Gestioneaza eliminarea unui produs de la favorite.
 */
async function handleRemoveFavorite(productId) {
    if (!confirm('Esti sigur ca vrei sa elimini acest produs din favorite?')) {
        return;
    }
    const token = localStorage.getItem('token');
    try {
        await api.removeFavorite(productId, token);
        fetchAndDisplayFavorites(); // Reincarcam lista dupa stergere
    } catch (error) {
        alert(error.message);
    }
}

/**
 * Preia si afiseaza produsele favorite ale utilizatorului.
 */
async function fetchAndDisplayFavorites() {
    loadingMessage.style.display = 'block';
    errorMessage.style.display = 'none';
    noFavoritesMessage.style.display = 'none';
    favoritesGrid.innerHTML = '';

    const token = localStorage.getItem('token');
    if (!token) {
        loadingMessage.style.display = 'none';
        errorMessage.textContent = 'Nu sunteti autentificat pentru a vedea favoritele.';
        errorMessage.style.display = 'block';
        return;
    }

    try {
        const favorites = await api.getFavorites(token);
        loadingMessage.style.display = 'none';

        if (favorites.length === 0) {
            noFavoritesMessage.style.display = 'block';
            return;
        }

        favorites.forEach(device => {
            // Folosim functia reutilizabila din ui.js pentru a crea cardul
            const card = createProductCard(device, {
                // Pe aceasta pagina, butonul de favorite are doar rolul de a sterge
                onFavoriteToggle: () => handleRemoveFavorite(device.id)
            });
            favoritesGrid.appendChild(card);
        });

    } catch (error) {
        console.error('Eroare la preluarea si afisarea favoritelor:', error);
        loadingMessage.style.display = 'none';
        errorMessage.textContent = error.message;
        errorMessage.style.display = 'block';
    }
}

// --- EVENT LISTENERS ---
backToHomeButton.addEventListener('click', () => {
    window.location.href = '/';
});

document.addEventListener('DOMContentLoaded', fetchAndDisplayFavorites);
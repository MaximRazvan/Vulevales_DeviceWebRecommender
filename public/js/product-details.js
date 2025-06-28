import * as api from './services/api.js';
import { isLoggedIn, getUserRole } from './auth.js'; 
// Probabil vei avea nevoie si de aceste functii aici
// import { openEditModal } from './productAdmin.js'; 

// --- Referinte DOM ---
const productDetailsSection = document.getElementById('productDetails');
const productNameElement = document.getElementById('productName');
const loadingMessageElement = productDetailsSection.querySelector('.loading-message');

// Referinte la butoanele de actiune de pe aceasta pagina
const favoriteButton = document.getElementById('favoriteButton');
const editProductButton = document.getElementById('editProductButton');
const deleteProductButton = document.getElementById('deleteProductButton');
let currentProductId = null;


/**
 * Curata detaliile vechi de pe pagina, lasand doar titlul si mesajul de incarcare.
 */
function clearProductDetails() {
    const existingDetails = productDetailsSection.querySelectorAll('p:not(.loading-message), a, img, .product-stats, .product-actions');
    existingDetails.forEach(el => el.remove());
}


/**
 * Preia si afiseaza detaliile complete pentru un produs.
 */
async function displayProductDetails(productId) {
    currentProductId = productId; // Salvam ID-ul curent
    productNameElement.textContent = 'Încarcare...';
    loadingMessageElement.style.display = 'block';
    clearProductDetails();

    try {
        const product = await api.getProductById(productId);

        loadingMessageElement.style.display = 'none'; // Ascundem mesajul de incarcare
        productNameElement.textContent = product.name;
        document.title = `${product.name} - Detalii`;

        // --- Cream si adaugam elementele HTML pe pagina ---

        // Container pentru statistici
        const statsContainer = document.createElement('div');
        statsContainer.className = 'product-stats';
        statsContainer.innerHTML = `
            <span class="stat-item">👍 ${product.likes_count} Aprecieri</span>
            <span class="stat-item">👁️ ${product.views_count} Vizualizări</span>
        `;
        productNameElement.after(statsContainer);

        // Imaginea produsului
        if (product.image) {
            const img = document.createElement('img');
            img.src = product.image;
            img.alt = product.name;
            img.className = 'detail-product-image';
            statsContainer.after(img);
        }
        
        // Detaliile produsului
        const detailsContainer = document.createElement('div');
        detailsContainer.innerHTML = `
            <p><strong>Preț:</strong> ${product.price} Lei</p>
            <p><strong>Autonomie baterie:</strong> ${product.batterylife ? `${product.batterylife} ore` : 'N/A'}</p>
            <p><strong>Tip:</strong> ${product.type}</p>
            <p><strong>Caracteristici:</strong> ${product.features.join(', ')}</p>
            ${product.link ? `<p><strong>Link:</strong> <a href="${product.link}" target="_blank">Vizitează pagina produsului</a></p>` : ''}
        `;
        (document.querySelector('.detail-product-image') || statsContainer).after(detailsContainer);

        // Actualizam starea butoanelor de actiune
        updateActionButtons(productId);

    } catch (error) {
        console.error('Eroare la preluarea detaliilor produsului:', error);
        loadingMessageElement.style.display = 'none';
        productDetailsSection.innerHTML += `<p class="error-message">${error.message}</p>`;
    }
}

/**
 * Actualizeaza butoanele (Favorite, Edit, Delete) in functie de starea de login si rol.
 */
async function updateActionButtons(productId) {
    // ... logica din pasii anteriori pentru a afisa/ascunde butoanele ...
    // ... si pentru a verifica starea de favorit ...
}


// --- Punctul de intrare ---
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('product_id');

    if (productId) {
        displayProductDetails(productId);
    } else {
        loadingMessageElement.style.display = 'none';
        productNameElement.textContent = 'Eroare';
        productDetailsSection.innerHTML += '<p class="error-message">ID-ul produsului nu a fost specificat în adresă.</p>';
    }
});
import { getUserRole } from './auth.js';

/**
 * Functie generica pentru a afisa mesaje de status.
 * @param {HTMLElement} element - Elementul div unde se afiseaza mesajul.
 * @param {string} message - Mesajul de afisat.
 * @param {'success'|'error'} type - Tipul mesajului.
 */
export function displayStatusMessage(element, message, type) {
    if (!element) return;
    element.textContent = message;
    element.className = `status-message ${type}`;
}

/**
 * Creeaza HTML-ul pentru un card de produs. Este o functie reutilizabila.
 * @param {object} device - Obiectul produsului.
 * @param {object} options - Optiuni si callback-uri pentru interactiuni.
 * @param {Function} [options.onEditClick] - Functie de apelat la click pe butonul de editare.
 * @param {Function} [options.onDeleteClick] - Functie de apelat la click pe butonul de stergere.
 * @param {Function} [options.onFavoriteToggle] - Functie de apelat la click pe butonul de favorite.
 * @returns {HTMLElement} - Elementul div al cardului.
 */
export function createProductCard(device, options = {}) {
    const div = document.createElement('div');
    div.className = 'device-card';
    if (device.isFavorited) {
        div.classList.add('is-favorited-card');
    }
    div.dataset.productId = device.id;

    // --- Container pentru actiuni (butoane) ---
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'device-actions';

    // Adaugam butoane de admin daca utilizatorul are rolul si functia de callback este furnizata
    if (getUserRole() === 'admin') {
        if (options.onEditClick) {
            const editButton = document.createElement('button');
            editButton.textContent = 'Editează';
            editButton.className = 'edit-btn';
            editButton.addEventListener('click', (e) => {
                e.stopPropagation();
                options.onEditClick(device.id);
            });
            actionsDiv.appendChild(editButton);
        }
        if (options.onDeleteClick) {
            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Șterge';
            deleteButton.className = 'delete-btn';
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                options.onDeleteClick(device.id);
            });
            actionsDiv.appendChild(deleteButton);
        }
    }

    // Adaugam buton de favorite daca functia de callback este furnizata
    if (options.onFavoriteToggle) {
        const favoriteButton = document.createElement('button');
        favoriteButton.textContent = device.isFavorited ? 'Elimină Favorit' : 'Adaugă Favorit';
        favoriteButton.className = `favorite-btn ${device.isFavorited ? 'favorited' : ''}`;
        favoriteButton.addEventListener('click', (e) => {
            e.stopPropagation();
            options.onFavoriteToggle(device.id, device.isFavorited);
        });
        actionsDiv.appendChild(favoriteButton);
    }
    
    if(actionsDiv.hasChildNodes()){
        div.appendChild(actionsDiv);
    }

    // --- Imaginea Produsului ---
    if (device.image) {
        const img = document.createElement('img');
        img.src = device.image;
        img.alt = device.name;
        img.className = 'product-image';
        div.appendChild(img);
    } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'product-image-placeholder';
        placeholder.textContent = 'Fara imagine';
        div.appendChild(placeholder);
    }

    // --- Detaliile Produsului ---
    const contentHTML = `
      <h3>${device.name}</h3>
      <p>Preț: ${device.price} Lei</p>
      ${device.site_name ? `<p>Site: <strong>${device.site_name}</strong></p>` : ''}
      <p>Caracteristici: ${device.features.join(', ')}</p>
    `;
    div.insertAdjacentHTML('beforeend', contentHTML);

    // Navigare la pagina de detalii la click pe card (nu pe butoane)
    div.addEventListener('click', (e) => {
    if (!e.target.closest('.device-actions button')) {
        // ADAUGĂ ACEASTĂ LINIE PENTRU A VERIFICA OBIECTUL 'device'
        console.log('Se face click pe card pentru device-ul:', device);

        window.location.href = `/product-details.html?product_id=${device.id}`;
    }
});

return div;
}
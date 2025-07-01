import * as api from './services/api.js';

// --- Referinte DOM pentru MODALUL DE ADAUGARE ---
const addProductModal = document.getElementById('addProductModal');
const addProductForm = document.getElementById('productForm');
const addProductStatusMessage = document.getElementById('addProductStatusMessage');
const addProductNameInput = document.getElementById('productNameInput');
const addProductPriceInput = document.getElementById('productPriceInput');
const addProductBatteryLifeInput = document.getElementById('productBatteryLifeInput');
const addProductTypeInput = document.getElementById('productTypeInput');
const addProductFeaturesInput = document.getElementById('productFeaturesInput');
const addProductLinkInput = document.getElementById('productLinkInput');
const addProductImageInput = document.getElementById('productImageInput');
const addProductSiteNameInput = document.getElementById('productSiteNameInput');

// --- Referinte DOM pentru MODALUL DE EDITARE ---
const editProductModal = document.getElementById('editProductModal');
const editProductForm = document.getElementById('editProductForm');
const editProductStatusMessage = document.getElementById('editProductStatusMessage');
const editProductIdInput = document.getElementById('editProductId');
const editProductNameInput = document.getElementById('editProductNameInput');
const editProductPriceInput = document.getElementById('editProductPriceInput');
const editProductBatteryLifeInput = document.getElementById('editProductBatteryLifeInput');
const editProductTypeInput = document.getElementById('editProductTypeInput');
const editProductFeaturesInput = document.getElementById('editProductFeaturesInput');
const editProductLinkInput = document.getElementById('editProductLinkInput');
const editProductImageInput = document.getElementById('editProductImageInput');
const editProductSiteNameInput = document.getElementById('editProductSiteNameInput');


// --- Functii Helper ---

function _showStatusMessage(modalType, message, status) {
    const messageElement = modalType === 'add' ? addProductStatusMessage : editProductStatusMessage;
    if (messageElement) {
        messageElement.textContent = message;
        messageElement.className = `status-message ${status}`;
    }
}

function _closeModals() {
    if (addProductModal) addProductModal.style.display = 'none';
    if (editProductModal) editProductModal.style.display = 'none';
}

// --- Functii Handler pentru Formulare ---

async function _handleAddSubmit(event, onProductChange) {
    event.preventDefault();
    const featuresValue = addProductFeaturesInput.value;
    if (featuresValue === null || featuresValue === undefined) {
         _showStatusMessage('add', 'Câmpul Caracteristici nu poate fi gol.', 'error');
         return;
    }
    const productData = {
        name: addProductNameInput.value,
        price: parseFloat(addProductPriceInput.value),
        batteryLife: parseInt(addProductBatteryLifeInput.value, 10) || null,
        type: addProductTypeInput.value,
        features: featuresValue.split(',').map(f => f.trim()).filter(Boolean),
        link: addProductLinkInput.value,
        image: addProductImageInput.value,
        siteName: addProductSiteNameInput.value,
    };

    const token = localStorage.getItem('token');
    try {
        const result = await api.addProduct(productData, token);
        _showStatusMessage('add', result.message, 'success');
        setTimeout(() => {
            _closeModals();
            if (onProductChange) onProductChange();
        }, 1500);
    } catch (error) {
        _showStatusMessage('add', error.message, 'error');
    }
}

async function _handleUpdateSubmit(event, onProductChange) {
    event.preventDefault();
    const productId = editProductIdInput.value;
    const featuresValue = editProductFeaturesInput.value;
     if (featuresValue === null || featuresValue === undefined) {
         _showStatusMessage('edit', 'Câmpul Caracteristici nu poate fi gol.', 'error');
         return;
    }
    const productData = {
        name: editProductNameInput.value,
        price: parseFloat(editProductPriceInput.value),
        batteryLife: parseInt(editProductBatteryLifeInput.value, 10) || null,
        type: editProductTypeInput.value,
        features: featuresValue.split(',').map(f => f.trim()).filter(Boolean),
        link: editProductLinkInput.value,
        image: editProductImageInput.value,
        siteName: editProductSiteNameInput.value,
    };
    
    const token = localStorage.getItem('token');
    try {
        const result = await api.updateProduct(productId, productData, token);
        _showStatusMessage('edit', result.message, 'success');
        setTimeout(() => {
            _closeModals();
            if (onProductChange) onProductChange();
        }, 1500);
    } catch (error) {
        _showStatusMessage('edit', error.message, 'error');
    }
}


// --- Functii exportate ---

/**
 * Deschide modalul de editare si populeaza formularul cu datele produsului.
 */
export async function openEditModal(productId) {
    _showStatusMessage('edit', '', '');
    try {
        const product = await api.getProductById(productId);
        // Popularea formularului de editare
        editProductIdInput.value = product.id;
        editProductNameInput.value = product.name;
        editProductPriceInput.value = product.price;
        editProductBatteryLifeInput.value = product.batterylife || '';
        editProductTypeInput.value = product.type;
        editProductFeaturesInput.value = product.features.join(', ');
        editProductLinkInput.value = product.link || '';
        editProductImageInput.value = product.image || '';
        // Asigura-te ca in HTML ai id="editProductSiteNameInput" pentru acest camp
        if(editProductSiteNameInput) editProductSiteNameInput.value = product.site_name || '';
        
        editProductModal.style.display = 'flex';
    } catch (error) {
        alert(`Nu am putut prelua datele produsului: ${error.message}`);
    }
}

/**
 * Functia principala de initializare a modulului.
 */
export function initAdminActions(callbacks = {}) {
    const addProductButton = document.getElementById('addProductButton');
    if (addProductButton) {
        addProductButton.addEventListener('click', () => {
            if(addProductForm) addProductForm.reset();
            _showStatusMessage('add', '', '');
            if(addProductModal) addProductModal.style.display = 'flex';
        });
    }
    
    if(addProductForm) addProductForm.addEventListener('submit', (e) => _handleAddSubmit(e, callbacks.onProductChange));
    if(editProductForm) editProductForm.addEventListener('submit', (e) => _handleUpdateSubmit(e, callbacks.onProductChange));

    document.querySelectorAll('.add-product-close-button, .edit-product-close-button').forEach(btn => {
        btn.addEventListener('click', _closeModals);
    });
}
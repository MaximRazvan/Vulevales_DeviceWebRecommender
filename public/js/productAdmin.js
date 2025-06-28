import * as api from './services/api.js';

// --- Referinte DOM ---
const addProductModal = document.getElementById('addProductModal');
const addProductForm = document.getElementById('productForm');
const addProductStatusMessage = document.getElementById('addProductStatusMessage');

// Input-urile specifice din formularul de adaugare
const productNameInput = document.getElementById('productNameInput');
const productPriceInput = document.getElementById('productPriceInput');
const productBatteryLifeInput = document.getElementById('productBatteryLifeInput');
const productTypeInput = document.getElementById('productTypeInput');
const productFeaturesInput = document.getElementById('productFeaturesInput');
const productLinkInput = document.getElementById('productLinkInput');
const productImageInput = document.getElementById('productImageInput');
const productSiteNameInput = document.getElementById('productSiteNameInput');

// ... si referintele la modalul de editare, daca este necesar
const editProductModal = document.getElementById('editProductModal');


function _showStatusMessage(modalType, message, status) {
    const messageElement = modalType === 'add' ? addProductStatusMessage : document.getElementById('editProductStatusMessage');
    if (messageElement) {
        messageElement.textContent = message;
        messageElement.className = `status-message ${status}`;
    }
}

function _closeModals() {
    if (addProductModal) addProductModal.style.display = 'none';
    if (editProductModal) editProductModal.style.display = 'none';
}

async function _handleAddSubmit(event, onProductAdded) {
    event.preventDefault();
    
    // Preluam datele direct prin ID-ul fiecarui element
    const featuresValue = productFeaturesInput.value;
    if (featuresValue === null || featuresValue === undefined) {
         _showStatusMessage('add', 'Câmpul Caracteristici nu poate fi gol.', 'error');
         return;
    }

    const productData = {
        name: productNameInput.value,
        price: parseFloat(productPriceInput.value),
        batteryLife: parseInt(productBatteryLifeInput.value, 10) || null,
        type: productTypeInput.value,
        features: featuresValue.split(',').map(f => f.trim()).filter(Boolean),
        link: productLinkInput.value,
        image: productImageInput.value,
        siteName: productSiteNameInput.value,
    };

    const token = localStorage.getItem('token');
    try {
        const result = await api.addProduct(productData, token);
        _showStatusMessage('add', result.message, 'success');
        setTimeout(() => {
            _closeModals();
            if (onProductAdded) onProductAdded();
        }, 1500);
    } catch (error) {
        _showStatusMessage('add', error.message, 'error');
    }
}

// ... _handleUpdateSubmit si openEditModal ar trebui modificate similar ...
async function _handleUpdateSubmit(event, onProductUpdated) { /* ... */ }
export async function openEditModal(productId) { /* ... */ }

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
    
    document.querySelectorAll('.add-product-close-button, .edit-product-close-button').forEach(btn => {
        btn.addEventListener('click', _closeModals);
    });
}
import * as api from './services/api.js';

// --- Asigura-te ca aceste ID-uri se potrivesc 100% cu cele din index.html ---
const loginModal = document.getElementById('loginModal');
const registerModal = document.getElementById('registerModal');
const loginButton = document.getElementById('loginButton');
const logoutButton = document.getElementById('logoutButton');
const userStatusButton = document.getElementById('userStatusButton');
const addProductButton = document.getElementById('addProductButton');
const viewFavoritesButton = document.getElementById('viewFavoritesButton');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginStatusMessage = document.getElementById('loginStatusMessage');
const registerStatusMessage = document.getElementById('registerStatusMessage');
const openRegisterModalButton = document.getElementById('openRegisterModal');

function _decodeJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}

export function isLoggedIn() {
    const token = localStorage.getItem('token');
    if (!token) return false;
    const decoded = _decodeJwt(token);
    if (!decoded || !decoded.exp) return false;
    return (decoded.exp * 1000) > Date.now();
}

export function getUserRole() {
    return localStorage.getItem('userRole');
}

async function handleLogin(event, onLoginSuccess) {
    event.preventDefault();
    const username = loginForm.elements.username.value;
    const password = loginForm.elements.password.value;
    if(loginStatusMessage) loginStatusMessage.textContent = '';

    try {
        const data = await api.login(username, password);
        localStorage.setItem('token', data.token);
        localStorage.setItem('userRole', data.role);
        localStorage.setItem('username', data.username);
        
        if(loginStatusMessage) {
            loginStatusMessage.className = 'status-message success';
            loginStatusMessage.textContent = data.message;
        }

        setTimeout(() => {
            if(loginModal) loginModal.style.display = 'none';
            updateAuthUI();
            if (onLoginSuccess) onLoginSuccess();
        }, 1000);
    } catch (error) {
        if(loginStatusMessage) {
            loginStatusMessage.className = 'status-message error';
            loginStatusMessage.textContent = error.message;
        }
    }
}

async function handleRegister(event) {
    event.preventDefault();
    const username = registerForm.elements.username.value;
    const email = registerForm.elements.email.value;
    const password = registerForm.elements.password.value;
    if(registerStatusMessage) registerStatusMessage.textContent = '';

    try {
        const data = await api.register(username, password, email);
        if(registerStatusMessage) {
            registerStatusMessage.className = 'status-message success';
            registerStatusMessage.textContent = data.message;
        }
        setTimeout(() => {
            if(registerModal) registerModal.style.display = 'none';
            if(loginModal) loginModal.style.display = 'flex';
        }, 1500);
    } catch (error) {
        if(registerStatusMessage) {
            registerStatusMessage.className = 'status-message error';
            registerStatusMessage.textContent = error.message;
        }
    }
}

function handleLogout(onLogoutSuccess) {
    localStorage.clear();
    updateAuthUI();
    if (onLogoutSuccess) onLogoutSuccess();
}

export function updateAuthUI() {
    if (isLoggedIn()) {
        const username = localStorage.getItem('username');
        const role = localStorage.getItem('userRole');
        if(loginButton) loginButton.style.display = 'none';
        if(logoutButton) logoutButton.style.display = 'block';
        if(userStatusButton) {
            userStatusButton.textContent = `${username} (${role})`;
            userStatusButton.style.display = 'block';
        }
        if(viewFavoritesButton) viewFavoritesButton.style.display = 'block';
        if(addProductButton) addProductButton.style.display = role === 'admin' ? 'block' : 'none';
    } else {
        if(loginButton) loginButton.style.display = 'block';
        if(logoutButton) logoutButton.style.display = 'none';
        if(userStatusButton) userStatusButton.style.display = 'none';
        if(viewFavoritesButton) viewFavoritesButton.style.display = 'none';
        if(addProductButton) addProductButton.style.display = 'none';
    }
}

export function initAuth(callbacks = {}) {
    if(loginButton) {
        loginButton.addEventListener('click', () => {
            loginModal.style.display = 'flex';
            if(loginStatusMessage) loginStatusMessage.textContent = '';
        });
    }

    if(logoutButton) logoutButton.addEventListener('click', () => handleLogout(callbacks.onAuthChange));
    if(loginForm) loginForm.addEventListener('submit', (e) => handleLogin(e, callbacks.onAuthChange));
    if(registerForm) registerForm.addEventListener('submit', handleRegister);
    
    if(openRegisterModalButton) {
        openRegisterModalButton.addEventListener('click', () => {
            if(loginModal) loginModal.style.display = 'none';
            if(registerModal) registerModal.style.display = 'flex';
        });
    }
    
    document.querySelectorAll('.login-close-button, .register-close-button').forEach(btn => {
        btn.addEventListener('click', () => {
            if(loginModal) loginModal.style.display = 'none';
            if(registerModal) registerModal.style.display = 'none';
        });
    });

    updateAuthUI();
}
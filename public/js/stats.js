// Atentie: Trebuie sa adaugi functia getPopularStats in api.js
// export function getPopularStats() { return _request('/popular'); }

import * as api from './services/api.js';

// --- REFERINTE DOM ---
const likesChartCanvas = document.getElementById('likesChart');
const viewsChartCanvas = document.getElementById('viewsChart');
const popularStatsInfo = document.getElementById('popularStatsInfo');
let likesChartInstance;
let viewsChartInstance;

/**
 * Preia statisticile de la API si deseneaza graficele.
 */
async function fetchPopularStats() {
    try {
        const popularData = await api.getPopularStats(); // Functie noua in api.js

        if (popularData && popularData.length > 0) {
            const productNames = popularData.map(item => item.name);
            const likeCounts = popularData.map(item => item.likes_count);
            const viewCounts = popularData.map(item => item.views_count);
            
            // Logica de a crea graficul pentru Likes cu Chart.js
            likesChartInstance = new Chart(likesChartCanvas, { /* ... configuratia ... */ });
            
            // Logica de a crea graficul pentru Views cu Chart.js
            viewsChartInstance = new Chart(viewsChartCanvas, { /* ... configuratia ... */ });
        } else {
            popularStatsInfo.textContent = 'Nu sunt statistici populare disponibile.';
            popularStatsInfo.style.display = 'block';
        }
    } catch (error) {
        console.error('Error fetching popular stats:', error);
        popularStatsInfo.textContent = error.message;
        popularStatsInfo.style.display = 'block';
    }
}

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', fetchPopularStats);
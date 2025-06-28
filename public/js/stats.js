// Importam serviciul API pentru a prelua datele
import * as api from './services/api.js';

// --- Referinte DOM ---
const backToHomeButton = document.getElementById('backToHome');
const likesChartCanvas = document.getElementById('likesChart');
const viewsChartCanvas = document.getElementById('viewsChart');
const popularStatsInfo = document.getElementById('popularStatsInfo');
let likesChartInstance;
let viewsChartInstance;

/**
 * Preia statisticile de la API si deseneaza graficele.
 */
async function fetchPopularStats() {
    // Distrugem graficele vechi, daca exista, pentru a preveni erorile
    if (likesChartInstance) likesChartInstance.destroy();
    if (viewsChartInstance) viewsChartInstance.destroy();
    
    popularStatsInfo.style.display = 'none';

    try {
        const popularData = await api.getPopularStats();

        if (popularData && popularData.length > 0) {
            const productNames = popularData.map(item => item.name);
            const likeCounts = popularData.map(item => item.likes_count);
            const viewCounts = popularData.map(item => item.views_count);

            const chartOptions = {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y', // Grafice orizontale, mai usor de citit
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true }
                }
            };

            // Cream graficul pentru Aprecieri
            likesChartInstance = new Chart(likesChartCanvas, {
                type: 'bar',
                data: {
                    labels: productNames,
                    datasets: [{
                        label: 'Număr de aprecieri',
                        data: likeCounts,
                        backgroundColor: 'rgba(255, 140, 0, 0.8)', // Portocaliu
                    }]
                },
                options: chartOptions
            });

            // Cream graficul pentru Vizualizari
            viewsChartInstance = new Chart(viewsChartCanvas, {
                type: 'bar',
                data: {
                    labels: productNames,
                    datasets: [{
                        label: 'Număr de vizualizări',
                        data: viewCounts,
                        backgroundColor: 'rgba(85, 85, 85, 0.8)', // Gri
                    }]
                },
                options: chartOptions
            });

        } else {
            likesChartCanvas.style.display = 'none';
            viewsChartCanvas.style.display = 'none';
            popularStatsInfo.textContent = 'Nu sunt statistici populare disponibile.';
            popularStatsInfo.style.display = 'block';
        }
    } catch (error) {
        console.error('Error fetching popular stats:', error);
        likesChartCanvas.style.display = 'none';
        viewsChartCanvas.style.display = 'none';
        popularStatsInfo.textContent = 'A apărut o eroare la încărcarea statisticilor.';
        popularStatsInfo.style.display = 'block';
    }
}

// --- Punctul de intrare ---
document.addEventListener('DOMContentLoaded', () => {
    // Adaugam functionalitatea pentru butonul de "Inapoi"
    if (backToHomeButton) {
        backToHomeButton.addEventListener('click', () => {
            window.location.href = '/';
        });
    }

    // Apelam functia pentru a incarca datele si a desena graficele
    fetchPopularStats();
});
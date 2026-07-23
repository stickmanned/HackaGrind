let selectedProjects = new Set();
let projectChart = null;
let languageChart = null;
let allProjectsList = [];

function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
}

async function fetchStats() {
    try {
        let url = '/api/stats';
        if (selectedProjects.size > 0) {
            const params = new URLSearchParams();
            selectedProjects.forEach(p => params.append('projects', p));
            url += '?' + params.toString();
        }

        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();

        updateMetrics(data);
        renderPills(data.by_project);
        renderCharts(data);
        renderTable(data);
    } catch (err) {
        console.error('Failed to fetch stats:', err);
    }
}

function updateMetrics(data) {
    document.getElementById('total-time-val').textContent = formatTime(data.total_seconds || 0);
    
    const projKeys = Object.keys(data.by_project || {});
    document.getElementById('projects-count').textContent = projKeys.length;

    const langEntries = Object.entries(data.by_language || {}).sort((a, b) => b[1] - a[1]);
    if (langEntries.length > 0) {
        const [topLang, langSec] = langEntries[0];
        document.getElementById('top-lang-val').textContent = topLang;
        const pct = data.total_seconds > 0 ? Math.round((langSec / data.total_seconds) * 100) : 0;
        document.getElementById('top-lang-sub').textContent = `${pct}% of total coding time`;
    }
}

function renderPills(byProject) {
    const container = document.getElementById('project-pills-container');
    const availableProjects = Object.keys(byProject || {});
    
    if (allProjectsList.length === 0 && availableProjects.length > 0) {
        allProjectsList = [...availableProjects];
    }

    container.innerHTML = '';
    const projectsToRender = allProjectsList.length > 0 ? allProjectsList : availableProjects;

    projectsToRender.forEach(proj => {
        const pill = document.createElement('div');
        const isActive = selectedProjects.has(proj);
        pill.className = `pill ${isActive ? 'active' : ''}`;
        pill.textContent = (isActive ? '✓ ' : '') + proj;
        pill.onclick = () => {
            if (selectedProjects.has(proj)) {
                selectedProjects.delete(proj);
            } else {
                selectedProjects.add(proj);
            }
            fetchStats();
        };
        container.appendChild(pill);
    });
}

function renderCharts(data) {
    const colors = ['#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#6366f1'];

    const projLabels = Object.keys(data.by_project || {});
    const projData = Object.values(data.by_project || {}).map(s => (s / 3600).toFixed(2));

    const ctxProj = document.getElementById('projectChart').getContext('2d');
    if (projectChart) projectChart.destroy();
    projectChart = new Chart(ctxProj, {
        type: 'doughnut',
        data: {
            labels: projLabels,
            datasets: [{
                data: projData,
                backgroundColor: colors.slice(0, projLabels.length),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#f8fafc' } }
            }
        }
    });

    const langLabels = Object.keys(data.by_language || {});
    const langData = Object.values(data.by_language || {}).map(s => (s / 3600).toFixed(2));

    const ctxLang = document.getElementById('languageChart').getContext('2d');
    if (languageChart) languageChart.destroy();
    languageChart = new Chart(ctxLang, {
        type: 'bar',
        data: {
            labels: langLabels,
            datasets: [{
                label: 'Hours',
                data: langData,
                backgroundColor: '#8b5cf6',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
                y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255, 255, 255, 0.05)' } }
            }
        }
    });
}

function renderTable(data) {
    const tbody = document.getElementById('breakdown-tbody');
    tbody.innerHTML = '';

    const total = data.total_seconds || 1;

    Object.entries(data.by_project || {}).forEach(([proj, sec]) => {
        const tr = document.createElement('tr');
        const pct = Math.round((sec / total) * 100);
        tr.innerHTML = `
            <td><span class="badge">Project</span></td>
            <td><strong>${proj}</strong></td>
            <td>${formatTime(sec)}</td>
            <td>${pct}%</td>
        `;
        tbody.appendChild(tr);
    });
}

const btnSelectAll = document.getElementById('btn-select-all');
if (btnSelectAll) {
    btnSelectAll.onclick = () => {
        selectedProjects.clear();
        fetchStats();
    };
}

fetchStats();
setInterval(fetchStats, 5000);

// Modal Settings Handlers
const modal = document.getElementById('settings-modal');
const btnOpenSettings = document.getElementById('btn-open-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnRunSync = document.getElementById('btn-run-sync');
const btnClearDb = document.getElementById('btn-clear-db');
const syncStatusMsg = document.getElementById('sync-status-msg');

if (btnOpenSettings) {
    btnOpenSettings.onclick = () => {
        modal.style.display = 'flex';
        syncStatusMsg.textContent = '';
    };
}

if (btnCloseSettings) {
    btnCloseSettings.onclick = () => {
        modal.style.display = 'none';
    };
}

window.onclick = (e) => {
    if (e.target === modal) {
        modal.style.display = 'none';
    }
};

if (btnRunSync) {
    btnRunSync.onclick = async () => {
        const apiKey = document.getElementById('hackatime-api-key').value.trim();
        const baseUrl = document.getElementById('hackatime-base-url').value.trim();
        
        if (!apiKey) {
            syncStatusMsg.style.color = '#ef4444';
            syncStatusMsg.textContent = '❌ Please enter your Hackatime API Key.';
            return;
        }

        syncStatusMsg.style.color = '#3b82f6';
        syncStatusMsg.textContent = '⏳ Importing real Hackatime heartbeats...';
        btnRunSync.disabled = true;

        try {
            const res = await fetch('/api/sync-hackatime', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKey, base_url: baseUrl })
            });
            const data = await res.json();

            if (data.status === 'ok') {
                syncStatusMsg.style.color = '#10b981';
                syncStatusMsg.textContent = '✅ ' + (data.message || 'Hackatime data imported successfully!');
                selectedProjects.clear();
                allProjectsList = [];
                fetchStats();
                setTimeout(() => { modal.style.display = 'none'; }, 1500);
            } else {
                syncStatusMsg.style.color = '#ef4444';
                syncStatusMsg.textContent = '❌ ' + (data.message || 'Failed to import.');
            }
        } catch (err) {
            syncStatusMsg.style.color = '#ef4444';
            syncStatusMsg.textContent = '❌ Network error: ' + err.message;
        } finally {
            btnRunSync.disabled = false;
        }
    };
}

if (btnClearDb) {
    btnClearDb.onclick = async () => {
        if (!confirm('Are you sure you want to clear all local data?')) return;
        
        try {
            await fetch('/api/clear-data', { method: 'POST' });
            syncStatusMsg.style.color = '#10b981';
            syncStatusMsg.textContent = '✅ Local data cleared!';
            selectedProjects.clear();
            allProjectsList = [];
            fetchStats();
        } catch (err) {
            syncStatusMsg.style.color = '#ef4444';
            syncStatusMsg.textContent = '❌ Clear failed.';
        }
    };
}

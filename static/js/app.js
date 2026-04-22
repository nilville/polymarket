document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('filter-form');
    const loader = document.getElementById('loader');
    const resultsGrid = document.getElementById('results-grid');
    const filterDrawer = document.getElementById('filter-drawer');
    const menuToggle = document.getElementById('menu-toggle');
    const closeDrawer = document.getElementById('close-drawer');
    const drawerOverlay = document.getElementById('drawer-overlay');

    function toggleDrawer() {
        if (!filterDrawer || !drawerOverlay) return;
        filterDrawer.classList.toggle('active');
        drawerOverlay.classList.toggle('active');
        document.body.style.overflow = filterDrawer.classList.contains('active') ? 'hidden' : '';
    }

    if (menuToggle) menuToggle.onclick = toggleDrawer;
    if (closeDrawer) closeDrawer.onclick = toggleDrawer;
    if (drawerOverlay) drawerOverlay.onclick = toggleDrawer;

    const refreshBtn = document.getElementById('refresh-btn');
    const paginationContainer = document.getElementById('pagination-container');

    let currentPage = 1;
    const itemsPerPage = 12;

    // Helper to sanitize HTML strings (XSS Prevention)
    function sanitize(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Segmented Control Logic
    document.querySelectorAll('.segmented-control').forEach(control => {
        const inputId = control.dataset.input;
        const input = document.getElementById(inputId);
        const items = control.querySelectorAll('.segment-item');

        items.forEach(item => {
            item.onclick = () => {
                items.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                if (input) input.value = item.dataset.value;
            };
        });
    });

    const STORAGE_KEY = 'poly-filters';

    function saveFilters() {
        if (!form) return;
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function loadFilters() {
        if (!form) return;
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const data = JSON.parse(saved);
                for (const [key, value] of Object.entries(data)) {
                    const input = form.elements[key];
                    if (input) {
                        input.value = value;
                    }
                }
                // Sync segmented controls UI
                document.querySelectorAll('.segmented-control').forEach(control => {
                    const inputId = control.dataset.input;
                    const input = document.getElementById(inputId);
                    if (input) {
                        const items = control.querySelectorAll('.segment-item');
                        items.forEach(item => {
                            item.classList.toggle('active', item.dataset.value === input.value);
                        });
                    }
                });
            } catch (e) {
                console.error('Error loading filters:', e);
            }
        }
    }

    async function scan(page = 1) {
        if (!loader || !form) return;

        currentPage = page;
        
        if (refreshBtn) refreshBtn.classList.add('loading');

        loader.style.display = 'grid';
        const formData = new FormData(form);
        const params = new URLSearchParams(formData);
        params.append('page', currentPage);
        params.append('limit', itemsPerPage);

        try {
            const res = await fetch(`/api/scan?${params}`);
            if (!res.ok) throw new Error('Network response was not ok');
            const data = await res.json();
            
            if (data.status === 'success') {
                render(data.results, data.total_pages, data.page);
            } else {
                throw new Error(data.message || 'Unknown error');
            }
            
            if (currentPage > 1) {
                window.scrollTo({ top: 0, behavior: 'auto' });
            }
        } catch (err) {
            console.error(err);
            if (resultsGrid) {
                resultsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--no); padding: 2rem;">Error: ${sanitize(err.message)}</div>`;
            }
            if (paginationContainer) paginationContainer.innerHTML = '';
        } finally {
            loader.style.display = 'none';
            if (refreshBtn) refreshBtn.classList.remove('loading');
        }
    }

    if (refreshBtn) {
        refreshBtn.onclick = () => scan(1);
    }

    function render(results, totalPages = 1, page = 1) {
        if (!resultsGrid) return;
        
        if (!results || results.length === 0) {
            resultsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--muted);">No high-confidence markets match these filters.</div>';
            renderPagination(0, 1);
            return;
        }

        resultsGrid.innerHTML = results.map(m => {
            const isYes = m.lead_label.toLowerCase() === 'yes';
            const isNo = m.lead_label.toLowerCase() === 'no';
            const badgeColor = isYes ? 'var(--yes)' : (isNo ? 'var(--no)' : 'var(--muted)');

            const isUrgent = m.days_left !== null && m.days_left < 2;
            const isSoon = m.days_left !== null && m.days_left < 7;
            const timeColor = isUrgent ? 'var(--no)' : (isSoon ? 'var(--highlight)' : 'var(--muted)');

            const safeQuestion = sanitize(m.question);
            const safeLabel = sanitize(m.lead_label);
            const safeTimeLabel = sanitize(m.time_label);
            const safeUrl = encodeURI(m.url);

            return `
            <div class="market-card">
                <div class="card-header">
                    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="market-question">${safeQuestion}</a>
                </div>
                <div class="card-body">
                    <div class="info-row">
                        <span class="label">Predicting</span>
                        <span class="badge" style="color: ${badgeColor}; border-color: ${badgeColor};">
                            ${safeLabel}
                        </span>
                    </div>
                    <div class="info-row">
                        <span class="label">Confidence</span>
                        <div class="confidence-wrapper">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${m.lead_prob}%;"></div>
                            </div>
                            <span class="prob-value">${m.lead_prob}%</span>
                        </div>
                    </div>
                </div>
                <div class="card-footer">
                    <div class="footer-item">
                        <span class="label">Volume</span>
                        <span class="value">${sanitize(m.volume_fmt)}</span>
                    </div>
                    <div class="footer-item">
                        <span class="label">Expires</span>
                        <span class="value" style="color: ${timeColor}; font-weight: bold;">
                            ${safeTimeLabel}
                        </span>
                    </div>
                </div>
            </div>
            `}).join('');

        renderPagination(totalPages, page);
    }

    function renderPagination(totalPages, page) {
        if (!paginationContainer) return;

        if (totalPages <= 1) {
            paginationContainer.style.display = 'none';
            return;
        }

        paginationContainer.style.display = 'flex';
        paginationContainer.innerHTML = `
            <button class="pagination-btn" id="prev-page" ${page === 1 ? 'disabled' : ''}>
                &lt; PREV
            </button>
            <div class="pagination-info">
                Page <span>${page}</span> of ${totalPages}
            </div>
            <button class="pagination-btn" id="next-page" ${page === totalPages ? 'disabled' : ''}>
                NEXT &gt;
            </button>
        `;

        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');

        if (prevBtn) prevBtn.onclick = () => scan(page - 1);
        if (nextBtn) nextBtn.onclick = () => scan(page + 1);
    }

    if (form) {
        form.onsubmit = (e) => { 
            e.preventDefault(); 
            saveFilters();
            scan(1); 
        };
    }

    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
        resetBtn.onclick = () => {
            if (form) {
                form.reset();
                const sortInput = document.getElementById('sort_by');
                const pagesInput = document.getElementById('pages');
                if (sortInput) sortInput.value = 'volume';
                if (pagesInput) pagesInput.value = '10';
            }
            
            document.querySelectorAll('.segmented-control').forEach(control => {
                const inputId = control.dataset.input;
                const input = document.getElementById(inputId);
                const items = control.querySelectorAll('.segment-item');
                items.forEach(item => {
                    item.classList.toggle('active', item.dataset.value === input.value);
                });
            });
            
            saveFilters();
            scan(1);
        };
    }

    loadFilters();
    scan(1);
});

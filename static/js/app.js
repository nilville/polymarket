document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('filter-form');
    const loader = document.getElementById('loader');
    const resultsGrid = document.getElementById('results-grid');
    const marketCount = document.getElementById('market-count');
    const menuToggle = document.getElementById('menu-toggle');
    const closeDrawer = document.getElementById('close-drawer');
    const filterDrawer = document.getElementById('filter-drawer');
    const drawerOverlay = document.getElementById('drawer-overlay');
    const scrollTop = document.getElementById('scroll-top');
    const themeToggle = document.getElementById('theme-toggle');
    const refreshBtn = document.getElementById('refresh-btn');

    // Theme Logic
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);

    if (themeToggle) {
        themeToggle.onclick = () => {
            const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
        };
    }

    function toggleDrawer() {
        filterDrawer.classList.toggle('active');
        drawerOverlay.classList.toggle('active');
        document.body.style.overflow = filterDrawer.classList.contains('active') ? 'hidden' : '';
    }

    if (menuToggle) menuToggle.onclick = toggleDrawer;
    if (closeDrawer) closeDrawer.onclick = toggleDrawer;
    if (drawerOverlay) drawerOverlay.onclick = toggleDrawer;

    window.onscroll = () => {
        if (window.scrollY > 400) {
            scrollTop.classList.add('visible');
        } else {
            scrollTop.classList.remove('visible');
        }
    };

    if (scrollTop) {
        scrollTop.onclick = () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };
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
                input.value = item.dataset.value;
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

    async function scan(closeDrawerOnScan = true) {
        if (!loader || !form) return;

        // Close drawer if open
        if (closeDrawerOnScan && filterDrawer.classList.contains('active')) toggleDrawer();
        
        if (refreshBtn) refreshBtn.classList.add('loading');

        loader.style.display = 'grid';
        const params = new URLSearchParams(new FormData(form));
        try {
            const res = await fetch(`/api/scan?${params}`);
            const data = await res.json();
            render(data.results);
            if (marketCount) {
                const isMobile = window.innerWidth <= 768;
                marketCount.innerText = isMobile ? `${data.total} Markets` : `${data.total} markets found`;
            }
        } catch (err) {
            console.error(err);
            if (resultsGrid) {
                resultsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--no); padding: 2rem;">Error connecting to scanner.</div>';
            }
        } finally {
            loader.style.display = 'none';
            if (refreshBtn) refreshBtn.classList.remove('loading');
        }
    }

    if (refreshBtn) {
        refreshBtn.onclick = () => scan(false);
    }

    function render(results) {
        if (!resultsGrid) return;
        resultsGrid.innerHTML = results.length ? results.map(m => {
            const isYes = m.lead_label.toLowerCase() === 'yes';
            const isNo = m.lead_label.toLowerCase() === 'no';
            const badgeColor = isYes ? 'var(--yes)' : (isNo ? 'var(--no)' : 'var(--muted)');
            const badgeBg = isYes ? 'var(--yes-bg)' : (isNo ? 'var(--no-bg)' : 'var(--border)');

            const isUrgent = m.days_left !== null && m.days_left < 2;
            const isSoon = m.days_left !== null && m.days_left < 7;
            const timeColor = isUrgent ? 'var(--no)' : (isSoon ? 'var(--accent)' : 'var(--muted)');

            return `
            <div class="market-card liquid">
                <div class="card-header">
                    <a href="${m.url}" target="_blank" class="market-question">${m.question}</a>
                </div>
                <div class="card-body">
                    <div class="info-row">
                        <span class="label">Predicting</span>
                        <span class="badge" style="background: ${badgeBg}; color: ${badgeColor};">
                            ${m.lead_label}
                        </span>
                    </div>
                    <div class="info-row">
                        <span class="label">Confidence</span>
                        <div class="confidence-wrapper">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${m.lead_prob}%; background: ${badgeColor};"></div>
                            </div>
                            <span class="prob-value">${m.lead_prob}%</span>
                        </div>
                    </div>
                </div>
                <div class="card-footer">
                    <div class="footer-item">
                        <span class="label">Volume</span>
                        <span class="value">${m.volume_fmt}</span>
                    </div>
                    <div class="footer-item">
                        <span class="label">Expires</span>
                        <span class="value" style="color: ${timeColor}; font-weight: ${isUrgent ? '700' : '500'};">
                            ${m.time_label}
                        </span>
                    </div>
                </div>
            </div>
            `}).join('')
            : '<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--muted);">No high-confidence markets match these filters.</div>';
    }

    if (form) {
        form.onsubmit = (e) => { 
            e.preventDefault(); 
            saveFilters();
            scan(); 
        };
    }

    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
        resetBtn.onclick = () => {
            if (form) {
                form.reset();
                // Manually reset hidden inputs to their default values
                const sortInput = document.getElementById('sort_by');
                const pagesInput = document.getElementById('pages');
                if (sortInput) sortInput.value = 'volume';
                if (pagesInput) pagesInput.value = '10';
            }
            
            // Sync segmented controls UI
            document.querySelectorAll('.segmented-control').forEach(control => {
                const inputId = control.dataset.input;
                const input = document.getElementById(inputId);
                const items = control.querySelectorAll('.segment-item');
                items.forEach(item => {
                    item.classList.toggle('active', item.dataset.value === input.value);
                });
            });
            
            saveFilters();
            scan();
        };
    }

    // Load saved filters before initial scan
    loadFilters();

    // Initial scan
    scan();
});

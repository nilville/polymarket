document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('filter-form');
    const loader = document.getElementById('loader');
    const resultsGrid = document.getElementById('results-grid');
    const filterDrawer = document.getElementById('filter-drawer');
    const menuToggle = document.getElementById('menu-toggle');
    const closeDrawer = document.getElementById('close-drawer');
    const drawerOverlay = document.getElementById('drawer-overlay');
    const scrollTopBtn = document.getElementById('scroll-top-btn');

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
    const watchlistToggleBtn = document.getElementById('watchlist-toggle-btn');

    let showWatchlist = false;
    let lastScanResults = [];

    const WATCHLIST_STORAGE_KEY = 'poly-watchlist';
    let watchlist = JSON.parse(localStorage.getItem(WATCHLIST_STORAGE_KEY) || '[]');

    function saveWatchlist() {
        localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
    }

    function toggleFavorite(market) {
        const index = watchlist.findIndex(m => m.id === market.id);
        if (index > -1) {
            watchlist.splice(index, 1);
        } else {
            watchlist.push(market);
        }
        saveWatchlist();
        
        if (showWatchlist) {
            render(watchlist);
        } else {
            render(lastScanResults);
        }
    }

    if (watchlistToggleBtn) {
        watchlistToggleBtn.onclick = () => {
            showWatchlist = !showWatchlist;
            watchlistToggleBtn.classList.toggle('active', showWatchlist);
            
            if (showWatchlist) {
                render(watchlist);
            } else {
                render(lastScanResults);
            }
        };
    }

    // Scroll to Top Logic
    window.onscroll = () => {
        if (scrollTopBtn) {
            if (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) {
                scrollTopBtn.style.display = 'flex';
            } else {
                scrollTopBtn.style.display = 'none';
            }
        }
    };

    if (scrollTopBtn) {
        scrollTopBtn.onclick = () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };
    }

    // SSE for Auto-Refresh
    function initSSE() {
        const evtSource = new EventSource("/api/stream");
        
        evtSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'refresh') {
                console.log('Pulse update received, refreshing...');
                // Only auto-refresh if we are NOT in watchlist mode 
                // and the drawer is NOT open (to avoid interrupting the user)
                if (!showWatchlist && (!filterDrawer || !filterDrawer.classList.contains('active'))) {
                    scan(true); // silent refresh
                }
            }
        };

        evtSource.onerror = () => {
            console.log("SSE connection lost. Reconnecting...");
            evtSource.close();
            setTimeout(initSSE, 5000);
        };
    }

    initSSE();

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

    async function scan(silent = false) {
        if (!loader || !form) return;
        
        // If not silent, reset watchlist view
        if (!silent) {
            showWatchlist = false;
            if (watchlistToggleBtn) watchlistToggleBtn.classList.remove('active');
        }

        if (refreshBtn) refreshBtn.classList.add('loading');

        if (!silent) loader.style.display = 'grid';
        
        const formData = new FormData(form);
        const params = new URLSearchParams(formData);

        try {
            const res = await fetch(`/api/scan?${params}`);
            if (!res.ok) throw new Error('Network response was not ok');
            const data = await res.json();
            
            if (data.status === 'success') {
                render(data.results);
            } else {
                throw new Error(data.message || 'Unknown error');
            }
        } catch (err) {
            console.error(err);
            if (!silent && resultsGrid) {
                resultsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--no); padding: 2rem;">Error: ${sanitize(err.message)}</div>`;
            }
        } finally {
            if (!silent) loader.style.display = 'none';
            if (refreshBtn) refreshBtn.classList.remove('loading');
        }
    }

    if (refreshBtn) {
        refreshBtn.onclick = () => scan();
    }

    function render(results) {
        if (!resultsGrid) return;
        
        if (!showWatchlist) {
            lastScanResults = results;
        }
        
        if (!results || results.length === 0) {
            const msg = showWatchlist ? 'Your watchlist is empty.' : 'No high-confidence markets match these filters.';
            resultsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--muted);">${msg}</div>`;
            return;
        }

        resultsGrid.innerHTML = results.map((m, idx) => {
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
            
            const isFavorited = watchlist.some(fav => fav.id === m.id);

            return `
            <div class="market-card">
                <div class="card-header">
                    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="market-question">${safeQuestion}</a>
                    <button class="favorite-btn ${isFavorited ? 'active' : ''}" data-idx="${idx}" title="${isFavorited ? 'Remove from Watchlist' : 'Add to Watchlist'}">
                        <svg viewBox="0 0 24 24" fill="${isFavorited ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                        </svg>
                    </button>
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
                <div class="roi-calculator">
                    <div class="calc-input-group">
                        <label>Invest $</label>
                        <input type="number" class="calc-input" value="100" min="1" step="10" data-prob="${m.lead_prob}">
                    </div>
                    <div class="calc-results">
                        <div class="calc-item">
                            <span class="label">Potential Profit</span>
                            <span class="value profit-value">$0.00</span>
                        </div>
                        <div class="calc-item">
                            <span class="label">ROI</span>
                            <span class="value roi-value">0.0%</span>
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

        // Attach event listeners to favorite buttons
        resultsGrid.querySelectorAll('.favorite-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                const idx = parseInt(btn.dataset.idx);
                toggleFavorite(results[idx]);
            };
        });

        // Initialize ROI calculations
        resultsGrid.querySelectorAll('.calc-input').forEach(input => {
            updateROICalc(input);
        });
    }

    // ROI Calculator logic
    function updateROICalc(input) {
        const prob = parseFloat(input.dataset.prob);
        const investment = parseFloat(input.value) || 0;
        const card = input.closest('.market-card');
        const profitEl = card.querySelector('.profit-value');
        const roiEl = card.querySelector('.roi-value');

        if (prob > 0 && investment > 0) {
            const price = prob / 100;
            const shares = investment / price;
            const profit = shares - investment;
            const roi = (profit / investment) * 100;

            profitEl.textContent = `$${profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            roiEl.textContent = `${roi.toFixed(1)}%`;
        } else {
            profitEl.textContent = '$0.00';
            roiEl.textContent = '0.0%';
        }
    }

    if (resultsGrid) {
        resultsGrid.oninput = (e) => {
            if (e.target.classList.contains('calc-input')) {
                updateROICalc(e.target);
            }
        };
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
                const queryInput = document.getElementById('query');
                const sortInput = document.getElementById('sort_by');
                const pagesInput = document.getElementById('pages');
                if (queryInput) queryInput.value = '';
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
            scan();
        };
    }

    loadFilters();
    scan();
});
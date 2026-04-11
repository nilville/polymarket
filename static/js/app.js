document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('filter-form');
    const loader = document.getElementById('loader');
    const resultsBody = document.getElementById('results-body');
    const marketCount = document.getElementById('market-count');
    const menuToggle = document.getElementById('menu-toggle');
    const closeDrawer = document.getElementById('close-drawer');
    const filterDrawer = document.getElementById('filter-drawer');
    const drawerOverlay = document.getElementById('drawer-overlay');
    const scrollTop = document.getElementById('scroll-top');
    const themeToggle = document.getElementById('theme-toggle');

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

    async function scan() {
        if (!loader || !form) return;

        // Close drawer if open
        if (filterDrawer.classList.contains('active')) toggleDrawer();

        loader.style.display = 'grid';
        const params = new URLSearchParams(new FormData(form));
        try {
            const res = await fetch(`/api/scan?${params}`);
            const data = await res.json();
            render(data.results);
            if (marketCount) marketCount.innerText = `${data.total} markets found`;
        } catch (err) {
            console.error(err);
            if (resultsBody) {
                resultsBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--no); padding: 2rem;">Error connecting to scanner.</td></tr>';
            }
        } finally {
            loader.style.display = 'none';
        }
    }

    function render(results) {
        if (!resultsBody) return;
        resultsBody.innerHTML = results.length ? results.map(m => {
            const isYes = m.lead_label.toLowerCase() === 'yes';
            const isNo = m.lead_label.toLowerCase() === 'no';
            const badgeColor = isYes ? 'var(--yes)' : (isNo ? 'var(--no)' : 'var(--muted)');
            const badgeBg = isYes ? 'var(--yes-bg)' : (isNo ? 'var(--no-bg)' : 'var(--border)');

            const isUrgent = m.days_left !== null && m.days_left < 2;
            const isSoon = m.days_left !== null && m.days_left < 7;
            const timeColor = isUrgent ? 'var(--no)' : (isSoon ? 'var(--accent)' : 'var(--muted)');

            return `
            <tr>
                <td data-label="Market">
                    <a href="${m.url}" target="_blank" style="color: inherit; font-weight: 600; text-decoration: none; display: block;">${m.question}</a>
                </td>
                <td data-label="Predicting">
                    <span class="badge" style="background: ${badgeBg}; color: ${badgeColor};">
                        ${m.lead_label}
                    </span>
                </td>
                <td data-label="Confidence">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="flex: 1; height: 8px; background: var(--border); border-radius: 99px; overflow: hidden; min-width: 60px;">
                            <div style="width: ${m.lead_prob}%; height: 100%; background: ${badgeColor}; border-radius: 99px;"></div>
                        </div>
                        <span style="font-weight: 700; font-variant-numeric: tabular-nums; width: 45px;">${m.lead_prob}%</span>
                    </div>
                </td>
                <td data-label="Volume" style="font-variant-numeric: tabular-nums; font-weight: 500;">${m.volume_fmt}</td>
                <td data-label="Expires" style="font-variant-numeric: tabular-nums; color: ${timeColor}; font-weight: ${isUrgent ? '700' : '400'};">
                    ${m.time_label}
                </td>
            </tr>
            `}).join('')
            : '<tr><td colspan="5" style="text-align: center; padding: 4rem; color: var(--muted);">No high-confidence markets match these filters.</td></tr>';
    }

    if (form) {
        form.onsubmit = (e) => { e.preventDefault(); scan(); };
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
            
            scan();
        };
    }

    // Initial scan
    scan();
});

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('filter-form');
    const loader = document.getElementById('loader');
    const resultsBody = document.getElementById('results-body');
    const marketCount = document.getElementById('market-count');
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');

    // Theme Logic
    const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
    const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;

    function setTheme(isDark) {
        document.body.classList.toggle('dark-theme', isDark);
        if (themeIcon) {
            themeIcon.innerHTML = isDark ? sunIcon : moonIcon;
        }
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    }

    if (themeToggle) {
        themeToggle.onclick = () => {
            const isDark = !document.body.classList.contains('dark-theme');
            setTheme(isDark);
        };
    }

    // Initialize theme
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(savedTheme === 'dark' || (!savedTheme && prefersDark));

    async function scan() {
        if (!loader || !form) return;
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
        resetBtn.onclick = () => { if (form) form.reset(); scan(); };
    }

    // Initial scan
    scan();
});

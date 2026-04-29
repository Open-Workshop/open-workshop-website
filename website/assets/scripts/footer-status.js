(function () {
    const FALLBACK_SUMMARY = {
        status_code: 'unknown',
        status_label: 'Нет данных',
        status_color: '#64748b',
        uptime_label: '—',
        title: 'Статус Open Workshop: нет данных'
    };

    const requestCache = new Map();

    function readJsonResponse(response) {
        if (!response || !response.ok) {
            return Promise.resolve(null);
        }

        return response.json().catch(function () {
            return null;
        });
    }

    function loadSummary(url) {
        if (!requestCache.has(url)) {
            const promise = fetch(url, { credentials: 'same-origin' })
                .then(readJsonResponse)
                .catch(function () {
                    return null;
                });

            requestCache.set(url, promise);
        }

        return requestCache.get(url);
    }

    function applySummary(element, summary) {
        const data = summary && typeof summary === 'object'
            ? {
                ...FALLBACK_SUMMARY,
                ...summary,
            }
            : FALLBACK_SUMMARY;

        element.setAttribute('aria-busy', 'false');
        element.dataset.statusState = data.status_code || FALLBACK_SUMMARY.status_code;
        element.style.setProperty('--status-color', data.status_color || FALLBACK_SUMMARY.status_color);

        const labelNode = element.querySelector('[data-status-label]');
        const uptimeNode = element.querySelector('[data-status-uptime]');

        if (labelNode) {
            labelNode.textContent = data.status_label || FALLBACK_SUMMARY.status_label;
        }

        if (uptimeNode) {
            uptimeNode.textContent = data.uptime_label || FALLBACK_SUMMARY.uptime_label;
        }

        const title = data.title || element.getAttribute('title') || FALLBACK_SUMMARY.title;
        element.setAttribute('title', title);
        element.setAttribute('aria-label', title);
    }

    async function refreshBadge(element) {
        const url = element.getAttribute('data-status-badge-url');
        if (!url) {
            applySummary(element, null);
            return;
        }

        element.setAttribute('aria-busy', 'true');
        const summary = await loadSummary(url);
        applySummary(element, summary);
    }

    function init() {
        const badges = document.querySelectorAll('[data-status-badge-url]');
        if (!badges.length) {
            return;
        }

        badges.forEach(function (badge) {
            refreshBadge(badge);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

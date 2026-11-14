(function () {
    const settings = document.currentScript.dataset;
    let userId = settings.userId || '';
    const identityKey = 'rybbit-user-id';

    // Rybbit reads the stored ID before its first pageview. Set it before
    // loading the tracker so a shared browser cannot attribute it to an old user.
    try {
        if (userId) localStorage.setItem(identityKey, userId);
        else localStorage.removeItem(identityKey);
    } catch (_) {
        // Analytics must never prevent the website from working.
    }

    window.OWAnalytics = {
        clearIdentity() {
            userId = '';
            try { localStorage.removeItem(identityKey); } catch (_) { /* unavailable */ }
            if (window.rybbit) window.rybbit.clearUserId();
        }
    };

    const tracker = document.createElement('script');
    const trackerUrl = new URL(settings.scriptUrl);
    trackerUrl.searchParams.set('siteId', settings.siteId);
    tracker.src = trackerUrl.toString();
    tracker.async = true;
    tracker.onload = function () {
        if (userId && window.rybbit) window.rybbit.identify(userId);
    };
    document.head.appendChild(tracker);

    document.addEventListener('click', function (event) {
        const target = event.target instanceof Element ? event.target.closest('.download-button') : null;
        if (!target || !window.rybbit) return;
        const isModpack = target.matches('[data-modpack-download-selected]');
        const match = (target.getAttribute('href') || '').match(/^\/mod\/(\d+)\/download(?:[?#]|$)/);
        if (isModpack) window.rybbit.event('modpack_download_click');
        else if (match) window.rybbit.event('mod_download_click', { mod_id: match[1] });
    });
})();

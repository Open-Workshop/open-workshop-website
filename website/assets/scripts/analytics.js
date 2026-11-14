(function () {
    const settings = document.currentScript.dataset;
    let userId = settings.userId || '';
    const userName = (settings.userName || '').trim();
    const userGrade = (settings.userGrade || '').trim();
    const identityKey = 'rybbit-user-id';
    const pendingEvents = [];

    function sendEvent(name, properties) {
        try {
            if (!window.rybbit || typeof window.rybbit.event !== 'function') return false;
            window.rybbit.event(name, properties || {});
            return true;
        } catch (_) {
            return false;
        }
    }

    // Rybbit reads the stored ID before its first pageview. Set it before
    // loading the tracker so a shared browser cannot attribute it to an old user.
    try {
        if (userId) localStorage.setItem(identityKey, userId);
        else localStorage.removeItem(identityKey);
    } catch (_) {
        // Analytics must never prevent the website from working.
    }

    window.OWAnalytics = {
        track(name, properties) {
            if (!sendEvent(name, properties) && pendingEvents.length < 30) {
                pendingEvents.push([name, properties]);
            }
        },
        getUserId() { return userId; },
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
        if (userId && window.rybbit) {
            const traits = {};
            if (userName) traits.username = userName;
            if (settings.gradeKnown === 'true') traits.grade = userGrade || null;
            if (Object.keys(traits).length) window.rybbit.identify(userId, traits);
            else window.rybbit.identify(userId);
        }
        while (pendingEvents.length && sendEvent(...pendingEvents[0])) pendingEvents.shift();
    };
    document.head.appendChild(tracker);

    document.addEventListener('click', function (event) {
        const target = event.target instanceof Element ? event.target.closest('.download-button') : null;
        if (!target) return;
        const isModpack = target.matches('[data-modpack-download-selected]');
        const match = (target.getAttribute('href') || '').match(/^\/mod\/(\d+)\/download(?:[?#]|$)/);
        if (isModpack) window.OWAnalytics.track('modpack_download_click');
        else if (match) window.OWAnalytics.track('mod_download_click', { mod_id: match[1] });
    });
})();

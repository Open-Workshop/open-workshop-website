(function () {
    const settings = document.currentScript.dataset;
    let userId = settings.userId || '';
    const userName = (settings.userName || '').trim();
    const userGrade = (settings.userGrade || '').trim();
    const identityKey = 'rybbit-user-id';
    const pendingEvents = [];
    const authStateKey = 'ow-analytics-auth-state';
    const pendingLogoutKey = 'ow-analytics-pending-logout';
    const authEventKey = 'ow-analytics-last-auth-event';
    const authState = settings.authState || 'unknown';
    let previousAccountId = '';

    function readCookie(name) {
        const part = (document.cookie || '').split('; ').find(item => item.startsWith(name + '='));
        if (!part) return '';
        try { return decodeURIComponent(part.slice(name.length + 1)); } catch (_) { return ''; }
    }

    function clearAuthEventCookie() {
        document.cookie = 'owAuthEvent=; Max-Age=0; path=/; domain=.openworkshop.miskler.ru; SameSite=Lax; Secure';
        document.cookie = 'owAuthEvent=; Max-Age=0; path=/; SameSite=Lax; Secure';
    }

    // Only compare verified server states: an unavailable Access service is not a logout.
    try {
        const previous = JSON.parse(localStorage.getItem(authStateKey) || 'null');
        if (authState === 'anonymous' && previous && previous.userId) {
            previousAccountId = String(previous.userId);
            localStorage.removeItem(authStateKey);
        } else if (authState === 'authenticated' && userId) {
            localStorage.setItem(authStateKey, JSON.stringify({ userId }));
        }
    } catch (_) { /* private mode or unavailable storage */ }


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
        trackLogout(reason) {
            if (!userId) return;
            const properties = { reason, account_id: String(userId) };
            if (!sendEvent('logout', properties)) {
                try { sessionStorage.setItem(pendingLogoutKey, JSON.stringify(properties)); } catch (_) { /* unavailable */ }
            }
        },
        clearIdentity() {
            userId = '';
            try {
                localStorage.removeItem(identityKey);
                localStorage.removeItem(authStateKey);
            } catch (_) { /* unavailable */ }
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
        if (userId && authState === 'authenticated') {
            const marker = readCookie('owAuthEvent');
            const match = marker.match(/^(login|linked)\.(google|yandex|password)\.(\d+)\.([a-f0-9]{16})$/);
            if (match && match[3] === String(userId)) {
                let seen = false;
                try { seen = localStorage.getItem(authEventKey) === match[4]; } catch (_) { /* unavailable */ }
                if (!seen && sendEvent(match[1] === 'linked' ? 'auth_method_linked' : 'login', { method: match[2] })) {
                    try { localStorage.setItem(authEventKey, match[4]); } catch (_) { /* unavailable */ }
                    clearAuthEventCookie();
                }
            }
        }
        if (previousAccountId) {
            sendEvent('logout', {
                reason: settings.logoutReason === 'credentials_expired' ? 'credentials_expired' : 'session_invalid',
                account_id: previousAccountId,
            });
            previousAccountId = '';
        }
        try {
            const raw = sessionStorage.getItem(pendingLogoutKey);
            if (raw) {
                const properties = JSON.parse(raw);
                if (sendEvent('logout', properties)) sessionStorage.removeItem(pendingLogoutKey);
            }
        } catch (_) { /* unavailable */ }
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

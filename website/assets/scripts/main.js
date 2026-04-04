(function () {
    const AUTH_REQUEST_EVENT = 'ow:auth-request';

    function getCookiesBanner() {
        return document.querySelector('cookies');
    }

    function showCookiesBanner() {
        const banner = getCookiesBanner();
        if (banner) {
            banner.classList.add('show');
        }
    }

    function acceptCookies() {
        const banner = getCookiesBanner();
        if (banner) {
            banner.classList.remove('show');
        }
        document.cookie = 'cooks=1; path=/; max-age=31536000';
    }

    async function logout() {
        const apiPaths = window.OWCore.getApiPaths();
        const apiBase = window.OWCore.getApiBase();
        const sessionEndpoint = apiPaths.session.logout;
        await fetch(`${apiBase}${sessionEndpoint.path}`, {
            method: sessionEndpoint.method,
            credentials: 'include'
        });
        location.reload();
    }

    function openActionLink(link) {
        if (!link) return;
        window.setTimeout(function () {
            window.location.replace(link);
        }, 100);
    }

    function setPhoneMenuOpen(open) {
        const menu = document.querySelector('section.phone-menu');
        const button = document.querySelector('button.phone-navigator');
        const backdrop = document.querySelector('.phone-full-background');

        if (menu) {
            menu.hidden = !open;
        }
        if (button) {
            button.hidden = open;
        }
        if (backdrop) {
            backdrop.classList.toggle('active', open);
        }
    }

    function dispatchAuthRequest(type, detail) {
        document.dispatchEvent(new CustomEvent(AUTH_REQUEST_EVENT, {
            detail: {
                type,
                ...(detail || {})
            }
        }));
    }

    function maybeShowDailyBanner() {
        const now = new Date();
        const lastShowDate = window.localStorage.getItem('lastShowDate');
        if (lastShowDate === now.toLocaleDateString()) {
            return;
        }

        const banners = [
            {
                title: 'Партнерский сервер по Хойке (РМК)',
                text: 'Перейти в Discord ✅',
                theme: 'dark',
                autohide: true,
                interval: 18000,
                link: 'https://discord.gg/tqdw6wS6nX'
            }
        ];

        window.setTimeout(function () {
            const selectedBanner = Math.floor(Math.random() * banners.length);
            new Toast(banners[selectedBanner]);
            window.localStorage.setItem('lastShowDate', now.toLocaleDateString());
        }, 1000);
    }

    function initMainUi() {
        if (!CookieManager.has('cooks')) {
            showCookiesBanner();
        }

        if (window.OWUI && typeof window.OWUI.initRelativeTime === 'function') {
            window.OWUI.initRelativeTime(document);
        }

        if (!document.querySelector('.toast-container')) {
            const container = document.createElement('div');
            container.classList.add('toast-container');
            (document.getElementById('main') || document.body).appendChild(container);
        }

        maybeShowDailyBanner();

        document.addEventListener('click', function (event) {
            const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
            if (!target) return;

            const action = target.dataset.action;

            if (action === 'cookies-accept') {
                acceptCookies();
                return;
            }

            if (action === 'logout') {
                logout();
                return;
            }

            if (action === 'service-auth') {
                dispatchAuthRequest('authorize', { serviceUrl: target.dataset.serviceUrl || '' });
                return;
            }

            if (action === 'service-connect') {
                dispatchAuthRequest('connect', { serviceUrl: target.dataset.serviceUrl || '' });
                return;
            }

            if (action === 'service-disconnect') {
                dispatchAuthRequest('disconnect', { service: target.dataset.service || '' });
                return;
            }

            if (action === 'open-link') {
                event.preventDefault();
                openActionLink(target.dataset.link || target.getAttribute('href') || '');
                return;
            }

            if (action === 'toggle-phone-menu') {
                setPhoneMenuOpen(true);
                return;
            }

            if (action === 'close-phone-menu') {
                setPhoneMenuOpen(false);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMainUi);
    } else {
        initMainUi();
    }
})();


function getCookiesBanner() {
    return document.querySelector('cookies');
}

function showCookiesBanner() {
    const banner = getCookiesBanner();
    if (banner) {
        banner.classList.add('show');
    }
}

function cookiesOkPress() {
    const banner = getCookiesBanner();
    if (banner) {
        banner.classList.remove('show');
    }
    document.cookie = 'cooks=1; path=/; max-age=31536000';
}


async function logon() {
    const apiPaths = window.OWCore.getApiPaths();
    const apiBase = window.OWCore.getApiBase();
    const sessionEndpoint = apiPaths.session.logout;
    const response = await fetch(`${apiBase}${sessionEndpoint.path}`, {
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

function initMainUi() {
    if (!CookieManager.has('cooks')) {
        showCookiesBanner();
    }

    if (!document.querySelector('.toast-container')) {
        const container = document.createElement('div');
        container.classList.add('toast-container');
        (document.getElementById('main') || document.body).appendChild(container);
    }

    document.addEventListener('click', function (event) {
        const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
        if (!target) return;

        const action = target.dataset.action;

        if (action === 'cookies-accept') {
            cookiesOkPress();
            return;
        }

        if (action === 'logout') {
            logon();
            return;
        }

        if (action === 'service-auth') {
            serviceAuthorization(target.dataset.serviceUrl || '');
            return;
        }

        if (action === 'service-connect') {
            serviceConnect(target.dataset.serviceUrl || '');
            return;
        }

        if (action === 'service-disconnect') {
            serviceDisconnect(target.dataset.service || '');
            return;
        }

        if (action === 'open-link') {
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

// Get the current date and time
const now = new Date();

// Get the last show date from local storage
const lastShowDate = window.localStorage.getItem('lastShowDate');

// Check if the last show date is not the same as the current date
const condition1 = lastShowDate !== now.toLocaleDateString();

// If the condition is true, display banners
if (condition1) {
    // Array of banners with title, text, theme, autohide, interval, and link
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

    // Display a random banner as a toast notification after a timeout
    window.setTimeout(() => {
        // Select a random banner
        const selectedBanner = Math.floor(Math.random() * banners.length);
        console.log("Выбранный баннер:", selectedBanner);
        // Show the selected banner as a toast notification
        new Toast(banners[selectedBanner]);
        // Set the last show date to the current date
        window.localStorage.setItem('lastShowDate', now.toLocaleDateString());
    }, 1000);
}

function adLink(adLink) {
    if (adLink) {
        window.location.href = adLink
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMainUi);
} else {
    initMainUi();
}

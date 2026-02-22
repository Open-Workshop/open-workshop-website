
if (!CookieManager.has('cooks')) {
    $('cookies').addClass('show');
}
function cookiesOkPress() {
    $('cookies').removeClass('show');
    document.cookie = "cooks=1; path=/; max-age=31536000";
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



if (!document.getElementsByClassName("toast-container")) {
    const container = document.createElement('div');
    container.classList.add('toast-container');
    document.getElementById("main").appendChild(container);
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
            title: 'Партнерский сервер',
            text: 'Перейти на сервер ✅',
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

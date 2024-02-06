
if (!document.cookie.includes('cooks')) {
    document.getElementById('cookie-bar').classList.add('cookie-bar-show');
}
function cookiesOkPress() {
    document.getElementById('cookie-bar').classList.remove('cookie-bar-show');
    document.cookie = "cooks=1; path=/; max-age=31536000";
}


async function logon() {
    const response = await fetch("https://openworkshop.su/api/accounts/authorization/logout", {
      method: "POST"
    });
  
    location.reload();
}
  


if (!document.getElementsByClassName("toast-container")) {
    const container = document.createElement('div');
    container.classList.add('toast-container');
    document.getElementById("main").appendChild(container);
}

const now = new Date();
const lastShowDate = window.localStorage.getItem('lastShowDate');
const condition1 = lastShowDate !== now.toLocaleDateString();
if (condition1) {
    banners = [
        {
            title: 'Попробуй Discord бота!',
            text: 'Перейти на наш сервер ✅',
            theme: 'dark',
            autohide: true,
            interval: 18000,
            link: 'https://discord.gg/UnJnGHNbBp'
        },
        {
            title: 'Браузерное расширение',
            text: 'Установить 🤩',
            theme: 'dark',
            autohide: true,
            interval: 18000,
            link: 'https://github.com/Open-Workshop/open-workshop-browser-extension/releases/tag/v1.0.0'
        },
        {
            title: 'Попробуй Telegram бота!',
            text: 'Запустить 📌',
            theme: 'dark',
            autohide: true,
            interval: 18000,
            link: 'https://t.me/get_from_steam_bot'
        }
    ]

    window.setTimeout(() => {
        const selectedBanner = Math.floor(Math.random() * banners.length)
        console.log("Выбранный баннер:", selectedBanner)
        new Toast(banners[selectedBanner])
        window.localStorage.setItem('lastShowDate', now.toLocaleDateString());
    }, 1000);
}

function adLink(adLink) {
    if (adLink) {
        window.location.href = adLink
    }
}

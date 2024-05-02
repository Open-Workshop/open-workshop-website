
window.CookieManager = {
    get(cookieName) {
        const equalSign = cookieName + '=';
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
            let trimmedCookie = cookie.trim();
            if (trimmedCookie.startsWith(equalSign)) {
                return trimmedCookie.substring(equalSign.length);
            }
        }
        return undefined;
    },
    has(cookieName) {
        return document.cookie.includes(cookieName+"=");
    }
}

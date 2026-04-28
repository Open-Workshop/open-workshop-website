(function () {
  const AUTH_REQUEST_EVENT = 'ow:auth-request';
  const AUTH_POLL_INTERVAL_MS = 250;
  const AUTH_POLL_TIMEOUT_MS = 10 * 60 * 1000;

  function clearCookie(name) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  }

  function getPopupPosition() {
    return {
      x: screen.width / 2 - 400 / 2,
      y: screen.height / 2 - 570 / 2,
    };
  }

  function getCloseBanner(type) {
    if (type === 'connect') {
      return {
        title: 'Подключение прервано',
        text: 'Вы закрыли авторизационное окно',
        theme: 'dark'
      };
    }

    return {
      title: 'Авторизация прервана',
      text: 'Вы закрыли авторизационное окно',
      theme: 'dark'
    };
  }

  function openAuthPopup(serviceUrl) {
    const popup = getPopupPosition();
    return window.open(
      '/api/login-popup?f=' + serviceUrl,
      '_blank',
      `location=no,height=570,width=400,scrollbars=no,status=yes,left=${popup.x},top=${popup.y}`
    );
  }

  function monitorAuthPopup(win, bannerCloseWindow) {
    const initialAccessToken = CookieManager.get('accessJS');
    const startedAt = Date.now();

    const intervalId = window.setInterval(function () {
      if (Date.now() - startedAt > AUTH_POLL_TIMEOUT_MS) {
        window.clearInterval(intervalId);
        if (win && !win.closed) {
          win.close();
        }
        new Toast({
          title: 'Авторизация отменена',
          text: 'Время ожидания истекло',
          theme: 'warning',
          autohide: true,
          interval: 6000
        });
        return;
      }

      if (!win || win.closed) {
        window.clearInterval(intervalId);
        window.setTimeout(function () {
          new Toast(bannerCloseWindow);
        }, 1000);
        return;
      }

      const currentAccessToken = CookieManager.get('accessJS');
      if (CookieManager.has('accessJS') && (initialAccessToken == null || initialAccessToken !== currentAccessToken)) {
        window.clearInterval(intervalId);
        win.close();
        location.reload();
        return;
      }

      if (CookieManager.has('popupLink')) {
        window.clearInterval(intervalId);
        win.close();

        const link = CookieManager.get('popupLink');
        clearCookie('popupLink');
        location.href = link;
      }
    }, AUTH_POLL_INTERVAL_MS);
  }

  function startAuthFlow(type, serviceUrl) {
    if (!serviceUrl) return;

    const popupWindow = openAuthPopup(serviceUrl);
    if (!popupWindow) {
      new Toast({
        title: 'Окно заблокировано',
        text: 'Разрешите всплывающие окна для продолжения',
        theme: 'warning',
        autohide: true,
        interval: 6000
      });
      return;
    }

    monitorAuthPopup(popupWindow, getCloseBanner(type));
  }

  async function disconnectService(service) {
    const apiPaths = window.OWCore.getApiPaths();
    const apiBase = window.OWCore.getApiBase();
    const disconnectEndpoint = apiPaths.oauth.disconnect;
    if (!disconnectEndpoint || !disconnectEndpoint.path) {
      new Toast({
        title: 'Отвязка недоступна',
        text: 'Сейчас manager не поддерживает отвязку этого сервиса.',
        theme: 'warning',
        autohide: true,
        interval: 6000
      });
      return;
    }
    const url = `${apiBase}${disconnectEndpoint.path.replace('{service}', service)}`;

    try {
      const response = await fetch(url, {
        method: disconnectEndpoint.method
      });

      if (response.status === 200) {
        location.reload();
        return;
      }

      const text = await response.text().catch(function () {
        return '';
      });
      new Toast({
        title: 'Ошибка',
        text: text.substring(1, text.length - 1),
        theme: 'warning',
        autohide: true,
        interval: 6000
      });
    } catch (error) {
      new Toast({
        title: 'Ошибка',
        text: 'При запросе на сервер произошла непредвиденная ошибка...',
        theme: 'danger',
        autohide: true,
        interval: 6000
      });
    }
  }

  document.addEventListener(AUTH_REQUEST_EVENT, function (event) {
    const detail = event.detail || {};
    if (detail.type === 'authorize' || detail.type === 'connect') {
      startAuthFlow(detail.type, detail.serviceUrl || '');
      return;
    }

    if (detail.type === 'disconnect') {
      disconnectService(detail.service || '');
    }
  });
})();


function serviceAuthorization(serviceUrl) {
  const banner = {
    title: 'Авторизация прервана',
    text: 'Вы закрыли авторизационное окно',
    theme: 'dark'
  };

  authWindow(serviceUrl, banner);
};

function serviceConnect(serviceUrl) {
  const banner = {
    title: 'Подключение прервано',
    text: 'Вы закрыли авторизационное окно',
    theme: 'dark'
  };

  authWindow(serviceUrl, banner);
};


function authWindow(serviceUrl, bannerCloseWindow) {
  var x = screen.width/2 - 400/2;
  var y = screen.height/2 - 570/2;
  
  const win = window.open('/api/login-popup?f='+serviceUrl,
      '_blank', 
      'location=no,height=570,width=400,scrollbars=no,status=yes,left='+x+',top='+y
  );

  const AT = CookieManager.get('accessJS');
  const interval = setInterval(() => {
    if (win.closed) {
      console.log("Окно закрыто :(");

      clearInterval(interval);

      window.setTimeout(() => {
        new Toast(bannerCloseWindow)
      }, 1000);
    }
    
    console.log(AT, CookieManager.get("accessJS"))
    if (CookieManager.has('accessJS') && (AT == null || AT != CookieManager.get("accessJS"))) {
      console.log("Кука появилась!");

      clearInterval(interval);
      win.close();

      location.reload();
    }
    if (CookieManager.has('popupLink')) {
      console.log("Пользователь переходит на другую страницу!");

      clearInterval(interval);
      win.close();

      const link = CookieManager.get("popupLink");
      console.log(link)
      document.cookie = "popupLink=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

      location.href = link;
    }
  }, 200);
}

function serviceDisconnect(service) {
  const managerUrl = document.body.getAttribute('manager-url');
  fetch(`${managerUrl}/session/${service}/disconnect`, {
    method: 'POST'
  }).then(response => {
    if (response.status === 200) {
      console.log('Код ответа равен 200!');
      location.reload();
    } else {
      console.log('Код ответа не равен 200');
      response.text().then(text => {
        banner_error_a = {
          title: 'Ошибка',
          text: text.substring(1, text.length - 1),
          theme: 'warning',
          autohide: true,
          interval: 6000
        };

        new Toast(banner_error_a);
      });
    }
  }).catch(error => {
    console.error('Произошла ошибка при отправке запроса: ' + error);
    banner_error_a = {
      title: 'Ошибка',
      text: 'При запросе на сервер произошла непредвиденная ошибка...',
      theme: 'danger',
      autohide: true,
      interval: 6000
    };

    new Toast(banner_error_a)
  });
}

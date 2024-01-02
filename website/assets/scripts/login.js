
function serviceAuthorization(serviceUrl)
{
  var x = screen.width/2 - 400/2;
  var y = screen.height/2 - 570/2;
  
  const win = window.open('/api/login-popup?f='+serviceUrl,
      '_blank', 
      'location=no,height=570,width=400,scrollbars=no,status=yes,left='+x+',top='+y
  );

  const interval = setInterval(() => {
    if (win.closed) {
      console.log("Окно закрыто :(");

      banner_error_a = {
        title: 'Авторизация прервана',
        text: 'Вы закрыли авторизационное окно',
        theme: 'dark',
        autohide: true,
        interval: 6000
      };

      window.setTimeout(() => {
        new Toast(banner_error_a)
      }, 1000);

      clearInterval(interval);
    }
    if (document.cookie.includes('loginJS')) {
      console.log("Кука появилась!");

      win.close();

      location.reload();
      clearInterval(interval);
    }
    if (document.cookie.includes('popupLink')) {
      console.log("Пользователь переходит на другую страницу!");

      win.close();

      const link = getCookie("popupLink");
      console.log(link)
      document.cookie = "popupLink=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

      document.location = link
    }
  }, 100);
};

function serviceConnect(serviceUrl)
{
  var x = screen.width/2 - 400/2;
  var y = screen.height/2 - 570/2;
  
  const win = window.open('/api/login-popup?f='+serviceUrl,
      '_blank', 
      'location=no,height=570,width=400,scrollbars=no,status=yes,left='+x+',top='+y
  );

  const interval = setInterval(() => {
    if (win.closed) {
      console.log("Окно закрыто :(");

      banner_error_a = {
        title: 'Подключение прервана',
        text: 'Вы закрыли авторизационное окно',
        theme: 'dark',
        autohide: true,
        interval: 6000
      };

      window.setTimeout(() => {
        new Toast(banner_error_a)
      }, 1000);

      clearInterval(interval);
    }
    if (document.cookie.includes('loginJS')) {
      console.log("Кука появилась!");

      win.close();

      location.reload();
      clearInterval(interval);
    }
    if (document.cookie.includes('popupLink')) {
      console.log("Пользователь переходит на другую страницу!");

      win.close();

      const link = getCookie("popupLink");
      console.log(link)
      document.cookie = "popupLink=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

      document.location = link
    }
  }, 100);
};

function getCookie(name) {
  var nameEQ = name + "=";
  var ca = document.cookie.split(';');
  for(var i=0;i < ca.length;i++) {
      var c = ca[i];
      while (c.charAt(0)==' ') c = c.substring(1,c.length);
      if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
  }
  return null;
}

function serviceDisconnect(service) {
  fetch("/api/accounts/authorization/disconnect?service_name="+service, {
    method: 'GET'
  }).then(response => {
      location.reload();
    }
  )
}

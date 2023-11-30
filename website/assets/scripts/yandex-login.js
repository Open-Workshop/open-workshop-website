
function yandexWindow()
{
  if (document.cookie.includes('loginJS')) {
    const response = fetch("https://openworkshop.su/api/accounts/authorization/logout");

    banner_error_a = {
      title: 'Выход',
      text: 'Вы вышли из аккаунта',
      theme: 'dark',
      autohide: true,
      interval: 6000
    }

    window.setTimeout(() => {
      new Toast(banner_error_a)
    }, 1000);
  } else {
    yandexAuthorization()
  }
}
  
function yandexAuthorization()
{
    var x = screen.width/2 - 700/2;
    var y = screen.height/2 - 450/2;
    
    const win = window.open('https://openworkshop.su/api/accounts/authorization/yandex/link',
        '_blank', 
        'location=no,height=570,width=400,scrollbars=no,status=yes,left='+x+',top='+y
    );

    const interval = setInterval(() => {
      if (win.closed) {
        console.log("Окно закрыто :(")

        banner_error_a = {
          title: 'Авторизация прервана',
          text: 'Вы закрыли авторизационное окно',
          theme: 'dark',
          autohide: true,
          interval: 6000
        }

        window.setTimeout(() => {
          new Toast(banner_error_a)
        }, 1000);

        clearInterval(interval);
      }
      if (document.cookie.includes('loginJS')) {
        console.log("Кука появилась!")

        win.close()

        banner_error_a = {
          title: 'Авторизован!',
          text: 'Вы успешно авторизовались в Open Workshop :)',
          theme: 'dark',
          autohide: true,
          interval: 6000
        }

        window.setTimeout(() => {
          new Toast(banner_error_a)
        }, 1000);

        clearInterval(interval);
      }
    }, 100);

};

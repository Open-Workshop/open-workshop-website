(function () {
  function initUserPage() {
    const about = document.getElementById('mod-description');
    if (about) {
      Formating.renderInto(about, about.innerHTML);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUserPage);
  } else {
    initUserPage();
  }
})();

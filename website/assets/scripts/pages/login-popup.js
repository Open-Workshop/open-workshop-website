/* eslint-env browser */

(function () {
  const root = document.querySelector('main.login-popup');
  if (!root) return;

  const legalCheckbox = document.getElementById('legal-checkbox');
  const russiaCheckbox = document.getElementById('russia-checkbox');
  const continueButton = document.getElementById('continue-link');

  function setPopupLink(link) {
    document.cookie = 'popupLink=' + link + '; path=/';
  }

  function syncContinueState() {
    if (!continueButton || !legalCheckbox) return;
    continueButton.disabled = !legalCheckbox.checked;
  }

  function toggleCheckbox(checkbox) {
    if (!(checkbox instanceof HTMLInputElement)) return;
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  }

  root.addEventListener('click', function (event) {
    const actionNode = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!actionNode) return;

    const action = actionNode.dataset.action;

    if (action === 'login-open-link') {
      event.preventDefault();
      setPopupLink(actionNode.dataset.link || '');
      return;
    }

    if (action === 'login-toggle-legal') {
      if (event.target instanceof Element && event.target.closest('a')) return;
      toggleCheckbox(legalCheckbox);
      return;
    }

    if (action === 'login-toggle-russia') {
      toggleCheckbox(russiaCheckbox);
      return;
    }

    if (action === 'login-continue') {
      if (russiaCheckbox) {
        document.cookie = 'fromRussia=' + russiaCheckbox.checked + '; expires=' + new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString() + '; path=/';
      }
      window.location.href = actionNode.dataset.link || '';
    }
  });

  if (legalCheckbox) {
    legalCheckbox.addEventListener('change', syncContinueState);
  }

  syncContinueState();
})();

(function () {
  const AUTOPLAY_DELAY_MS = 100000;

  function createSlider(root) {
    if (!(root instanceof Element) || root.dataset.sliderBound === '1') return null;
    root.dataset.sliderBound = '1';

    const imagesList = root.querySelector('.js__slider__images');
    const pagersRoot = root.querySelector('.js__slider__pagers');
    if (!imagesList) return null;

    let currentIndex = 0;
    let autoplayId = 0;

    function getItems() {
      return Array.from(root.querySelectorAll('.slider__images-item'));
    }

    function getPagers() {
      return Array.from(root.querySelectorAll('.js__slider__pagers li'));
    }

    function updateEmptyState() {
      const hasImages = getItems().length > 0;
      const editEmpty = document.getElementById('no-screenshots-edit');
      const noImgsPlaceholder = document.getElementById('no-screenshots-error');

      if (editEmpty) {
        editEmpty.style.display = hasImages ? 'none' : 'flex';
      }

      if (noImgsPlaceholder) {
        noImgsPlaceholder.style.display = hasImages ? 'none' : 'flex';
        imagesList.style.display = hasImages ? 'block' : 'none';
      }
    }

    function renderPagers() {
      if (!pagersRoot) {
        updateEmptyState();
        return;
      }

      pagersRoot.innerHTML = '';
      getItems().forEach(function (item, index) {
        const listItem = document.createElement('li');
        listItem.textContent = index + 1;
        listItem.addEventListener('click', function () {
          if (currentIndex === index) return;
          show(index);
          restartAutoplay();
        });
        pagersRoot.appendChild(listItem);
      });

      updateEmptyState();
    }

    function show(nextIndex) {
      const items = getItems();
      const pagers = getPagers();

      if (!items.length) {
        document.dispatchEvent(new CustomEvent('noscreenshotsavailable'));
        return;
      }

      currentIndex = Math.max(0, Math.min(nextIndex, items.length - 1));
      items.forEach(function (item, index) {
        const active = index === currentIndex;
        item.style.display = active ? 'flex' : 'none';
        if (active) {
          item.dispatchEvent(new CustomEvent('onscreenshotselect', { bubbles: true }));
        }
      });
      pagers.forEach(function (pager, index) {
        pager.classList.toggle('active', index === currentIndex);
      });
    }

    function stopAutoplay() {
      if (!autoplayId) return;
      window.clearInterval(autoplayId);
      autoplayId = 0;
    }

    function startAutoplay() {
      stopAutoplay();

      if (document.hidden || getItems().length <= 1) return;
      autoplayId = window.setInterval(function () {
        const items = getItems();
        if (!items.length || document.hidden) return;
        show((currentIndex + 1) % items.length);
      }, AUTOPLAY_DELAY_MS);
    }

    function restartAutoplay() {
      startAutoplay();
    }

    function init() {
      renderPagers();
      show(0);
      startAutoplay();
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        stopAutoplay();
      } else {
        startAutoplay();
      }
    });

    init();
    return {
      refresh() {
        renderPagers();
        show(currentIndex);
        startAutoplay();
      },
    };
  }

  function initSliders() {
    document.querySelectorAll('.slider').forEach(createSlider);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSliders);
  } else {
    initSliders();
  }
})();

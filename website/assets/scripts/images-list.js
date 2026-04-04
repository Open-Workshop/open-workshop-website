// create pager list items
var sliderImage = document.querySelectorAll('.slider__images-image');
var sliderPagers = document.querySelectorAll('.js__slider__pagers');

var sliderImages = document.querySelector('ul.js__slider__images');
var sliderImagesItems = document.querySelectorAll('.slider__images-item');
var sliderSpeed = 100000;//10000;
var sliderTarget;

var sliderPagersList = document.querySelectorAll('ol.js__slider__pagers li');
var lastElem = sliderPagersList.length - 1;
function renderPagesSelect() {
  if (!sliderPagers || sliderPagers.length === 0) {
    sliderPagersList = document.querySelectorAll('ol.js__slider__pagers li');
    lastElem = sliderPagersList.length - 1;
    updateEmptyState();
    return;
  }
  sliderPagers[0].innerHTML = '';
  sliderImage.forEach(function (image, index) {
    var listItem = document.createElement('li');
    listItem.textContent = index + 1;
    sliderPagers[0].appendChild(listItem);
  });
  sliderPagersList = document.querySelectorAll('ol.js__slider__pagers li');
  lastElem = sliderPagersList.length - 1;
  
  // pager controls
  sliderPagersList.forEach(function (pager) {
    pager.addEventListener('click', function () {
      if (!pager.classList.contains('active')) {
        sliderTarget = Array.from(sliderPagersList).indexOf(pager);
        sliderResponse(sliderTarget);
        resetTiming();
      }
    });
  });
  
  updateEmptyState();
}

function updateEmptyState() {
  var hasImages = sliderImagesItems.length > 0;
  const editEmpty = document.getElementById('no-screenshots-edit');
  if (editEmpty) {
    editEmpty.style.display = hasImages ? 'none' : 'flex';
  }

  const noImgsPlaceholder = document.getElementById('no-screenshots-error');
  if (noImgsPlaceholder) {
    noImgsPlaceholder.style.display = hasImages ? 'none' : 'flex';
    if (sliderImages) {
      sliderImages.style.display = hasImages ? 'block' : 'none';
    }
  }
}

function allResetVars() {
  sliderImage = document.querySelectorAll('.slider__images-image');
  sliderPagers = document.querySelectorAll('.js__slider__pagers');
  sliderImages = document.querySelector('ul.js__slider__images');
  sliderImagesItems = document.querySelectorAll('.slider__images-item');
}

// set up first slide
function initSlider() {
  renderPagesSelect();
  sliderTarget = 0
  sliderResponse(0)
}

window.addEventListener('load', function(){
  renderPagesSelect();
  sliderResponse(sliderTarget)
});


// transition function
function sliderResponse(sliderTarget) {
  sliderImagesItems.forEach(function (item, index) {
    if (index === sliderTarget) {
      item.style.display = 'flex';
      console.log(item);
      item.dispatchEvent(new CustomEvent('onscreenshotselect', { bubbles: true }));
    } else {
      item.style.display = 'none';
    }
  });
  sliderPagersList.forEach(function (pager, index) {
    if (index === sliderTarget) {
      pager.classList.add('active');
    } else {
      pager.classList.remove('active');
    }
  });

  if (sliderImagesItems.length == 0) {
    document.dispatchEvent(new CustomEvent('noscreenshotsavailable'));
  }
}

// slider timing
function sliderTiming() {
  sliderTarget = Array.from(sliderPagersList).indexOf(document.querySelector('.js__slider__pagers li.active'));
  sliderTarget === lastElem ? (sliderTarget = 0) : (sliderTarget = sliderTarget + 1);
  sliderResponse(sliderTarget);
}

// slider autoplay
var timingRun = setInterval(function() {
    sliderTiming();
}, sliderSpeed);

function resetTiming() {
    clearInterval(timingRun);
    timingRun = setInterval(function() {
      sliderTiming();
    }, sliderSpeed);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSlider);
} else {
  initSlider();
}

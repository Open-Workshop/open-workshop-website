// create pager list items
var sliderImage = document.querySelectorAll('.slider__images-image');
var sliderPagers = document.querySelectorAll('.js__slider__pagers');

sliderImage.forEach(function (image, index) {
  var listItem = document.createElement('li');
  listItem.textContent = index + 1;
  sliderPagers[0].appendChild(listItem);
});

// set up vars
var sliderPagersList = document.querySelectorAll('ol.js__slider__pagers li');
var sliderImages = document.querySelector('.js__slider__images');
var sliderImagesItems = document.querySelectorAll('.slider__images-item');
var sliderSpeed = 100000;//10000;
var lastElem = sliderPagersList.length - 1;
var sliderTarget;

// set up first slide
sliderPagersList[0].classList.add('active');
sliderImagesItems.forEach(function (item, index) {
  if (index !== 0) {
    item.style.display = 'none';
  }
});

// transition function
function sliderResponse(sliderTarget) {
  sliderImagesItems.forEach(function (item, index) {
    if (index === sliderTarget) {
      item.style.display = 'block';
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
}

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

function checkImageHeight() {
  var sliderImages = document.getElementsByClassName('slider__images-image');
  var visibleSliderImage = Array.from(sliderImages).find(function(image) {
      return window.getComputedStyle(image).display !== 'none';
  });
  if (visibleSliderImage) {
      var sliderWidth = visibleSliderImage.offsetWidth;
      Array.from(sliderImages).forEach(function(image) {
        image.style.width = sliderWidth + 'px';
      });
  }
}

checkImageHeight()
var sliderImages = document.getElementsByClassName('slider__images-image');
Array.from(sliderImages).forEach(function(sliderImage) {
  sliderImage.addEventListener('load', function() {
      checkImageHeight();
      Array.from(sliderImages).forEach(function(image) {
          image.classList.add('loaded');
      });
  });
});

window.addEventListener('resize', function() {
  checkImageHeight();
});

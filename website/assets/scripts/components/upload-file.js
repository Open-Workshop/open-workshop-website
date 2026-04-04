/* eslint-env browser */

(function () {
  function updateLabel(root, input) {
    if (!root || !input) return;
    const label = root.querySelector('.upload-file__text');
    if (!label) return;

    const file = input.files && input.files.length ? input.files[0] : null;
    label.textContent = file ? file.name : 'выберите файл';
  }

  function setFiles(input, files) {
    if (!input || !files || !files.length || typeof DataTransfer === 'undefined') return false;

    const transfer = new DataTransfer();
    Array.from(files).forEach(function (file) {
      transfer.items.add(file);
    });
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function bindUploadFile(root) {
    if (!(root instanceof Element) || root.dataset.uploadFileBound === '1') return;

    const input = root.nextElementSibling instanceof HTMLInputElement
      ? root.nextElementSibling
      : root.parentElement && root.parentElement.querySelector('input[type="file"]');
    if (!input) return;

    root.dataset.uploadFileBound = '1';

    root.addEventListener('click', function () {
      input.click();
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(function (eventName) {
      root.addEventListener(eventName, function (event) {
        event.preventDefault();
        event.stopPropagation();
      });
    });

    ['dragenter', 'dragover'].forEach(function (eventName) {
      root.addEventListener(eventName, function () {
        root.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(function (eventName) {
      root.addEventListener(eventName, function () {
        root.classList.remove('dragover');
      });
    });

    root.addEventListener('drop', function (event) {
      const files = event.dataTransfer ? event.dataTransfer.files : null;
      if (files && files.length) {
        if (!setFiles(input, files)) {
          updateLabel(root, { files });
        }
      }
    });

    input.addEventListener('change', function () {
      updateLabel(root, input);
    });

    updateLabel(root, input);
  }

  function initUploadFiles() {
    document.querySelectorAll('[data-upload-file]').forEach(bindUploadFile);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUploadFiles);
  } else {
    initUploadFiles();
  }
})();

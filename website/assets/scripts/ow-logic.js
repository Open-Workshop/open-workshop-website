// Расширяем его, добавляя метод get с возможностью значения по умолчанию
class Dictionary {
    constructor(old = {}) {
        for (const key in old) {
            if (Array.isArray(old[key])) {
                this[key] = old[key].map(function (item) {
                    if (Array.isArray(item)) {
                        return item.slice();
                    }
                    if (item instanceof Object) {
                        return new Dictionary(item);
                    }
                    return item;
                });
            } else if (old[key] instanceof Object) {
                this[key] = new Dictionary(old[key]);
            } else {
                this[key] = old[key];
            }
        }
    }


    get(key, defaultValue = undefined) {
        return this[key] !== undefined ? this[key] : defaultValue;
    }

    set(key, value) {
        this[key] = value;
    }

    pop(key) {
        delete this[key];
        return this;
    }

    replaceKey(oldKey, newKey) {
        this[newKey] = this.get(oldKey);
        delete this[oldKey];
    }


    keys() {
        return Object.keys(this);
    }

    values() {
        return Object.values(this);
    }


    duplicate() {
        return new Dictionary(this);
    }
}

  
// Handlers

function handlerImgErrorLoad(element) {
    if (!(element instanceof HTMLImageElement)) return;

    const fallbackSrc = element.dataset.fallbackSrc || (window.OWCore && typeof window.OWCore.getImageFallback === 'function'
        ? window.OWCore.getImageFallback()
        : '');
    const currentSrc = element.getAttribute('src') || '';

    if (!fallbackSrc || currentSrc === fallbackSrc) {
        return;
    }

    element.removeAttribute('srcset');
    element.removeAttribute('sizes');
    element.setAttribute('src', fallbackSrc);
}

function refreshImageFallbacks(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;

    const images = [];
    if (root instanceof HTMLImageElement && root.matches('img[data-fallback-src]')) {
        images.push(root);
    }
    root.querySelectorAll('img[data-fallback-src]').forEach(function (element) {
        images.push(element);
    });

    images.forEach(function (element) {
        if (!(element instanceof HTMLImageElement)) return;

        const currentSrc = (element.getAttribute('src') || '').trim();
        if (!currentSrc || (element.complete && element.naturalWidth === 0)) {
            handlerImgErrorLoad(element);
        }
    });
}


// Триггерим логику при инициализации

const importHeightMap = new Map();
let importHeightObserver = null;
let importHeightRaf = 0;

function scheduleImportHeightUpdate() {
    if (importHeightRaf) return;
    importHeightRaf = requestAnimationFrame(function () {
        importHeightRaf = 0;
        if (importHeightMap.size) {
            importHeightMap.forEach(function (_, target) {
                updateImportHeightForTarget(target);
            });
        } else {
            checkElementsImportHeight();
        }
    });
}

function ensureImportHeightObserver() {
    if (importHeightObserver || !window.ResizeObserver) return;
    importHeightObserver = new ResizeObserver(function (entries) {
        entries.forEach(function (entry) {
            updateImportHeightForTarget(entry.target);
        });
    });
}

function updateImportHeightForTarget(target) {
    const linked = importHeightMap.get(target);
    if (!linked) return;
    const height = target.getBoundingClientRect().height;
    linked.forEach(function (element) {
        element.style.height = height + 'px';
    });
}

function registerImportHeightElement(element) {
    if (!element || element.dataset.owImportBound) return;
    const selector = element.getAttribute('import-height');
    if (!selector) return;
    const target = document.querySelector(selector);
    if (!target) {
        return;
    }
    element.dataset.owImportBound = '1';
    ensureImportHeightObserver();
    if (!importHeightMap.has(target)) {
        importHeightMap.set(target, new Set());
        if (importHeightObserver) importHeightObserver.observe(target);
    }
    importHeightMap.get(target).add(element);
    updateImportHeightForTarget(target);
}

function bindDynamicInputs(root) {
    root.querySelectorAll('input[dynamlen]').forEach(function (input) {
        if (input.dataset.owDynamLenBound) return;
        input.dataset.owDynamLenBound = '1';
        input.addEventListener('input', function () { inputDynamLen(input); });
        input.addEventListener('change', function () { inputDynamLen(input); });
        inputDynamLen(input);
    });

    root.querySelectorAll('input[displaylimit]').forEach(function (input) {
        if (input.dataset.owDisplayLimitBound) return;
        input.dataset.owDisplayLimitBound = '1';
        input.addEventListener('input', function () { inputDisplayLimit(input); });
        input.addEventListener('change', function () { inputDisplayLimit(input); });
        inputDisplayLimit(input);
    });
}

function bindImportHeight(root) {
    root.querySelectorAll('[import-height]').forEach(function (element) {
        registerImportHeightElement(element);
    });
}

function observeDomChanges() {
    const observer = new MutationObserver(function (mutations) {
        let found = false;
        mutations.forEach(function (mutation) {
            mutation.addedNodes.forEach(function (node) {
                if (!(node instanceof Element)) return;
                if (node.matches && node.matches('input[dynamlen], input[displaylimit], [import-height], img[data-fallback-src]')) {
                    found = true;
                } else if (node.querySelector) {
                    if (node.querySelector('input[dynamlen], input[displaylimit], [import-height], img[data-fallback-src]')) {
                        found = true;
                    }
                }
            });
        });

        if (!found) return;
        bindDynamicInputs(document);
        bindImportHeight(document);
        refreshImageFallbacks(document);
        scheduleImportHeightUpdate();
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

function initOWLogic() {
    // Глобальный обработчик ошибок картинок (ловит и динамические изображения)
    document.addEventListener('error', function (event) {
        const target = event.target;
        if (target && target.tagName === 'IMG') {
            handlerImgErrorLoad(target);
        }
    }, true);

    document.addEventListener('event-height', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) return;

        if (target.matches('input[displaylimit]')) {
            inputDisplayLimit(target);
        }
        if (target.matches('input[dynamlen]')) {
            inputDynamLen(target);
        }
        if (target.matches('[import-height]') || target.closest('[import-height]')) {
            scheduleImportHeightUpdate();
        }
    });

    bindDynamicInputs(document);
    bindImportHeight(document);
    refreshImageFallbacks(document);
    scheduleImportHeightUpdate();
    observeDomChanges();
}

// Сами логические функции
function inputDynamLen(element) {
    if (!(element instanceof HTMLInputElement)) return;

    const hasEmptyWidth = element.hasAttribute('empty-width');
    const value = element.value || '';

    if ((!hasEmptyWidth) || (value.length > 0 && hasEmptyWidth)) {
        element.style.width = '0px';
        element.style.width = element.scrollWidth + 15 + 'px';
    } else {
        element.style.width = element.getAttribute('empty-width');
    }
}

function inputDisplayLimit(element) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;

    const myText = element.value || '';
    const maxLength = element.getAttribute('maxlength');
    const minLength = element.getAttribute('minlength');

    if ((maxLength && myText.length > maxLength) || (minLength && myText.length < minLength)) {
        element.classList.add('limit');
    } else {
        element.classList.remove('limit');
    }
}


// Автоматическая подгонка высоты одного элемента к другому

function checkElementsImportHeight() {
    document.querySelectorAll('[import-height]').forEach(function (element) {
        registerImportHeightElement(element);
    });
}

window.addEventListener('resize', function() {
    scheduleImportHeightUpdate();
});

window.addEventListener('load', function() {
    scheduleImportHeightUpdate();
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOWLogic);
} else {
    initOWLogic();
}

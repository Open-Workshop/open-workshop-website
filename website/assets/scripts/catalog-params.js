/* eslint-env browser */

(function () {
  const root = document.querySelector('main.catalog');
  if (!root) return;

  const { getApiPaths, apiUrl } = window.OWCore;
  const apiPaths = getApiPaths();

  let blocking = false;
  let outOfCards = false;
  let warns = [false, false, false];
  let suppressDependencySync = false;
  let suppressGenreSync = false;
  let pendingTagSync = false;
  let pendingGenreSync = false;
  let infiniteScrollObserver = null;
  let infiniteScrollSentinel = null;
  let pendingInfiniteScrollCheck = 0;
  const INFINITE_SCROLL_ROOT_MARGIN_PX = 2500;
  const CATALOG_MOD_TYPE_CONFIGS = {
    all: { min: null, max: null },
    mods: { min: 0, max: 0 },
    framework: { min: 1, max: null },
    'notable-framework': { min: 5, max: null },
    'popular-framework': { min: 10, max: null },
    'framework-standard': { min: 50, max: null },
  };
  const CATALOG_DEPENDENCY_FILTER_MODES = {
    dependencies: 'dependencies',
    excluded_dependencies: 'excluded_dependencies',
  };

  function getTagsEditor() {
    return window.OWPickerEditors ? window.OWPickerEditors.get('catalog-tags-editor') : null;
  }

  function getGenresEditor() {
    return window.OWPickerEditors ? window.OWPickerEditors.get('catalog-genres-editor') : null;
  }

  function getDependenciesEditor() {
    return window.OWPickerEditors ? window.OWPickerEditors.get('catalog-dependencies-editor') : null;
  }

  function getDependenciesEditorRoot() {
    return document.getElementById('catalog-dependencies-editor');
  }

  const dependencyItemModes = new Map();

  function normalizeDependencyFilterMode(value) {
    const normalized = String(value || '').trim();
    return normalized === CATALOG_DEPENDENCY_FILTER_MODES.excluded_dependencies
      ? CATALOG_DEPENDENCY_FILTER_MODES.excluded_dependencies
      : CATALOG_DEPENDENCY_FILTER_MODES.dependencies;
  }

  function getDependencyItemId(itemNode) {
    if (!(itemNode instanceof Element)) return '';
    return String(itemNode.dataset.pickerId || '').trim();
  }

  function getDependencyItemNodes(itemId) {
    const normalizedId = String(itemId || '').trim();
    const root = getDependenciesEditorRoot();
    if (!root || normalizedId === '') return [];

    return Array.from(root.querySelectorAll('[data-picker-id="' + normalizedId + '"]'));
  }

  function applyDependencyItemModeToNode(itemNode, mode, selected) {
    if (!(itemNode instanceof Element)) return;

    const normalizedMode = normalizeDependencyFilterMode(mode);
    const isSelected = typeof selected === 'boolean'
      ? selected
      : itemNode.classList.contains('is-selected') || itemNode.dataset.pickerSlot === 'selected';

    itemNode.dataset.catalogDependenciesMode = normalizedMode;
    itemNode.dataset.catalogDependenciesSelected = isSelected ? 'true' : 'false';

    itemNode.querySelectorAll('[data-action="catalog-dependencies-mode"]').forEach(function (button) {
      const buttonMode = normalizeDependencyFilterMode(button.dataset.dependenciesMode);
      const isActive = buttonMode === normalizedMode;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function syncDependencyItemModeState(itemId) {
    const normalizedId = String(itemId || '').trim();
    if (!normalizedId) return;

    const mode = getDependencyItemMode(normalizedId);
    getDependencyItemNodes(normalizedId).forEach(function (itemNode) {
      applyDependencyItemModeToNode(itemNode, mode);
    });
  }

  function getDependencyItemMode(itemId) {
    const normalizedId = String(itemId || '').trim();
    if (!normalizedId) return CATALOG_DEPENDENCY_FILTER_MODES.dependencies;

    if (dependencyItemModes.has(normalizedId)) {
      return normalizeDependencyFilterMode(dependencyItemModes.get(normalizedId));
    }

    const itemNodes = getDependencyItemNodes(normalizedId);
    const selectedNode = itemNodes.find(function (node) {
      return node.dataset.pickerSlot === 'selected' || node.classList.contains('is-selected');
    });
    const node = selectedNode || itemNodes[0] || null;
    if (node && node.dataset.catalogDependenciesMode) {
      const mode = normalizeDependencyFilterMode(node.dataset.catalogDependenciesMode);
      dependencyItemModes.set(normalizedId, mode);
      return mode;
    }

    return CATALOG_DEPENDENCY_FILTER_MODES.dependencies;
  }

  function setDependencyItemMode(itemId, mode, skipSync = false) {
    const normalizedId = String(itemId || '').trim();
    if (!normalizedId) return CATALOG_DEPENDENCY_FILTER_MODES.dependencies;

    const normalizedMode = normalizeDependencyFilterMode(mode);
    dependencyItemModes.set(normalizedId, normalizedMode);
    if (!skipSync) {
      syncDependencyItemModeState(normalizedId);
    }
    return normalizedMode;
  }

  window.OWCatalogDependencies = window.OWCatalogDependencies || {};
  window.OWCatalogDependencies.getItemMode = getDependencyItemMode;
  window.OWCatalogDependencies.setItemMode = setDependencyItemMode;
  window.OWCatalogDependencies.decorateItemModeControls = function decorateDependencyItemModeControls(itemNode, itemId, selected) {
    const normalizedId = String(itemId || '').trim();
    const mode = getDependencyItemMode(normalizedId);
    applyDependencyItemModeToNode(itemNode, mode, selected);
  };
  window.OWCatalogDependencies.applyCardMode = function applyCatalogDependencyCardMode(mode, editor, itemNode) {
    const normalizedMode = normalizeDependencyFilterMode(mode);
    const pickerEditor = editor && typeof editor.toggle === 'function' ? editor : null;
    const itemId = getDependencyItemId(itemNode);
    if (!itemId) return;
    const selectedIds = getSelectedDependencyIds();
    const isAlreadySelected = itemId !== ''
      && selectedIds.some(function (selectedId) {
        return String(selectedId) === itemId;
      });

    setDependencyItemMode(itemId, normalizedMode, true);
    if (pickerEditor && itemNode instanceof Element && !isAlreadySelected) {
      suppressDependencySync = true;
      try {
        pickerEditor.toggle(itemNode);
      } finally {
        suppressDependencySync = false;
      }
    }

    syncDependencyItemModeState(itemId);
    syncDependenciesUrlFromSelection(true);
  };

  function getCatalogModTypeSelect() {
    return document.getElementById('mod-type-select');
  }

  function normalizeCatalogModType(value) {
    const normalized = String(value || 'all');
    return Object.prototype.hasOwnProperty.call(CATALOG_MOD_TYPE_CONFIGS, normalized)
      ? normalized
      : 'all';
  }

  function getCatalogModTypeConfig(value) {
    return CATALOG_MOD_TYPE_CONFIGS[normalizeCatalogModType(value)] || CATALOG_MOD_TYPE_CONFIGS.all;
  }

  function resolveCatalogModTypeFromParams(params) {
    const rawMin = parseNumericValue(params.get('dependents_count_min', ''), null);
    const rawMax = parseNumericValue(params.get('dependents_count_max', ''), null);

    for (const key in CATALOG_MOD_TYPE_CONFIGS) {
      const config = CATALOG_MOD_TYPE_CONFIGS[key];
      if (config.min === rawMin && config.max === rawMax) {
        return key;
      }
    }

    return 'all';
  }

  function syncCatalogModTypeSelect() {
    const select = getCatalogModTypeSelect();
    if (!select) return;

    select.value = resolveCatalogModTypeFromParams(URLManager.getParams());
  }

  function applyCatalogModTypeSelect(input) {
    const select = input instanceof Element ? input : getCatalogModTypeSelect();
    if (!select) return;

    const modType = normalizeCatalogModType(select.value);
    const config = getCatalogModTypeConfig(modType);
    const updates = [
      new Dictionary({
        key: 'dependents_count_min',
        value: config.min === null ? null : config.min,
        default: null,
      }),
      new Dictionary({
        key: 'dependents_count_max',
        value: config.max === null ? null : config.max,
        default: null,
      }),
      new Dictionary({ key: 'page', value: 0 }),
    ];

    URLManager.updateParams(updates);
    resetCatalog();
  }

  const CATALOG_RANGE_CONFIGS = {
    size: {
      minParam: 'size_min',
      maxParam: 'size_max',
    },
    size_unpacked: {
      minParam: 'size_unpacked_min',
      maxParam: 'size_unpacked_max',
    },
  };

  let catalogRangeFeed = null;
  let catalogRangeDrag = null;

  function getCatalogRangeFeedUrl() {
    const feedPath = apiPaths.mod.feed.path;
    const params = URLManager.getParams();
    const gameId = parseNumericValue(params.get('game', ''), null);

    if (gameId === null || gameId <= 0) {
      return apiUrl(feedPath);
    }

    return apiUrl(feedPath) + '?game=' + encodeURIComponent(String(gameId));
  }

  function getCatalogRangeSetting() {
    return document.querySelector('setting.catalog-range-setting');
  }

  function getCatalogRangeGroup(key) {
    return document.querySelector('setting.catalog-range-setting .catalog-range-group[data-range-key="' + key + '"]');
  }

  function getCatalogRangeInput(key, role) {
    const group = getCatalogRangeGroup(key);
    if (!group) return null;
    return group.querySelector('input[data-action="catalog-range"][data-range-role="' + role + '"]');
  }

  function getCatalogRangeCurrentNode(key) {
    return document.querySelector('[data-range-current="' + key + '"]');
  }

  function getCatalogRangeSliderNode(key) {
    const group = getCatalogRangeGroup(key);
    if (!group) return null;
    return group.querySelector('.catalog-range-slider');
  }

  function getCatalogRangeFillNode(key) {
    const slider = getCatalogRangeSliderNode(key);
    if (!slider) return null;
    return slider.querySelector('.catalog-range-slider__fill');
  }

  function getCatalogRangeSliderRect(slider) {
    const track = slider.querySelector('.catalog-range-slider__track');
    const target = track || slider;
    return target.getBoundingClientRect();
  }

  function getCatalogRangePercentFromClientX(slider, clientX) {
    const rect = getCatalogRangeSliderRect(slider);
    if (!rect.width) return 0;

    const percent = ((clientX - rect.left) / rect.width) * 100;
    return Math.max(0, Math.min(100, percent));
  }

  function snapCatalogRangeValue(value, bounds, step) {
    if (!Number.isFinite(value)) return bounds.min;

    const safeStep = Math.max(1, step || 1);
    // Snap to the exact ends so the slider can reach the feed bounds.
    if (value <= bounds.min + safeStep / 2) return bounds.min;
    if (value >= bounds.max - safeStep / 2) return bounds.max;

    const snapped = bounds.min + Math.round((value - bounds.min) / safeStep) * safeStep;
    return clampNumericValue(snapped, bounds.min, bounds.max);
  }

  function resolveCatalogRangeRoleFromPointer(key, percent, bounds) {
    const minInput = getCatalogRangeInput(key, 'min');
    const maxInput = getCatalogRangeInput(key, 'max');
    if (!minInput || !maxInput) return 'min';

    const minValue = clampNumericValue(parseNumericValue(minInput.value, bounds.min), bounds.min, bounds.max);
    const maxValue = clampNumericValue(parseNumericValue(maxInput.value, bounds.max), bounds.min, bounds.max);
    const denominator = Math.max(bounds.max - bounds.min, 1);
    const minPercent = ((minValue - bounds.min) / denominator) * 100;
    const maxPercent = ((maxValue - bounds.min) / denominator) * 100;
    const minDistance = Math.abs(percent - minPercent);
    const maxDistance = Math.abs(percent - maxPercent);

    if (Math.abs(minDistance - maxDistance) < 0.0001) {
      return percent <= (minPercent + maxPercent) / 2 ? 'min' : 'max';
    }

    return minDistance < maxDistance ? 'min' : 'max';
  }

  function updateCatalogRangePointerValue(key, clientX, role, triggerReset) {
    const slider = getCatalogRangeSliderNode(key);
    const bounds = getCatalogRangeBounds(key);
    const minInput = getCatalogRangeInput(key, 'min');
    const maxInput = getCatalogRangeInput(key, 'max');

    if (!slider || !minInput || !maxInput || bounds.min === null || bounds.max === null) {
      return false;
    }

    const percent = getCatalogRangePercentFromClientX(slider, clientX);
    const step = computeCatalogRangeStep(bounds.min, bounds.max);
    const rawValue = bounds.min + ((bounds.max - bounds.min) * percent) / 100;
    const snappedValue = snapCatalogRangeValue(rawValue, bounds, step);

    if (role === 'min') {
      minInput.value = String(Math.min(snappedValue, parseNumericValue(maxInput.value, bounds.max)));
    } else {
      maxInput.value = String(Math.max(snappedValue, parseNumericValue(minInput.value, bounds.min)));
    }

    return syncCatalogRangeGroupFromInputs(key, triggerReset, role);
  }

  function handleCatalogRangePointerDown(event) {
    if (!(event.target instanceof Element)) return;
    if (event.button !== 0) return;

    const slider = event.target.closest('.catalog-range-slider');
    if (!slider) return;

    const key = slider.dataset.rangeSlider || '';
    const bounds = getCatalogRangeBounds(key);
    const minInput = getCatalogRangeInput(key, 'min');
    const maxInput = getCatalogRangeInput(key, 'max');
    if (!key || !minInput || !maxInput || minInput.disabled || maxInput.disabled || bounds.min === null || bounds.max === null) {
      return;
    }

    const percent = getCatalogRangePercentFromClientX(slider, event.clientX);
    const role = resolveCatalogRangeRoleFromPointer(key, percent, bounds);

    catalogRangeDrag = {
      key,
      pointerId: event.pointerId,
      role,
    };

    slider.classList.add('is-dragging');
    if (typeof slider.setPointerCapture === 'function') {
      try {
        slider.setPointerCapture(event.pointerId);
      } catch (error) {
        // Ignore pointer capture failures; dragging still works via the document handlers.
      }
    }

    updateCatalogRangePointerValue(key, event.clientX, role, false);

    const activeInput = getCatalogRangeInput(key, role);
    if (activeInput && typeof activeInput.focus === 'function') {
      try {
        activeInput.focus({ preventScroll: true });
      } catch (error) {
        activeInput.focus();
      }
    }

    event.preventDefault();
  }

  function finishCatalogRangeDrag(event, triggerReset) {
    if (!catalogRangeDrag) return;
    if (event.pointerId !== undefined && event.pointerId !== null && catalogRangeDrag.pointerId !== event.pointerId) {
      return;
    }

    const { key, pointerId, role } = catalogRangeDrag;
    const slider = getCatalogRangeSliderNode(key);
    if (slider) {
      slider.classList.remove('is-dragging');
      if (typeof slider.releasePointerCapture === 'function') {
        try {
          slider.releasePointerCapture(pointerId);
        } catch (error) {
          // Ignore release errors when capture was never established.
        }
      }
    }

    syncCatalogRangeGroupFromInputs(key, triggerReset, role);
    catalogRangeDrag = null;
    event.preventDefault();
  }

  function handleCatalogRangePointerMove(event) {
    if (!catalogRangeDrag) return;
    if (event.pointerId !== catalogRangeDrag.pointerId) return;

    updateCatalogRangePointerValue(catalogRangeDrag.key, event.clientX, catalogRangeDrag.role, false);
    event.preventDefault();
  }

  function handleCatalogRangePointerUp(event) {
    finishCatalogRangeDrag(event, true);
  }

  function handleCatalogRangePointerCancel(event) {
    finishCatalogRangeDrag(event, true);
  }

  function parseNumericValue(value, fallback = null) {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string' && value.trim() === '') return fallback;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
  }

  function clampNumericValue(value, min, max) {
    if (!Number.isFinite(value)) return value;
    return Math.min(Math.max(value, min), max);
  }

  function normalizeRangeBounds(minValue, maxValue, fallbackMin = null, fallbackMax = null) {
    let min = parseNumericValue(minValue, fallbackMin);
    let max = parseNumericValue(maxValue, fallbackMax);

    if (min === null && max === null) {
      return { min: fallbackMin, max: fallbackMax };
    }

    if (min === null) {
      min = max;
    }
    if (max === null) {
      max = min;
    }

    if (min === null || max === null) {
      return { min: fallbackMin, max: fallbackMax };
    }

    if (min > max) {
      const swap = min;
      min = max;
      max = swap;
    }

    return { min, max };
  }

  function formatCatalogSize(value) {
    const numericValue = parseNumericValue(value, null);
    if (numericValue === null) return '—';

    const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
    let size = Math.abs(numericValue);
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }

    const formattedSize = size.toLocaleString('ru-RU', {
      maximumFractionDigits: 1,
    });
    const prefix = numericValue < 0 ? '-' : '';
    return prefix + formattedSize + ' ' + units[unitIndex];
  }

  function formatCatalogRangeSummary(minValue, maxValue) {
    const minText = formatCatalogSize(minValue);
    const maxText = formatCatalogSize(maxValue);
    if (minText === maxText) return minText;
    return minText + ' — ' + maxText;
  }

  function computeCatalogRangeStep(minValue, maxValue) {
    const range = Math.abs(parseNumericValue(maxValue, 0) - parseNumericValue(minValue, 0));
    if (!Number.isFinite(range) || range <= 1) return 1;

    const roughStep = range / 200;
    if (roughStep < 1) return 1;

    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const normalized = roughStep / magnitude;
    let nice = 10;

    if (normalized <= 1) {
      nice = 1;
    } else if (normalized <= 2) {
      nice = 2;
    } else if (normalized <= 5) {
      nice = 5;
    }

    return Math.max(1, Math.round(nice * magnitude));
  }

  function getCatalogRangeBounds(key) {
    const range = catalogRangeFeed && catalogRangeFeed[key] ? catalogRangeFeed[key] : null;
    return {
      min: range ? parseNumericValue(range.min, null) : null,
      max: range ? parseNumericValue(range.max, null) : null,
    };
  }

  function setCatalogRangeControlsDisabled(disabled) {
    const setting = getCatalogRangeSetting();
    if (setting) {
      setting.setAttribute('aria-busy', disabled ? 'true' : 'false');
    }

    document.querySelectorAll('input[data-action="catalog-range"]').forEach(function (input) {
      if ('disabled' in input) {
        input.disabled = disabled;
      }
    });
  }

  function updateCatalogRangeGroupState(key, values, bounds, activeRole = '') {
    const group = getCatalogRangeGroup(key);
    const slider = getCatalogRangeSliderNode(key);
    const fillNode = getCatalogRangeFillNode(key);
    const minInput = getCatalogRangeInput(key, 'min');
    const maxInput = getCatalogRangeInput(key, 'max');
    const currentNode = getCatalogRangeCurrentNode(key);

    if (!group || !slider || !minInput || !maxInput || !currentNode || bounds.min === null || bounds.max === null) {
      return;
    }

    const minValue = clampNumericValue(parseNumericValue(values.min, bounds.min), bounds.min, bounds.max);
    const maxValue = clampNumericValue(parseNumericValue(values.max, bounds.max), bounds.min, bounds.max);
    const normalized = normalizeRangeBounds(minValue, maxValue, bounds.min, bounds.max);
    const touchStep = computeCatalogRangeStep(bounds.min, bounds.max);
    const denominator = Math.max(bounds.max - bounds.min, 1);
    const minPercent = Math.max(0, Math.min(100, ((normalized.min - bounds.min) / denominator) * 100));
    const maxPercent = Math.max(0, Math.min(100, ((normalized.max - bounds.min) / denominator) * 100));
    const fillWidth = Math.max(0, maxPercent - minPercent);
    const touching = Math.abs(normalized.max - normalized.min) <= touchStep;

    [minInput, maxInput].forEach(function (input) {
      input.min = String(bounds.min);
      input.max = String(bounds.max);
      input.step = '1';
      input.disabled = false;
    });

    let minZIndex = touching ? 3 : 2;
    let maxZIndex = touching ? 4 : 3;
    if (activeRole === 'min') {
      minZIndex = 4;
      maxZIndex = 3;
    } else if (activeRole === 'max') {
      minZIndex = 3;
      maxZIndex = 4;
    }

    minInput.style.zIndex = String(minZIndex);
    maxInput.style.zIndex = String(maxZIndex);

    minInput.value = String(normalized.min);
    maxInput.value = String(normalized.max);

    currentNode.textContent = formatCatalogRangeSummary(normalized.min, normalized.max);

    slider.style.setProperty('--range-fill-left', minPercent.toFixed(3) + '%');
    slider.style.setProperty('--range-fill-width', fillWidth.toFixed(3) + '%');
    if (fillNode) {
      fillNode.setAttribute('aria-hidden', 'true');
    }

    minInput.setAttribute('aria-valuemin', String(bounds.min));
    minInput.setAttribute('aria-valuemax', String(bounds.max));
    minInput.setAttribute('aria-valuenow', String(normalized.min));
    minInput.setAttribute('aria-valuetext', formatCatalogSize(normalized.min));
    maxInput.setAttribute('aria-valuemin', String(bounds.min));
    maxInput.setAttribute('aria-valuemax', String(bounds.max));
    maxInput.setAttribute('aria-valuenow', String(normalized.max));
    maxInput.setAttribute('aria-valuetext', formatCatalogSize(normalized.max));
  }

  function getCatalogRangeValuesFromParams(params, key, bounds) {
    const config = CATALOG_RANGE_CONFIGS[key];
    if (!config) return { min: bounds.min, max: bounds.max };

    const rawMin = parseNumericValue(params.get(config.minParam, ''), bounds.min);
    const rawMax = parseNumericValue(params.get(config.maxParam, ''), bounds.max);
    return normalizeRangeBounds(rawMin, rawMax, bounds.min, bounds.max);
  }

  function syncCatalogRangeUrl(key, values, bounds, triggerReset) {
    const config = CATALOG_RANGE_CONFIGS[key];
    if (!config || bounds.min === null || bounds.max === null) return false;

    const params = URLManager.getParams();
    const currentValues = getCatalogRangeValuesFromParams(params, key, bounds);
    if (currentValues.min === values.min && currentValues.max === values.max) {
      return false;
    }

    URLManager.updateParams([
      new Dictionary({ key: config.minParam, value: values.min, default: bounds.min }),
      new Dictionary({ key: config.maxParam, value: values.max, default: bounds.max }),
      new Dictionary({ key: 'page', value: 0 }),
    ]);

    if (triggerReset) {
      resetCatalog();
    }
    return true;
  }

  function syncCatalogRangeGroupFromInputs(key, triggerReset, changedRole = '') {
    const bounds = getCatalogRangeBounds(key);
    const config = CATALOG_RANGE_CONFIGS[key];
    const minInput = getCatalogRangeInput(key, 'min');
    const maxInput = getCatalogRangeInput(key, 'max');

    if (!config || !minInput || !maxInput || bounds.min === null || bounds.max === null) {
      return false;
    }

    let minValue = parseNumericValue(minInput.value, bounds.min);
    let maxValue = parseNumericValue(maxInput.value, bounds.max);
    const activeRole = changedRole || (document.activeElement === minInput ? 'min' : (document.activeElement === maxInput ? 'max' : ''));

    if (activeRole === 'min' && minValue > maxValue) {
      maxValue = minValue;
    } else if (activeRole === 'max' && maxValue < minValue) {
      minValue = maxValue;
    } else if (minValue > maxValue) {
      const swap = minValue;
      minValue = maxValue;
      maxValue = swap;
    }

    const normalized = normalizeRangeBounds(minValue, maxValue, bounds.min, bounds.max);
    updateCatalogRangeGroupState(key, normalized, bounds, activeRole);
    if (triggerReset) {
      return syncCatalogRangeUrl(key, normalized, bounds, true);
    }
    return true;
  }

  async function loadCatalogRangeFeed() {
    const feedUrl = getCatalogRangeFeedUrl();
    setCatalogRangeControlsDisabled(true);

    try {
      const response = await fetch(feedUrl, {
        method: 'GET',
        redirect: 'follow',
        credentials: 'include',
      });

      const payload = await response.json();
      if (!response.ok || !payload || typeof payload !== 'object') {
        throw new Error('Invalid catalog range feed response');
      }

      const databaseSize = parseNumericValue(payload.database_size, 0) || 0;
      const sizeBounds = normalizeRangeBounds(payload.size_min, payload.size_max, null, null);
      const unpackedBounds = normalizeRangeBounds(
        payload.size_unpacked_min,
        payload.size_unpacked_max,
        sizeBounds.min,
        sizeBounds.max,
      );

      catalogRangeFeed = {
        database_size: databaseSize,
        size: sizeBounds,
        size_unpacked: unpackedBounds,
      };

      const hasSizeBounds = sizeBounds.min !== null && sizeBounds.max !== null;
      const hasUnpackedBounds = unpackedBounds.min !== null && unpackedBounds.max !== null;
      const hasValidBounds = hasSizeBounds && hasUnpackedBounds;
      setCatalogRangeControlsDisabled(!hasValidBounds);

      if (!hasValidBounds) {
        return true;
      }

      const params = URLManager.getParams();
      const updates = [];
      Object.keys(CATALOG_RANGE_CONFIGS).forEach(function (key) {
        const bounds = getCatalogRangeBounds(key);
        if (bounds.min === null || bounds.max === null) {
          return;
        }

        const values = getCatalogRangeValuesFromParams(params, key, bounds);
        updateCatalogRangeGroupState(key, values, bounds);

        const config = CATALOG_RANGE_CONFIGS[key];
        const currentMin = parseNumericValue(params.get(config.minParam, ''), bounds.min);
        const currentMax = parseNumericValue(params.get(config.maxParam, ''), bounds.max);
        if (currentMin !== values.min || currentMax !== values.max) {
          updates.push(new Dictionary({ key: config.minParam, value: values.min, default: bounds.min }));
          updates.push(new Dictionary({ key: config.maxParam, value: values.max, default: bounds.max }));
        }
      });

      if (updates.length > 0) {
        updates.push(new Dictionary({ key: 'page', value: 0 }));
        URLManager.updateParams(updates);
      }

      return true;
    } catch (error) {
      catalogRangeFeed = null;
      setCatalogRangeControlsDisabled(true);
      return false;
    }
  }

  function sortOptionsList(mode) {
    const select = document.querySelector('select#sort-select');
    if (!select) return;
    select.classList.toggle('game', !mode);
    select.classList.toggle('mod', mode);
  }

  function getGameSetting() {
    return document.querySelector('setting#game-select');
  }

  function getDependencySetting() {
    return document.querySelector('setting#depen');
  }

  function getDependencyEditorSetting() {
    return document.querySelector('setting.catalog-dependencies-setting');
  }

  function setSettingChecked(setting, checked) {
    if (!(setting instanceof Element)) return;
    const input = setting.querySelector('input');
    if (input) {
      input.checked = checked;
    }
  }

  function setCatalogSearchValues(value) {
    document.querySelectorAll('#search-in-catalog-header, #search-in-catalog-menu').forEach(function (input) {
      input.value = value;
    });
  }

  function setEndOfCardsVisible(visible) {
    const label = document.querySelector('label#end-of-cards');
    if (!label) return;
    label.style.display = visible ? '' : 'none';
  }

  function setCatalogGameSpecificFiltersVisible(visible) {
    document.querySelectorAll('#settings-catalog .catalog-game-filter').forEach(function (element) {
      element.hidden = !visible;
    });

    if (visible) return;

    const dependenciesEditor = getDependenciesEditor();
    if (dependenciesEditor && typeof dependenciesEditor.close === 'function') {
      dependenciesEditor.close();
    }

    const tagsEditor = getTagsEditor();
    if (tagsEditor && typeof tagsEditor.close === 'function') {
      tagsEditor.close();
    }
  }

  function setCatalogGameSelectionFiltersVisible(visible) {
    document.querySelectorAll('#settings-catalog .catalog-game-select-filter').forEach(function (element) {
      element.hidden = !visible;
    });

    if (visible) return;

    const genresEditor = getGenresEditor();
    if (genresEditor && typeof genresEditor.close === 'function') {
      suppressGenreSync = true;
      pendingGenreSync = false;
      genresEditor.close();
      suppressGenreSync = false;
    }
  }

  function parseDependenciesParam(value) {
    return String(value || '')
      .replaceAll('[', '')
      .replaceAll(']', '')
      .replaceAll('_', ',')
      .split(',')
      .map(function (id) {
        return String(id).trim();
      })
      .filter(function (id) {
        return /^\d+$/.test(id);
      });
  }

  function parseGenresParam(value) {
    return String(value || '')
      .replaceAll('[', '')
      .replaceAll(']', '')
      .replaceAll('_', ',')
      .split(',')
      .map(function (id) {
        return String(id).trim();
      })
      .filter(function (id) {
        return /^\d+$/.test(id);
      });
  }

  function getSelectedDependencyIds() {
    const editor = getDependenciesEditor();
    if (!editor) return [];

    return editor.getState().visible
      .map(function (item) {
        return String(item.id);
      })
      .filter(function (id) {
        return id.length > 0;
      });
  }

  function getSelectedDependencySelection() {
    const editor = getDependenciesEditor();
    const selection = {
      dependencies: [],
      excluded_dependencies: [],
    };

    if (!editor) return selection;

    editor.getState().visible.forEach(function (item) {
      const itemId = String(item.id || '').trim();
      if (!itemId) return;

      const mode = getDependencyItemMode(itemId);
      selection[mode].push(itemId);
    });

    return selection;
  }

  function getSelectedTagIds() {
    const editor = getTagsEditor();
    if (!editor) return [];

    return editor.getState().visible
      .map(function (item) {
        return String(item.id);
      })
      .filter(function (id) {
        return id.length > 0;
      });
  }

  function getSelectedGenreIds() {
    const editor = getGenresEditor();
    if (!editor) return [];

    return editor.getState().visible
      .map(function (item) {
        return String(item.id);
      })
      .filter(function (id) {
        return id.length > 0;
      });
  }

  function clearSelectedDependencies() {
    const editor = getDependenciesEditor();
    if (!editor) return;

    suppressDependencySync = true;
    try {
      editor.clearVisibleSelection();
    } finally {
      suppressDependencySync = false;
    }
  }

  function setDependenciesEditorDisabled(disabled) {
    const setting = getDependencyEditorSetting();
    if (setting) {
      setting.classList.toggle('is-disabled', disabled);
    }

    const root = getDependenciesEditorRoot();
    if (!root) return;

    root.classList.toggle('is-disabled', disabled);
    root.setAttribute('aria-disabled', disabled ? 'true' : 'false');

    root.querySelectorAll('[data-picker-toggle], [data-picker-search], [data-picker-create]').forEach(function (control) {
      if ('disabled' in control) {
        control.disabled = disabled;
      }
    });

    if (setting) {
      setting.querySelectorAll('[data-action="catalog-dependencies-mode"]').forEach(function (control) {
        if ('disabled' in control) {
          control.disabled = disabled;
        }
      });
    }

    const editor = getDependenciesEditor();
    if (disabled && editor && editor.isOpen()) {
      editor.close();
    }
  }

  function syncDependenceSearchGame(gameID) {
    const editor = getDependenciesEditor();
    if (!editor) return;
    editor.setContext({ gameId: gameID ? String(gameID) : '' });
    if (editor.isOpen()) {
      editor.refresh();
    }
  }

  function syncTagsSearchGame(gameID) {
    const editor = getTagsEditor();
    if (!editor) return;
    editor.setContext({ gameId: gameID ? String(gameID) : '' });
    if (editor.isOpen()) {
      editor.refresh();
    }
  }

  function syncDependenciesUrlFromSelection(triggerReset) {
    const params = URLManager.getParams();
    const selection = getSelectedDependencySelection();
    const dependenciesValue = selection.dependencies.join('_');
    const excludedDependenciesValue = selection.excluded_dependencies.join('_');
    const currentDependenciesValue = parseDependenciesParam(params.get('dependencies', '')).join('_');
    const currentExcludedDependenciesValue = parseDependenciesParam(params.get('excluded_dependencies', '')).join('_');
    const legacyModeValue = String(params.get('dependencies_mode', '') || '').trim();

    if (
      currentDependenciesValue === dependenciesValue
      && currentExcludedDependenciesValue === excludedDependenciesValue
      && legacyModeValue === ''
    ) {
      return false;
    }

    const hasDependencies = selection.dependencies.length > 0 || selection.excluded_dependencies.length > 0;
    const updates = [
      new Dictionary({ key: 'dependencies', value: dependenciesValue, default: '' }),
      new Dictionary({ key: 'excluded_dependencies', value: excludedDependenciesValue, default: '' }),
      new Dictionary({ key: 'dependencies_mode', value: '', default: '' }),
      new Dictionary({ key: 'page', value: 0 }),
    ];

    if (hasDependencies) {
      updates.push(new Dictionary({ key: 'sgame', value: 'no', default: 'yes' }));
      updates.push(new Dictionary({ key: 'depen', value: 'no', default: 'no' }));
      setSettingChecked(getDependencySetting(), false);
      setSettingChecked(getGameSetting(), false);
      sortOptionsList(false);
    }

    URLManager.updateParams(updates);
    if (triggerReset) {
      resetCatalog();
    }
    return true;
  }

  function syncTagsUrlFromSelected(selectedIds, triggerReset) {
    const tagsValue = selectedIds.join('_');
    const params = URLManager.getParams();
    if (tagsValue === String(params.get('tags', '') || '')) return false;

    URLManager.updateParams([
      new Dictionary({ key: 'tags', value: tagsValue, default: '' }),
      new Dictionary({ key: 'page', value: 0 }),
    ]);

    if (triggerReset) {
      resetCatalog();
    }
    return true;
  }

  function syncGenresUrlFromSelected(selectedIds, triggerReset) {
    const genresValue = selectedIds.join('_');
    const params = URLManager.getParams();
    if (genresValue === String(params.get('genres', '') || '')) return false;

    URLManager.updateParams([
      new Dictionary({ key: 'genres', value: genresValue, default: '' }),
      new Dictionary({ key: 'sgame', value: 'yes', default: 'yes' }),
      new Dictionary({ key: 'page', value: 0 }),
    ]);

    if (triggerReset) {
      resetCatalog();
    }
    return true;
  }

  async function hydrateDependenciesFilter(ids) {
    const editor = getDependenciesEditor();
    if (!ids.length || !editor) return;

    suppressDependencySync = true;
    try {
      await editor.setDefaultSelected(ids);
    } finally {
      suppressDependencySync = false;
    }
  }

  async function hydrateGenresFilter(ids) {
    const editor = getGenresEditor();
    if (!ids.length || !editor) return;

    await editor.setDefaultSelected(ids);
  }

  function toggleIndependent(settingElement) {
    const setting = settingElement instanceof Element ? settingElement : getDependencySetting();
    const input = setting ? setting.querySelector('input') : null;
    const checked = !(input && input.checked);
    if (input) {
      input.checked = checked;
    }

    const selectedDependencySelection = getSelectedDependencySelection();
    const updates = [];

    if (checked) {
      updates.push(new Dictionary({ key: 'depen', value: 'yes', default: 'no' }));
      updates.push(new Dictionary({ key: 'dependencies', value: '', default: '' }));
      updates.push(new Dictionary({ key: 'excluded_dependencies', value: '', default: '' }));
      clearSelectedDependencies();
    } else {
      updates.push(new Dictionary({ key: 'depen', value: 'no', default: 'no' }));
      const dependenciesValue = selectedDependencySelection.dependencies.join('_');
      const excludedDependenciesValue = selectedDependencySelection.excluded_dependencies.join('_');
      if (dependenciesValue !== '' || excludedDependenciesValue !== '') {
        updates.push(new Dictionary({ key: 'dependencies', value: dependenciesValue, default: '' }));
        updates.push(new Dictionary({ key: 'excluded_dependencies', value: excludedDependenciesValue, default: '' }));
        updates.push(new Dictionary({ key: 'sgame', value: 'no', default: 'yes' }));
        setSettingChecked(getGameSetting(), false);
        sortOptionsList(false);
      }
    }

    updates.push(new Dictionary({ key: 'dependencies_mode', value: '', default: '' }));
    updates.push(new Dictionary({ key: 'page', value: 0 }));
    URLManager.updateParams(updates);
    setDependenciesEditorDisabled(checked);
    resetCatalog();
  }

  function toggleGameMode(settingElement) {
    const setting = settingElement instanceof Element ? settingElement : getGameSetting();
    const input = setting ? setting.querySelector('input') : null;
    const params = URLManager.getParams();
    const checked = !(input && input.checked);
    const hasDependencies =
      getSelectedDependencyIds().length > 0
      || parseDependenciesParam(params.get('dependencies', '')).length > 0
      || parseDependenciesParam(params.get('excluded_dependencies', '')).length > 0;

    if (!checked && params.get('game', '') === '' && !hasDependencies) {
      const label = setting ? setting.querySelector('label') : null;
      if (label) {
        label.textContent = 'Выберете игру!';
      }
      return;
    }

    if (input) {
      input.checked = checked;
    }

    sortOptionsList(checked);
    const updates = [
      new Dictionary({ key: 'sgame', value: checked ? 'yes' : 'no', default: 'yes' }),
      new Dictionary({ key: 'dependencies_mode', value: '', default: '' }),
      new Dictionary({ key: 'page', value: 0 }),
    ];

    if (checked) {
      clearSelectedDependencies();
      updates.push(new Dictionary({ key: 'dependencies', value: '', default: '' }));
      updates.push(new Dictionary({ key: 'excluded_dependencies', value: '', default: '' }));
    }

    URLManager.updateParams(updates);
    syncDependenceSearchGame(checked ? '' : params.get('game', ''));
    setCatalogGameSpecificFiltersVisible(!checked);
    setCatalogGameSelectionFiltersVisible(checked);

    const settingsCatalog = document.getElementById('settings-catalog');
    if (settingsCatalog) {
      settingsCatalog.classList.remove('full-screen');
    }

    resetCatalog();
  }

  async function selectGame(gameID) {
    sortOptionsList(false);
    URLManager.updateParams([
      new Dictionary({ key: 'sgame', value: 'no', default: 'yes' }),
      new Dictionary({ key: 'game', value: gameID, default: '' }),
      new Dictionary({ key: 'page', value: 0 }),
    ]);

    const gameSetting = getGameSetting();
    const previewLogo = document.getElementById('preview-logo-card-' + gameID);
    const previewTitle = document.getElementById('titlename' + gameID);
    if (gameSetting) {
      const settingImg = gameSetting.querySelector('img');
      const settingLabel = gameSetting.querySelector('label');
      if (settingImg && previewLogo) {
        settingImg.setAttribute('src', previewLogo.getAttribute('src') || '');
      }
      if (settingLabel && previewTitle) {
        settingLabel.textContent = previewTitle.textContent || '';
      }
    }

    syncTagsSearchGame(gameID);
    syncDependenceSearchGame(gameID);
    pendingTagSync = false;

    const tagsEditor = getTagsEditor();
    if (tagsEditor) {
      tagsEditor.clearVisibleSelection();
    }

    setCatalogGameSpecificFiltersVisible(true);
    setCatalogGameSelectionFiltersVisible(false);

    await loadCatalogRangeFeed();
    resetCatalog();
  }

  function searchByName(input) {
    const searchInput = input instanceof Element
      ? input
      : document.querySelector(input || '#search-in-catalog-menu');
    if (!searchInput) return;

    setCatalogSearchValues(searchInput.value || '');

    URLManager.updateParams([
      new Dictionary({ key: 'name', value: searchInput.value || '', default: '' }),
      new Dictionary({ key: 'page', value: 0 }),
    ]);

    resetCatalog();
  }

  function refreshCatalogList(input) {
    const menuInput = document.getElementById('search-in-catalog-menu');
    const headerInput = document.getElementById('search-in-catalog-header');
    const searchInput = input || menuInput || headerInput;

    if (searchInput) {
      searchByName(searchInput);
      return;
    }

    URLManager.updateParam('page', 0);
    resetCatalog();
  }

  function applySortSelect(input) {
    const select = input instanceof Element ? input : document.getElementById('sort-select');
    if (!select) return;

    const invertButton = document.querySelector('button#sort-select-invert');
    const invertMode = invertButton && invertButton.classList.contains('toggled') ? 'i' : '';
    URLManager.updateParams([
      new Dictionary({
        key: 'sort',
        value: invertMode + select.value,
        default: 'iDOWNLOADS',
      }),
      new Dictionary({ key: 'page', value: 0 }),
    ]);

    resetCatalog();
  }

  function applyInvertSort(button) {
    const toggleButton = button instanceof Element ? button : document.querySelector('button#sort-select-invert');
    const select = document.querySelector('select#sort-select');
    if (!toggleButton || !select) return;

    const invertMode = toggleButton.classList.contains('toggled') ? 'i' : '';
    URLManager.updateParams([
      new Dictionary({
        key: 'sort',
        value: invertMode + select.value,
        default: 'iDOWNLOADS',
      }),
      new Dictionary({ key: 'page', value: 0 }),
    ]);

    resetCatalog();
  }

  function clearUserFilter() {
    URLManager.updateParams([
      new Dictionary({ key: 'user', value: '', default: '' }),
      new Dictionary({ key: 'page', value: 0 }),
    ]);
    const filterEl = document.getElementById('catalog-user-filter');
    if (filterEl) filterEl.remove();
    resetCatalog();
  }

  async function render(params) {
    const res = await Catalog.addPage(params);
    try {
      if (res.results && res.results.length > 0) {
        const ownerType = params.get('sgame', 'yes') === 'yes' ? 'games' : 'mods';
        await Cards.setterImgs(params.get('page', 0), ownerType);
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async function resetCatalog() {
    if (pendingInfiniteScrollCheck) {
      cancelAnimationFrame(pendingInfiniteScrollCheck);
      pendingInfiniteScrollCheck = 0;
    }

    blocking = false;
    outOfCards = false;
    warns = [false, false, false];

    setEndOfCardsVisible(false);
    Catalog.removeAll();
    const renderRes = await render(URLManager.getParams());
    if (!renderRes) {
      setEndOfCardsVisible(false);
      outOfCards = true;
      Catalog.notFound();
      return;
    }

    queueInfiniteScrollCheck();
  }

  function warnAboutCardCount(countElems) {
    if (countElems >= 500 && warns[0] === false) {
      warns[0] = true;
      new Toast({
        title: 'Рекомендуем обновить страницу',
        text: 'На странице ' + countElems + ' карточек из-за чего рендер замедляется!',
        theme: 'warning',
      });
    } else if (countElems > 700 && warns[1] === false) {
      warns[1] = true;
      new Toast({
        title: 'Обновите страницу',
        text: 'На странице ' + countElems + ' карточек из-за чего рендер замедляется!!',
        theme: 'error',
      });
    } else if (countElems > 1000 && warns[2] === false) {
      warns[2] = true;
      new Toast({
        title: 'Обновите страницу!',
        text: 'На странице ' + countElems + ' карточек из-за чего рендер замедляется!!!',
        theme: 'critical',
      });
    }
  }

  async function loadNextPage() {
    if (blocking || outOfCards) return;
    blocking = true;

    try {
      const params = URLManager.getParams();
      params.set('page', Number(params.get('page', 0)) + 1);

      const renderRes = await render(params);
      if (renderRes) {
        URLManager.updateParam('page', Number(params.get('page', 0)));
        warnAboutCardCount(document.querySelectorAll('.card').length);
      } else {
        outOfCards = true;
        setEndOfCardsVisible(true);
      }
    } finally {
      blocking = false;
      if (!outOfCards) {
        queueInfiniteScrollCheck();
      }
    }
  }

  function shouldLoadNextPageImmediately() {
    const sentinel = ensureInfiniteScrollSentinel();
    if (!sentinel) return false;

    const rect = sentinel.getBoundingClientRect();
    return rect.top <= window.innerHeight + INFINITE_SCROLL_ROOT_MARGIN_PX;
  }

  function queueInfiniteScrollCheck() {
    if (pendingInfiniteScrollCheck) return;

    pendingInfiniteScrollCheck = requestAnimationFrame(function () {
      pendingInfiniteScrollCheck = 0;

      if (shouldLoadNextPageImmediately()) {
        loadNextPage();
      }
    });
  }

  function ensureInfiniteScrollSentinel() {
    if (infiniteScrollSentinel && infiniteScrollSentinel.isConnected) {
      return infiniteScrollSentinel;
    }

    const cardsContainer = document.getElementById('cards-container');
    if (!cardsContainer) return null;

    infiniteScrollSentinel = document.createElement('div');
    infiniteScrollSentinel.id = 'catalog-scroll-sentinel';
    infiniteScrollSentinel.setAttribute('aria-hidden', 'true');
    infiniteScrollSentinel.style.height = '1px';
    infiniteScrollSentinel.style.opacity = '0';
    infiniteScrollSentinel.style.pointerEvents = 'none';
    cardsContainer.appendChild(infiniteScrollSentinel);
    return infiniteScrollSentinel;
  }

  function bindInfiniteScroll() {
    const sentinel = ensureInfiniteScrollSentinel();
    if (!sentinel || !window.IntersectionObserver) return;

    if (infiniteScrollObserver) {
      infiniteScrollObserver.disconnect();
    }

    infiniteScrollObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          loadNextPage();
        }
      });
    }, {
      root: null,
      rootMargin: '0px 0px ' + INFINITE_SCROLL_ROOT_MARGIN_PX + 'px 0px',
      threshold: 0,
    });

    infiniteScrollObserver.observe(sentinel);
  }

  function handleTagsSelectionChange() {
    const editor = getTagsEditor();
    if (!editor) return;

    if (editor.isOpen()) {
      pendingTagSync = true;
      return;
    }

    pendingTagSync = false;
    syncTagsUrlFromSelected(getSelectedTagIds(), true);
  }

  function handleTagsOpenChange(event) {
    if (!event.detail || event.detail.open !== false || !pendingTagSync) return;
    pendingTagSync = false;
    syncTagsUrlFromSelected(getSelectedTagIds(), true);
  }

  function handleGenresSelectionChange() {
    const editor = getGenresEditor();
    if (!editor) return;
    if (suppressGenreSync) return;

    if (editor.isOpen()) {
      pendingGenreSync = true;
      return;
    }

    pendingGenreSync = false;
    syncGenresUrlFromSelected(getSelectedGenreIds(), true);
  }

  function handleGenresOpenChange(event) {
    if (suppressGenreSync) return;
    if (!event.detail || event.detail.open !== false || !pendingGenreSync) return;
    pendingGenreSync = false;
    syncGenresUrlFromSelected(getSelectedGenreIds(), true);
  }

  function handleDependenciesSelectionChange() {
    if (suppressDependencySync) return;
    if (URLManager.getParams().get('depen', 'no') === 'yes') return;
    syncDependenciesUrlFromSelection(true);
  }

  function bindPickerEvents() {
    const tagsRoot = document.getElementById('catalog-tags-editor');
    if (tagsRoot && tagsRoot.dataset.catalogBound !== '1') {
      tagsRoot.dataset.catalogBound = '1';
      tagsRoot.addEventListener('ow:picker-selection-change', handleTagsSelectionChange);
      tagsRoot.addEventListener('ow:picker-open-change', handleTagsOpenChange);
    }

    const genresRoot = document.getElementById('catalog-genres-editor');
    if (genresRoot && genresRoot.dataset.catalogBound !== '1') {
      genresRoot.dataset.catalogBound = '1';
      genresRoot.addEventListener('ow:picker-selection-change', handleGenresSelectionChange);
      genresRoot.addEventListener('ow:picker-open-change', handleGenresOpenChange);
    }

    const dependenciesRoot = document.getElementById('catalog-dependencies-editor');
    if (dependenciesRoot && dependenciesRoot.dataset.catalogBound !== '1') {
      dependenciesRoot.dataset.catalogBound = '1';
      dependenciesRoot.addEventListener('ow:picker-selection-change', handleDependenciesSelectionChange);
    }
  }

  async function initCatalogPage() {
    let params = URLManager.getParams();
    const filterEl = document.getElementById('catalog-user-filter');
    if (filterEl) {
      const userId = filterEl.getAttribute('data-user-id');
      const currentUser = params.get('user', '');
      const currentSGame = params.get('sgame', 'yes');
      if (currentUser !== String(userId) || currentSGame !== 'no') {
        URLManager.updateParams([
          new Dictionary({ key: 'user', value: String(userId), default: '' }),
          new Dictionary({ key: 'sgame', value: 'no', default: 'yes' }),
          new Dictionary({ key: 'page', value: 0 }),
        ]);
        params = URLManager.getParams();
      }
    }

    const dependencyIds = parseDependenciesParam(params.get('dependencies', ''));
    const excludedDependencyIds = parseDependenciesParam(params.get('excluded_dependencies', ''));
    const genreIds = parseGenresParam(params.get('genres', ''));
    const updates = [];
    const normalizedDependenciesValue = dependencyIds.join('_');
    const normalizedExcludedDependenciesValue = excludedDependencyIds.join('_');
    const normalizedGenresValue = genreIds.join('_');
    const independentMode = params.get('depen', 'no') === 'yes';
    const dependencyHydrationIds = independentMode
      ? []
      : Array.from(new Set([...dependencyIds, ...excludedDependencyIds]));

    dependencyIds.forEach(function (id) {
      dependencyItemModes.set(String(id), CATALOG_DEPENDENCY_FILTER_MODES.dependencies);
    });
    excludedDependencyIds.forEach(function (id) {
      dependencyItemModes.set(String(id), CATALOG_DEPENDENCY_FILTER_MODES.excluded_dependencies);
    });

    if (String(params.get('dependencies_mode', '') || '') !== '') {
      updates.push(new Dictionary({
        key: 'dependencies_mode',
        value: '',
        default: '',
      }));
    }

    if (independentMode) {
      if (String(params.get('dependencies', '') || '') !== '') {
        updates.push(new Dictionary({ key: 'dependencies', value: '', default: '' }));
      }
      if (String(params.get('excluded_dependencies', '') || '') !== '') {
        updates.push(new Dictionary({ key: 'excluded_dependencies', value: '', default: '' }));
      }
    } else {
      if (normalizedDependenciesValue !== String(params.get('dependencies', '') || '')) {
        updates.push(new Dictionary({
          key: 'dependencies',
          value: normalizedDependenciesValue,
          default: '',
        }));
      }
      if (normalizedExcludedDependenciesValue !== String(params.get('excluded_dependencies', '') || '')) {
        updates.push(new Dictionary({
          key: 'excluded_dependencies',
          value: normalizedExcludedDependenciesValue,
          default: '',
        }));
      }
      if ((dependencyIds.length > 0 || excludedDependencyIds.length > 0) && params.get('sgame', 'yes') !== 'no') {
        updates.push(new Dictionary({ key: 'sgame', value: 'no', default: 'yes' }));
      }
    }
    if (normalizedGenresValue !== String(params.get('genres', '') || '')) {
      updates.push(new Dictionary({ key: 'genres', value: normalizedGenresValue, default: '' }));
    }
    if (genreIds.length > 0 && params.get('sgame', 'yes') !== 'yes') {
      updates.push(new Dictionary({ key: 'sgame', value: 'yes', default: 'yes' }));
    }
    if (updates.length > 0) {
      updates.push(new Dictionary({ key: 'page', value: 0 }));
      URLManager.updateParams(updates);
      params = URLManager.getParams();
    }

    const sgame = params.get('sgame', 'yes') === 'yes';

    setSettingChecked(getDependencySetting(), params.get('depen', 'no') === 'yes');
    setSettingChecked(getGameSetting(), sgame);
    setCatalogSearchValues(params.get('name', ''));
    syncTagsSearchGame(params.get('game', ''));
    syncDependenceSearchGame(params.get('game', ''));

    await hydrateDependenciesFilter(dependencyHydrationIds);
    await hydrateGenresFilter(genreIds);
    setDependenciesEditorDisabled(params.get('depen', 'no') === 'yes');
    setCatalogRangeControlsDisabled(true);

    await loadCatalogRangeFeed();
    params = URLManager.getParams();

    URLManager.updateParam('page', Number(params.get('page', 0)));

    sortOptionsList(sgame);
    syncCatalogModTypeSelect();
    const tagsEditor = getTagsEditor();
    if (tagsEditor) {
      await tagsEditor.setDefaultSelected(
        params.get('tags', '')
          .replaceAll('_', ',')
          .split(',')
          .map(function (item) {
            return String(item).trim();
          })
          .filter(function (item) {
            return /^\d+$/.test(item);
          }),
      );
    }

    setCatalogGameSpecificFiltersVisible(!sgame);
    setCatalogGameSelectionFiltersVisible(sgame);

    const sortMode = params.get('sort', 'iDOWNLOADS');
    const invertButton = document.querySelector('button#sort-select-invert');
    if (invertButton) {
      invertButton.classList.toggle('toggled', sortMode.startsWith('i'));
    }
    const sortSelectInput = document.querySelector('select#sort-select');
    if (sortSelectInput) {
      sortSelectInput.value = sortMode.replace('i', '');
    }

    if (params.get('game', '') !== '') {
      const gameListPath = apiPaths.game.list.path;
      const resourcesPath = apiPaths.resource.list.path;
      const gameIds = '[' + params.get('game', '') + ']';

      const [gameResponse, logoResponse] = await Promise.all([
        fetch(`${apiUrl(gameListPath)}?allowed_ids=${gameIds}`),
        fetch(
          `${apiUrl(resourcesPath)}?owner_type=games&owner_ids=${gameIds}&types_resources=["logo"]&only_urls=true`,
        ),
      ]);

      if (gameResponse.ok && logoResponse.ok) {
        const [data, logo] = await Promise.all([gameResponse.json(), logoResponse.json()]);
        const setting = getGameSetting();
        if (setting) {
          const img = setting.querySelector('img');
          const label = setting.querySelector('label');
          if (img && Array.isArray(logo.results) && logo.results[0]) {
            img.setAttribute('src', logo.results[0]);
          }
          if (label && data.results && data.results[0]) {
            label.textContent = data.results[0].name;
          }
        }
      }
    }

    bindPickerEvents();
    bindInfiniteScroll();
    resetCatalog();
  }

  document.addEventListener('ow:catalog-game-select', function (event) {
    const gameId = event.detail && event.detail.gameId ? String(event.detail.gameId) : '';
    if (gameId) {
      void selectGame(gameId);
    }
  });

  document.addEventListener('click', function (event) {
    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!target) return;

    const action = target.dataset.action;

    if (action === 'catalog-toggle-fullscreen') {
      const settings = document.getElementById('settings-catalog');
      if (settings) {
        settings.classList.toggle('full-screen');
      }
      return;
    }

    if (action === 'catalog-clear-user') {
      clearUserFilter();
      return;
    }

    if (action === 'catalog-refresh') {
      const input = document.querySelector(target.dataset.target || '');
      refreshCatalogList(input);
      return;
    }

    if (action === 'catalog-sort-invert') {
      target.classList.toggle('toggled');
      applyInvertSort(target);
      return;
    }

    if (action === 'catalog-toggle-game-mode') {
      toggleGameMode(target);
      return;
    }

    if (action === 'catalog-toggle-independent') {
      toggleIndependent(target);
    }
  });

  document.addEventListener('input', function (event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.matches('[data-action="catalog-range"]')) {
      syncCatalogRangeGroupFromInputs(target.dataset.rangeKey || '', false, target.dataset.rangeRole || '');
    }
  });

  document.addEventListener('pointerdown', handleCatalogRangePointerDown);
  document.addEventListener('pointermove', handleCatalogRangePointerMove);
  document.addEventListener('pointerup', handleCatalogRangePointerUp);
  document.addEventListener('pointercancel', handleCatalogRangePointerCancel);

  document.addEventListener('change', function (event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.matches('[data-action="catalog-range"]')) {
      syncCatalogRangeGroupFromInputs(target.dataset.rangeKey || '', true, target.dataset.rangeRole || '');
      return;
    }

    if (target.matches('[data-action="catalog-search"]')) {
      searchByName(target);
      return;
    }

    if (target.matches('[data-action="catalog-mod-type-select"]')) {
      applyCatalogModTypeSelect(target);
      return;
    }

    if (target.matches('[data-action="catalog-sort-select"]')) {
      applySortSelect(target);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCatalogPage);
  } else {
    initCatalogPage();
  }
})();

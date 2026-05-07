/* eslint-env browser, node */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.OWCatalogCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function hasValue(value) {
    return value !== undefined && value !== null && value !== '';
  }

  function toPlainObject(source) {
    const output = {};
    if (!source || typeof source !== 'object') return output;

    Object.keys(source).forEach(function (key) {
      const value = source[key];
      output[key] = Array.isArray(value) ? value.slice() : value;
    });

    return output;
  }

  function getParam(params, key, defaultValue) {
    return params && params[key] !== undefined ? params[key] : defaultValue;
  }

  function popParam(params, key) {
    delete params[key];
  }

  function replaceParamKey(params, oldKey, newKey) {
    params[newKey] = params[oldKey];
    delete params[oldKey];
  }

  function resolveCatalogMode(mode) {
    if (mode === 'game' || mode === 'mod' || mode === 'modpack') {
      return mode;
    }
    return mode ? 'game' : 'mod';
  }

  function normalizeCatalogKind(catalogKind) {
    return String(catalogKind || '').trim().toLowerCase() === 'modpack' ? 'modpack' : 'mod';
  }

  function resolveCatalogState(options) {
    const settings = options || {};
    const catalogKind = normalizeCatalogKind(settings.catalogKind);
    const defaultSgame = catalogKind === 'modpack' && Boolean(settings.hasUserFilter) ? 'no' : 'yes';
    const isGameView = String(settings.sgame === undefined ? defaultSgame : settings.sgame) === 'yes';
    const view = isGameView ? 'game' : catalogKind;

    return {
      catalogKind,
      defaultSgame,
      isGameView,
      view,
    };
  }

  const CATALOG_VIEW_CLEANUP_KEYS = {
    game: [
      'public',
      'dependencies',
      'excluded_dependencies',
      'excluded_conflicts',
      'dependencies_mode',
      'depen',
      'independents',
      'dependents_count_min',
      'dependents_count_max',
      'size_min',
      'size_max',
      'size_unpacked_min',
      'size_unpacked_max',
    ],
    mod: [
      'public',
      'game_type',
      'types',
      'genres',
    ],
    modpack: [
      'public',
      'game_type',
      'types',
      'dependencies',
      'excluded_dependencies',
      'excluded_conflicts',
      'dependencies_mode',
      'depen',
      'independents',
      'dependents_count_min',
      'dependents_count_max',
      'genres',
      'size_min',
      'size_max',
      'size_unpacked_min',
      'size_unpacked_max',
    ],
  };

  function getCatalogCleanupKeysForView(view) {
    return CATALOG_VIEW_CLEANUP_KEYS[view] || [];
  }

  function buildCatalogCleanupOps(params, state, extraKeys) {
    const sourceParams = toPlainObject(params);
    const keys = Array.from(new Set([
      ...getCatalogCleanupKeysForView(state && state.view),
      ...(Array.isArray(extraKeys) ? extraKeys : []),
    ]));

    return keys
      .filter(function (key) {
        return getParam(sourceParams, key, '') !== '';
      })
      .map(function (key) {
        return { key, value: '', defaultValue: '' };
      });
  }

  const CATALOG_SORT_ALIASES = {
    creation: 'created_at',
    downloads: 'downloads',
    mods: 'mods_count',
    mods_downloads: 'downloads',
    plugins_count: 'dependents_count',
    rating: 'rating',
    update: 'file_updated_at',
    updated_at: 'file_updated_at',
  };
  const CATALOG_SORT_ALLOWED_VALUES = {
    game: new Set(['mods_count', 'downloads', 'created_at', 'name']),
    mod: new Set(['downloads', 'rating', 'size', 'file_updated_at', 'dependents_count', 'created_at', 'name']),
    modpack: new Set(['downloads', 'rating', 'created_at', 'name']),
  };
  const CATALOG_SORT_DEFAULT_VALUES = {
    game: 'mods_count',
    mod: 'downloads',
    modpack: 'downloads',
  };

  function normalizeCatalogSortValue(sortMode) {
    const normalizedSort = String(sortMode || '')
      .replace(/^-/, '')
      .toLowerCase();
    return CATALOG_SORT_ALIASES[normalizedSort] || normalizedSort;
  }

  function getCatalogSortDefaultValue(catalogMode) {
    const resolvedMode = resolveCatalogMode(catalogMode);
    return CATALOG_SORT_DEFAULT_VALUES[resolvedMode] || CATALOG_SORT_DEFAULT_VALUES.mod;
  }

  function isCatalogSortAllowedForMode(sortValue, catalogMode) {
    const normalizedSort = normalizeCatalogSortValue(sortValue);
    const resolvedMode = resolveCatalogMode(catalogMode);
    const allowedValues = CATALOG_SORT_ALLOWED_VALUES[resolvedMode] || CATALOG_SORT_ALLOWED_VALUES.mod;
    return allowedValues.has(normalizedSort);
  }

  function getCatalogSortStateForMode(sortMode, catalogMode) {
    const rawSort = String(sortMode || '').trim();
    const descending = rawSort.startsWith('-');
    const normalizedSort = normalizeCatalogSortValue(rawSort);
    const resolvedMode = resolveCatalogMode(catalogMode);
    const allowedSort = isCatalogSortAllowedForMode(normalizedSort, resolvedMode)
      ? normalizedSort
      : getCatalogSortDefaultValue(resolvedMode);

    return {
      descending,
      sort: (descending ? '-' : '') + allowedSort,
      value: allowedSort,
    };
  }

  function normalizeCatalogSortForManager(sortMode, catalogMode) {
    const sortState = getCatalogSortStateForMode(sortMode, catalogMode);
    const resolvedMode = resolveCatalogMode(catalogMode);
    const managerSort = sortState.value === 'downloads' && resolvedMode === 'game'
      ? 'mods_downloads'
      : sortState.value;

    return (sortState.descending ? '-' : '') + managerSort;
  }

  function getContextSortMode(sortMode) {
    const normalizedSort = String(sortMode || '')
      .replace(/^-/, '')
      .toLowerCase();
    const aliases = {
      downloads: 'DOWNLOADS',
      mods_downloads: 'DOWNLOADS',
      created_at: 'CREATION',
      file_updated_at: 'UPDATE',
      updated_at: 'UPDATE',
      mods_count: 'MODS',
      dependents_count: 'DEPENDENTS',
      size: 'SIZE',
      rating: 'RATING',
    };
    return aliases[normalizedSort] || normalizedSort.toUpperCase();
  }

  function normalizeCatalogGameTypeForManager(value) {
    const normalized = String(value || 'all').trim().toLowerCase();
    if (normalized === 'app' || normalized === 'game') return normalized;
    return 'all';
  }

  function parseNumericIdList(value) {
    return String(value || '')
      .replaceAll('_', ',')
      .replaceAll('[', '')
      .replaceAll(']', '')
      .split(',')
      .map(function (id) {
        return String(id).trim();
      })
      .filter(function (id) {
        return /^\d+$/.test(id);
      });
  }

  function splitFilterList(value) {
    return String(value || '').split('_').filter(Boolean);
  }

  function popMany(params, keys) {
    keys.forEach(function (key) {
      popParam(params, key);
    });
  }

  function buildCatalogRequest(options) {
    const settings = toPlainObject(options && options.settings);
    const catalogKind = normalizeCatalogKind(options && options.catalogKind);
    const paths = (options && options.paths) || {};
    const pageSize = Number(options && options.pageSize) || 30;
    const isModpackMode = catalogKind === 'modpack';
    const isGameMode = getParam(settings, 'sgame', 'yes') == 'yes';
    const renderEntityKind = isGameMode ? 'game' : (isModpackMode ? 'modpack' : 'mod');
    const requestParams = toPlainObject(settings);
    const includeFields = ['short_description', 'dates'];

    requestParams.page_size = pageSize;
    popMany(requestParams, ['statistics', 'dates', 'trigger', 'include', 'catalog_kind']);

    let path = '';
    if (isModpackMode && !isGameMode) {
      const selectedGameId = String(getParam(requestParams, 'game_id', getParam(requestParams, 'game', '')) || '').trim();
      popMany(requestParams, [
        'user',
        'public',
        'sgame',
        'game',
        'game_id',
        'game_type',
        'types',
        'dependencies_mode',
        'independents',
        'depen',
        'dependencies',
        'excluded_dependencies',
        'excluded_conflicts',
        'genres',
        'size_min',
        'size_max',
        'size_unpacked_min',
        'size_unpacked_max',
      ]);

      if (selectedGameId !== '') {
        requestParams.game_id = selectedGameId;
      }
      if (hasValue(requestParams.tags)) {
        requestParams.tags = splitFilterList(requestParams.tags);
      }
      if (hasValue(requestParams.excluded_tags)) {
        requestParams.excluded_tags = splitFilterList(requestParams.excluded_tags);
      }

      requestParams.include = includeFields;
      requestParams.sort = normalizeCatalogSortForManager(getParam(requestParams, 'sort', '-downloads'), 'modpack');
      path = paths.modpack || '';
    } else {
      if (requestParams.depen !== undefined) {
        replaceParamKey(requestParams, 'depen', 'independents');
      }

      const dependencies = parseNumericIdList(requestParams.dependencies);
      const excludedDependencies = parseNumericIdList(requestParams.excluded_dependencies);
      const excludedConflicts = parseNumericIdList(requestParams.excluded_conflicts);
      const independentMode = String(getParam(requestParams, 'independents', 'no')) === 'yes';
      popParam(requestParams, 'dependencies_mode');

      if (independentMode) {
        popMany(requestParams, ['dependencies', 'excluded_dependencies']);
      } else {
        if (dependencies.length > 0) {
          requestParams.dependencies = dependencies;
        } else {
          popParam(requestParams, 'dependencies');
        }

        if (excludedDependencies.length > 0) {
          requestParams.excluded_dependencies = excludedDependencies;
        } else {
          popParam(requestParams, 'excluded_dependencies');
        }

        if (dependencies.length > 0 || excludedDependencies.length > 0) {
          requestParams.sgame = 'no';
          requestParams.independents = 'no';
        }
      }

      if (excludedConflicts.length > 0) {
        requestParams.excluded_conflicts = excludedConflicts;
        requestParams.sgame = 'no';
      } else {
        popParam(requestParams, 'excluded_conflicts');
      }

      if (isGameMode) {
        includeFields.push('statistics');
      }

      const gameType = normalizeCatalogGameTypeForManager(getParam(requestParams, 'game_type', getParam(requestParams, 'types', 'all')));
      popMany(requestParams, ['dependencies_mode', 'independents', 'sgame']);

      if (isGameMode) {
        popMany(requestParams, [
          'adult',
          'dependencies',
          'excluded_dependencies',
          'excluded_conflicts',
          'tags',
          'excluded_tags',
          'dependents_count_min',
          'dependents_count_max',
          'size_min',
          'size_max',
          'size_unpacked_min',
          'size_unpacked_max',
          'game_type',
          'types',
        ]);

        if (gameType !== 'all') {
          requestParams.types = gameType;
        }
        if (hasValue(requestParams.genres)) {
          requestParams.genres = splitFilterList(requestParams.genres);
        }
      } else {
        const adultValue = getParam(requestParams, 'adult', '');
        if (adultValue === '' || adultValue === undefined || adultValue === null) {
          requestParams.adult = '0';
        }
        popMany(requestParams, ['game_type', 'types', 'genres']);
      }

      requestParams.include = includeFields;
      requestParams.sort = normalizeCatalogSortForManager(getParam(requestParams, 'sort', '-downloads'), isGameMode ? 'game' : 'mod');

      if (isGameMode) {
        popParam(requestParams, 'game');
      } else if (requestParams.game !== undefined) {
        replaceParamKey(requestParams, 'game', 'game_id');
      }

      if (!isGameMode && hasValue(requestParams.tags)) {
        requestParams.tags = splitFilterList(requestParams.tags);
      }
      if (!isGameMode && hasValue(requestParams.excluded_tags)) {
        requestParams.excluded_tags = splitFilterList(requestParams.excluded_tags);
      }

      path = isGameMode ? (paths.game || '') : (paths.mod || '');
    }

    return {
      includeFields,
      isGameMode,
      isModpackMode,
      path,
      renderEntityKind,
      requestParams,
    };
  }

  return {
    buildCatalogCleanupOps,
    buildCatalogRequest,
    getCatalogCleanupKeysForView,
    getCatalogSortStateForMode,
    getContextSortMode,
    isCatalogSortAllowedForMode,
    normalizeCatalogGameTypeForManager,
    normalizeCatalogKind,
    normalizeCatalogSortForManager,
    normalizeCatalogSortValue,
    parseNumericIdList,
    resolveCatalogMode,
    resolveCatalogState,
  };
});

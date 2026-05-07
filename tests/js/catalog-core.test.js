const assert = require('node:assert/strict');
const test = require('node:test');

const catalogCore = require('../../website/assets/scripts/catalog-core.js');

const paths = {
  game: '/games',
  mod: '/mods',
  modpack: '/modpacks',
};

function buildPlan(catalogKind, settings, options = {}) {
  return catalogCore.buildCatalogRequest({
    catalogKind,
    pageSize: options.pageSize || 30,
    paths,
    settings,
  });
}

test('modpack catalog requests games while game selector mode is active', () => {
  const plan = buildPlan('modpack', {
    adult: '1',
    catalog_kind: 'modpack',
    dependencies: '11_12',
    excluded_tags: '3',
    game: '2',
    game_type: 'app',
    genres: '8_9',
    name: 'rim',
    page: '0',
    sgame: 'yes',
    size_min: '100',
    tags: '1_2',
  });

  assert.equal(plan.path, '/games');
  assert.equal(plan.isGameMode, true);
  assert.equal(plan.renderEntityKind, 'game');
  assert.deepEqual(plan.includeFields, ['short_description', 'dates', 'statistics']);
  assert.deepEqual(plan.requestParams, {
    genres: ['8', '9'],
    include: ['short_description', 'dates', 'statistics'],
    name: 'rim',
    page: '0',
    page_size: 30,
    sort: '-mods_downloads',
    types: 'app',
  });
});

test('modpack catalog requests modpacks and maps selected game to game_id', () => {
  const plan = buildPlan('modpack', {
    adult: '0',
    author_id: '7',
    dependencies: '11_12',
    excluded_conflicts: '21',
    excluded_tags: '3',
    game: '2',
    genres: '8_9',
    page: '0',
    public: '1',
    sgame: 'no',
    sort: 'rating',
    tags: '1_2',
    user: '99',
  });

  assert.equal(plan.path, '/modpacks');
  assert.equal(plan.isGameMode, false);
  assert.equal(plan.renderEntityKind, 'modpack');
  assert.deepEqual(plan.includeFields, ['short_description', 'dates']);
  assert.deepEqual(plan.requestParams, {
    adult: '0',
    author_id: '7',
    excluded_tags: ['3'],
    game_id: '2',
    include: ['short_description', 'dates'],
    page: '0',
    page_size: 30,
    sort: 'rating',
    tags: ['1', '2'],
  });
});

test('mod request normalizes dependency, conflict, adult and tag filters', () => {
  const plan = buildPlan('mod', {
    adult: '',
    depen: 'no',
    dependencies: '[10]_11',
    excluded_conflicts: '33',
    excluded_dependencies: '22',
    excluded_tags: '3',
    game: '5',
    page: '0',
    sgame: 'no',
    sort: '-mods_count',
    tags: '1_2',
  });

  assert.equal(plan.path, '/mods');
  assert.equal(plan.renderEntityKind, 'mod');
  assert.deepEqual(plan.requestParams, {
    adult: '0',
    dependencies: ['10', '11'],
    excluded_conflicts: ['33'],
    excluded_dependencies: ['22'],
    excluded_tags: ['3'],
    game_id: '5',
    include: ['short_description', 'dates'],
    page: '0',
    page_size: 30,
    sort: '-downloads',
    tags: ['1', '2'],
  });
});

test('independent mod mode removes dependency filters before manager request', () => {
  const plan = buildPlan('mod', {
    depen: 'yes',
    dependencies: '10_11',
    excluded_dependencies: '22',
    game: '5',
    sgame: 'no',
  });

  assert.equal(plan.path, '/mods');
  assert.equal(plan.requestParams.dependencies, undefined);
  assert.equal(plan.requestParams.excluded_dependencies, undefined);
  assert.equal(plan.requestParams.game_id, '5');
  assert.equal(plan.requestParams.adult, '0');
});

test('game type filter is sent only to game feed as manager types', () => {
  const appGames = buildPlan('mod', {
    game_type: 'app',
    sgame: 'yes',
  });
  const legacyGameType = buildPlan('mod', {
    sgame: 'yes',
    types: 'game',
  });
  const invalidGameType = buildPlan('mod', {
    game_type: 'desktop',
    sgame: 'yes',
  });
  const modEntities = buildPlan('mod', {
    game_type: 'app',
    genres: '7_8',
    sgame: 'no',
    types: 'game',
  });

  assert.equal(appGames.path, '/games');
  assert.equal(appGames.requestParams.types, 'app');
  assert.equal(legacyGameType.requestParams.types, 'game');
  assert.equal(invalidGameType.requestParams.types, undefined);
  assert.equal(modEntities.path, '/mods');
  assert.equal(modEntities.requestParams.game_type, undefined);
  assert.equal(modEntities.requestParams.types, undefined);
  assert.equal(modEntities.requestParams.genres, undefined);
});

test('sort state is normalized per catalog mode before manager request', () => {
  assert.deepEqual(
    catalogCore.getCatalogSortStateForMode('-rating', 'game'),
    {
      descending: true,
      sort: '-mods_count',
      value: 'mods_count',
    },
  );
  assert.deepEqual(
    catalogCore.getCatalogSortStateForMode('rating', 'modpack'),
    {
      descending: false,
      sort: 'rating',
      value: 'rating',
    },
  );
  assert.equal(catalogCore.normalizeCatalogSortForManager('-downloads', 'game'), '-mods_downloads');
  assert.equal(catalogCore.normalizeCatalogSortForManager('plugins_count', 'mod'), 'dependents_count');
  assert.equal(catalogCore.normalizeCatalogSortForManager('-mods_count', 'mod'), '-downloads');
});

test('catalog state defaults preserve game selection priority unless user catalog says otherwise', () => {
  assert.deepEqual(
    catalogCore.resolveCatalogState({
      catalogKind: 'modpack',
      hasUserFilter: false,
      sgame: undefined,
    }),
    {
      catalogKind: 'modpack',
      defaultSgame: 'yes',
      isGameView: true,
      view: 'game',
    },
  );
  assert.deepEqual(
    catalogCore.resolveCatalogState({
      catalogKind: 'modpack',
      hasUserFilter: true,
      sgame: undefined,
    }),
    {
      catalogKind: 'modpack',
      defaultSgame: 'no',
      isGameView: false,
      view: 'modpack',
    },
  );
});

test('cleanup operations are derived from the active catalog view', () => {
  const gameState = catalogCore.resolveCatalogState({
    catalogKind: 'modpack',
    hasUserFilter: false,
    sgame: 'yes',
  });
  const modpackState = catalogCore.resolveCatalogState({
    catalogKind: 'modpack',
    hasUserFilter: false,
    sgame: 'no',
  });

  assert.deepEqual(
    catalogCore.buildCatalogCleanupOps({
      dependencies: '1',
      game_type: 'app',
      genres: '3',
      tags: '2',
    }, gameState),
    [
      { key: 'dependencies', value: '', defaultValue: '' },
    ],
  );
  assert.deepEqual(
    catalogCore.buildCatalogCleanupOps({
      dependencies: '1',
      game_type: 'app',
      genres: '3',
      size_min: '100',
      tags: '2',
    }, modpackState).map((operation) => operation.key),
    ['game_type', 'dependencies', 'genres', 'size_min'],
  );
});

test('request builder does not mutate incoming settings', () => {
  const settings = {
    game: '2',
    sgame: 'no',
    tags: '1_2',
  };

  const plan = buildPlan('modpack', settings);

  assert.deepEqual(settings, {
    game: '2',
    sgame: 'no',
    tags: '1_2',
  });
  assert.deepEqual(plan.requestParams.tags, ['1', '2']);
});

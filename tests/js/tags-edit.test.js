const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function createRoot(id, dataset = {}) {
  return {
    id,
    dataset: { ...dataset },
    addEventListener() {},
    closest() {
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

function createTagsRuntime({ items = [], rootDataset = {} } = {}) {
  const requests = [];
  let createdConfig = null;
  const roots = [
    createRoot('mod-tags-editor', {
      owTagsEditorBound: 'false',
      pickerContextGameId: '4',
      ...rootDataset,
    }),
  ];

  const source = fs.readFileSync(
    path.resolve(__dirname, '../../website/assets/scripts/vendors/tags-edit.js'),
    'utf-8',
  );

  const context = {
    console,
    URL,
    URLSearchParams,
    fetch: async (url) => {
      requests.push(String(url));
      return {
        ok: true,
        text: async () => '',
        json: async () => ({
          items,
          pagination: {
            page: 0,
            page_size: items.length,
            offset: 0,
            total: items.length,
            has_next: false,
            has_previous: false,
          },
        }),
      };
    },
    document: {
      body: { dataset: {} },
      querySelectorAll: (selector) => (selector === '[data-picker-editor-kind="tags"]' ? roots : []),
    },
    window: null,
  };

  context.window = context;
  context.OWCore = {
    apiUrl: (resourcePath) => `https://api.test${resourcePath}`,
    formatPath: (resourcePath, params) => resourcePath.replace(/\{(\w+)\}/g, function (match, key) {
      return params && params[key] !== undefined ? params[key] : match;
    }),
    getApiPaths: () => ({
      game: {
        tags: {
          path: '/games/{game_id}/tags',
        },
      },
      tag_group: {
        tags: {
          path: '/tag-groups/{group_id}/tags',
        },
      },
      tag: {
        list: {
          path: '/tags',
        },
      },
    }),
    normalizeCollectionResponse: (payload) => payload,
  };
  context.OWPickerEditors = {
    create: (config) => {
      createdConfig = config;
      return {
        key: config.key,
        getContext: () => ({ ...(config.context || {}) }),
      };
    },
  };

  vm.runInNewContext(source, context, {
    filename: 'tags-edit.js',
  });

  return {
    config: createdConfig,
    requests,
    roots,
  };
}

test('game-scoped tags editor uses server-side search on the game endpoint', async () => {
  const { config, requests } = createTagsRuntime({
    items: [
      { id: 495, name: '0.10', group: { id: 1, name: 'Version' } },
    ],
  });

  assert.ok(config);

  const editor = {
    getContext: () => ({
      gameId: '4',
    }),
  };

  const searchResult = await config.fetchSearchResults('0.10', editor);
  assert.equal(requests.length, 1);
  assert.equal(requests[0], 'https://api.test/games/4/tags?page_size=30&name=0.10');
  assert.deepEqual(searchResult.results.map((item) => item.id), [495]);
  assert.equal(searchResult.databaseSize, 1);

  const selectedItems = await config.fetchItemsByIds([495], editor);
  assert.deepEqual(selectedItems.map((item) => item.id), [495]);
  assert.equal(requests.length, 2);
  assert.equal(requests[1], 'https://api.test/games/4/tags?ids=495');
});

test('ungrouped-only tags editor uses the generic tags endpoint with the game filter', async () => {
  const { config, requests } = createTagsRuntime({
    items: [
      { id: 29, name: 'Wip' },
    ],
    rootDataset: {
      pickerContextTagUngroupedOnly: 'true',
    },
  });

  assert.ok(config);

  const editor = {
    getContext: () => ({
      gameId: '4',
      tagUngroupedOnly: 'true',
    }),
  };

  const searchResult = await config.fetchSearchResults('Wip', editor);
  assert.equal(requests.length, 1);
  assert.equal(requests[0], 'https://api.test/tags?page_size=30&name=Wip&game_id=4');
  assert.deepEqual(searchResult.results.map((item) => item.id), [29]);

  const selectedItems = await config.fetchItemsByIds([29], editor);
  assert.deepEqual(selectedItems.map((item) => item.id), [29]);
  assert.equal(requests.length, 2);
  assert.equal(requests[1], 'https://api.test/tags?ids=29&game_id=4');
});

test('group-scoped tags editor forwards the game filter to the tag-group endpoint', async () => {
  const { config, requests } = createTagsRuntime({
    items: [
      { id: 495, name: '0.10', group: { id: 1, name: 'Version' } },
    ],
  });

  assert.ok(config);

  const editor = {
    getContext: () => ({
      gameId: '4',
      tagGroupId: '1',
    }),
  };

  const searchResult = await config.fetchSearchResults('0.10', editor);
  assert.equal(requests.length, 1);
  assert.equal(requests[0], 'https://api.test/tag-groups/1/tags?page_size=30&name=0.10&game_id=4');
  assert.deepEqual(searchResult.results.map((item) => item.id), [495]);
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

class FakeClassList {
  constructor(classes = []) {
    this.classes = new Set(classes);
  }

  add(...classes) {
    classes.forEach((className) => this.classes.add(className));
  }

  remove(...classes) {
    classes.forEach((className) => this.classes.delete(className));
  }

  contains(className) {
    return this.classes.has(className);
  }

  toggle(className, force) {
    if (force === undefined ? !this.contains(className) : force) {
      this.add(className);
      return true;
    }
    this.remove(className);
    return false;
  }
}

class FakeElement {
  constructor(id = '', classes = [], tagName = 'div') {
    this.id = id;
    this.tagName = String(tagName).toUpperCase();
    this.attributes = {};
    this.children = [];
    this.classList = new FakeClassList(classes);
    this.dataset = {};
    this.parentElement = null;
    this.style = {};
  }

  addEventListener() {}

  appendChild(child) {
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  closest() {
    return null;
  }

  querySelector() {
    return null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
}

class FakeImageElement extends FakeElement {
  constructor(id = '') {
    super(id, [], 'img');
  }
}

function createCardsRuntime({ cards = [], images = {}, resources = [], fetchOverride = null } = {}) {
  const requests = [];
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../website/assets/scripts/vendors/cards.js'),
    'utf-8',
  );
  const context = {
    CustomEvent: class CustomEvent {},
    Element: FakeElement,
    Formating: {
      highlightSearch: (_search, value) => value,
      renderInto: (node, value) => {
        node.textContent = value;
      },
    },
    HTMLImageElement: FakeImageElement,
    URL,
    URLSearchParams,
    clearTimeout,
    console,
    fetch: async (url, options) => {
      requests.push(String(url));
      if (fetchOverride) return fetchOverride(String(url), options);
      return {
        json: async () => ({ items: resources }),
        ok: true,
      };
    },
    setTimeout,
  };
  context.window = context;
  context.document = {
    body: { dataset: {} },
    createElement: (tagName) => (tagName === 'img' ? new FakeImageElement() : new FakeElement('', [], tagName)),
    createElementNS: (_namespace, tagName) => new FakeElement('', [], tagName),
    dispatchEvent: () => {},
    getElementById: (id) => images[id] || null,
    querySelector: () => null,
    querySelectorAll: () => cards,
  };
  context.OWCore = {
    apiUrl: (resourcePath) => `https://api.test${resourcePath}`,
    getApiPaths: () => ({
      resource: {
        list: {
          path: '/resources',
        },
      },
    }),
    getImageFallback: () => '/fallback.webp',
    normalizeCollectionResponse: (payload) => payload,
  };
  context.Blurhash = {
    drawToCanvas: () => false,
  };
  context.location = {
    href: 'https://site.test/',
  };

  vm.runInNewContext(source, context, {
    filename: 'cards.js',
  });

  return { context, requests };
}

function createCard(id, classes = []) {
  return new FakeElement(id, classes);
}

function createImage(id) {
  return new FakeImageElement(id);
}

function findInTree(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.children || []) {
    const match = findInTree(child, predicate);
    if (match) return match;
  }
  return null;
}

test('setterImgs collects visible card ids and skips placeholders', async () => {
  const image = createImage('preview-logo-card-1');
  const { context, requests } = createCardsRuntime({
    cards: [
      createCard('1'),
      createCard('2', ['card--placeholder']),
      createCard(''),
    ],
    images: {
      'preview-logo-card-1': image,
    },
  });

  await context.Cards.setterImgs(0, 'mods');

  assert.equal(requests.length, 1);
  const url = new URL(requests[0]);
  assert.equal(url.pathname, '/resources');
  assert.equal(url.searchParams.get('owner_type'), 'mods');
  assert.deepEqual(url.searchParams.getAll('owner_ids'), ['1']);
  assert.equal(image.src, '/fallback.webp');
});

test('setterImgs prefers source item ids over DOM cards', async () => {
  const { context, requests } = createCardsRuntime({
    cards: [
      createCard('dom-card-id'),
    ],
  });

  await context.Cards.setterImgs(0, 'modpacks', null, [
    { id: 2 },
    { owner_id: 3 },
    { id: null },
    {},
  ]);

  assert.equal(requests.length, 1);
  const url = new URL(requests[0]);
  assert.equal(url.searchParams.get('owner_type'), 'modpacks');
  assert.deepEqual(url.searchParams.getAll('owner_ids'), ['2', '3']);
});

test('setterImgs does not request resources for stale catalog tokens', async () => {
  const { context, requests } = createCardsRuntime({
    cards: [
      createCard('1'),
    ],
  });
  context.Catalog = {
    getRequestToken: () => 5,
  };

  await context.Cards.setterImgs(0, 'mods', 4);

  assert.deepEqual(requests, []);
});

test('starts image download without waiting for a slow blurhash response', async () => {
  const image = createImage('preview-logo-card-1');
  const imageUrl = 'https://storage.test/download/resource/mods/1/logo.webp';
  let resolveBlurhash;
  const pending = new Promise((resolve) => { resolveBlurhash = resolve; });
  const { context } = createCardsRuntime({
    images: { 'preview-logo-card-1': image },
    resources: [{ owner_id: 1, url: imageUrl }],
    fetchOverride: (url) => url.endsWith('/blurhashes')
      ? pending
      : Promise.resolve({ ok: true, json: async () => ({ items: [{ owner_id: 1, url: imageUrl }] }) }),
  });

  await context.Cards.setterImgs(0, 'mods', null, [{ id: 1 }]);
  assert.equal(image.src, imageUrl);
  resolveBlurhash({ ok: true, json: async () => ({ items: [] }) });
});

test('does not paint a late placeholder over a loaded or replaced image', async () => {
  for (const state of ['loaded', 'replaced', 'stale']) {
    const image = createImage('preview-logo-card-1');
    const canvas = new FakeElement('', ['card-blurhash'], 'canvas');
    canvas.hidden = true;
    const media = new FakeElement('', ['card-media']);
    media.querySelector = () => canvas;
    image.closest = () => media;
    const imageUrl = 'https://storage.test/download/resource/mods/1/logo.webp';
    let resolveBlurhash;
    let token = 1;
    let draws = 0;
    const pending = new Promise((resolve) => { resolveBlurhash = resolve; });
    const { context } = createCardsRuntime({
      images: { 'preview-logo-card-1': image },
      fetchOverride: (url) => url.endsWith('/blurhashes')
        ? pending
        : Promise.resolve({ ok: true, json: async () => ({ items: [{ owner_id: 1, url: imageUrl }] }) }),
    });
    context.Catalog = { getRequestToken: () => token };
    context.Blurhash.drawToCanvas = () => { draws += 1; return true; };
    await context.Cards.setterImgs(0, 'mods', 1, [{ id: 1 }]);
    if (state === 'loaded') image.complete = true;
    if (state === 'replaced') image.src = '/fallback.webp';
    if (state === 'stale') token = 2;
    resolveBlurhash({ ok: true, json: async () => ({ items: [{ path: imageUrl, blurhash: 'test', width: 4, height: 3 }] }) });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(draws, 0, state);
    assert.equal(canvas.hidden, true, state);
  }
});

test('paints a timely placeholder while the image is still loading', async () => {
  const image = createImage('preview-logo-card-1');
  const canvas = new FakeElement('', ['card-blurhash'], 'canvas');
  canvas.hidden = true;
  const media = new FakeElement('', ['card-media']);
  media.querySelector = () => canvas;
  image.closest = () => media;
  const imageUrl = 'https://storage.test/download/resource/mods/1/logo.webp';
  const { context } = createCardsRuntime({
    images: { 'preview-logo-card-1': image },
    fetchOverride: (url) => Promise.resolve({ ok: true, json: async () => url.endsWith('/blurhashes')
      ? { items: [{ path: imageUrl, blurhash: 'test', width: 4, height: 3 }] }
      : { items: [{ owner_id: 1, url: imageUrl }] } }),
  });
  context.Blurhash.drawToCanvas = () => true;
  await context.Cards.setterImgs(0, 'mods', null, [{ id: 1 }]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(canvas.hidden, false);
  assert.equal(image.src, imageUrl);
});

test('create marks adult modpack cards and links them to modpack detail pages', () => {
  const { context } = createCardsRuntime();

  const card = context.Cards.create(
    {
      adult: true,
      doplink: '',
      id: 42,
      logo: '/logo.webp',
      name: 'Adult Modpack',
      short_description: 'description',
    },
    0,
    true,
    '',
    false,
    [],
    false,
    {
      entityKind: 'modpack',
    },
  );

  assert.equal(card.classList.contains('card--adult'), true);
  assert.ok(findInTree(card, (node) => node.classList.contains('card-media')));
  assert.ok(findInTree(card, (node) => node.classList.contains('card-blurhash')));
  assert.ok(findInTree(card, (node) => node.href === '/modpack/42'));
});

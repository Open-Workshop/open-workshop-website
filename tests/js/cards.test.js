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

function createCardsRuntime({ cards = [], images = {}, resources = [] } = {}) {
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
    fetch: async (url) => {
      requests.push(String(url));
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

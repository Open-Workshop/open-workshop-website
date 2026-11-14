const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = name => fs.readFileSync(path.join(__dirname, '../../website/assets/scripts/pages', name), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

async function versionUpload(fail) {
  let factory;
  let fetchCount = 0;
  const events = [];
  const runtime = {
    define: (_, fn) => { factory = fn; },
    resolveElement: value => value,
    setButtonBusy() {}, showToast() {}, showError() {}
  };
  const window = {
    OWEditRuntime: runtime,
    OWAnalytics: { track: (name, data) => events.push([name, JSON.parse(JSON.stringify(data))]) },
    location: { origin: 'https://openworkshop.example', reload() {} },
    setTimeout() {}
  };
  const api = {
    fetchModInfo: async () => ({ id: 42, condition: 'published', file_updated_at: fetchCount++ ? 'after' : 'before' }),
    startVersionTransfer: async () => ({ transfer_url: 'https://storage.example/upload' }),
    uploadBinaryToTransfer: async () => { if (fail) throw new Error('private server message'); }
  };
  vm.runInNewContext(read('mod-edit/upload-flow.js'), { window, URL });
  const flow = factory({ api, entityKind: 'mod', entityId: 42, uploadButton: {} });
  await flow.start({ name: 'private-filename.zip', size: 123 });
  await settle();
  return events;
}

test('version completion is recorded only after the new file date appears', async () => {
  assert.deepEqual(await versionUpload(false), [
    ['version_upload_completed', { entity_kind: 'mod', entity_id: '42', mode: 'replace' }]
  ]);
});

test('failed version upload records a safe stage, not filename or server error', async () => {
  assert.deepEqual(await versionUpload(true), [
    ['version_upload_failed', { entity_kind: 'mod', entity_id: '42', stage: 'transfer' }]
  ]);
});

async function contentEdit(fail, visibility = null) {
  let factory;
  const events = [];
  const titleInput = { value: 'new title', start: 'old title' };
  const runtime = {
    define: (_, fn) => { factory = fn; },
    resolveElement: value => value,
    getTextValue: node => node?.value || '', getStartValue: node => node?.start || '',
    getEditorValue: () => '', getEditorStartValue: () => '', getAttributeValue: node => node?.value || '',
    diffValue: (value, startValue) => ({ value, startValue, changed: value !== startValue }),
    setButtonBusy() {}, showToast() {}, showError() {}
  };
  const window = {
    OWEditRuntime: runtime,
    OWAnalytics: { track: (name, data) => events.push([name, JSON.parse(JSON.stringify(data))]) },
    location: { reload() {} }, requestAnimationFrame: callback => callback()
  };
  class HTMLInputElement {}
  class Element {}
  const api = { updateMod: async () => { if (fail) throw new Error('private server error'); } };
  vm.runInNewContext(read('mod-edit/save-service.js'), { window, HTMLInputElement, Element });
  const service = factory({ api, entityKind: 'mod', entityId: 42, titleInput, publicButton: visibility });
  await service.save();
  return events;
}

test('page editing is recorded only after the save succeeds', async () => {
  assert.deepEqual(await contentEdit(false), [
    ['content_edit_saved', { entity_kind: 'mod', entity_id: '42', sections: ['base'] }]
  ]);
  assert.deepEqual(await contentEdit(true), [
    ['content_edit_failed', { entity_kind: 'mod', entity_id: '42', sections: ['base'] }]
  ]);
});

test('making a mod public is recorded after the visibility update succeeds', async () => {
  assert.deepEqual(await contentEdit(false, { value: '0', start: '2' }), [
    ['content_published', { entity_kind: 'mod', entity_id: '42' }],
    ['content_edit_saved', { entity_kind: 'mod', entity_id: '42', sections: ['base'] }]
  ]);
  assert.deepEqual(await contentEdit(true, { value: '0', start: '2' }), [
    ['content_edit_failed', { entity_kind: 'mod', entity_id: '42', sections: ['base'] }]
  ]);
});

async function createContent(kind, uploadFails = false) {
  const events = [];
  let click;
  const button = { addEventListener: (_, fn) => { click = fn; } };
  const root = {
    dataset: { addPage: JSON.stringify({ kind, entity_kind: kind, route_prefix: kind, description_modules: [{ module_key: 'short' }] }) },
    querySelector: selector => selector === '[data-action="submit-add-entity"]' || selector === '.entity-add__actions > button' ? button : null
  };
  const file = { name: 'private-filename.zip', size: 123 };
  const document = {
    getElementById: id => id === 'main-container' ? root : null,
    querySelector: selector => ({
      'input#entity-name-title': { value: 'private title' },
      'input#input-mod-file-upload': { files: [file] },
      'div.main-body-game-selector': { getAttribute: () => '5' }
    })[selector] || null
  };
  const endpoint = { path: '/create', method: 'POST' };
  const window = {
    OWAnalytics: { track: (name, data) => events.push([name, JSON.parse(JSON.stringify(data))]) },
    OWDescriptionModules: { init() {}, getValue: () => 'private description' },
    OWCore: {
      getApiBase: () => 'https://api.example',
      getApiPaths: () => ({ mod: { add: endpoint, file: { path: '/transfer', method: 'POST' }, info: { path: '/info/{mod_id}' } }, modpack: { add: endpoint } }),
      formatPath: () => '/info/42', apiUrl: value => 'https://api.example' + value,
      request: async url => url.endsWith('/transfer')
        ? { ok: true, data: { transfer_url: 'https://storage.example/upload' } }
        : { ok: true, data: { id: 42 } }
    },
    location: { href: '' }
  };
  const fetch = async url => url.startsWith('https://storage.example')
    ? { ok: !uploadFails, status: 500, text: async () => 'private server error' }
    : { ok: true, json: async () => ({ condition: 'published' }) };
  class Toast {}
  vm.runInNewContext(read('mod-add.js'), { window, document, URL, fetch, Toast, setTimeout });
  click();
  await settle(); await settle();
  return events;
}

test('modpack creation is recorded after the API returns its ID', async () => {
  assert.deepEqual(await createContent('modpack'), [
    ['content_created', { entity_kind: 'modpack', entity_id: '42' }]
  ]);
});

test('initial mod upload distinguishes creation from upload result', async () => {
  assert.deepEqual(await createContent('mod'), [
    ['content_created', { entity_kind: 'mod', entity_id: '42' }],
    ['initial_upload_completed', { entity_kind: 'mod', entity_id: '42' }]
  ]);
  assert.deepEqual(await createContent('mod', true), [
    ['content_created', { entity_kind: 'mod', entity_id: '42' }],
    ['initial_upload_failed', { entity_kind: 'mod', entity_id: '42', stage: 'transfer' }]
  ]);
});

async function profileSave(actorId, fails) {
  const events = [];
  let click;
  class Element { closest() { return this; } }
  const button = new Element();
  button.dataset = { action: 'user-save-profile' };
  const root = { dataset: { userId: '7' }, addEventListener: (type, fn) => { if (type === 'click') click = fn; } };
  const username = { value: 'private-new-name', getAttribute: () => 'old-name' };
  const document = {
    querySelector: selector => selector === 'main.user.settings' ? root : null,
    getElementById: id => id === 'username' ? username : null
  };
  const window = {
    OWAnalytics: { getUserId: () => actorId, track: (name, data) => events.push([name, JSON.parse(JSON.stringify(data))]) },
    OWCore: {
      getApiPaths: () => ({ profile: { edit: { path: '/profile', method: 'PATCH' }, edit_rights: {} } }),
      getConfig: () => ({}), apiUrl: value => value, formatPath: value => value,
      request: async () => fails ? { ok: false, data: { detail: 'private error' } } : { ok: true, data: {} }
    }
  };
  const location = { reload() {} };
  class Toast {}
  vm.runInNewContext(read('user-settings.js'), { window, document, Element, Toast, location });
  click({ target: button });
  await settle();
  return events;
}

test('profile changes distinguish own edits from edits of another user', async () => {
  const own = await profileSave('7', false);
  const other = await profileSave('1', false);
  assert.deepEqual(own, [['profile_update_completed', { target_user_id: '7', scope: 'self', section: 'profile', fields: ['username'] }]]);
  assert.deepEqual(other, [['profile_update_completed', { target_user_id: '7', scope: 'other', section: 'profile', fields: ['username'] }]]);
});

test('profile failure is recorded without names or error text', async () => {
  assert.deepEqual(await profileSave('1', true), [
    ['profile_update_failed', { target_user_id: '7', scope: 'other', section: 'profile' }]
  ]);
});

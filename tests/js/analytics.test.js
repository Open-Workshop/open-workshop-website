const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../website/assets/scripts/analytics.js'), 'utf8');

function setup(userId, previousId) {
    const values = new Map(previousId ? [['rybbit-user-id', previousId]] : []);
    const calls = [];
    let tracker;
    const window = { rybbit: {
        identify: id => calls.push(['identify', id]),
        clearUserId: () => calls.push(['clear']),
        event: (...args) => calls.push(['event', ...args])
    } };
    const document = {
        currentScript: { dataset: { userId, siteId: '42', scriptUrl: 'https://analytics.example/api/script.js' } },
        createElement: () => ({}),
        head: { appendChild: element => { tracker = element; } },
        addEventListener: () => {}
    };
    const localStorage = {
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key)
    };
    vm.runInNewContext(source, { document, window, localStorage, URL });
    return { values, calls, tracker, window };
}

test('authenticated user replaces the previous identity before the tracker loads', () => {
    const state = setup('7', '3');
    assert.equal(state.values.get('rybbit-user-id'), '7');
    assert.equal(state.tracker.src, 'https://analytics.example/api/script.js?siteId=42');
    state.tracker.onload();
    assert.deepEqual(state.calls, [['identify', '7']]);
});

test('anonymous visitor clears a previous identity before the tracker loads', () => {
    const state = setup('', '3');
    assert.equal(state.values.has('rybbit-user-id'), false);
    state.tracker.onload();
    assert.deepEqual(state.calls, []);
});

test('logout during tracker loading cannot restore the old identity', () => {
    const state = setup('7', '3');
    state.window.OWAnalytics.clearIdentity();
    state.tracker.onload();
    assert.equal(state.values.has('rybbit-user-id'), false);
    assert.deepEqual(state.calls, [['clear']]);
});

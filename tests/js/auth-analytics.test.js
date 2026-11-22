const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../website/assets/scripts/analytics.js'), 'utf8');
function setup({userId = '', authState = 'unknown', reason = 'session_invalid', storage = new Map(), tab = new Map(), cookie = ''} = {}) {
    let tracker;
    const events = [];
    const cookies = new Map();
    if (cookie) cookies.set('owAuthEvent', cookie);
    const document = {
        currentScript: {dataset: {userId, authState, logoutReason: reason, gradeKnown: 'false', siteId: '2', scriptUrl: 'https://analytics.example/api/script.js'}},
        get cookie() { return [...cookies].map(([key, value]) => `${key}=${value}`).join('; '); },
        set cookie(value) { if (value.startsWith('owAuthEvent=;')) cookies.delete('owAuthEvent'); },
        createElement: () => ({}), head: {appendChild: element => {tracker = element;}}, addEventListener: () => {}
    };
    function store(map) {return {getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key)};}
    const window = {rybbit: {
        identify: (id) => events.push(['identify', id]),
        event: (name, props) => events.push([name, JSON.parse(JSON.stringify(props))]),
        clearUserId: () => events.push(['clear'])
    }};
    vm.runInNewContext(source, {document, window, localStorage: store(storage), sessionStorage: store(tab), URL});
    return {window, tracker, events, cookies, storage, tab};
}
function eventOnly(state) {return state.events.filter(event => event[0] !== 'identify' && event[0] !== 'clear');}

test('login and confirmed link emit distinct events with provider once', () => {
    for (const [kind, method, expected] of [['login', 'google', 'login'], ['linked', 'yandex', 'auth_method_linked'], ['login', 'password', 'login']]) {
        const state = setup({userId: '42', authState: 'authenticated', cookie: `${kind}.${method}.42.0123456789abcdef`});
        state.tracker.onload();
        assert.deepEqual(eventOnly(state), [[expected, {method}]]);
        assert.equal(state.cookies.has('owAuthEvent'), false);
        state.tracker.onload();
        assert.equal(eventOnly(state).length, 1);
    }
});
test('marker for a different account and invalid markers are not reported', () => {
    for (const cookie of ['linked.google.43.0123456789abcdef', 'linked.unknown.42.0123456789abcdef', 'bad']) {
        const state = setup({userId: '42', authState: 'authenticated', cookie});
        state.tracker.onload();
        assert.deepEqual(eventOnly(state), []);
    }
});
test('expired or otherwise invalid session is recorded once, not during Access failure', () => {
    for (const reason of ['credentials_expired', 'session_invalid']) {
        const storage = new Map([['ow-analytics-auth-state', JSON.stringify({userId: '42'})]]);
        const state = setup({authState: 'anonymous', reason, storage});
        state.tracker.onload();
        assert.deepEqual(eventOnly(state), [['logout', {reason, account_id: '42'}]]);
        const next = setup({authState: 'anonymous', reason, storage});
        next.tracker.onload();
        assert.deepEqual(eventOnly(next), []);
    }
    const storage = new Map([['ow-analytics-auth-state', JSON.stringify({userId: '42'})]]);
    const unknown = setup({authState: 'unknown', storage});
    unknown.tracker.onload();
    assert.deepEqual(eventOnly(unknown), []);
    assert.ok(storage.has('ow-analytics-auth-state'));
});
test('explicit logout emits before identity is cleared', () => {
    const state = setup({userId: '42', authState: 'authenticated'});
    state.window.OWAnalytics.trackLogout('user_initiated');
    state.window.OWAnalytics.clearIdentity();
    assert.deepEqual(state.events, [['logout', {reason: 'user_initiated', account_id: '42'}], ['clear']]);
    assert.equal(state.storage.has('ow-analytics-auth-state'), false);
});
test('logout is saved until next page when tracker has not loaded', () => {
    const tab = new Map(), storage = new Map();
    const state = setup({userId: '42', authState: 'authenticated', tab, storage});
    delete state.window.rybbit;
    state.window.OWAnalytics.trackLogout('user_initiated');
    state.window.OWAnalytics.clearIdentity();
    const next = setup({authState: 'anonymous', tab, storage});
    next.tracker.onload();
    assert.deepEqual(eventOnly(next), [['logout', {reason: 'user_initiated', account_id: '42'}]]);
    assert.equal(tab.has('ow-analytics-pending-logout'), false);
});

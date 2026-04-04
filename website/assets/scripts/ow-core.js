/* eslint-env browser */

/**
 * @typedef {'json'|'text'|'blob'} OWParseType
 *
 * @typedef {Object} OWRequestOptions
 * @property {string} [method]
 * @property {FormData|Object|string|undefined|null} [data]
 * @property {HeadersInit} [headers]
 * @property {RequestCredentials} [credentials]
 * @property {OWParseType} [parseAs]
 */

(function () {
  let configCache = null;

  function readConfigScript() {
    const configNode = document.getElementById('ow-config');
    if (!configNode) return {};

    try {
      return JSON.parse(configNode.textContent || '{}');
    } catch (error) {
      return {};
    }
  }

  function getConfig() {
    if (configCache == null) {
      configCache = readConfigScript();
    }
    return configCache;
  }

  function getApiPaths() {
    const cfg = getConfig();
    return (cfg.api && cfg.api.paths) || {};
  }

  function getApiBase() {
    const cfg = getConfig();
    const base = (cfg.api && cfg.api.base) || '';
    return base || document.body.getAttribute('manager-url') || '';
  }

  function isAbsoluteUrl(url) {
    return /^https?:\/\//i.test(url);
  }

  function apiUrl(path) {
    if (!path) return getApiBase();
    return isAbsoluteUrl(path) ? path : `${getApiBase()}${path}`;
  }

  function formatPath(path, params) {
    if (!params) return path;
    return path.replace(/\{(\w+)\}/g, (match, key) => {
      return params[key] !== undefined ? params[key] : match;
    });
  }

  /**
   * @param {string} pathOrUrl
   * @param {OWRequestOptions} [options]
   */
  async function request(pathOrUrl, options = {}) {
    const {
      method = 'GET',
      data = undefined,
      headers = {},
      credentials = 'include',
      parseAs = 'json',
    } = options;

    const url = apiUrl(pathOrUrl);
    const init = { method, headers: { ...headers }, credentials };

    if (data instanceof FormData) {
      init.body = data;
    } else if (data !== undefined && data !== null) {
      if (typeof data === 'string') {
        init.body = data;
      } else {
        init.body = JSON.stringify(data);
        if (!init.headers['Content-Type']) {
          init.headers['Content-Type'] = 'application/json';
        }
      }
    }

    const response = await fetch(url, init);

    let payload = null;
    if (parseAs === 'text') {
      payload = await response.text();
    } else if (parseAs === 'blob') {
      payload = await response.blob();
    } else {
      payload = await response.json().catch(() => null);
    }

    return {
      ok: response.ok,
      status: response.status,
      data: payload,
      response,
    };
  }

  window.OWCore = {
    getConfig,
    getApiPaths,
    getApiBase,
    apiUrl,
    formatPath,
    request,
  };
})();

/* eslint-env browser */

(function () {
  const runtime = window.OWEditRuntime;
  if (!runtime) return;

  function extractErrorMessage(result, fallback) {
    const payload = result ? result.data : null;

    if (typeof payload === 'string') {
      return runtime.parseResponseMessage(payload, fallback);
    }

    if (payload && typeof payload === 'object') {
      if (typeof payload.detail === 'string') return payload.detail;
      if (typeof payload.message === 'string') return payload.message;
      if (typeof payload.error === 'string') return payload.error;
    }

    return fallback;
  }

  runtime.define('mod-edit-api', function createModEditApi(options) {
    const config = options || {};
    const modId = Number(config.modId || 0);
    const entityId = Number(config.entityId || modId || 0);
    const entityKind = String(config.entityKind || 'mod').toLowerCase();
    const resourceOwnerType = String(config.resourceOwnerType || (entityKind === 'modpack' ? 'modpacks' : 'mods'));
    const apiPaths = config.apiPaths || window.OWCore.getApiPaths();
    const modApiPaths = apiPaths.mod || {};
    const modpackApiPaths = apiPaths.modpack || {};
    const entityApiPaths = entityKind === 'modpack' ? modpackApiPaths : modApiPaths;
    const ENTITY_FORMS = {
      mod: { nominative: 'мод', genitive: 'мода', accusative: 'мод' },
      modpack: { nominative: 'модпак', genitive: 'модпака', accusative: 'модпак' },
    };
    const entityForms = ENTITY_FORMS[entityKind] || ENTITY_FORMS.mod;

    function formatEndpoint(endpoint, pathParams, query) {
      const path = window.OWCore.formatPath(endpoint.path, pathParams || {});
      const url = new URL(window.OWCore.apiUrl(path), window.location.origin);

      if (query instanceof URLSearchParams) {
        query.forEach(function (value, key) {
          url.searchParams.append(key, value);
        });
      } else if (query && typeof query === 'object') {
        Object.entries(query).forEach(function (entry) {
          const key = entry[0];
          const value = entry[1];
          if (Array.isArray(value)) {
            value.forEach(function (item) {
              if (item !== undefined && item !== null && item !== '') {
                url.searchParams.append(key, String(item));
              }
            });
          } else if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, String(value));
          }
        });
      }

      return url.toString();
    }

    async function requestEndpoint(endpoint, requestOptions) {
      const settings = requestOptions || {};
      const result = await window.OWCore.request(
        formatEndpoint(endpoint, settings.pathParams, settings.query),
        {
          method: settings.method || endpoint.method,
          data: settings.data,
          headers: settings.headers,
          credentials: settings.credentials || 'include',
          parseAs: settings.parseAs || 'text',
        },
      );

      if (!result.ok) {
        throw new Error(extractErrorMessage(result, settings.fallbackError || `Ошибка (${result.status})`));
      }

      return result;
    }

    async function fetchModInfo() {
      const result = await requestEndpoint(entityApiPaths.info, {
        pathParams: entityKind === 'modpack' ? { modpack_id: modId } : { mod_id: modId },
        query: entityKind === 'modpack'
          ? undefined
          : { include: ['dates', 'authors', 'game', 'short_description', 'description', 'resources'] },
        parseAs: 'json',
        fallbackError: 'Не удалось получить информацию о ' + entityForms.genitive,
      });

      return result.data;
    }

    async function fetchProfile(userId) {
      const result = await requestEndpoint(apiPaths.profile.info, {
        pathParams: { user_id: userId },
        query: { include: ['general'] },
        parseAs: 'json',
        fallbackError: 'Не удалось получить профиль пользователя',
      });

      if (result.data && result.data.general && typeof result.data.general === 'object') {
        return {
          ...result.data.general,
          id: Number(result.data.general.id || userId),
        };
      }

      throw new Error('Ответ сервера не содержит данных профиля');
    }

    async function searchProfiles(username) {
      const query = String(username || '').trim();
      if (query === '') return [];

      const result = await requestEndpoint(apiPaths.profile.list, {
        query: {
          username: query,
          page: 0,
          page_size: 10,
        },
        parseAs: 'json',
        fallbackError: 'Не удалось найти пользователей',
      });

      return Array.isArray(result.data && result.data.items) ? result.data.items : [];
    }

    async function updateMod(formData) {
      if (!formData || typeof formData !== 'object' || Array.isArray(formData)) return null;
      const payload = {};
      Object.entries(formData).forEach(function (entry) {
        const key = entry[0];
        const value = entry[1];
        if (value !== undefined) {
          payload[key] = value;
        }
      });
      if (Object.keys(payload).length === 0) return null;

      return requestEndpoint(entityApiPaths.edit, {
        pathParams: entityKind === 'modpack' ? { modpack_id: modId } : { mod_id: modId },
        data: payload,
        parseAs: 'json',
        fallbackError: 'Не удалось сохранить изменения ' + entityForms.genitive,
      });
    }

    async function updateTag(tagId, add) {
      const endpoint = add ? entityApiPaths.tags_add : entityApiPaths.tags_delete;
      return requestEndpoint(endpoint, {
        pathParams: entityKind === 'modpack'
          ? { modpack_id: modId, tag_id: tagId }
          : { mod_id: modId, tag_id: tagId },
        parseAs: 'text',
        fallbackError: add ? 'Не удалось добавить тег' : 'Не удалось удалить тег',
      });
    }

    async function updateDependency(dependencyId, add, optional) {
      const endpoint = add ? apiPaths.mod.dependencies_add : apiPaths.mod.dependencies_delete;
      return requestEndpoint(endpoint, {
        pathParams: { mod_id: modId, dependency_mod_id: dependencyId },
        data: add && optional !== undefined
          ? {
            optional: Boolean(optional),
          }
          : undefined,
        parseAs: 'text',
        fallbackError: add ? 'Не удалось добавить зависимость' : 'Не удалось удалить зависимость',
      });
    }

    async function updateDependencyOptional(dependencyId, optional) {
      return requestEndpoint(apiPaths.mod.dependencies_update, {
        pathParams: { mod_id: modId, dependency_mod_id: dependencyId },
        data: {
          optional: Boolean(optional),
        },
        parseAs: 'text',
        fallbackError: 'Не удалось обновить параметр зависимости',
      });
    }

    async function updateConflict(conflictId, add) {
      const endpoint = add ? apiPaths.mod.conflicts_add : apiPaths.mod.conflicts_delete;
      return requestEndpoint(endpoint, {
        pathParams: { mod_id: modId, conflict_mod_id: conflictId },
        parseAs: 'text',
        fallbackError: add ? 'Не удалось добавить конфликт' : 'Не удалось удалить конфликт',
      });
    }

    async function upsertAuthor(authorId, owner) {
      return requestEndpoint(entityApiPaths.authors_upsert, {
        pathParams: entityKind === 'modpack'
          ? { modpack_id: modId, author_id: authorId }
          : { mod_id: modId, author_id: authorId },
        data: {
          owner: Boolean(owner),
        },
        parseAs: 'text',
        fallbackError: 'Не удалось обновить список авторов',
      });
    }

    async function deleteAuthor(authorId) {
      return requestEndpoint(entityApiPaths.authors_delete, {
        pathParams: entityKind === 'modpack'
          ? { modpack_id: modId, author_id: authorId }
          : { mod_id: modId, author_id: authorId },
        parseAs: 'text',
        fallbackError: 'Не удалось удалить автора',
      });
    }

    async function updateModpackMods(items) {
      return requestEndpoint(entityApiPaths.mods_update, {
        pathParams: { modpack_id: modId },
        data: {
          items: Array.isArray(items) ? items : [],
        },
        parseAs: 'text',
        fallbackError: 'Не удалось обновить список модов модпака',
      });
    }

    async function addResourceUrl(resource) {
      const sortOrder = Number(resource && resource.sortOrder !== undefined ? resource.sortOrder : 0);
      return requestEndpoint(apiPaths.resource.add, {
        data: {
          owner_type: resourceOwnerType,
          owner_id: entityId,
          type: resource.type,
          url: resource.url,
          sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
        },
        parseAs: 'json',
        fallbackError: 'Не удалось добавить изображение',
      });
    }

    async function editResource(resourceChange) {
      const sortOrder = Number(resourceChange && resourceChange.sortOrder !== undefined ? resourceChange.sortOrder : NaN);
      return requestEndpoint(apiPaths.resource.edit, {
        pathParams: { resource_id: resourceChange.id },
        data: {
          ...(resourceChange.type ? { type: resourceChange.type } : {}),
          ...(resourceChange.url ? { url: resourceChange.url } : {}),
          ...(Number.isFinite(sortOrder) ? { sort_order: sortOrder } : {}),
        },
        parseAs: 'json',
        fallbackError: 'Не удалось обновить изображение',
      });
    }

    async function deleteResource(resourceId) {
      return requestEndpoint(apiPaths.resource.delete, {
        pathParams: { resource_id: resourceId },
        parseAs: 'text',
        fallbackError: 'Не удалось удалить изображение',
      });
    }

    async function deleteMod() {
      return requestEndpoint(entityApiPaths.delete, {
        pathParams: entityKind === 'modpack' ? { modpack_id: modId } : { mod_id: modId },
        parseAs: 'text',
        fallbackError: 'Не удалось удалить ' + entityForms.accusative,
      });
    }

    async function startTransferRequest(endpoint, formData, pathParams, fallbackError) {
      const url = formatEndpoint(endpoint, pathParams);
      const response = await window.OWCore.request(url, {
        method: endpoint.method,
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json',
        },
        data: formData,
        parseAs: 'json',
      });

      if (response.ok) {
        if (response.data && response.data.transfer_url) {
          return response.data;
        }
        throw new Error('Ответ менеджера некорректен');
      }

      if (response.status === 307 || response.status === 302) {
        const redirectUrl = response.response && response.response.headers
          ? response.response.headers.get('Location')
          : null;
        if (!redirectUrl) {
          throw new Error('Redirect URL не получен');
        }
        return { transfer_url: redirectUrl };
      }

      throw new Error(extractErrorMessage(response, fallbackError || `Ошибка (${response.status})`));
    }

    function normalizeWebSocketUrl(value) {
      return String(value || '').trim().replace(/^http/, 'ws');
    }

    function watchTransferProgress(transfer, progress) {
      const wsUrl = normalizeWebSocketUrl(transfer && transfer.ws_url ? transfer.ws_url : '');
      if (!wsUrl || !progress || typeof progress.applyTransferState !== 'function') {
        return {
          wait: Promise.resolve(),
          close: function () {},
        };
      }

      let ws = null;
      let settled = false;

      const wait = new Promise(function (resolve, reject) {
        try {
          ws = new WebSocket(wsUrl);
        } catch (error) {
          settled = true;
          resolve();
          return;
        }

        ws.onmessage = function (event) {
          let data = null;
          try {
            data = JSON.parse(event.data);
          } catch (parseError) {
            return;
          }

          if (data.event === 'stage' || data.event === 'progress') {
            progress.applyTransferState(data);
            return;
          }

          if (data.event === 'error') {
            settled = true;
            if (ws && ws.readyState <= WebSocket.OPEN) {
              ws.close();
            }
            reject(new Error(data.message || 'Ошибка загрузки изображения'));
            return;
          }

          if (data.event === 'complete') {
            settled = true;
            if (ws && ws.readyState <= WebSocket.OPEN) {
              ws.close();
            }
            resolve();
          }
        };

        ws.onerror = function () {
          if (settled) return;
          settled = true;
          resolve();
        };

        ws.onclose = function () {
          if (settled) return;
          settled = true;
          resolve();
        };
      });

      return {
        wait,
        close: function () {
          if (!ws) return;
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        },
      };
    }

    async function startVersionTransfer(formData) {
      return startTransferRequest(
        apiPaths.mod.file,
        formData,
        { mod_id: modId },
        'Не удалось инициализировать загрузку версии',
      );
    }

    async function startResourceTransfer(formData, resourceId) {
      return startTransferRequest(
        apiPaths.resource.upload_init,
        {
          ...formData,
          ...(resourceId ? { owner_id: resourceId, mode: 'replace' } : { mode: 'create' }),
        },
        {},
        'Не удалось инициализировать загрузку изображения',
      );
    }

    async function uploadBinaryToTransfer(transferUrl, file) {
      const parsedUpload = new URL(transferUrl, window.location.origin);
      if (file && file.name) {
        parsedUpload.searchParams.set('filename', file.name);
      }
      if (file && Number.isFinite(file.size) && file.size >= 0) {
        parsedUpload.searchParams.set('size', String(file.size));
      }

      const response = await fetch(parsedUpload.toString(), {
        method: 'POST',
        body: file,
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        credentials: 'omit',
      });

      if (!response.ok) {
        const text = await response.text().catch(function () { return ''; });
        throw new Error(runtime.parseResponseMessage(text, `Ошибка (${response.status})`));
      }

      return response;
    }

    async function uploadNewResourceFile(resource, progress) {
      const sortOrder = Number(resource && resource.sortOrder !== undefined ? resource.sortOrder : 0);
      const transfer = await startResourceTransfer({
        kind: 'resource_image',
        owner_type: 'resource',
        resource_owner_type: resourceOwnerType,
        resource_owner_id: entityId,
        resource_type: resource.type,
        ...(Number.isFinite(sortOrder) ? { resource_sort_order: sortOrder } : {}),
      });
      const watcher = watchTransferProgress(transfer, progress);

      if (progress && typeof progress.setTransferStage === 'function') {
        progress.setTransferStage('uploading');
      } else if (progress && typeof progress.setStage === 'function') {
        progress.setStage('uploading');
      }

      try {
        await uploadBinaryToTransfer(transfer.transfer_url, resource.file);
        await watcher.wait;
      } finally {
        watcher.close();
      }
    }

    return {
      modId,
      fetchModInfo,
      fetchProfile,
      searchProfiles,
      updateMod,
      updateTag,
      updateDependency,
      updateDependencyOptional,
      updateConflict,
      upsertAuthor,
      deleteAuthor,
      updateModpackMods,
      addResourceUrl,
      editResource,
      deleteResource,
      deleteMod,
      startVersionTransfer,
      startResourceTransfer,
      uploadBinaryToTransfer,
      uploadNewResourceFile,
    };
  });
})();

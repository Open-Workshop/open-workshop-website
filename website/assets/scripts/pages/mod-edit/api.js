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
    const resourceOwnerType = String(config.resourceOwnerType || 'mods');
    const apiPaths = config.apiPaths || window.OWCore.getApiPaths();

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
      const result = await requestEndpoint(apiPaths.mod.info, {
        pathParams: { mod_id: modId },
        query: { include: ['dates', 'authors', 'game', 'short_description', 'description', 'resources'] },
        parseAs: 'json',
        fallbackError: 'Не удалось получить информацию о моде',
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

      return requestEndpoint(apiPaths.mod.edit, {
        pathParams: { mod_id: modId },
        data: payload,
        parseAs: 'json',
        fallbackError: 'Не удалось сохранить изменения мода',
      });
    }

    async function updateTag(tagId, add) {
      const endpoint = add ? apiPaths.mod.tags_add : apiPaths.mod.tags_delete;
      return requestEndpoint(endpoint, {
        pathParams: { mod_id: modId, tag_id: tagId },
        parseAs: 'text',
        fallbackError: add ? 'Не удалось добавить тег' : 'Не удалось удалить тег',
      });
    }

    async function updateDependency(dependencyId, add) {
      const endpoint = add ? apiPaths.mod.dependencies_add : apiPaths.mod.dependencies_delete;
      return requestEndpoint(endpoint, {
        pathParams: { mod_id: modId, dependency_mod_id: dependencyId },
        parseAs: 'text',
        fallbackError: add ? 'Не удалось добавить зависимость' : 'Не удалось удалить зависимость',
      });
    }

    async function upsertAuthor(authorId, owner) {
      return requestEndpoint(apiPaths.mod.authors_upsert, {
        pathParams: { mod_id: modId, author_id: authorId },
        data: {
          owner: Boolean(owner),
        },
        parseAs: 'text',
        fallbackError: 'Не удалось обновить список авторов',
      });
    }

    async function deleteAuthor(authorId) {
      return requestEndpoint(apiPaths.mod.authors_delete, {
        pathParams: { mod_id: modId, author_id: authorId },
        parseAs: 'text',
        fallbackError: 'Не удалось удалить автора',
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
      return requestEndpoint(apiPaths.mod.delete, {
        pathParams: { mod_id: modId },
        parseAs: 'text',
        fallbackError: 'Не удалось удалить мод',
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

    async function uploadNewResourceFile(resource) {
      const sortOrder = Number(resource && resource.sortOrder !== undefined ? resource.sortOrder : 0);
      const transfer = await startResourceTransfer({
        kind: 'resource_image',
        owner_type: 'resource',
        resource_owner_type: resourceOwnerType,
        resource_owner_id: entityId,
        resource_type: resource.type,
        ...(Number.isFinite(sortOrder) ? { resource_sort_order: sortOrder } : {}),
      });
      await uploadBinaryToTransfer(transfer.transfer_url, resource.file);
    }

    return {
      modId,
      fetchModInfo,
      fetchProfile,
      searchProfiles,
      updateMod,
      updateTag,
      updateDependency,
      upsertAuthor,
      deleteAuthor,
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

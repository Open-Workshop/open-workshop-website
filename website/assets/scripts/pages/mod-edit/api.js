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
    const apiPaths = config.apiPaths || window.OWCore.getApiPaths();

    function formatEndpoint(endpoint, pathParams, query) {
      const path = window.OWCore.formatPath(endpoint.path, pathParams || {});
      const url = new URL(window.OWCore.apiUrl(path), window.location.origin);

      if (query instanceof URLSearchParams) {
        query.forEach(function (value, key) {
          url.searchParams.set(key, value);
        });
      } else if (query && typeof query === 'object') {
        Object.entries(query).forEach(function (entry) {
          const key = entry[0];
          const value = entry[1];
          if (value !== undefined && value !== null && value !== '') {
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
        query: { dates: 'true', authors: 'true' },
        parseAs: 'json',
        fallbackError: 'Не удалось получить информацию о моде',
      });

      return result.data;
    }

    async function fetchProfile(userId) {
      const result = await requestEndpoint(apiPaths.profile.info, {
        pathParams: { user_id: userId },
        query: { general: 'true' },
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

    async function updateMod(formData) {
      if (!(formData instanceof FormData) || Array.from(formData.keys()).length === 0) return null;

      return requestEndpoint(apiPaths.mod.edit, {
        pathParams: { mod_id: modId },
        data: formData,
        parseAs: 'text',
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
        pathParams: { mod_id: modId, dependencie_id: dependencyId },
        parseAs: 'text',
        fallbackError: add ? 'Не удалось добавить зависимость' : 'Не удалось удалить зависимость',
      });
    }

    async function updateAuthor(authorId, mode, owner) {
      const formData = new FormData();
      formData.append('mode', String(Boolean(mode)));
      formData.append('author', String(authorId));
      if (owner !== undefined) {
        formData.append('owner', String(Boolean(owner)));
      }

      return requestEndpoint(apiPaths.mod.authors, {
        pathParams: { mod_id: modId },
        data: formData,
        parseAs: 'text',
        fallbackError: 'Не удалось обновить список авторов',
      });
    }

    async function addResourceUrl(resource) {
      const formData = new FormData();
      formData.append('owner_type', 'mods');
      formData.append('resource_type', resource.type);
      formData.append('resource_owner_id', String(modId));
      formData.append('resource_url', resource.url);

      return requestEndpoint(apiPaths.resource.add, {
        data: formData,
        parseAs: 'text',
        fallbackError: 'Не удалось добавить изображение',
      });
    }

    async function editResource(resourceChange) {
      const formData = new FormData();
      if (resourceChange.type) {
        formData.append('resource_type', resourceChange.type);
      }
      if (resourceChange.url) {
        formData.append('resource_url', resourceChange.url);
      }

      return requestEndpoint(apiPaths.resource.edit, {
        pathParams: { resource_id: resourceChange.id },
        data: formData,
        parseAs: 'text',
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
      const response = await fetch(url, {
        method: endpoint.method,
        body: formData,
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json',
        },
      });

      if (response.ok) {
        const payload = await response.json().catch(function () { return {}; });
        if (payload && payload.transfer_url) {
          return payload;
        }
        throw new Error('Ответ менеджера некорректен');
      }

      if (response.status === 307 || response.status === 302) {
        const redirectUrl = response.headers.get('Location');
        if (!redirectUrl) {
          throw new Error('Redirect URL не получен');
        }
        return { transfer_url: redirectUrl };
      }

      const text = await response.text().catch(function () { return ''; });
      throw new Error(runtime.parseResponseMessage(text, fallbackError || `Ошибка (${response.status})`));
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
      const endpoint = resourceId ? apiPaths.resource.upload_init_edit : apiPaths.resource.upload_init;
      const pathParams = resourceId ? { resource_id: resourceId } : {};

      return startTransferRequest(
        endpoint,
        formData,
        pathParams,
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
      const transferData = new FormData();
      transferData.append('owner_type', 'mods');
      transferData.append('resource_type', resource.type);
      transferData.append('resource_owner_id', String(modId));

      const transfer = await startResourceTransfer(transferData);
      await uploadBinaryToTransfer(transfer.transfer_url, resource.file);
    }

    return {
      modId,
      fetchModInfo,
      fetchProfile,
      updateMod,
      updateTag,
      updateDependency,
      updateAuthor,
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

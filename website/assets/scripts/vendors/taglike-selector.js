/* eslint-env browser */

(function () {
  function resolveElement(target) {
    if (!target) return null;
    if (target instanceof Element) return target;
    if (target.jquery && target.length > 0) return target[0];
    if (typeof target === 'string') return document.querySelector(target);
    return null;
  }

  function showToast(title, text, theme = 'info') {
    if (typeof window.Toast !== 'function') return;

    new Toast({
      title,
      text,
      theme,
      autohide: true,
      interval: 5000,
    });
  }

  function normalizeName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function getNameKey(value) {
    return normalizeName(value).toLocaleLowerCase('ru-RU');
  }

  window.OWTaglikeSelector = {
    create(config) {
      const selectedRoot = resolveElement(config.selectedRoot);
      const searchRoot = resolveElement(config.searchRoot);
      const searchInput = resolveElement(config.searchInput);
      const showMoreCounter = resolveElement(config.showMoreCounter);

      if (!selectedRoot || !searchRoot || !searchInput) {
        return null;
      }

      const idAttribute = config.idAttribute || 'data-id';
      const selectedClass = config.selectedClass || 'selected';
      const savedAttribute = config.savedAttribute || 'saved';
      const pendingAttribute = config.pendingAttribute || 'data-pending-create';
      const pendingPrefix = config.pendingPrefix || 'pending-item';
      const searchEmptyText = config.searchEmptyText || 'Не найдено';

      let pendingCreateCounter = 0;
      let searchRequestCounter = 0;

      function getItemId(node) {
        return String(node.getAttribute(idAttribute) || '');
      }

      function getItemName(node) {
        if (typeof config.getItemName === 'function') {
          return normalizeName(config.getItemName(node));
        }

        if (node.dataset && node.dataset.taglikeName) {
          return normalizeName(node.dataset.taglikeName);
        }

        const title = node.querySelector('h3');
        return title ? normalizeName(title.textContent) : normalizeName(node.textContent);
      }

      function isSaved(node) {
        return node.hasAttribute(savedAttribute);
      }

      function isPending(node) {
        return node.getAttribute(pendingAttribute) === 'true';
      }

      function isVisible(node) {
        return !node.classList.contains('none-display');
      }

      function findById(rootNode, itemId) {
        return rootNode.querySelector('[' + idAttribute + '="' + itemId + '"]');
      }

      function findByName(rootNode, nameKey) {
        return Array.from(rootNode.querySelectorAll('[' + idAttribute + ']')).find(function (node) {
          return getNameKey(getItemName(node)) === nameKey;
        }) || null;
      }

      function isSelected(itemId) {
        const selectedNode = findById(selectedRoot, itemId);
        return Boolean(selectedNode && isVisible(selectedNode));
      }

      function triggerSelectionChange() {
        if (typeof config.onSelectionChange === 'function') {
          config.onSelectionChange();
        }
      }

      function updateShowMoreCount(databaseSize, resultsLength) {
        if (!showMoreCounter) return;

        const overflowCount = (Number.isFinite(Number(databaseSize)) ? Number(databaseSize) : resultsLength) - resultsLength;
        showMoreCounter.textContent = 'И ещё ' + overflowCount + ' шт...';
        if (overflowCount <= 0) {
          showMoreCounter.setAttribute('hidden', '');
        } else {
          showMoreCounter.removeAttribute('hidden');
        }
      }

      function resetSearchRoot() {
        const emptyState = searchRoot.querySelector('p');
        const detachedEmptyState = emptyState ? emptyState.cloneNode(true) : null;
        searchRoot.innerHTML = '';

        if (detachedEmptyState) {
          detachedEmptyState.textContent = searchEmptyText;
          searchRoot.appendChild(detachedEmptyState);
        }
      }

      function createItem(itemId, itemName, options = {}) {
        const element = config.createItemElement({
          id: String(itemId),
          name: normalizeName(itemName),
          saved: Boolean(options.saved),
          selected: Boolean(options.selected),
          pendingCreate: Boolean(options.pendingCreate),
          showRemoveIcon: options.showRemoveIcon !== false,
        });

        if (!element.hasAttribute(idAttribute)) {
          element.setAttribute(idAttribute, String(itemId));
        }

        if (!element.dataset.taglikeName) {
          element.dataset.taglikeName = normalizeName(itemName);
        }

        if (options.saved) {
          element.setAttribute(savedAttribute, '');
        }

        if (options.pendingCreate) {
          element.setAttribute(pendingAttribute, 'true');
        }

        if (options.selected) {
          element.classList.add(selectedClass);
        }

        element.addEventListener('click', function () {
          api.toggle(element);
        });

        return element;
      }

      function syncPendingToSearch(queryKey) {
        const existingIds = new Set(
          Array.from(searchRoot.querySelectorAll('[' + idAttribute + ']')).map(function (node) {
            return getItemId(node);
          }),
        );

        Array.from(selectedRoot.querySelectorAll('[' + pendingAttribute + '="true"]'))
          .filter(isVisible)
          .forEach(function (node) {
            const itemName = getItemName(node);
            if (queryKey !== '' && !getNameKey(itemName).includes(queryKey)) {
              return;
            }

            const itemId = getItemId(node);
            if (existingIds.has(itemId)) {
              const existingNode = findById(searchRoot, itemId);
              if (existingNode) {
                existingNode.classList.add(selectedClass);
              }
              return;
            }

            searchRoot.appendChild(
              createItem(itemId, itemName, {
                pendingCreate: true,
                selected: true,
                showRemoveIcon: false,
              }),
            );
          });
      }

      async function refresh() {
        const queryValue = normalizeName(searchInput.value);
        const queryKey = getNameKey(queryValue);
        const requestId = ++searchRequestCounter;

        if (showMoreCounter) {
          showMoreCounter.classList.add('hiden');
        }
        searchRoot.classList.add('hiden');

        try {
          const payload = await config.fetchSearchResults(queryValue);
          if (requestId !== searchRequestCounter) return;

          const results = Array.isArray(payload && payload.results) ? payload.results : [];
          const databaseSize = payload && payload.databaseSize;

          resetSearchRoot();

          results.forEach(function (item) {
            const itemId = String(item.id || '');
            searchRoot.appendChild(
              createItem(itemId, item.name, {
                selected: isSelected(itemId),
                showRemoveIcon: false,
              }),
            );
          });

          syncPendingToSearch(queryKey);
          updateShowMoreCount(databaseSize, results.length);
        } catch (error) {
          if (requestId !== searchRequestCounter) return;
          showToast('Ошибка', error.message || String(error), 'danger');
        } finally {
          if (requestId === searchRequestCounter) {
            if (showMoreCounter) {
              showMoreCounter.classList.remove('hiden');
            }
            searchRoot.classList.remove('hiden');
          }
        }
      }

      function toggle(node) {
        const target = resolveElement(node);
        if (!target) return;

        const itemId = getItemId(target);
        if (itemId === '') return;

        const targetName = getItemName(target);
        const selectedNode = findById(selectedRoot, itemId);
        const searchNode = findById(searchRoot, itemId);
        const alreadySelected = Boolean(selectedNode && isVisible(selectedNode));

        if (alreadySelected) {
          if (selectedNode && isSaved(selectedNode)) {
            selectedNode.classList.add('none-display');
          } else if (selectedNode) {
            selectedNode.remove();
          }
        } else if (selectedNode) {
          selectedNode.classList.remove('none-display');
        } else {
          selectedRoot.appendChild(
            createItem(itemId, targetName, {
              pendingCreate: isPending(target),
              showRemoveIcon: true,
            }),
          );
        }

        if (searchNode) {
          searchNode.classList.toggle(selectedClass, isSelected(itemId));
        }

        triggerSelectionChange();
      }

      function queueCreate() {
        const itemName = normalizeName(searchInput.value);
        const itemNameKey = getNameKey(itemName);

        if (itemName === '') {
          showToast('Пустое имя', config.emptyNameMessage || 'Введите название', 'info');
          return;
        }

        const selectedNode = findByName(selectedRoot, itemNameKey);
        if (selectedNode) {
          if (isVisible(selectedNode)) {
            showToast('Уже добавлено', config.duplicateMessage || 'Этот элемент уже выбран', 'info');
            return;
          }

          selectedNode.classList.remove('none-display');
          const searchNode = findById(searchRoot, getItemId(selectedNode));
          if (searchNode) {
            searchNode.classList.add(selectedClass);
          }
          triggerSelectionChange();
          return;
        }

        const searchNode = findByName(searchRoot, itemNameKey);
        if (searchNode) {
          if (!searchNode.classList.contains(selectedClass)) {
            api.toggle(searchNode);
          } else {
            showToast('Уже добавлено', config.duplicateMessage || 'Этот элемент уже выбран', 'info');
          }
          return;
        }

        pendingCreateCounter += 1;
        const pendingId = pendingPrefix + '-' + pendingCreateCounter;

        selectedRoot.appendChild(
          createItem(pendingId, itemName, {
            pendingCreate: true,
            showRemoveIcon: true,
          }),
        );

        searchRoot.appendChild(
          createItem(pendingId, itemName, {
            pendingCreate: true,
            selected: true,
            showRemoveIcon: false,
          }),
        );

        triggerSelectionChange();
      }

      function unselectAll() {
        Array.from(selectedRoot.querySelectorAll('[' + idAttribute + ']'))
          .filter(isVisible)
          .forEach(function (node) {
            api.toggle(node);
          });
      }

      async function setDefaultSelected(ids) {
        if (typeof config.fetchItemsByIds !== 'function' || !Array.isArray(ids) || ids.length === 0) {
          return;
        }

        const items = await config.fetchItemsByIds(ids);
        items.forEach(function (item) {
          const itemId = String(item.id || '');
          const existingNode = findById(selectedRoot, itemId);
          if (existingNode) {
            existingNode.classList.remove('none-display');
            existingNode.setAttribute(savedAttribute, '');
            return;
          }

          selectedRoot.appendChild(
            createItem(itemId, item.name, {
              saved: true,
              showRemoveIcon: true,
            }),
          );
        });

        triggerSelectionChange();
      }

      function finalizeCreated(tempId, realId) {
        document.querySelectorAll('[' + idAttribute + '="' + tempId + '"]').forEach(function (node) {
          node.setAttribute(idAttribute, String(realId));
          node.removeAttribute(pendingAttribute);
        });
      }

      function getState() {
        const allSelected = Array.from(selectedRoot.querySelectorAll('[' + idAttribute + ']'));

        function mapNode(node) {
          return {
            id: getItemId(node),
            name: getItemName(node),
          };
        }

        return {
          all: allSelected.map(mapNode),
          visible: allSelected.filter(isVisible).map(mapNode),
          savedAll: allSelected.filter(function (node) {
            return isSaved(node) && !isPending(node);
          }).map(mapNode),
          savedVisible: allSelected.filter(function (node) {
            return isSaved(node) && !isPending(node) && isVisible(node);
          }).map(mapNode),
          savedHidden: allSelected.filter(function (node) {
            return isSaved(node) && !isPending(node) && !isVisible(node);
          }).map(mapNode),
          unsavedVisible: allSelected.filter(function (node) {
            return !isSaved(node) && !isPending(node) && isVisible(node);
          }).map(mapNode),
          pendingVisible: allSelected.filter(function (node) {
            return isPending(node) && isVisible(node);
          }).map(mapNode),
        };
      }

      const api = {
        refresh,
        toggle,
        queueCreate,
        unselectAll,
        setDefaultSelected,
        finalizeCreated,
        getState,
      };

      return api;
    },
  };
})();

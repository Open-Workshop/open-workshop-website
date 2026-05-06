/* eslint-env browser */

(function () {
  const runtime = window.OWEditRuntime;
  if (!runtime) return;

  runtime.define('mod-edit-modpack-autodependencies', function createModpackAutoDependenciesManager(options) {
    const settings = options || {};
    const editorId = String(settings.modpackModsEditorId || 'modpack-mods-editor');
    const api = settings.api || null;
    const dependencyGraph = settings.dependencyGraph || null;
    const root = runtime.resolveElement(settings.root || '#' + editorId);

    let refreshToken = 0;
    let suppressRefresh = false;
    let bound = false;
    const AUTO_DEPENDENCIES_CHANGE_EVENT = 'ow:modpack-autodependencies-change';

    function getEditor() {
      return window.OWPickerEditors ? window.OWPickerEditors.get(editorId) : null;
    }

    function getEditorRoot() {
      const editor = getEditor();
      if (editor && editor.root instanceof Element) {
        return editor.root;
      }
      return root instanceof Element ? root : null;
    }

    function getSelectedNodes(includeHidden = true) {
      const editorRoot = getEditorRoot();
      if (!editorRoot) return [];

      return Array.from(editorRoot.querySelectorAll('[data-picker-slot="selected"] [data-picker-id]')).filter(function (node) {
        return includeHidden || !node.classList.contains('is-hidden');
      });
    }

    function getNodeId(node) {
      if (!(node instanceof Element)) return '';
      return String(node.dataset.pickerId || '').trim();
    }

    function normalizeIdList(values) {
      const normalizedIds = [];
      const seenIds = new Set();

      (Array.isArray(values) ? values : []).forEach(function (value) {
        const normalizedId = Number(value);
        if (!Number.isFinite(normalizedId) || normalizedId <= 0 || seenIds.has(normalizedId)) {
          return;
        }

        seenIds.add(normalizedId);
        normalizedIds.push(normalizedId);
      });

      return normalizedIds;
    }

    function isVisible(node) {
      return node instanceof Element && !node.classList.contains('is-hidden');
    }

    function isAutoAdded(node) {
      if (!(node instanceof Element)) return false;
      return String(node.dataset.pickerAutoAdded || 'false') === 'true';
    }

    function isManuallyRemoved(node) {
      if (!(node instanceof Element)) return false;
      return String(node.dataset.pickerManualRemoved || 'false') === 'true';
    }

    function isGhost(node) {
      return node instanceof Element && String(node.dataset.pickerGhost || 'false') === 'true';
    }

    function getAutoBadge(node) {
      if (!(node instanceof Element)) return null;
      return node.querySelector('[data-modpack-auto-badge="true"]');
    }

    function createAutoBadge() {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tag-link-yellow modpack-auto-badge';
      button.setAttribute('data-action', 'modpack-auto-added-toggle');
      button.setAttribute('data-modpack-auto-badge', 'true');
      button.setAttribute('title', 'Убрать автозависимость');
      button.setAttribute('aria-label', 'Убрать автозависимость');

      const label = document.createElement('span');
      label.className = 'modpack-auto-badge__label';
      label.textContent = 'Автозависимость';

      const remove = document.createElement('span');
      remove.className = 'modpack-auto-badge__remove';
      remove.setAttribute('aria-hidden', 'true');
      remove.textContent = '×';

      button.appendChild(label);
      button.appendChild(remove);
      return button;
    }

    function findResultNodeById(itemId) {
      const editorRoot = getEditorRoot();
      if (!editorRoot) return null;
      const normalizedId = String(itemId || '').trim();
      if (!normalizedId) return null;

      return editorRoot.querySelector('[data-picker-slot="results"] [data-picker-id="' + normalizedId.replaceAll('"', '\\"') + '"]');
    }

    function syncResultSelection(itemId) {
      const resultNode = findResultNodeById(itemId);
      if (!(resultNode instanceof Element)) return;

      const selectedNode = findNodeById(itemId);
      resultNode.classList.toggle('is-selected', Boolean(selectedNode && isVisible(selectedNode)));
    }

    function syncAutoBadgeState(node, autoAdded) {
      if (!(node instanceof Element)) return false;

      const isAuto = Boolean(autoAdded);
      node.dataset.pickerAutoAdded = isAuto ? 'true' : 'false';
      node.classList.toggle('is-auto-added', isAuto);

      const existingBadge = getAutoBadge(node);
      if (!isAuto) {
        if (existingBadge) {
          existingBadge.remove();
        }
        return false;
      }

      if (existingBadge) {
        existingBadge.setAttribute('title', 'Убрать автозависимость');
        existingBadge.setAttribute('aria-label', 'Убрать автозависимость');
        return true;
      }

      const itemHeaderMain = node.querySelector('.picker-editor__item-title--row');
      const badge = createAutoBadge();
      if (itemHeaderMain) {
        itemHeaderMain.appendChild(badge);
      } else {
        node.appendChild(badge);
      }
      return true;
    }

    function removeAutoNode(node) {
      if (!(node instanceof Element)) return false;

      const itemId = getNodeId(node);
      if (!itemId) return false;

      if (isGhost(node)) {
        node.remove();
        syncResultSelection(itemId);
        return true;
      }

      if (isVisible(node)) {
        if (String(node.dataset.pickerSaved || 'false') === 'true') {
          node.classList.add('is-hidden');
        } else {
          node.remove();
        }
        syncResultSelection(itemId);
        return true;
      }

      return false;
    }

    function ensureExistingBadges() {
      getSelectedNodes(true).forEach(function (node) {
        syncAutoBadgeState(node, isAutoAdded(node));
      });
    }

    function findNodeById(itemId) {
      const editorRoot = getEditorRoot();
      if (!editorRoot) return null;
      const normalizedId = String(itemId || '').trim();
      if (!normalizedId) return null;

      return editorRoot.querySelector('[data-picker-slot="selected"] [data-picker-id="' + normalizedId.replaceAll('"', '\\"') + '"]');
    }

    function getDependencyGraphModel() {
      if (!dependencyGraph || typeof dependencyGraph.getModel !== 'function') {
        return null;
      }

      return dependencyGraph.getModel();
    }

    function getManualIds() {
      return Array.from(new Set(
        getSelectedNodes(false)
          .filter(function (node) {
            return !isAutoAdded(node);
          })
          .map(getNodeId)
          .filter(Boolean),
      ));
    }

    function getBlockedAutoIds() {
      return new Set(
        getSelectedNodes(true)
          .filter(isManuallyRemoved)
          .map(getNodeId)
          .filter(Boolean),
      );
    }

    function filterBlockedAutoIds(desiredAutoIds) {
      if (!(desiredAutoIds instanceof Set)) {
        return desiredAutoIds;
      }

      const blockedAutoIds = getBlockedAutoIds();
      if (blockedAutoIds.size === 0) {
        return desiredAutoIds;
      }

      return new Set(Array.from(desiredAutoIds).filter(function (id) {
        return !blockedAutoIds.has(String(id));
      }));
    }

    function collectDesiredAutoIdsFromModel(manualIds) {
      const model = getDependencyGraphModel();
      if (!model || !(model.outgoingAdjacency instanceof Map)) {
        return null;
      }

      const desiredAutoIds = new Set();
      const visitedIds = new Set(normalizeIdList(manualIds));
      const queue = Array.from(visitedIds);

      while (queue.length > 0) {
        const sourceId = queue.shift();
        const targetIds = model.outgoingAdjacency.get(sourceId);
        if (!(targetIds instanceof Set)) {
          continue;
        }

        targetIds.forEach(function (targetId) {
          if (visitedIds.has(targetId)) {
            return;
          }

          visitedIds.add(targetId);
          desiredAutoIds.add(String(targetId));
          queue.push(targetId);
        });
      }

      return filterBlockedAutoIds(desiredAutoIds);
    }

    async function addMissingAutoDependencies(autoIds) {
      const editor = getEditor();
      if (!editor || autoIds.length === 0) return;

      suppressRefresh = true;
      try {
        await editor.setDefaultSelected(autoIds);
        autoIds.forEach(function (id) {
          const node = findNodeById(id);
          if (node) {
            node.classList.remove('is-hidden');
            syncAutoBadgeState(node, true);
          }
        });
      } finally {
        suppressRefresh = false;
      }
    }

    async function applyDesiredAutoDependencies(desiredAutoIds, options) {
      const editor = getEditor();
      const editorRoot = getEditorRoot();
      if (!editor || !editorRoot || !(desiredAutoIds instanceof Set)) {
        return;
      }

      const allowMissingFetch = !options || options.allowMissingFetch !== false;
      const blockedAutoIds = getBlockedAutoIds();

      suppressRefresh = true;
      try {
        const allSelectedNodes = getSelectedNodes(true);
        const selectedIds = new Set(allSelectedNodes.map(getNodeId).filter(Boolean));

        allSelectedNodes.forEach(function (node) {
          const nodeId = getNodeId(node);
          if (!nodeId) return;

          const visible = !node.classList.contains('is-hidden');
          const auto = isAutoAdded(node);
          const shouldBeAuto = desiredAutoIds.has(nodeId) && !blockedAutoIds.has(nodeId);

          if (shouldBeAuto) {
            if (!visible) {
              node.classList.remove('is-hidden');
            }

            syncAutoBadgeState(node, true);
            syncResultSelection(nodeId);
            return;
          }

          if (auto) {
            removeAutoNode(node);
          }
        });

        const missingIds = Array.from(desiredAutoIds).filter(function (id) {
          return !selectedIds.has(id) && !blockedAutoIds.has(String(id));
        });
        if (allowMissingFetch && missingIds.length > 0) {
          await addMissingAutoDependencies(missingIds);
        }

        desiredAutoIds.forEach(function (id) {
          if (blockedAutoIds.has(String(id))) {
            return;
          }

          const node = findNodeById(id);
          if (node) {
            node.classList.remove('is-hidden');
            syncAutoBadgeState(node, true);
            syncResultSelection(id);
          }
        });
      } finally {
        suppressRefresh = false;
      }
    }

    async function refreshAutoDependencies() {
      if (suppressRefresh) return;

      const editor = getEditor();
      const editorRoot = getEditorRoot();
      if (!editor || !editorRoot || typeof api.buildMissingDependencies !== 'function') {
        ensureExistingBadges();
        return;
      }

      const manualIds = getManualIds();

      const requestId = ++refreshToken;
      editorRoot.dataset.modpackAutoDependenciesUpdating = 'true';
      try {
        let buildResult;
        try {
          buildResult = manualIds.length === 0
            ? { nodes: [] }
            : await api.buildMissingDependencies(manualIds);
        } catch (error) {
          buildResult = null;
        }

        if (requestId !== refreshToken) return;

        if (buildResult) {
          const desiredAutoIds = new Set(
            Array.isArray(buildResult && buildResult.nodes)
              ? buildResult.nodes
                .filter(function (node) {
                  return node && node.selected === false && node.mod_id !== undefined && node.mod_id !== null;
                })
                .map(function (node) {
                  return String(node.mod_id).trim();
                })
                .filter(Boolean)
              : [],
          );

          await applyDesiredAutoDependencies(filterBlockedAutoIds(desiredAutoIds), { allowMissingFetch: true });
        }
      } finally {
        if (requestId === refreshToken) {
          delete editorRoot.dataset.modpackAutoDependenciesUpdating;
          editorRoot.dispatchEvent(new CustomEvent(AUTO_DEPENDENCIES_CHANGE_EVENT, {
            bubbles: true,
            detail: {
              editor: editor,
              key: editorId,
            }
          }));
        }
      }
    }

    async function refreshAutoDependenciesFromModel() {
      const editor = getEditor();
      const editorRoot = getEditorRoot();
      if (!editor || !editorRoot) {
        return;
      }

      const manualIds = getManualIds();
      const desiredAutoIds = collectDesiredAutoIdsFromModel(manualIds);
      if (!(desiredAutoIds instanceof Set)) {
        return;
      }

      await applyDesiredAutoDependencies(desiredAutoIds, { allowMissingFetch: false });

      editorRoot.dispatchEvent(new CustomEvent(AUTO_DEPENDENCIES_CHANGE_EVENT, {
        bubbles: true,
        detail: {
          editor: editor,
          key: editorId,
          source: 'model',
        },
      }));
    }

    function handleSelectionChange(event) {
      if (!event || !event.detail || event.detail.key !== editorId || suppressRefresh) {
        return;
      }

      if (event.detail.materializedGhost || event.detail.dematerializedGhost) {
        return;
      }

      refreshAutoDependencies().catch(function () {
        // Keep the editor usable even if dependency sync fails.
      });
    }

    function handleAutoBadgeToggle(event) {
      const target = event.target instanceof Element ? event.target.closest('[data-action="modpack-auto-added-toggle"]') : null;
      if (!target || !root || !root.contains(target)) return;

      const item = target.closest('[data-picker-id]');
      if (!(item instanceof Element)) return;

      event.preventDefault();
      event.stopPropagation();

      suppressRefresh = true;
      try {
        syncAutoBadgeState(item, false);
      } finally {
        suppressRefresh = false;
      }

      refreshAutoDependencies().catch(function () {
        // Badge removal should still leave the list usable.
      });
    }

    function bind() {
      const editorRoot = getEditorRoot();
      if (!editorRoot || bound) return;

      bound = true;
      editorRoot.addEventListener('click', handleAutoBadgeToggle, true);
      editorRoot.addEventListener('ow:picker-selection-change', handleSelectionChange);
      ensureExistingBadges();
    }

    return {
      bind,
      refresh: refreshAutoDependencies,
      syncAutoBadgeState,
      ensureExistingBadges,
    };
  });
})();

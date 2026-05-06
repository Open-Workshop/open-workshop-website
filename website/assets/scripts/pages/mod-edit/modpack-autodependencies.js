/* eslint-env browser */

(function () {
  const runtime = window.OWEditRuntime;
  if (!runtime) return;

  runtime.define('mod-edit-modpack-autodependencies', function createModpackAutoDependenciesManager(options) {
    const settings = options || {};
    const editorId = String(settings.modpackModsEditorId || 'modpack-mods-editor');
    const api = settings.api || null;
    const root = runtime.resolveElement(settings.root || '#' + editorId);

    let refreshToken = 0;
    let suppressRefresh = false;
    let bound = false;

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

    function isAutoAdded(node) {
      if (!(node instanceof Element)) return false;
      return String(node.dataset.pickerAutoAdded || 'false') === 'true';
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
      let buildResult;
      try {
        buildResult = manualIds.length === 0
          ? { nodes: [] }
          : await api.buildMissingDependencies(manualIds);
      } catch (error) {
        return;
      }

      if (requestId !== refreshToken) return;

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

      suppressRefresh = true;
      try {
        const allSelectedNodes = getSelectedNodes(true);
        const selectedIds = new Set(allSelectedNodes.map(getNodeId).filter(Boolean));

        allSelectedNodes.forEach(function (node) {
          const nodeId = getNodeId(node);
          if (!nodeId) return;

          const visible = !node.classList.contains('is-hidden');
          const auto = isAutoAdded(node);
          const shouldBeAuto = desiredAutoIds.has(nodeId);

          if (shouldBeAuto) {
            if (!visible) {
              node.classList.remove('is-hidden');
            }

            syncAutoBadgeState(node, true);
            return;
          }

          if (auto && visible) {
            editor.toggle(node);
          }
        });

        const missingIds = Array.from(desiredAutoIds).filter(function (id) {
          return !selectedIds.has(id);
        });
        if (missingIds.length > 0) {
          await addMissingAutoDependencies(missingIds);
        }

        desiredAutoIds.forEach(function (id) {
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
    }

    function bind() {
      const editorRoot = getEditorRoot();
      if (!editorRoot || bound) return;

      bound = true;
      editorRoot.addEventListener('click', handleAutoBadgeToggle, true);
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

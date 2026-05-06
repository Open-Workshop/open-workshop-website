/* eslint-env browser */

(function () {
  const runtime = window.OWEditRuntime;
  if (!runtime) return;

  runtime.define('mod-edit-modpack-dependency-graph', function createModpackDependencyGraph(options) {
    const settings = options || {};
    const api = settings.api || null;
    const editorId = String(settings.editorId || settings.modpackModsEditorId || 'modpack-mods-editor');
    const editorRoot = runtime.resolveElement(settings.editorRoot || '#' + editorId);
    const graphRoot = runtime.resolveElement(
      settings.root ||
      settings.graphRoot ||
      '[data-modpack-dependency-graph-root][data-modpack-dependency-graph-editor="' + editorId + '"]',
    );

    const MAX_GRAPH_NODES = 120;
    const AUTO_DEPENDENCIES_CHANGE_EVENT = 'ow:modpack-autodependencies-change';
    const KIND_PRIORITY = {
      selected: 0,
      required: 1,
      optional: 2,
    };

    const dependencyCache = new Map();
    const modMetaCache = new Map();
    const imageFallback = window.OWCore.getImageFallback();

    let bound = false;
    let refreshToken = 0;
    let lastModel = null;
    let hoveredNodeId = 0;
    let resizeObserver = null;
    let resizeListener = null;
    let hoverSelectedList = null;
    let hoverPointerOverListener = null;
    let hoverPointerLeaveListener = null;

    function normalizeId(value) {
      const normalized = Number(value);
      return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
    }

    function normalizeIdList(values) {
      const normalizedIds = [];
      const seenIds = new Set();

      (Array.isArray(values) ? values : []).forEach(function (value) {
        const normalizedId = normalizeId(value);
        if (!normalizedId || seenIds.has(normalizedId)) {
          return;
        }

        seenIds.add(normalizedId);
        normalizedIds.push(normalizedId);
      });

      return normalizedIds;
    }

    function getEditor() {
      return window.OWPickerEditors ? window.OWPickerEditors.get(editorId) : null;
    }

    function getSelectedList() {
      return editorRoot instanceof Element
        ? editorRoot.querySelector('[data-picker-slot="selected"]')
        : null;
    }

    function getShell() {
      return editorRoot instanceof Element
        ? editorRoot.querySelector('.picker-editor__shell')
        : null;
    }

    function getSelectedItems() {
      const selectedList = getSelectedList();
      return selectedList instanceof Element
        ? Array.from(selectedList.querySelectorAll('[data-picker-id]:not(.is-hidden)'))
        : [];
    }

    function isGhostItem(node) {
      return node instanceof Element && String(node.dataset.pickerGhost || 'false') === 'true';
    }

    function getSelectedIds() {
      return normalizeIdList(
        getSelectedItems().filter(function (node) {
          return !isGhostItem(node);
        }).map(function (node) {
          return node.dataset.pickerId;
        }),
      );
    }

    function getEdgesRoot() {
      return graphRoot instanceof Element
        ? graphRoot.querySelector('[data-modpack-dependency-graph-edges]')
        : null;
    }

    function getEmptyNode() {
      return graphRoot instanceof Element
        ? graphRoot.querySelector('[data-modpack-dependency-graph-empty]')
        : null;
    }

    function getHoverRoot() {
      return editorRoot instanceof Element ? editorRoot : null;
    }

    function setGraphVisibility(visible) {
      const isVisible = Boolean(visible);

      if (editorRoot instanceof Element) {
        editorRoot.dataset.modpackDependencyGraphVisible = isVisible ? 'true' : 'false';
      }

      if (graphRoot instanceof Element) {
        graphRoot.hidden = !isVisible;
      }
    }

    function setStatus(message, kind) {
      if (!(graphRoot instanceof Element)) return;

      const emptyNode = getEmptyNode();
      if (emptyNode) {
        emptyNode.textContent = String(message || '');
        emptyNode.hidden = !message;
      }

      graphRoot.dataset.graphState = kind || 'empty';
      graphRoot.setAttribute('aria-busy', kind === 'loading' ? 'true' : 'false');
    }

    function clearSvg(edgesRoot) {
      Array.from(edgesRoot.childNodes).forEach(function (node) {
        if (!(node instanceof Element) || node.tagName.toLowerCase() !== 'defs') {
          node.remove();
        }
      });
    }

    function clearGraph() {
      const selectedList = getSelectedList();
      const edgesRoot = getEdgesRoot();
      lastModel = null;
      hoveredNodeId = 0;

      if (graphRoot) {
        delete graphRoot.dataset.graphNotice;
      }

      if (selectedList instanceof Element) {
        selectedList.querySelectorAll('[data-picker-ghost="true"]').forEach(function (node) {
          node.remove();
        });
      }

      if (edgesRoot) {
        clearSvg(edgesRoot);
      }

      syncHoverFocus();
    }

    function insertGhostItem(listNode, element) {
      if (!(listNode instanceof Element) || !(element instanceof Element)) {
        return;
      }

      const emptyNode = listNode.querySelector('.picker-editor__empty');
      if (emptyNode) {
        listNode.insertBefore(element, emptyNode);
      } else {
        listNode.appendChild(element);
      }
    }

    function normalizeNodeKind(currentKind, nextKind) {
      const currentPriority = KIND_PRIORITY[currentKind] !== undefined ? KIND_PRIORITY[currentKind] : 99;
      const nextPriority = KIND_PRIORITY[nextKind] !== undefined ? KIND_PRIORITY[nextKind] : 99;

      return nextPriority < currentPriority ? nextKind : currentKind || nextKind || 'optional';
    }

    function upsertNode(nodesById, nodeId, patch) {
      const normalizedId = normalizeId(nodeId);
      if (!normalizedId) return null;

      const existing = nodesById.get(normalizedId) || {
        id: normalizedId,
        name: '',
        img: '',
        kind: 'optional',
        selected: false,
      };

      const next = {
        ...existing,
        ...(patch || {}),
        id: normalizedId,
      };

      next.selected = Boolean(existing.selected || (patch && patch.selected));
      next.kind = normalizeNodeKind(existing.kind, patch && patch.kind);

      if (!next.name) {
        next.name = existing.name || '';
      }

      if (!next.img) {
        next.img = existing.img || window.OWCore.getImageFallback();
      }

      nodesById.set(normalizedId, next);
      return next;
    }

    function buildDirectAdjacency(edges) {
      const outgoing = new Map();
      const incoming = new Map();

      (Array.isArray(edges) ? edges : []).forEach(function (edge) {
        const sourceId = normalizeId(edge && edge.sourceId);
        const targetId = normalizeId(edge && edge.targetId);
        if (!sourceId || !targetId) {
          return;
        }

        if (!outgoing.has(sourceId)) {
          outgoing.set(sourceId, new Set());
        }

        if (!incoming.has(targetId)) {
          incoming.set(targetId, new Set());
        }

        outgoing.get(sourceId).add(targetId);
        incoming.get(targetId).add(sourceId);
      });

      return {
        outgoingAdjacency: outgoing,
        incomingAdjacency: incoming,
      };
    }

    function getRelatedNodeIds(nodeId) {
      const normalizedId = normalizeId(nodeId);
      if (!normalizedId || !lastModel) {
        return new Set();
      }

      const related = new Set([normalizedId]);

      const outgoing = lastModel.outgoingAdjacency instanceof Map ? lastModel.outgoingAdjacency : new Map();
      const incoming = lastModel.incomingAdjacency instanceof Map ? lastModel.incomingAdjacency : new Map();

      const directOutgoing = outgoing.get(normalizedId);
      const directIncoming = incoming.get(normalizedId);

      if (directOutgoing) {
        directOutgoing.forEach(function (neighborId) {
          related.add(neighborId);
        });
      }

      if (directIncoming) {
        directIncoming.forEach(function (neighborId) {
          related.add(neighborId);
        });
      }

      return related;
    }

    function syncHoverFocus() {
      const hoverRoot = getHoverRoot();
      const selectedList = getSelectedList();
      const edgesRoot = getEdgesRoot();
      const relatedNodeIds = hoveredNodeId > 0 ? getRelatedNodeIds(hoveredNodeId) : new Set();
      const hasHover = relatedNodeIds.size > 0;

      if (hoverRoot) {
        if (hasHover) {
          hoverRoot.dataset.modpackDependencyGraphHovered = 'true';
        } else {
          delete hoverRoot.dataset.modpackDependencyGraphHovered;
        }
      }

      if (selectedList instanceof Element) {
        selectedList.querySelectorAll('[data-picker-id]:not(.is-hidden)').forEach(function (node) {
          const itemId = normalizeId(node.dataset.pickerId);
          node.classList.toggle('modpack-dependency-graph__hover-related', hasHover && itemId > 0 && relatedNodeIds.has(itemId));
        });
      }

      if (edgesRoot instanceof Element) {
        edgesRoot.querySelectorAll('.modpack-dependency-graph__edge').forEach(function (edgeNode) {
          const sourceId = normalizeId(edgeNode.dataset.edgeSourceId);
          const targetId = normalizeId(edgeNode.dataset.edgeTargetId);
          const related = hasHover && sourceId > 0 && targetId > 0
            && relatedNodeIds.has(sourceId)
            && relatedNodeIds.has(targetId);
          edgeNode.classList.toggle('modpack-dependency-graph__hover-related', related);
        });
      }
    }

    function setHoverNode(nodeId) {
      const normalizedId = normalizeId(nodeId);
      if (normalizedId === hoveredNodeId) {
        return;
      }

      hoveredNodeId = normalizedId;
      syncHoverFocus();
    }

    function clearHoverNode() {
      if (hoveredNodeId === 0) {
        return;
      }

      hoveredNodeId = 0;
      syncHoverFocus();
    }

    function findHoverTarget(event) {
      if (!(event && event.target instanceof Element)) {
        return null;
      }

      const selectedList = getSelectedList();
      if (!(selectedList instanceof Element)) {
        return null;
      }

      const target = event.target.closest('[data-picker-slot="selected"] [data-picker-id]');
      if (!(target instanceof Element) || !selectedList.contains(target)) {
        return null;
      }

      return target;
    }

    function addEdge(edgesByKey, sourceId, targetId, optional, required, fromBuild) {
      const normalizedSourceId = normalizeId(sourceId);
      const normalizedTargetId = normalizeId(targetId);
      if (!normalizedSourceId || !normalizedTargetId || normalizedSourceId === normalizedTargetId) {
        return null;
      }

      const key = normalizedSourceId + '->' + normalizedTargetId;
      const existing = edgesByKey.get(key) || {
        sourceId: normalizedSourceId,
        targetId: normalizedTargetId,
        optional: true,
        required: false,
        fromBuild: false,
      };

      existing.optional = Boolean(existing.optional && optional);
      existing.required = Boolean(existing.required || required || fromBuild);
      existing.fromBuild = Boolean(existing.fromBuild || fromBuild);
      edgesByKey.set(key, existing);
      return existing;
    }

    function getDependencyPromise(modId) {
      const normalizedId = normalizeId(modId);
      if (!normalizedId) {
        return Promise.resolve([]);
      }

      const cacheKey = String(normalizedId);
      if (!dependencyCache.has(cacheKey)) {
        dependencyCache.set(
          cacheKey,
          Promise.resolve()
            .then(function () {
              return api && typeof api.fetchModDependencies === 'function'
                ? api.fetchModDependencies(normalizedId)
                : [];
            })
            .catch(function (error) {
              dependencyCache.delete(cacheKey);
              throw error;
            }),
        );
      }

      return dependencyCache.get(cacheKey);
    }

    async function loadModMeta(ids) {
      const normalizedIds = normalizeIdList(ids);
      if (normalizedIds.length === 0 || !api || typeof api.fetchModsByIds !== 'function') {
        return;
      }

      const missingIds = normalizedIds.filter(function (id) {
        const cached = modMetaCache.get(String(id));
        return !cached || !cached.name || !cached.img || cached.img === imageFallback;
      });

      if (missingIds.length === 0) {
        return;
      }

      const items = await api.fetchModsByIds(missingIds);
      if (!Array.isArray(items)) {
        return;
      }

      items.forEach(function (item) {
        const itemId = normalizeId(item && item.id);
        if (!itemId) return;

        const existing = modMetaCache.get(String(itemId)) || {
          id: itemId,
          name: '',
          img: '',
        };

        modMetaCache.set(String(itemId), {
          ...existing,
          id: itemId,
          name: String(item && item.name ? item.name : existing.name || ''),
          img: String(item && item.img ? item.img : existing.img || imageFallback),
        });
      });
    }

    function getNodeMeta(node) {
      const cached = modMetaCache.get(String(node.id));
      return {
        ...node,
        name: node.name || (cached && cached.name) || 'Мод #' + node.id,
        img: node.img || (cached && cached.img) || imageFallback,
      };
    }

    function getNodeLevelMap(nodesById, edgesByKey, selectedIds) {
      const levels = new Map();
      const adjacency = new Map();

      edgesByKey.forEach(function (edge) {
        if (!adjacency.has(edge.sourceId)) {
          adjacency.set(edge.sourceId, []);
        }
        adjacency.get(edge.sourceId).push(edge.targetId);
      });

      const queue = [];
      normalizeIdList(selectedIds).forEach(function (id) {
        if (!nodesById.has(id) || levels.has(id)) {
          return;
        }

        levels.set(id, 0);
        queue.push(id);
      });

      while (queue.length > 0) {
        const sourceId = queue.shift();
        const sourceLevel = levels.get(sourceId) || 0;
        const targetLevel = sourceLevel + 1;
        const targets = adjacency.get(sourceId) || [];

        targets.forEach(function (targetId) {
          if (!nodesById.has(targetId)) {
            return;
          }

          const currentLevel = levels.get(targetId);
          if (currentLevel === undefined || targetLevel < currentLevel) {
            levels.set(targetId, targetLevel);
            queue.push(targetId);
          }
        });
      }

      nodesById.forEach(function (node, id) {
        if (!levels.has(id)) {
          levels.set(id, node.selected ? 0 : 1);
        }
      });

      return levels;
    }

    function createNodeElement(node) {
      const itemImageAlt = editorRoot instanceof Element
        ? String(editorRoot.dataset.pickerItemImageAlt || 'Логотип мода')
        : 'Логотип мода';
      const itemRemoveActionAlt = editorRoot instanceof Element
        ? String(editorRoot.dataset.pickerRemoveActionAlt || 'Убрать мод')
        : 'Убрать мод';
      const showViewLink = editorRoot instanceof Element && String(editorRoot.dataset.pickerShowViewLink || 'false') === 'true';

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

      const element = document.createElement('div');
      element.className = 'picker-editor__item picker-editor__item--row modpack-dependency-graph__ghost-item';
      element.dataset.pickerId = String(node.id);
      element.dataset.pickerName = String(node.name || '');
      element.dataset.pickerSlot = 'selected';
      element.dataset.pickerGhost = 'true';
      element.dataset.pickerGhostOrigin = 'true';
      element.dataset.pickerAutoAdded = 'true';
      element.dataset.pickerSaved = 'true';
      element.dataset.pickerPending = 'false';
      element.classList.add('is-auto-added');

      const image = document.createElement('img');
      image.className = 'picker-editor__item-media';
      image.src = node.img || window.OWCore.getImageFallback();
      image.alt = itemImageAlt;
      image.setAttribute('errorcap', '');

      const content = document.createElement('div');
      content.className = 'picker-editor__item-content';

      const header = document.createElement('div');
      header.className = 'picker-editor__item-header';

      const title = document.createElement('h3');
      title.className = 'picker-editor__item-title picker-editor__item-title--row';
      title.setAttribute('translate', 'no');
      const titleText = document.createElement('span');
      titleText.className = 'picker-editor__item-title-text';
      titleText.textContent = node.name || ('Мод #' + node.id);
      title.appendChild(titleText);
      title.appendChild(createAutoBadge());

      const actions = document.createElement('div');
      actions.className = 'picker-editor__item-actions picker-editor__item-actions--header';

      const removeIcon = document.createElement('img');
      removeIcon.className = 'picker-editor__item-action';
      removeIcon.src = '/assets/images/removal-triangle.svg';
      removeIcon.alt = itemRemoveActionAlt;
      actions.appendChild(removeIcon);

      if (showViewLink) {
        const viewLink = document.createElement('a');
        viewLink.className = 'modpack-mods-edit__view-link';
        viewLink.href = '/mod/' + encodeURIComponent(String(node.id));
        viewLink.target = '_blank';
        viewLink.rel = 'noopener noreferrer';
        viewLink.title = 'Открыть страницу мода';
        viewLink.setAttribute('aria-label', 'Открыть страницу мода');
        viewLink.setAttribute('data-picker-ignore-toggle', 'true');

        const viewIcon = document.createElement('img');
        viewIcon.src = '/assets/images/svg/white/eye.svg';
        viewIcon.alt = '';
        viewIcon.setAttribute('aria-hidden', 'true');
        viewLink.appendChild(viewIcon);
        actions.appendChild(viewLink);
      }

      header.appendChild(title);
      header.appendChild(actions);
      content.appendChild(header);

      element.appendChild(image);
      element.appendChild(content);
      return element;
    }

    function ensureGraphFrame() {
      const edgesRoot = getEdgesRoot();
      if (!(edgesRoot instanceof Element)) {
        return;
      }

      if (!edgesRoot.querySelector('defs')) {
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

        const requiredMarker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        requiredMarker.setAttribute('id', 'modpack-dependency-arrow-required');
        requiredMarker.setAttribute('markerWidth', '10');
        requiredMarker.setAttribute('markerHeight', '10');
        requiredMarker.setAttribute('refX', '8');
        requiredMarker.setAttribute('refY', '5');
        requiredMarker.setAttribute('orient', 'auto');
        requiredMarker.setAttribute('markerUnits', 'strokeWidth');
        const requiredPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        requiredPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
        requiredPath.setAttribute('fill', '#8cd29c');
        requiredMarker.appendChild(requiredPath);
        defs.appendChild(requiredMarker);

        const optionalMarker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        optionalMarker.setAttribute('id', 'modpack-dependency-arrow-optional');
        optionalMarker.setAttribute('markerWidth', '10');
        optionalMarker.setAttribute('markerHeight', '10');
        optionalMarker.setAttribute('refX', '8');
        optionalMarker.setAttribute('refY', '5');
        optionalMarker.setAttribute('orient', 'auto');
        optionalMarker.setAttribute('markerUnits', 'strokeWidth');
        const optionalPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        optionalPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
        optionalPath.setAttribute('fill', '#d8c16a');
        optionalMarker.appendChild(optionalPath);
        defs.appendChild(optionalMarker);

        edgesRoot.appendChild(defs);
      }
    }

    function drawEdges(model) {
      if (!model || !graphRoot) {
        return;
      }

      const edgesRoot = getEdgesRoot();
      if (!(edgesRoot instanceof Element)) {
        return;
      }

      ensureGraphFrame();
      clearSvg(edgesRoot);

      const graphRect = graphRoot.getBoundingClientRect();
      const width = Math.max(1, Math.ceil(graphRect.width || 0));
      const height = Math.max(1, Math.ceil(graphRect.height || 0));

      edgesRoot.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      edgesRoot.setAttribute('preserveAspectRatio', 'none');
      edgesRoot.setAttribute('width', '100%');
      edgesRoot.setAttribute('height', '100%');

      const nodeElements = new Map();

      getSelectedItems().forEach(function (nodeElement) {
        const modId = normalizeId(nodeElement.dataset.pickerId);
        if (modId) {
          nodeElements.set(modId, nodeElement);
        }
      });

      model.edges.forEach(function (edge) {
        const sourceElement = nodeElements.get(edge.sourceId);
        const targetElement = nodeElements.get(edge.targetId);
        if (!(sourceElement instanceof Element) || !(targetElement instanceof Element)) {
          return;
        }

        const sourceRect = sourceElement.getBoundingClientRect();
        const targetRect = targetElement.getBoundingClientRect();

        const startX = sourceRect.left - graphRect.left + 1;
        const startY = sourceRect.top - graphRect.top + sourceRect.height / 2;
        const endX = targetRect.left - graphRect.left + 1;
        const endY = targetRect.top - graphRect.top + targetRect.height / 2;
        const verticalSpan = Math.abs(endY - startY);
        const curveDepth = Math.max(
          90,
          Math.min(210, Math.round(verticalSpan * 0.575)),
        );
        const routeX = Math.min(startX, endX) - curveDepth;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.classList.add('modpack-dependency-graph__edge');
        path.classList.add(edge.required ? 'modpack-dependency-graph__edge--required' : 'modpack-dependency-graph__edge--optional');
        if (!edge.required) {
          path.classList.add('modpack-dependency-graph__edge--dashed');
        }

        const sourceSelected = Boolean(sourceElement.closest('[data-picker-slot="selected"]'));
        const targetSelected = Boolean(targetElement.closest('[data-picker-slot="selected"]'));
        if (!sourceSelected || !targetSelected) {
          path.classList.add('modpack-dependency-graph__edge--faded');
        }

        path.setAttribute(
          'd',
          'M ' + startX + ' ' + startY + ' C ' + routeX + ' ' + startY + ', ' + routeX + ' ' + endY + ', ' + endX + ' ' + endY,
        );
        path.dataset.edgeSourceId = String(edge.sourceId);
        path.dataset.edgeTargetId = String(edge.targetId);
        path.setAttribute(
          'marker-end',
          edge.required
            ? 'url(#modpack-dependency-arrow-required)'
            : 'url(#modpack-dependency-arrow-optional)',
        );
        edgesRoot.appendChild(path);
      });
    }

    async function refreshGraph() {
      const selectedIds = getSelectedIds();
      const hasSelected = selectedIds.length > 0;

      setGraphVisibility(hasSelected);

      if (!hasSelected) {
        clearGraph();
        return;
      }

      setStatus('Строим граф зависимостей...', 'loading');
      clearGraph();
      ensureGraphFrame();

      const requestId = ++refreshToken;
      let buildGraph = null;
      let buildGraphFailed = false;
      let truncated = false;

      if (api && typeof api.buildMissingDependencies === 'function') {
        try {
          buildGraph = await api.buildMissingDependencies(selectedIds);
        } catch (error) {
          buildGraphFailed = true;
          buildGraph = null;
        }
      }

      if (requestId !== refreshToken) {
        return;
      }

      const nodesById = new Map();
      const edgesByKey = new Map();
      const initialFrontier = [];

      if (buildGraph && Array.isArray(buildGraph.nodes)) {
        buildGraph.nodes.forEach(function (node) {
          const nodeId = normalizeId(node && node.mod_id);
          if (!nodeId) return;
          if (!nodesById.has(nodeId) && nodesById.size >= MAX_GRAPH_NODES) {
            truncated = true;
            return;
          }

          upsertNode(nodesById, nodeId, {
            name: String(node && node.mod_name ? node.mod_name : ''),
            selected: Boolean(node && node.selected),
            kind: node && node.selected ? 'selected' : 'required',
          });
          initialFrontier.push(nodeId);
        });

        if (Array.isArray(buildGraph.edges)) {
          buildGraph.edges.forEach(function (edge) {
            addEdge(edgesByKey, edge && edge.source_mod_id, edge && edge.target_mod_id, false, true, true);
          });
        }
      } else {
        selectedIds.forEach(function (nodeId) {
          upsertNode(nodesById, nodeId, {
            selected: true,
            kind: 'selected',
          });
          initialFrontier.push(nodeId);
        });
      }

      if (initialFrontier.length === 0) {
        initialFrontier.push.apply(initialFrontier, selectedIds);
      }

      const visited = new Set();
      let frontier = Array.from(new Set(initialFrontier));

      while (frontier.length > 0) {
        const currentFrontier = frontier.filter(function (nodeId) {
          return !visited.has(nodeId);
        });

        if (currentFrontier.length === 0) {
          break;
        }

        currentFrontier.forEach(function (nodeId) {
          visited.add(nodeId);
        });

        const dependencyLists = await Promise.all(
          currentFrontier.map(function (nodeId) {
            return getDependencyPromise(nodeId).catch(function () {
              return [];
            });
          }),
        );

        if (requestId !== refreshToken) {
          return;
        }

        const nextFrontier = new Set();

        currentFrontier.forEach(function (sourceId, sourceIndex) {
          const dependencies = Array.isArray(dependencyLists[sourceIndex]) ? dependencyLists[sourceIndex] : [];

          dependencies.forEach(function (dependency) {
            const targetId = normalizeId(dependency && dependency.mod_id);
            if (!targetId) {
              return;
            }

            const targetKnown = nodesById.has(targetId);
            if (!targetKnown && nodesById.size >= MAX_GRAPH_NODES) {
              truncated = true;
              return;
            }

            addEdge(
              edgesByKey,
              sourceId,
              targetId,
              Boolean(dependency && dependency.optional),
              !Boolean(dependency && dependency.optional),
              false,
            );

            const currentKind = targetKnown ? nodesById.get(targetId).kind : 'optional';
            const nextKind = dependency && dependency.optional ? 'optional' : 'required';
            upsertNode(nodesById, targetId, {
              kind: normalizeNodeKind(currentKind, nextKind),
            });

            if (!visited.has(targetId) && (targetKnown || nodesById.size < MAX_GRAPH_NODES)) {
              nextFrontier.add(targetId);
            } else if (!visited.has(targetId) && !targetKnown) {
              truncated = true;
            }
          });
        });

        if (nodesById.size >= MAX_GRAPH_NODES) {
          truncated = true;
          break;
        }

        frontier = Array.from(nextFrontier);
        if (frontier.length === 0) {
          break;
        }
      }

      if (nodesById.size >= MAX_GRAPH_NODES) {
        truncated = true;
      }

      try {
        await loadModMeta(Array.from(nodesById.keys()));
      } catch (error) {
        // Keep the graph usable even if metadata lookup fails.
      }

      if (requestId !== refreshToken) {
        return;
      }

      nodesById.forEach(function (node, nodeId) {
        const meta = modMetaCache.get(String(nodeId));
        if (meta) {
          node.name = node.name || meta.name || ('Мод #' + nodeId);
          node.img = meta.img || node.img || imageFallback;
        } else {
          node.name = node.name || ('Мод #' + nodeId);
          node.img = node.img || imageFallback;
        }
      });

      const levels = getNodeLevelMap(nodesById, edgesByKey, selectedIds);
      const nodes = Array.from(nodesById.values())
        .map(function (node) {
          return {
            ...getNodeMeta(node),
            depth: levels.get(node.id) || 0,
          };
        })
        .sort(function (left, right) {
          if (left.depth !== right.depth) {
            return left.depth - right.depth;
          }

          const leftPriority = KIND_PRIORITY[left.kind] !== undefined ? KIND_PRIORITY[left.kind] : 99;
          const rightPriority = KIND_PRIORITY[right.kind] !== undefined ? KIND_PRIORITY[right.kind] : 99;
          if (leftPriority !== rightPriority) {
            return leftPriority - rightPriority;
          }

          return String(left.name || '').localeCompare(String(right.name || ''), 'ru', { sensitivity: 'base' });
        });

      const edges = Array.from(edgesByKey.values()).map(function (edge) {
        return {
          ...edge,
          required: Boolean(edge.required),
          optional: Boolean(edge.optional),
        };
      });

      const selectedList = getSelectedList();
      const edgesRoot = getEdgesRoot();
      if (!(selectedList instanceof Element) || !(edgesRoot instanceof Element)) {
        return;
      }

      selectedList.querySelectorAll('[data-picker-ghost="true"]').forEach(function (node) {
        node.remove();
      });

      nodes
        .filter(function (node) {
          return !node.selected;
        })
        .forEach(function (node) {
          insertGhostItem(selectedList, createNodeElement(node));
        });

      lastModel = {
        nodes,
        edges,
        ...buildDirectAdjacency(edges),
      };

      if (graphRoot) {
        if (buildGraphFailed) {
          graphRoot.dataset.graphNotice = 'Не удалось построить полный граф, показываю прямые связи';
        } else if (truncated) {
          graphRoot.dataset.graphNotice = 'Показаны первые ' + MAX_GRAPH_NODES + ' модов';
        } else {
          delete graphRoot.dataset.graphNotice;
        }
      }

      if (window.OWPickerEditors && typeof window.OWPickerEditors.requestLayout === 'function') {
        window.OWPickerEditors.requestLayout(editorRoot);
      }

      syncHoverFocus();
      setStatus('', 'ready');

      window.requestAnimationFrame(function () {
        drawEdges(lastModel);
        syncHoverFocus();
      });
    }

    function handleSelectionChange(event) {
      if (!event || !event.detail || event.detail.key !== editorId) {
        return;
      }

      if (event.detail.materializedGhost || event.detail.dematerializedGhost) {
        return;
      }

      if (editorRoot instanceof Element && String(editorRoot.dataset.modpackAutoDependenciesUpdating || 'false') === 'true') {
        return;
      }

      refreshGraph().catch(function () {
        setStatus('Не удалось построить граф зависимостей', 'error');
      });
    }

    function handleAutoDependenciesChange(event) {
      if (!event || !event.detail || event.detail.key !== editorId) {
        return;
      }

      if (event.detail.source === 'model') {
        if (lastModel) {
          window.requestAnimationFrame(function () {
            drawEdges(lastModel);
            syncHoverFocus();
          });
        }
        return;
      }

      refreshGraph().catch(function () {
        setStatus('Не удалось построить граф зависимостей', 'error');
      });
    }

    function bindResizeListeners() {
      const shell = getShell();

      if (typeof ResizeObserver === 'function' && shell instanceof Element) {
        resizeObserver = new ResizeObserver(function () {
          if (graphRoot && lastModel) {
            window.requestAnimationFrame(function () {
              drawEdges(lastModel);
              syncHoverFocus();
            });
          }
        });
        resizeObserver.observe(shell);
      }

      resizeListener = function () {
        if (graphRoot && lastModel) {
          drawEdges(lastModel);
          syncHoverFocus();
        }
      };

      window.addEventListener('resize', resizeListener);
    }

    function bind() {
      if (bound || !(graphRoot instanceof Element) || !(editorRoot instanceof Element)) {
        return;
      }

      bound = true;

      editorRoot.dataset.modpackDependencyGraphVisible = 'false';
      graphRoot.hidden = true;

      hoverSelectedList = getSelectedList();
      if (hoverSelectedList instanceof Element) {
        hoverPointerOverListener = function (event) {
          const target = findHoverTarget(event);
          if (!target) {
            clearHoverNode();
            return;
          }

          setHoverNode(target.dataset.pickerId);
        };

        hoverPointerLeaveListener = function () {
          clearHoverNode();
        };

        hoverSelectedList.addEventListener('pointerover', hoverPointerOverListener);
        hoverSelectedList.addEventListener('pointerleave', hoverPointerLeaveListener);
      }

      editorRoot.addEventListener('ow:picker-selection-change', handleSelectionChange);
      editorRoot.addEventListener(AUTO_DEPENDENCIES_CHANGE_EVENT, handleAutoDependenciesChange);
      bindResizeListeners();
      refreshGraph().catch(function () {
        setStatus('Не удалось построить граф зависимостей', 'error');
      });
    }

    function dispose() {
      if (!bound) return;
      bound = false;

      editorRoot.removeEventListener('ow:picker-selection-change', handleSelectionChange);
      editorRoot.removeEventListener(AUTO_DEPENDENCIES_CHANGE_EVENT, handleAutoDependenciesChange);

      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }

      if (resizeListener) {
        window.removeEventListener('resize', resizeListener);
        resizeListener = null;
      }

      if (hoverSelectedList instanceof Element) {
        if (hoverPointerOverListener) {
          hoverSelectedList.removeEventListener('pointerover', hoverPointerOverListener);
        }
        if (hoverPointerLeaveListener) {
          hoverSelectedList.removeEventListener('pointerleave', hoverPointerLeaveListener);
        }
      }

      hoverSelectedList = null;
      hoverPointerOverListener = null;
      hoverPointerLeaveListener = null;
      hoveredNodeId = 0;
      syncHoverFocus();
    }

    return {
      bind,
      refresh: refreshGraph,
      dispose,
      getModel() {
        return lastModel;
      },
    };
  });
})();

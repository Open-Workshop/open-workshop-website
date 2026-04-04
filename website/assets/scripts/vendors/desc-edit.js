(function () {
  const editorRegistry = new WeakMap();
  const editorList = [];
  let outsideCloseBound = false;
  let observerBound = false;

  function normalizeText(value) {
    return String(value || '').replace(/\r\n?/g, '\n');
  }

  function normalizeUrl(value) {
    const raw = String(value || '').trim();
    if (raw === '') return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://${raw.replace(/^\/+/, '')}`;
  }

  function normalizeInlineText(text) {
    return String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\ufeff/g, '');
  }

  function serializeInlineNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return normalizeInlineText(node.textContent);
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const tag = node.tagName.toUpperCase();

    if (tag === 'BR') return '\n';
    if (tag === 'STRONG' || tag === 'B') return `[b]${serializeInlineChildren(node)}[/b]`;
    if (tag === 'EM' || tag === 'I') return `[i]${serializeInlineChildren(node)}[/i]`;
    if (tag === 'U') return `[u]${serializeInlineChildren(node)}[/u]`;
    if (tag === 'S' || tag === 'STRIKE') return `[strike]${serializeInlineChildren(node)}[/strike]`;

    if (tag === 'A') {
      const href = String(node.getAttribute('href') || '').trim();
      const label = serializeInlineChildren(node).trim();
      if (href === '') return label;
      return label === href ? href : `[url=${href}]${label}[/url]`;
    }

    if (tag === 'IMG') {
      const src = String(node.getAttribute('src') || '').trim();
      return src ? `[img]${src}[/img]` : '';
    }

    return serializeInlineChildren(node);
  }

  function serializeInlineChildren(node) {
    return Array.from(node.childNodes)
      .map(function (child) {
        return serializeInlineNode(child);
      })
      .join('');
  }

  function serializeNodes(nodes) {
    const blocks = [];

    nodes.forEach(function (node) {
      const serialized = serializeBlockNode(node);
      if (serialized === '') return;
      blocks.push(serialized);
    });

    return blocks.join('\n\n');
  }

  function serializeList(node) {
    const items = Array.from(node.children)
      .filter(function (child) {
        return child.tagName && child.tagName.toUpperCase() === 'LI';
      })
      .map(function (item) {
        const text = serializeInlineChildren(item).trim();
        return text ? `[*] ${text}` : '';
      })
      .filter(Boolean);

    if (!items.length) return '';
    return `[list]\n${items.join('\n')}\n[/list]`;
  }

  function serializeBlockNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return normalizeInlineText(node.textContent).trim();
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const tag = node.tagName.toUpperCase();

    if (tag === 'P' || tag === 'DIV') {
      return serializeInlineChildren(node).trim();
    }

    if (/^H[1-6]$/.test(tag)) {
      const level = tag.slice(1);
      return `[h${level}]${serializeInlineChildren(node).trim()}[/h${level}]`;
    }

    if (tag === 'BLOCKQUOTE') {
      const value = serializeNodes(Array.from(node.childNodes)).trim();
      return value ? `[quote]${value}[/quote]` : '';
    }

    if (tag === 'UL' || tag === 'OL') {
      return serializeList(node);
    }

    if (tag === 'IMG') {
      const src = String(node.getAttribute('src') || '').trim();
      return src ? `[img]${src}[/img]` : '';
    }

    if (tag === 'HR') {
      return '[hr]';
    }

    return serializeInlineChildren(node).trim();
  }

  function normalizeSerializedBbcode(text) {
    return normalizeText(text)
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function serializeEditorRoot(root) {
    return normalizeSerializedBbcode(serializeNodes(Array.from(root.childNodes)));
  }

  function updateLimit(editor) {
    if (!editor.limitNode) return;

    const rawLimit = Number(editor.root.getAttribute('limit') || 0);
    if (!Number.isFinite(rawLimit) || rawLimit <= 0) {
      editor.limitNode.textContent = '';
      return;
    }

    const remaining = rawLimit - editor.textarea.value.length;
    editor.limitNode.textContent = remaining;
    editor.limitNode.classList.toggle('is-over-limit', remaining < 0);
  }

  function notifyChange(editor) {
    editor.changeListeners.forEach(function (callback) {
      callback(editor);
    });

    editor.root.dispatchEvent(
      new CustomEvent('ow:desc-change', {
        detail: { editor },
      }),
    );
  }

  function syncTransport(editor) {
    if (editor.isApplying) return;
    editor.textarea.value = serializeEditorRoot(editor.quill.root);
    updateLimit(editor);
    notifyChange(editor);
  }

  function setEditorValue(editor, value, options) {
    const normalizedValue = normalizeText(value);
    const nextOptions = options || {};
    const html = window.Formating
      ? window.Formating.syntax2HTML(normalizedValue)
      : '';

    editor.isApplying = true;
    editor.quill.setText('', 'silent');
    if (html && html.trim() !== '') {
      editor.quill.clipboard.dangerouslyPasteHTML(html, 'silent');
    }
    editor.textarea.value = normalizedValue;
    if (nextOptions.updateStart) {
      editor.textarea.setAttribute('startdata', normalizedValue);
    }
    editor.isApplying = false;

    updateLimit(editor);
    if (!nextOptions.silent) {
      notifyChange(editor);
    }
  }

  function insertImageByUrl(quill) {
    const rawUrl = window.prompt('Введите URL изображения');
    const imageUrl = normalizeUrl(rawUrl);
    if (!imageUrl) return;

    const selection = quill.getSelection(true);
    const index = selection ? selection.index : quill.getLength();
    quill.insertEmbed(index, 'image', imageUrl, Quill.sources.USER);
    quill.setSelection(index + 1, 0, Quill.sources.SILENT);
  }

  function bindOutsideClose() {
    if (outsideCloseBound) return;
    outsideCloseBound = true;

    document.addEventListener(
      'pointerdown',
      function (event) {
        editorList.forEach(function (editor) {
          if (!editor.root.isConnected) return;
          const tooltip = editor.quill.theme && editor.quill.theme.tooltip
            ? editor.quill.theme.tooltip.root
            : null;
          if (!tooltip || tooltip.classList.contains('ql-hidden')) return;
          if (tooltip.contains(event.target)) return;

          requestAnimationFrame(function () {
            if (editor.quill.theme && editor.quill.theme.tooltip) {
              editor.quill.blur();
              editor.quill.theme.tooltip.hide();
            }
          });
        });
      },
      true,
    );
  }

  function resolveRoot(target) {
    if (!target) return null;

    if (target.jquery && target.length) {
      return resolveRoot(target.get(0));
    }

    if (editorRegistry.has(target)) {
      return target;
    }

    if (target.root && editorRegistry.has(target.root)) {
      return target.root;
    }

    if (typeof target === 'string') {
      return resolveRoot(document.querySelector(target));
    }

    if (target instanceof Element) {
      if (target.matches('.desc-edit')) return target;
      return target.closest('.desc-edit');
    }

    return null;
  }

  function createEditor(root) {
    if (!root || editorRegistry.has(root)) {
      return editorRegistry.get(root) || null;
    }

    const host = root.querySelector('[data-desc-editor]');
    const textarea = root.querySelector('[data-desc-transport]');
    const limitNode = root.querySelector('[data-desc-limit]');

    if (!host || !textarea || typeof Quill === 'undefined') {
      return null;
    }

    const initialValue = normalizeText(textarea.value);
    textarea.value = initialValue;
    textarea.setAttribute('startdata', initialValue);

    const quill = new Quill(host, {
      theme: 'bubble',
      placeholder: host.getAttribute('data-placeholder') || textarea.getAttribute('placeholder') || '',
      modules: {
        toolbar: {
          container: [
            [{ header: [1, 2, 3, 4, 5, 6, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            ['blockquote', 'link'],
            [{ list: 'bullet' }],
            ['image', 'clean'],
          ],
          handlers: {
            image: function () {
              insertImageByUrl(this.quill);
            },
          },
        },
      },
      formats: ['header', 'bold', 'italic', 'underline', 'strike', 'blockquote', 'link', 'list', 'image'],
    });

    quill.root.classList.add('ow-description-content');

    const editor = {
      root,
      host,
      textarea,
      limitNode,
      quill,
      changeListeners: new Set(),
      isApplying: false,
      getValue: function () {
        return textarea.value;
      },
      getStartValue: function () {
        return textarea.getAttribute('startdata') || '';
      },
      setValue: function (value, options) {
        setEditorValue(editor, value, options);
      },
      onChange: function (callback) {
        editor.changeListeners.add(callback);
        return function () {
          editor.changeListeners.delete(callback);
        };
      },
    };

    editorRegistry.set(root, editor);
    editorList.push(editor);

    setEditorValue(editor, initialValue, { silent: true, updateStart: true });
    quill.on('text-change', function () {
      syncTransport(editor);
    });

    bindOutsideClose();
    root.classList.add('is-ready');
    return editor;
  }

  function initAllEditors(scope) {
    const root = scope instanceof Element ? scope : document;
    root.querySelectorAll('.desc-edit').forEach(function (editorRoot) {
      createEditor(editorRoot);
    });
  }

  function observeEditors() {
    if (observerBound || !window.MutationObserver) return;
    observerBound = true;

    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (!(node instanceof Element)) return;
          if (node.matches('.desc-edit')) {
            createEditor(node);
          } else if (node.querySelectorAll) {
            initAllEditors(node);
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function getEditor(target) {
    const root = resolveRoot(target);
    return root ? editorRegistry.get(root) || createEditor(root) : null;
  }

  function initEditor(target) {
    const root = resolveRoot(target) || target;
    if (!(root instanceof Element)) return null;
    return createEditor(root);
  }

  function getValue(target) {
    const editor = getEditor(target);
    return editor ? editor.getValue() : '';
  }

  function getStartValue(target) {
    const editor = getEditor(target);
    return editor ? editor.getStartValue() : '';
  }

  function setValue(target, value, options) {
    const editor = getEditor(target);
    if (!editor) return;
    editor.setValue(value, options);
  }

  function onReady() {
    initAllEditors(document);
    observeEditors();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }

  window.OWDescEditors = {
    init: initEditor,
    initAll: initAllEditors,
    get: getEditor,
    getValue,
    getStartValue,
    setValue,
  };
})();

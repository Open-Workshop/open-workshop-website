(function () {
  const editorRegistry = new WeakMap();
  const editorList = [];
  let outsideCloseBound = false;
  let observerBound = false;

  function getCodec() {
    return window.OWDescriptionCodec || null;
  }

  function normalizeText(value) {
    const codec = getCodec();
    return codec ? codec.normalizeText(value) : String(value || '').replace(/\r\n?/g, '\n');
  }

  function normalizeUrl(value) {
    const codec = getCodec();
    return codec ? codec.normalizeUrl(value) : '';
  }

  function serializeEditorRoot(root) {
    const codec = getCodec();
    return codec ? codec.serializeRoot(root) : normalizeText(root ? root.textContent : '').trim();
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

  function syncCodeButtonState(editor) {
    const toolbar = editor.quill.getModule('toolbar');
    if (!toolbar || !toolbar.container) return;

    const codeButton = toolbar.container.querySelector('.ql-code');
    if (!codeButton) return;

    const selection = editor.quill.getSelection();
    if (!selection) {
      codeButton.classList.remove('ql-active');
      return;
    }

    const formats = editor.quill.getFormat(selection);
    codeButton.classList.toggle('ql-active', Boolean(formats.code || formats['code-block']));
  }

  function toggleSmartCode(quill) {
    const range = quill.getSelection(true);
    if (!range) return;

    const formats = quill.getFormat(range);
    const selectedText = range.length > 0 ? quill.getText(range.index, range.length) : '';
    const lines = quill.getLines(range.index, range.length);
    const useBlockMode = Boolean(
      formats['code-block'] || (range.length > 0 && (selectedText.includes('\n') || lines.length > 1)),
    );

    if (useBlockMode) {
      quill.formatLine(
        range.index,
        Math.max(range.length, 1),
        'code-block',
        !Boolean(formats['code-block']),
        Quill.sources.USER,
      );
      return;
    }

    if (range.length === 0) {
      quill.format('code', !Boolean(formats.code), Quill.sources.USER);
      return;
    }

    quill.formatText(range.index, range.length, 'code', !Boolean(formats.code), Quill.sources.USER);
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
    const html = getCodec()
      ? getCodec().toHtml(normalizedValue)
      : '';

    editor.isApplying = true;
    editor.quill.setText('', 'silent');
    if (html && html.trim() !== '') {
      editor.quill.clipboard.dangerouslyPasteHTML(html, 'silent');
    }
    editor.textarea.defaultValue = normalizedValue;
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

    const initialValue = normalizeText(textarea.defaultValue);
    textarea.defaultValue = initialValue;
    textarea.value = initialValue;
    textarea.setAttribute('startdata', initialValue);

    const quill = new Quill(host, {
      theme: 'bubble',
      placeholder: host.getAttribute('data-placeholder') || textarea.getAttribute('placeholder') || '',
      modules: {
        toolbar: {
          container: [
            [{ header: [1, 2, 3, 4, 5, 6, false] }],
            ['bold', 'italic', 'underline', 'strike', 'code'],
            ['blockquote', 'link'],
            [{ list: 'bullet' }],
            ['image', 'clean'],
          ],
          handlers: {
            code: function () {
              toggleSmartCode(this.quill);
            },
            image: function () {
              insertImageByUrl(this.quill);
            },
          },
        },
      },
      formats: ['header', 'bold', 'italic', 'underline', 'strike', 'code', 'code-block', 'blockquote', 'link', 'list', 'image'],
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
      syncCodeButtonState(editor);
    });
    quill.on('selection-change', function () {
      syncCodeButtonState(editor);
    });
    syncCodeButtonState(editor);

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

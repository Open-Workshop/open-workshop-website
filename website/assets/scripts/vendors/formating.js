(function () {
  function normalizeText(value) {
    return String(value || '').replace(/\r\n?/g, '\n');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeUrl(value) {
    const raw = String(value || '').trim();
    if (raw === '') return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://${raw.replace(/^\/+/, '')}`;
  }

  function renderLink(href, label) {
    const safeHref = normalizeUrl(href);
    const safeLabel = label || safeHref;
    if (safeHref === '') return escapeHtml(safeLabel);
    return `<a class="tag-link" href="${escapeHtml(safeHref)}">${safeLabel}</a>`;
  }

  function findNextInlineMatch(text) {
    const patterns = [
      { type: 'bb-url', regex: /\[url=([^\]\n]+)]([\s\S]*?)\[\/url]/i },
      { type: 'md-url', regex: /\[(.+?)]\((https?:\/\/.+?)\)/i },
      { type: 'bb-img', regex: /\[img(?:=([^\]]+))?](.*?)\[\/img]/i },
      { type: 'bb-bold', regex: /\[b]([\s\S]*?)\[\/b]/i },
      { type: 'md-bold', regex: /\*\*([\s\S]*?)\*\*/ },
      { type: 'bb-italic', regex: /\[i]([\s\S]*?)\[\/i]/i },
      { type: 'md-italic', regex: /(^|[^\*])\*([^*\n][\s\S]*?)\*(?!\*)/ },
      { type: 'bb-underline', regex: /\[u]([\s\S]*?)\[\/u]/i },
      { type: 'bb-strike', regex: /\[strike]([\s\S]*?)\[\/strike]/i },
      { type: 'bb-spoiler', regex: /\[spoiler]([\s\S]*?)\[\/spoiler]/i },
      { type: 'raw-url', regex: /https?:\/\/[^\s<\]]+/i },
    ];

    let best = null;

    patterns.forEach(function (pattern) {
      const match = pattern.regex.exec(text);
      if (!match) return;
      if (!best || match.index < best.match.index) {
        best = { type: pattern.type, match };
      }
    });

    return best;
  }

  function inlineSyntaxToHtml(text) {
    let remaining = normalizeText(text);
    let html = '';

    while (remaining.length > 0) {
      const next = findNextInlineMatch(remaining);
      if (!next) {
        html += escapeHtml(remaining);
        break;
      }

      const before = remaining.slice(0, next.match.index);
      html += escapeHtml(before);

      if (next.type === 'bb-url') {
        html += renderLink(next.match[1], inlineSyntaxToHtml(next.match[2]));
      } else if (next.type === 'md-url') {
        html += renderLink(next.match[2], inlineSyntaxToHtml(next.match[1]));
      } else if (next.type === 'bb-img') {
        const src = normalizeUrl(next.match[1] || next.match[2]);
        if (src) {
          html += `<img class="img-desc" src="${escapeHtml(src)}" alt="">`;
        }
      } else if (next.type === 'bb-bold' || next.type === 'md-bold') {
        html += `<strong>${inlineSyntaxToHtml(next.match[1])}</strong>`;
      } else if (next.type === 'bb-italic') {
        html += `<em>${inlineSyntaxToHtml(next.match[1])}</em>`;
      } else if (next.type === 'md-italic') {
        html += `${escapeHtml(next.match[1])}<em>${inlineSyntaxToHtml(next.match[2])}</em>`;
      } else if (next.type === 'bb-underline') {
        html += `<u>${inlineSyntaxToHtml(next.match[1])}</u>`;
      } else if (next.type === 'bb-strike') {
        html += `<s>${inlineSyntaxToHtml(next.match[1])}</s>`;
      } else if (next.type === 'bb-spoiler') {
        html += `<span class="spoiler">${inlineSyntaxToHtml(next.match[1])}</span>`;
      } else if (next.type === 'raw-url') {
        let label = next.match[0];
        try {
          label = new URL(next.match[0]).hostname;
        } catch (error) {
          label = next.match[0];
        }
        html += renderLink(next.match[0], escapeHtml(label));
      }

      remaining = remaining.slice(next.match.index + next.match[0].length);
    }

    return html;
  }

  function renderParagraph(lines) {
    const html = lines
      .map(function (line) {
        return inlineSyntaxToHtml(line);
      })
      .join('<br>');

    return html.trim() === '' ? '' : `<p>${html}</p>`;
  }

  function renderHeading(line) {
    const match = line.trim().match(/^\[h([1-6])](.*?)\[\/h\1]$/i);
    if (!match) return '';
    return `<h${match[1]}>${inlineSyntaxToHtml(match[2])}</h${match[1]}>`;
  }

  function renderImage(line) {
    const match = line.trim().match(/^\[img(?:=([^\]]+))?](.*?)\[\/img]$/i);
    if (!match) return '';
    const src = normalizeUrl(match[1] || match[2]);
    if (!src) return '';
    return `<p><img class="img-desc" src="${escapeHtml(src)}" alt=""></p>`;
  }

  function collectSimpleList(lines, startIndex, markerRegex) {
    const items = [];
    let index = startIndex;

    while (index < lines.length) {
      const line = lines[index];
      if (!markerRegex.test(line.trim())) break;
      items.push(line.trim().replace(markerRegex, '').trim());
      index += 1;
    }

    return {
      nextIndex: index,
      html: items.length
        ? `<ul>${items
            .map(function (item) {
              return `<li>${inlineSyntaxToHtml(item)}</li>`;
            })
            .join('')}</ul>`
        : '',
    };
  }

  function collectTaggedList(lines, startIndex) {
    const items = [];
    let index = startIndex + 1;
    let currentItem = '';

    while (index < lines.length) {
      const rawLine = lines[index];
      const trimmed = rawLine.trim();

      if (/^\[\/list]$/i.test(trimmed)) {
        if (currentItem !== '') items.push(currentItem);
        return {
          nextIndex: index + 1,
          html: items.length
            ? `<ul>${items
                .map(function (item) {
                  return `<li>${inlineSyntaxToHtml(item)}</li>`;
                })
                .join('')}</ul>`
            : '',
        };
      }

      if (/^\[\*]/.test(trimmed)) {
        if (currentItem !== '') items.push(currentItem);
        currentItem = trimmed.replace(/^\[\*]\s*/, '');
      } else if (currentItem !== '') {
        currentItem += `\n${rawLine}`;
      }

      index += 1;
    }

    if (currentItem !== '') items.push(currentItem);

    return {
      nextIndex: lines.length,
      html: items.length
        ? `<ul>${items
            .map(function (item) {
              return `<li>${inlineSyntaxToHtml(item)}</li>`;
            })
            .join('')}</ul>`
        : '',
    };
  }

  function renderTable(raw) {
    return raw
      .replace(/\[table\]/gi, '<table>')
      .replace(/\[\/table\]/gi, '</table>')
      .replace(/\[tr\]/gi, '<tr>')
      .replace(/\[\/tr\]/gi, '</tr>')
      .replace(/\[td\]/gi, '<td>')
      .replace(/\[\/td\]/gi, '</td>');
  }

  function collectTable(lines, startIndex) {
    const collected = [];
    let index = startIndex;

    while (index < lines.length) {
      collected.push(lines[index]);
      if (/\[\/table]/i.test(lines[index])) {
        return {
          nextIndex: index + 1,
          html: renderTable(collected.join('\n')),
        };
      }
      index += 1;
    }

    return {
      nextIndex: lines.length,
      html: renderTable(collected.join('\n')),
    };
  }

  function collectQuote(lines, startIndex) {
    const firstLine = lines[startIndex];
    const openMatch = firstLine.trim().match(/^\[quote(?:=(.*?))?](.*)$/i);
    if (!openMatch) {
      return { nextIndex: startIndex + 1, html: renderParagraph([firstLine]) };
    }

    const title = openMatch[1] ? openMatch[1].trim() : '';
    const contentLines = [];
    let currentLine = openMatch[2] || '';
    let index = startIndex;

    while (index < lines.length) {
      const closeIndex = currentLine.search(/\[\/quote]/i);
      if (closeIndex >= 0) {
        const beforeClose = currentLine.slice(0, closeIndex);
        if (beforeClose !== '') contentLines.push(beforeClose);
        break;
      }

      if (currentLine !== '' || index !== startIndex) {
        contentLines.push(currentLine);
      }
      index += 1;
      currentLine = lines[index] || '';
    }

    const titleHtml = title !== '' ? `<p><strong>${inlineSyntaxToHtml(title)}</strong></p>` : '';
    const contentHtml = renderBlocks(contentLines.join('\n'), false);

    return {
      nextIndex: Math.min(index + 1, lines.length),
      html: `<blockquote>${titleHtml}${contentHtml}</blockquote>`,
    };
  }

  function renderBlocks(text, short) {
    const lines = normalizeText(text).split('\n');
    const blocks = [];
    let paragraphLines = [];
    let index = 0;

    function flushParagraph() {
      if (!paragraphLines.length) return;
      const paragraph = renderParagraph(paragraphLines);
      if (paragraph) blocks.push(paragraph);
      paragraphLines = [];
    }

    while (index < lines.length) {
      const line = lines[index];
      const trimmed = line.trim();

      if (trimmed === '') {
        flushParagraph();
        index += 1;
        continue;
      }

      if (/^\[h[1-6]].*\[\/h[1-6]]$/i.test(trimmed)) {
        flushParagraph();
        blocks.push(renderHeading(line));
        index += 1;
        continue;
      }

      if (/^\[img(?:=.*?)?].*\[\/img]$/i.test(trimmed)) {
        flushParagraph();
        blocks.push(renderImage(line));
        index += 1;
        continue;
      }

      if (/^\[quote(?:=.*?)?]/i.test(trimmed)) {
        flushParagraph();
        const renderedQuote = collectQuote(lines, index);
        if (renderedQuote.html) blocks.push(renderedQuote.html);
        index = renderedQuote.nextIndex;
        continue;
      }

      if (/^\[list]$/i.test(trimmed)) {
        flushParagraph();
        const renderedList = collectTaggedList(lines, index);
        if (renderedList.html) blocks.push(renderedList.html);
        index = renderedList.nextIndex;
        continue;
      }

      if (/^\*\s+/.test(trimmed)) {
        flushParagraph();
        const renderedList = collectSimpleList(lines, index, /^\*\s+/);
        if (renderedList.html) blocks.push(renderedList.html);
        index = renderedList.nextIndex;
        continue;
      }

      if (/^\[table]/i.test(trimmed)) {
        flushParagraph();
        const renderedTable = collectTable(lines, index);
        if (renderedTable.html) blocks.push(renderedTable.html);
        index = renderedTable.nextIndex;
        continue;
      }

      if (/^\[hr(?:\s*\/)?]$/i.test(trimmed) || /^\[hr].*\[\/hr]$/i.test(trimmed)) {
        flushParagraph();
        blocks.push('<hr>');
        index += 1;
        continue;
      }

      paragraphLines.push(line);
      index += 1;
    }

    flushParagraph();

    const html = blocks.join('');
    if (!short) return html;
    return html.replace(/(?:<p><br><\/p>\s*)+/g, '');
  }

  window.Formating = {
    syntax2HTML: function (text, short) {
      return renderBlocks(text, !!short);
    },
    renderInto: function (element, text, short) {
      if (!element) return '';
      const html = renderBlocks(text, !!short);
      element.classList.add('ow-description-content');
      element.innerHTML = html;
      return html;
    },
    highlightSearch: function (searchQuery, articleText) {
      if (searchQuery.trim().length > 0) {
        const regex = new RegExp(searchQuery.trim(), 'gi');
        articleText = articleText.replace(regex, '<p class="result-search">$&</p>');
      }
      return articleText;
    },
  };
})();

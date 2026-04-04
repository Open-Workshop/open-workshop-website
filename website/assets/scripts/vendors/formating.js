(function () {
  function render(text, short) {
    if (!window.OWDescriptionCodec) return '';
    return window.OWDescriptionCodec.toHtml(text, short);
  }

  window.Formating = {
    syntax2HTML: function (text, short) {
      return render(text, !!short);
    },
    renderInto: function (element, text, short) {
      if (!element) return '';
      const html = render(text, !!short);
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

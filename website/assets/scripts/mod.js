(function () {
  const { getApiPaths, apiUrl, formatPath, request } = window.OWCore;

  function appendCurrentQuery(link, extraQuery) {
    if (!(link instanceof HTMLAnchorElement)) return;

    const url = new URL(link.href, window.location.origin);
    const currentParams = new URLSearchParams(window.location.search);
    const extraParams = new URLSearchParams(extraQuery || '');

    currentParams.forEach(function (value, key) {
      url.searchParams.set(key, value);
    });
    extraParams.forEach(function (value, key) {
      url.searchParams.set(key, value);
    });

    link.href = url.toString();
  }

  function showToast(title, text, theme) {
    if (typeof Toast !== 'function') return;
    new Toast({
      title,
      text,
      theme: theme || 'info',
      autohide: true,
      interval: 4500,
    });
  }

  function extractErrorMessage(payload, fallback) {
    if (typeof payload === 'string') {
      const text = payload.trim();
      if (text) return text;
    }

    if (payload && typeof payload === 'object') {
      if (typeof payload.detail === 'string' && payload.detail.trim()) return payload.detail.trim();
      if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim();
      if (typeof payload.error === 'string' && payload.error.trim()) return payload.error.trim();
    }

    return fallback;
  }

  function coerceNumber(value, fallback) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : (fallback || 0);
  }

  function pluralizeRu(value, forms) {
    const normalizedValue = Math.abs(Math.trunc(value));
    if (normalizedValue % 10 === 1 && normalizedValue % 100 !== 11) {
      return forms[0];
    }
    if (normalizedValue % 10 >= 2 && normalizedValue % 10 <= 4 && (normalizedValue % 100 < 10 || normalizedValue % 100 >= 20)) {
      return forms[1];
    }
    return forms[2];
  }

  function formatSteamRatingSummary(rating, votesCount) {
    const votesValue = Math.max(0, Math.trunc(coerceNumber(votesCount, 0)));
    const ratingValue = Math.max(0, Math.min(100, Math.trunc(coerceNumber(rating, 0))));

    if (votesValue <= 0) {
      return {
        label: 'Нет оценок',
        title: 'Нет оценок',
        rating: 0,
        votesCount: 0,
        tone: 'none',
      };
    }

    let label;
    let tone;

    if (ratingValue >= 95) {
      label = 'Крайне положительные';
      tone = 'positive-extreme';
    } else if (ratingValue >= 80) {
      label = 'Очень положительные';
      tone = 'positive-strong';
    } else if (ratingValue >= 70) {
      label = 'В основном положительные';
      tone = 'positive';
    } else if (ratingValue >= 40) {
      label = 'Смешанные';
      tone = 'mixed';
    } else if (ratingValue >= 20) {
      label = 'В основном отрицательные';
      tone = 'negative';
    } else if (ratingValue >= 10) {
      label = 'Очень отрицательные';
      tone = 'negative-strong';
    } else {
      label = 'Крайне отрицательные';
      tone = 'negative-extreme';
    }

    return {
      label,
      title: `${label} · ${ratingValue}% · ${votesValue} ${pluralizeRu(votesValue, ['голос', 'голоса', 'голосов'])}`,
      rating: ratingValue,
      votesCount: votesValue,
      tone,
    };
  }

  function applySteamRatingSummary(node, summary) {
    if (!(node instanceof Element)) return;
    node.textContent = summary.label;
    node.title = summary.title;
    node.setAttribute('aria-label', summary.title);
  }

  function setRatingButtonState(widget, activeValue) {
    if (!(widget instanceof Element)) return;
    const buttons = Array.from(widget.querySelectorAll('[data-action="mod-rate"]'));
    buttons.forEach(function (button) {
      if (!(button instanceof HTMLButtonElement)) return;
      const isActive = String(button.dataset.value || '') === String(activeValue);
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function parseCurrentVote(value) {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function setRatingBusy(widget, busy) {
    if (!(widget instanceof Element)) return;
    const canVote = widget.dataset.canVote === 'true';
    widget.querySelectorAll('[data-action="mod-rate"]').forEach(function (button) {
      if (!(button instanceof HTMLButtonElement)) return;
      button.disabled = busy || !canVote;
    });
  }

  async function sendRatingVote(widget, value) {
    if (!(widget instanceof Element)) return;

    const apiPaths = getApiPaths();
    const endpoint = apiPaths.mod && apiPaths.mod.rating ? apiPaths.mod.rating : null;
    const modId = Number(widget.dataset.modId || 0);
    const canVote = widget.dataset.canVote === 'true';
    const voteReason = widget.dataset.voteReason || 'Голосование недоступно';
    const ratingValueNode = widget.querySelector('[data-mod-rating-value]');

    if (!endpoint || !modId) {
      showToast('Ошибка', 'Не удалось определить endpoint рейтинга', 'danger');
      return;
    }

    if (!canVote) {
      showToast('Голосование недоступно', voteReason, 'warning');
      return;
    }

    setRatingBusy(widget, true);
    try {
      const result = await request(apiUrl(formatPath(endpoint.path, { mod_id: modId })), {
        method: endpoint.method,
        data: { value },
        parseAs: 'json',
        credentials: 'include',
      });

      if (!result.ok) {
        throw new Error(extractErrorMessage(result.data, 'Не удалось сохранить голос'));
      }

      const payload = result.data && typeof result.data === 'object' ? result.data : {};
      const summary = formatSteamRatingSummary(
        payload.rating !== undefined ? payload.rating : widget.dataset.ratingScore,
        payload.votes_count !== undefined ? payload.votes_count : widget.dataset.ratingVotesCount,
      );

      if (ratingValueNode) {
        applySteamRatingSummary(ratingValueNode, summary);
      }
      widget.dataset.ratingScore = String(summary.rating);
      widget.dataset.ratingVotesCount = String(summary.votesCount);
      widget.dataset.currentVote = String(value);
      setRatingButtonState(widget, value);
      showToast(
        value === 0 ? 'Голос снят' : 'Голос сохранён',
        payload.rating !== undefined ? `Текущий рейтинг: ${summary.label}` : 'Голос учтен',
        'success',
      );
    } catch (error) {
      showToast('Ошибка', error && error.message ? error.message : 'Не удалось сохранить голос', 'danger');
    } finally {
      setRatingBusy(widget, false);
    }
  }

  function initModRatingWidget() {
    const widget = document.querySelector('[data-mod-rating-widget]');
    if (!widget) return;

    setRatingButtonState(widget, parseCurrentVote(widget.dataset.currentVote));

    const ratingValueNode = widget.querySelector('[data-mod-rating-value]');
    if (ratingValueNode) {
      applySteamRatingSummary(
        ratingValueNode,
        formatSteamRatingSummary(widget.dataset.ratingScore, widget.dataset.ratingVotesCount),
      );
    }

    widget.querySelectorAll('[data-action="mod-rate"]').forEach(function (button) {
      button.addEventListener('click', function () {
        const value = Number.parseInt(button.dataset.value || '0', 10);
        if (!Number.isFinite(value)) return;
        const currentVote = parseCurrentVote(widget.dataset.currentVote);
        const nextValue = currentVote === value ? 0 : value;
        sendRatingVote(widget, nextValue);
      });
    });
  }

  function initModPage() {
    const description = document.getElementById('mod-description');
    if (description) {
      description.classList.add('ow-description-content');
    }

    const currentParams = new URLSearchParams(window.location.search);
    const dependencyLinks = document.querySelectorAll('.right-bar a.element[href]');
    dependencyLinks.forEach(function (link) {
      appendCurrentQuery(link);
    });

    currentParams.delete('game');
    currentParams.delete('game_select');
    currentParams.delete('sgame');

    const gameLabel = document.getElementById('mod-for-game-label');
    if (gameLabel) {
      appendCurrentQuery(gameLabel, currentParams.toString());
    }

    initModRatingWidget();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModPage);
  } else {
    initModPage();
  }
})();

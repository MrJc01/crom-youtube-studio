(function (global) {
  'use strict';

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function slugify(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'secao';
  }

  function unquote(str) {
    if (str.length >= 2) {
      if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
        return str.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }
    }
    return str;
  }

  function parseYamlValue(rawVal) {
    if (!rawVal) return '';
    if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      const inner = rawVal.slice(1, -1).trim();
      if (!inner) return [];
      const items = [];
      let cur = '';
      let inQuotes = false;
      let quoteChar = '"';
      for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if ((ch === '"' || ch === "'") && inner[i - 1] !== '\\') {
          if (!inQuotes) {
            inQuotes = true;
            quoteChar = ch;
          } else if (quoteChar === ch) {
            inQuotes = false;
          } else {
            cur += ch;
          }
        } else if (ch === ',' && !inQuotes) {
          const cleaned = unquote(cur.trim());
          if (cleaned) items.push(cleaned);
          cur = '';
        } else {
          cur += ch;
        }
      }
      const tail = unquote(cur.trim());
      if (tail) items.push(tail);
      return items;
    }
    if (/^-?\d+(\.\d+)?$/.test(rawVal)) return Number(rawVal);
    if (rawVal === 'true') return true;
    if (rawVal === 'false') return false;
    return unquote(rawVal);
  }

  function parseFrontmatter(raw) {
    const normalized = String(raw || '').replace(/\r\n/g, '\n');
    if (!normalized.startsWith('---\n')) {
      return { meta: {}, body: normalized };
    }
    let endIdx = normalized.indexOf('\n---\n', 4);
    let step = 5;
    if (endIdx === -1 && normalized.endsWith('\n---')) {
      endIdx = normalized.length - 4;
      step = 4;
    }
    if (endIdx === -1) {
      return { meta: {}, body: normalized };
    }
    const yamlBlock = normalized.slice(4, endIdx);
    const body = normalized.slice(endIdx + step).replace(/^\n+/, '');
    const meta = {};
    for (const line of yamlBlock.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf(':');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      meta[key] = parseYamlValue(val);
    }
    return { meta, body };
  }

  function escapeYamlStr(str) {
    return `"${String(str ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  function serializeFrontmatter(meta, body) {
    const order = [
      'id',
      'titulo',
      'tipo',
      'status',
      'serie',
      'formato',
      'prioridade',
      'duracao_estimada',
      'data_criacao',
      'data_alvo',
      'repo_github',
      'youtube_id',
      'views',
      'tags',
      'resumo',
    ];
    const lines = ['---'];
    const written = new Set();

    const writeKey = (key) => {
      if (!(key in meta)) return;
      written.add(key);
      const val = meta[key];
      if (Array.isArray(val)) {
        const items = val.map((item) => escapeYamlStr(item)).join(', ');
        lines.push(`${key}: [${items}]`);
      } else if (typeof val === 'number' || typeof val === 'boolean') {
        lines.push(`${key}: ${val}`);
      } else {
        lines.push(`${key}: ${escapeYamlStr(val)}`);
      }
    };

    for (const key of order) writeKey(key);
    for (const key of Object.keys(meta)) {
      if (!written.has(key)) writeKey(key);
    }
    lines.push('---', '');
    return lines.join('\n') + String(body || '').replace(/^\n+/, '');
  }

  function sanitizeUrl(url) {
    const trimmed = String(url || '').trim();
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('#') || trimmed.startsWith('/')) {
      return escapeHtml(trimmed);
    }
    return '#';
  }

  function renderInline(rawText) {
    const codeTokens = [];
    let text = String(rawText || '').replace(/`([^`]+)`/g, (_, code) => {
      const idx = codeTokens.length;
      const upper = code.trim();
      if (/^\[(B-ROLL|TELA|GANCHO|CORTE|ÁUDIO|AUDIO|SFX)\]$/i.test(upper)) {
        const kind = upper.slice(1, -1).toLowerCase().replace('á', 'a');
        codeTokens.push(`<span class="cue-tag cue-${kind}">${escapeHtml(upper)}</span>`);
      } else {
        codeTokens.push(`<code class="md-inline-code">${escapeHtml(code)}</code>`);
      }
      return `\u0000CODE${idx}\u0000`;
    });

    text = escapeHtml(text);

    // Markdown links [label](url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      const trimmedHref = String(href || '').trim();
      if (/\.md(#.*)?$/i.test(trimmedHref) && !/^https?:\/\//i.test(trimmedHref)) {
        return `<a href="#" class="md-internal-link" data-rel-md="${escapeHtml(trimmedHref)}">${label}</a>`;
      }
      const safeHref = sanitizeUrl(trimmedHref);
      const isExternal = /^https?:\/\//i.test(trimmedHref);
      return `<a href="${safeHref}"${isExternal ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
    });

    // Bare URLs
    text = text.replace(/(^|[\s(>])(https?:\/\/[^\s<)]+)/g, (_, prefix, href) => {
      const safeHref = sanitizeUrl(href);
      return `${prefix}<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${escapeHtml(href)}</a>`;
    });

    // Bold, italic, strikethrough
    text = text
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // Timestamps de roteiro ex.: 00:00 ou 03:45
    text = text.replace(/\b(\d{2}:\d{2}(?:\s*[–-]\s*\d{2}:\d{2})?)\b/g, '<span class="cue-time">$1</span>');

    text = text.replace(/\u0000CODE(\d+)\u0000/g, (_, idx) => codeTokens[Number(idx)] || '');
    return text;
  }

  function isTableRow(line) {
    return /^\|.*\|$/.test(line.trim());
  }

  function isTableSeparator(line) {
    return /^\|(?:\s*:?-{2,}:?\s*\|)+$/.test(line.trim());
  }

  function splitTableRow(line) {
    const trimmed = line.trim();
    return trimmed
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim());
  }

  function renderMarkdown(markdownText) {
    const lines = String(markdownText || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let i = 0;
    let checkIndex = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        i += 1;
        continue;
      }

      if (/^<!--[\s\S]*-->$/.test(trimmed)) {
        i += 1;
        continue;
      }

      if (trimmed.startsWith('```')) {
        const lang = trimmed.slice(3).trim() || 'texto';
        const codeLines = [];
        i += 1;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i += 1;
        }
        i += 1;
        const rawCode = codeLines.join('\n');
        out.push(
          `<div class="md-code-block"><div class="md-code-head"><span>${escapeHtml(lang)}</span><button type="button" class="md-copy-btn" data-copy-code="${escapeHtml(rawCode)}">Copiar</button></div><pre><code>${escapeHtml(rawCode)}</code></pre></div>`
        );
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        out.push('<hr class="md-hr">');
        i += 1;
        continue;
      }

      const hMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
      if (hMatch) {
        const lvl = hMatch[1].length;
        const headingText = hMatch[2].trim();
        const hid = slugify(headingText.replace(/[*_`]/g, ''));
        out.push(`<h${lvl} id="${escapeHtml(hid)}">${renderInline(headingText)}</h${lvl}>`);
        i += 1;
        continue;
      }

      if (isTableRow(trimmed) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        const headers = splitTableRow(trimmed);
        const sepCells = splitTableRow(lines[i + 1]);
        const aligns = sepCells.map((c) => {
          if (c.startsWith(':') && c.endsWith(':')) return 'center';
          if (c.endsWith(':')) return 'right';
          return 'left';
        });
        i += 2;
        const rows = [];
        while (i < lines.length && isTableRow(lines[i])) {
          rows.push(splitTableRow(lines[i]));
          i += 1;
        }
        const ths = headers
          .map((h, idx) => `<th style="text-align:${aligns[idx] || 'left'}">${renderInline(h)}</th>`)
          .join('');
        const trs = rows
          .map(
            (r) =>
              `<tr>${headers
                .map((_, idx) => `<td style="text-align:${aligns[idx] || 'left'}">${renderInline(r[idx] || '')}</td>`)
                .join('')}</tr>`
          )
          .join('');
        out.push(`<div class="md-table-wrap"><table class="md-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`);
        continue;
      }

      if (trimmed.startsWith('>')) {
        const quoteLines = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
          i += 1;
        }
        out.push(`<blockquote class="md-quote">${renderInline(quoteLines.join('<br>'))}</blockquote>`);
        continue;
      }

      if (/^[-*+]\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^(\s*)[-*+]\s+/.test(lines[i])) {
          const itemLine = lines[i];
          const indent = (/^(\s*)/.exec(itemLine) || ['', ''])[1].length;
          const content = itemLine.replace(/^\s*[-*+]\s+/, '');
          const chkMatch = /^\[([ xX])\]\s+([\s\S]*)$/.exec(content);
          if (chkMatch) {
            const checked = chkMatch[1].toLowerCase() === 'x';
            const idx = checkIndex++;
            items.push(
              `<li class="md-task-item${checked ? ' is-done' : ''}" style="margin-left:${Math.min(indent * 8, 32)}px"><label><input type="checkbox" class="md-task-box" data-check-index="${idx}"${checked ? ' checked' : ''}><span>${renderInline(chkMatch[2])}</span></label></li>`
            );
          } else {
            items.push(`<li style="margin-left:${Math.min(indent * 8, 32)}px">${renderInline(content)}</li>`);
          }
          i += 1;
        }
        const hasTasks = items.some((x) => x.includes('md-task-item'));
        out.push(`<ul class="md-list${hasTasks ? ' md-task-list' : ''}">${items.join('')}</ul>`);
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          const content = lines[i].replace(/^\s*\d+\.\s+/, '');
          items.push(`<li>${renderInline(content)}</li>`);
          i += 1;
        }
        out.push(`<ol class="md-list md-ordered">${items.join('')}</ol>`);
        continue;
      }

      const pLines = [];
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !lines[i].trim().startsWith('#') &&
        !lines[i].trim().startsWith('```') &&
        !lines[i].trim().startsWith('>') &&
        !/^[-*+]\s+/.test(lines[i].trim()) &&
        !/^\d+\.\s+/.test(lines[i].trim()) &&
        !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim()) &&
        !(isTableRow(lines[i].trim()) && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
      ) {
        pLines.push(lines[i].trim());
        i += 1;
      }
      out.push(`<p>${renderInline(pLines.join(' '))}</p>`);
    }

    return out.join('\n');
  }

  function toggleCheckboxInMarkdown(markdownText, targetIndex) {
    const lines = String(markdownText || '').replace(/\r\n/g, '\n').split('\n');
    let idx = 0;
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('```')) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      const match = /^(\s*[-*+]\s+\[)([ xX])(\]\s+.*)$/.exec(lines[i]);
      if (match) {
        if (idx === targetIndex) {
          const nextState = match[2].toLowerCase() === 'x' ? ' ' : 'x';
          lines[i] = `${match[1]}${nextState}${match[3]}`;
          return lines.join('\n');
        }
        idx += 1;
      }
    }
    return markdownText;
  }

  function analyzeStats(body) {
    const plain = String(body || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]+`/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#>*_~|[\]-]/g, ' ');
    const words = plain.split(/\s+/).filter(Boolean).length;
    let checksTotal = 0;
    let checksDone = 0;
    for (const line of String(body || '').split('\n')) {
      const m = /^\s*[-*+]\s+\[([ xX])\]\s+/.exec(line);
      if (m) {
        checksTotal += 1;
        if (m[1].toLowerCase() === 'x') checksDone += 1;
      }
    }
    return {
      words,
      speakMinutes: words > 0 ? Math.max(1, Math.round(words / 140)) : 0,
      readMinutes: words > 0 ? Math.max(1, Math.round(words / 220)) : 0,
      checksTotal,
      checksDone,
    };
  }

  const api = {
    escapeHtml,
    slugify,
    parseFrontmatter,
    serializeFrontmatter,
    renderMarkdown,
    toggleCheckboxInMarkdown,
    analyzeStats,
  };

  global.CromMarkdown = api;
  global.MrjMarkdown = api;
})(window);

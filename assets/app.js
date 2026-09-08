(() => {
  'use strict';

  const STORAGE_KEY = 'ruby-transparent-generator:data:v1';
  const SETTINGS_KEY = 'ruby-transparent-generator:settings:v1';
  const SAMPLE_URL = './examples/sample.json';

  const $ = (id) => document.getElementById(id);
  const els = {
    jsonInput: $('jsonInput'), fileInput: $('fileInput'), renderBtn: $('renderBtn'), sampleBtn: $('sampleBtn'), clearBtn: $('clearBtn'),
    status: $('status'), saveState: $('saveState'), previewGrid: $('previewGrid'), countLabel: $('countLabel'), emptyState: $('emptyState'),
    scaleSelect: $('scaleSelect'), fontSizeRange: $('fontSizeRange'), fontSizeOutput: $('fontSizeOutput'),
    lineHeightRange: $('lineHeightRange'), lineHeightOutput: $('lineHeightOutput'), textColor: $('textColor'),
    includeTitleToggle: $('includeTitleToggle'), showMetaToggle: $('showMetaToggle'),
    exportAllTransparentBtn: $('exportAllTransparentBtn'), exportAllCardBtn: $('exportAllCardBtn'), exportRoot: $('exportRoot')
  };

  let currentData = { blocks: [] };
  let saveTimer = null;

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  const rubyHtml = (tokens = []) => tokens.map(token => {
    const text = escapeHtml(token?.text ?? '');
    const ruby = token?.ruby;
    if (ruby == null || ruby === '') return `<span>${text}</span>`;
    return `<ruby><rb>${text}</rb><rt>${escapeHtml(ruby)}</rt></ruby>`;
  }).join('');

  const create = (tag, className = '', html = null) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (html !== null) el.innerHTML = html;
    return el;
  };

  function setStatus(message, type = '') {
    els.status.textContent = message;
    els.status.className = `status ${type}`.trim();
  }

  function setSavedState(text) {
    els.saveState.textContent = text;
  }

  function parseInput() {
    const raw = els.jsonInput.value.trim();
    if (!raw) return { blocks: [] };
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.blocks)) throw new Error('トップレベルに blocks 配列が必要です。');
    return data;
  }

  function appendBlockBody(container, block) {
    if (Array.isArray(block.content)) {
      container.appendChild(create('p', '', rubyHtml(block.content)));
    }
    if (Array.isArray(block.paragraphs)) {
      block.paragraphs.forEach(paragraph => container.appendChild(create('p', '', rubyHtml(paragraph))));
    }
    if (Array.isArray(block.items)) {
      const ul = create('ul');
      block.items.forEach(item => ul.appendChild(create('li', '', rubyHtml(item))));
      container.appendChild(ul);
    }
    if (Array.isArray(block.steps)) {
      const steps = create('div', 'steps');
      block.steps.forEach(step => {
        const row = create('div', 'step');
        row.appendChild(create('div', 'step-num', escapeHtml(step.number ?? '')));
        row.appendChild(create('div', 'step-text', rubyHtml(step.content ?? [])));
        steps.appendChild(row);
      });
      container.appendChild(steps);
    }
  }

  function createBlockCard(block) {
    const item = create('article', 'preview-item');
    const card = create('div', `block-card style-${block.style || 'plain'}`);
    card.dataset.blockId = block.id || '';
    card.appendChild(create('div', 'block-type', escapeHtml(block.type || 'block')));
    card.appendChild(create('div', 'meta', `P${escapeHtml(block.page ?? '-')}｜${escapeHtml(block.section ?? '')}｜${escapeHtml(block.id ?? '')}`));

    if (block.title) card.appendChild(create('div', 'title', escapeHtml(block.title)));
    const content = create('div', 'content');
    appendBlockBody(content, block);
    card.appendChild(content);
    item.appendChild(card);

    const actions = create('div', 'actions');
    const transparentBtn = create('button', 'button accent', '透過PNG');
    transparentBtn.type = 'button';
    transparentBtn.addEventListener('click', () => exportBlock(card, block, 'transparent'));
    const cardBtn = create('button', 'button secondary', 'カードPNG');
    cardBtn.type = 'button';
    cardBtn.addEventListener('click', () => exportBlock(card, block, 'card'));
    actions.append(transparentBtn, cardBtn);
    item.appendChild(actions);
    return item;
  }

  function applyPreviewSettings() {
    const fontSize = Number(els.fontSizeRange.value);
    const lineHeight = Number(els.lineHeightRange.value) / 100;
    const color = els.textColor.value;
    document.documentElement.style.setProperty('--body-size', `${fontSize}px`);
    document.documentElement.style.setProperty('--body-leading', String(lineHeight));
    document.documentElement.style.setProperty('--text-color', color);
    els.fontSizeOutput.textContent = `${fontSize}px`;
    els.lineHeightOutput.textContent = lineHeight.toFixed(2);
    saveSettings();
  }

  function render() {
    els.previewGrid.innerHTML = '';
    const blocks = currentData.blocks || [];
    blocks.forEach(block => els.previewGrid.appendChild(createBlockCard(block)));
    els.countLabel.textContent = `${blocks.length}ブロック`;
    els.emptyState.hidden = blocks.length !== 0;
    applyPreviewSettings();
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    setSavedState('保存中…');
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, els.jsonInput.value);
        setSavedState('自動保存済み');
      } catch {
        setSavedState('保存不可');
      }
    }, 300);
  }

  function saveSettings() {
    const settings = {
      scale: els.scaleSelect.value,
      fontSize: els.fontSizeRange.value,
      lineHeight: els.lineHeightRange.value,
      color: els.textColor.value,
      includeTitle: els.includeTitleToggle.checked,
      showMeta: els.showMetaToggle.checked
    };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  }

  function restoreSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      if (saved.scale) els.scaleSelect.value = saved.scale;
      if (saved.fontSize) els.fontSizeRange.value = saved.fontSize;
      if (saved.lineHeight) els.lineHeightRange.value = saved.lineHeight;
      if (saved.color) els.textColor.value = saved.color;
      if (typeof saved.includeTitle === 'boolean') els.includeTitleToggle.checked = saved.includeTitle;
      if (typeof saved.showMeta === 'boolean') els.showMetaToggle.checked = saved.showMeta;
    } catch {}
  }

  async function loadSample() {
    try {
      const response = await fetch(SAMPLE_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`sample.json: HTTP ${response.status}`);
      const data = await response.json();
      els.jsonInput.value = JSON.stringify(data, null, 2);
      currentData = data;
      scheduleSave();
      render();
      setStatus('サンプルを読み込みました。', 'success');
    } catch (error) {
      setStatus(`サンプル読込エラー: ${error.message}`, 'error');
    }
  }

  function readJsonFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      els.jsonInput.value = String(reader.result || '');
      try {
        currentData = parseInput();
        scheduleSave();
        render();
        setStatus(`${file.name} を読み込みました。`, 'success');
      } catch (error) {
        setStatus(`JSONエラー: ${error.message}`, 'error');
      }
    };
    reader.onerror = () => setStatus('ファイルを読み込めませんでした。', 'error');
    reader.readAsText(file, 'utf-8');
  }

  function waitForFonts() {
    return document.fonts?.ready ?? Promise.resolve();
  }

  function nextFrames() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  function collectCssText() {
    let css = '';
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) css += `${rule.cssText}\n`;
      } catch {}
    }
    return css;
  }

  function buildExportNode(sourceCard, mode) {
    const shell = create('div', `export-shell ${mode}`);
    if (!els.includeTitleToggle.checked) shell.classList.add('hide-title');
    if (!els.showMetaToggle.checked) shell.classList.add('hide-meta');
    shell.appendChild(sourceCard.cloneNode(true));
    return shell;
  }

  async function nodeToPngBlob(node, transparent, scale) {
    await waitForFonts();
    await nextFrames();

    const rect = node.getBoundingClientRect();
    const width = Math.ceil(rect.width);
    const height = Math.ceil(rect.height);
    if (!width || !height) throw new Error('出力サイズを取得できませんでした。');

    const css = collectCssText();
    const serialized = new XMLSerializer().serializeToString(node);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width} ${height}">
        ${transparent ? '' : '<rect width="100%" height="100%" fill="#ffffff"/>'}
        <foreignObject x="0" y="0" width="${width}" height="${height}">
          <div xmlns="http://www.w3.org/1999/xhtml">
            <style>${css}</style>
            ${serialized}
          </div>
        </foreignObject>
      </svg>`;

    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const image = new Image();
    image.decoding = 'async';
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('PNG変換用SVGを読み込めませんでした。'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvasを作成できませんでした。');
    if (!transparent) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNGの生成に失敗しました。');
    return blob;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  async function exportBlock(sourceCard, block, mode) {
    const scale = Number(els.scaleSelect.value) || 3;
    const id = block.id || 'block';
    setStatus(`${id} を${mode === 'transparent' ? '透過' : 'カード'}PNGに変換中…`);
    const node = buildExportNode(sourceCard, mode);
    els.exportRoot.replaceChildren(node);
    try {
      const blob = await nodeToPngBlob(node, mode === 'transparent', scale);
      downloadBlob(blob, `${id}__${mode}@${scale}x.png`);
      setStatus(`${id} を保存しました。`, 'success');
    } catch (error) {
      console.error(error);
      setStatus(`PNG書き出しエラー: ${error.message}`, 'error');
    } finally {
      els.exportRoot.replaceChildren();
    }
  }

  async function exportAll(mode) {
    const cards = [...els.previewGrid.querySelectorAll('.block-card')];
    if (!cards.length) return setStatus('保存するブロックがありません。', 'error');
    const buttons = [els.exportAllTransparentBtn, els.exportAllCardBtn];
    buttons.forEach(button => button.disabled = true);
    try {
      for (const card of cards) {
        const id = card.dataset.blockId || 'block';
        const block = currentData.blocks.find(item => (item.id || '') === id) || { id };
        await exportBlock(card, block, mode);
        await sleep(180);
      }
      setStatus(`全${cards.length}ブロックの保存処理が完了しました。`, 'success');
    } finally {
      buttons.forEach(button => button.disabled = false);
    }
  }

  function init() {
    restoreSettings();
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      els.jsonInput.value = saved;
      try { currentData = parseInput(); } catch { currentData = { blocks: [] }; }
      render();
    } else {
      loadSample();
    }

    els.renderBtn.addEventListener('click', () => {
      try {
        currentData = parseInput();
        scheduleSave();
        render();
        setStatus(`${currentData.blocks.length}ブロックを表示しました。`, 'success');
      } catch (error) {
        setStatus(`JSONエラー: ${error.message}`, 'error');
      }
    });

    els.sampleBtn.addEventListener('click', loadSample);
    els.clearBtn.addEventListener('click', () => {
      els.jsonInput.value = '';
      currentData = { blocks: [] };
      scheduleSave();
      render();
      setStatus('入力をクリアしました。');
    });
    els.fileInput.addEventListener('change', event => readJsonFile(event.target.files?.[0]));
    els.jsonInput.addEventListener('input', scheduleSave);

    [els.fontSizeRange, els.lineHeightRange, els.textColor].forEach(el => el.addEventListener('input', applyPreviewSettings));
    [els.scaleSelect, els.includeTitleToggle, els.showMetaToggle].forEach(el => el.addEventListener('change', saveSettings));

    els.exportAllTransparentBtn.addEventListener('click', () => exportAll('transparent'));
    els.exportAllCardBtn.addEventListener('click', () => exportAll('card'));
    applyPreviewSettings();
  }

  init();
})();

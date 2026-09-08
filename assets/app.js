
(() => {
  'use strict';

  const STORAGE_KEY = 'ruby-transparent-generator:data:v2';
  const SETTINGS_KEY = 'ruby-transparent-generator:settings:v2';
  const SAMPLE_URL = './examples/sample.json';
  const DEFAULTS = { aspectRatio: 'auto', align: 'top-left', padding: 'medium' };
  const PADDING_MAP = { small: 28, medium: 52, large: 84 };
  const ASPECT_MAP = {
    '1:1': 1,
    '4:3': 4 / 3,
    '3:4': 3 / 4,
    '16:9': 16 / 9,
    '9:16': 9 / 16,
    'a-landscape': 1.414,
    'a-portrait': 1 / 1.414
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    jsonInput: $('jsonInput'), fileInput: $('fileInput'), renderBtn: $('renderBtn'), sampleBtn: $('sampleBtn'), clearBtn: $('clearBtn'),
    status: $('status'), saveState: $('saveState'), previewGrid: $('previewGrid'), countLabel: $('countLabel'), emptyState: $('emptyState'),
    scaleSelect: $('scaleSelect'), fontSizeRange: $('fontSizeRange'), fontSizeOutput: $('fontSizeOutput'),
    lineHeightRange: $('lineHeightRange'), lineHeightOutput: $('lineHeightOutput'), textColor: $('textColor'),
    includeTitleToggle: $('includeTitleToggle'), showMetaToggle: $('showMetaToggle'),
    defaultAspectSelect: $('defaultAspectSelect'), defaultAlignSelect: $('defaultAlignSelect'), defaultPaddingSelect: $('defaultPaddingSelect'),
    applyRecommendedBtn: $('applyRecommendedBtn'), applyDefaultsBtn: $('applyDefaultsBtn'),
    exportAllTransparentBtn: $('exportAllTransparentBtn'), exportAllCardBtn: $('exportAllCardBtn'), exportRoot: $('exportRoot')
  };

  let currentData = { blocks: [] };
  let saveTimer = null;
  let blockSettings = {};

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

  function getRecommendedPreset(block = {}) {
    if (block.export_preset) {
      return {
        aspectRatio: normalizeAspect(block.export_preset.aspect_ratio) || DEFAULTS.aspectRatio,
        align: normalizeAlign(block.export_preset.align) || DEFAULTS.align,
        padding: normalizePadding(block.export_preset.padding) || DEFAULTS.padding,
        source: 'JSON'
      };
    }
    const type = String(block.type || '').toLowerCase();
    const title = String(block.title || '');
    let preset = { ...DEFAULTS, source: 'おすすめ' };
    if (type === 'steps') preset = { aspectRatio: '3:4', align: 'top-left', padding: 'medium', source: 'おすすめ' };
    else if (type === 'materials') preset = { aspectRatio: '4:3', align: 'top-left', padding: 'medium', source: 'おすすめ' };
    else if (type === 'observation_points') preset = { aspectRatio: '4:3', align: 'top-left', padding: 'medium', source: 'おすすめ' };
    else if (type === 'safety' || type === 'note') preset = { aspectRatio: '1:1', align: 'top-left', padding: 'medium', source: 'おすすめ' };
    else if (type === 'question' || /問い|キャッチ|大見出し/.test(title)) preset = { aspectRatio: '16:9', align: 'center', padding: 'medium', source: 'おすすめ' };
    else if (type === 'reference') preset = { aspectRatio: 'a-landscape', align: 'top-left', padding: 'small', source: 'おすすめ' };
    else if (type === 'lead' || type === 'summary') preset = { aspectRatio: '4:3', align: 'top-left', padding: 'medium', source: 'おすすめ' };
    else if (type === 'mini_column' || type === 'trivia') preset = { aspectRatio: '4:3', align: 'top-left', padding: 'medium', source: 'おすすめ' };
    return preset;
  }

  function normalizeAspect(v) {
    if (typeof v !== 'string') return null;
    const s = v.trim();
    return ['auto','1:1','4:3','3:4','16:9','9:16','a-landscape','a-portrait'].includes(s) ? s : null;
  }
  function normalizeAlign(v) {
    if (typeof v !== 'string') return null;
    const s = v.trim();
    return ['top-left','top-center','center-left','center','bottom-left','bottom-center'].includes(s) ? s : null;
  }
  function normalizePadding(v) {
    if (typeof v !== 'string') return null;
    const s = v.trim();
    return ['small','medium','large'].includes(s) ? s : null;
  }

  function getGlobalDefaults() {
    return {
      aspectRatio: normalizeAspect(els.defaultAspectSelect.value) || DEFAULTS.aspectRatio,
      align: normalizeAlign(els.defaultAlignSelect.value) || DEFAULTS.align,
      padding: normalizePadding(els.defaultPaddingSelect.value) || DEFAULTS.padding
    };
  }

  function getBlockOptions(block) {
    const id = block?.id || '';
    const override = blockSettings[id];
    if (override) return { ...override };
    const preset = getRecommendedPreset(block);
    return { aspectRatio: preset.aspectRatio, align: preset.align, padding: preset.padding };
  }

  function setBlockOptions(blockId, options) {
    blockSettings[blockId] = {
      aspectRatio: normalizeAspect(options.aspectRatio) || DEFAULTS.aspectRatio,
      align: normalizeAlign(options.align) || DEFAULTS.align,
      padding: normalizePadding(options.padding) || DEFAULTS.padding
    };
    saveSettings();
  }

  function createSelect(options, value, onChange) {
    const select = document.createElement('select');
    options.forEach(({value: val, label}) => {
      const option = document.createElement('option');
      option.value = val;
      option.textContent = label;
      if (val === value) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener('change', onChange);
    return select;
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

    const tools = create('div', 'block-tools');
    const head = create('div', 'tools-head');
    const preset = getRecommendedPreset(block);
    head.appendChild(create('strong', '', '出力設定'));
    head.appendChild(create('span', 'preset-tag', `${preset.source}：${labelAspect(preset.aspectRatio)} / ${labelAlign(preset.align)} / 余白${labelPadding(preset.padding)}`));
    tools.appendChild(head);

    const grid = create('div', 'block-export-settings');
    const current = getBlockOptions(block);

    const aspectLabel = create('label');
    aspectLabel.appendChild(create('span', '', '縦横比'));
    const aspectSelect = createSelect([
      {value:'auto', label:'自動フィット'}, {value:'1:1', label:'1:1'}, {value:'4:3', label:'4:3'}, {value:'3:4', label:'3:4'},
      {value:'16:9', label:'16:9'}, {value:'9:16', label:'9:16'}, {value:'a-landscape', label:'A横'}, {value:'a-portrait', label:'A縦'}
    ], current.aspectRatio, () => setBlockOptions(block.id, { ...getBlockOptions(block), aspectRatio: aspectSelect.value }));
    aspectLabel.appendChild(aspectSelect);

    const alignLabel = create('label');
    alignLabel.appendChild(create('span', '', '配置'));
    const alignSelect = createSelect([
      {value:'top-left', label:'左上'}, {value:'top-center', label:'上中央'}, {value:'center-left', label:'左中央'},
      {value:'center', label:'中央'}, {value:'bottom-left', label:'左下'}, {value:'bottom-center', label:'下中央'}
    ], current.align, () => setBlockOptions(block.id, { ...getBlockOptions(block), align: alignSelect.value }));
    alignLabel.appendChild(alignSelect);

    const padLabel = create('label');
    padLabel.appendChild(create('span', '', '余白'));
    const padSelect = createSelect([
      {value:'small', label:'小'}, {value:'medium', label:'中'}, {value:'large', label:'大'}
    ], current.padding, () => setBlockOptions(block.id, { ...getBlockOptions(block), padding: padSelect.value }));
    padLabel.appendChild(padSelect);

    grid.append(aspectLabel, alignLabel, padLabel);
    tools.appendChild(grid);

    const mini = create('div', 'mini-actions');
    const recBtn = create('button', 'button subtle small-btn', 'おすすめ');
    recBtn.type = 'button';
    recBtn.addEventListener('click', () => {
      const rec = getRecommendedPreset(block);
      setBlockOptions(block.id, rec);
      aspectSelect.value = rec.aspectRatio;
      alignSelect.value = rec.align;
      padSelect.value = rec.padding;
      setStatus(`${block.id} におすすめ設定を適用しました。`, 'success');
    });
    const defaultBtn = create('button', 'button subtle small-btn', '既定を適用');
    defaultBtn.type = 'button';
    defaultBtn.addEventListener('click', () => {
      const defs = getGlobalDefaults();
      setBlockOptions(block.id, defs);
      aspectSelect.value = defs.aspectRatio;
      alignSelect.value = defs.align;
      padSelect.value = defs.padding;
      setStatus(`${block.id} に既定設定を適用しました。`, 'success');
    });
    mini.append(recBtn, defaultBtn);
    tools.appendChild(mini);
    item.appendChild(tools);

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

  function labelAspect(v) {
    return ({'auto':'自動','1:1':'1:1','4:3':'4:3','3:4':'3:4','16:9':'16:9','9:16':'9:16','a-landscape':'A横','a-portrait':'A縦'})[v] || v;
  }
  function labelAlign(v) {
    return ({'top-left':'左上','top-center':'上中央','center-left':'左中央','center':'中央','bottom-left':'左下','bottom-center':'下中央'})[v] || v;
  }
  function labelPadding(v) {
    return ({small:'小', medium:'中', large:'大'})[v] || v;
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

  function ensureBlockSettings() {
    const next = {};
    (currentData.blocks || []).forEach(block => {
      const id = block.id || `block-${Math.random()}`;
      const existing = blockSettings[id];
      if (existing) next[id] = existing;
      else {
        const preset = getRecommendedPreset(block);
        next[id] = { aspectRatio: preset.aspectRatio, align: preset.align, padding: preset.padding };
      }
    });
    blockSettings = next;
  }

  function render() {
    ensureBlockSettings();
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
      showMeta: els.showMetaToggle.checked,
      defaultAspect: els.defaultAspectSelect.value,
      defaultAlign: els.defaultAlignSelect.value,
      defaultPadding: els.defaultPaddingSelect.value,
      blockSettings
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
      if (saved.defaultAspect) els.defaultAspectSelect.value = saved.defaultAspect;
      if (saved.defaultAlign) els.defaultAlignSelect.value = saved.defaultAlign;
      if (saved.defaultPadding) els.defaultPaddingSelect.value = saved.defaultPadding;
      if (saved.blockSettings && typeof saved.blockSettings === 'object') blockSettings = saved.blockSettings;
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
        for (const rule of sheet.cssRules) css += `${rule.cssText}
`;
      } catch {}
    }
    return css;
  }

  function buildExportContent(sourceCard, mode) {
    const shell = create('div', `export-content-shell ${mode}`);
    if (!els.includeTitleToggle.checked) shell.classList.add('hide-title');
    if (!els.showMetaToggle.checked) shell.classList.add('hide-meta');
    shell.appendChild(sourceCard.cloneNode(true));
    return shell;
  }

  function computeFittedCanvas(contentWidth, contentHeight, aspectRatio, padPx) {
    const minWidth = Math.ceil(contentWidth + padPx * 2);
    const minHeight = Math.ceil(contentHeight + padPx * 2);
    const ratio = ASPECT_MAP[aspectRatio];
    if (!ratio) return { width: minWidth, height: minHeight };
    let width = minWidth;
    let height = Math.ceil(width / ratio);
    if (height < minHeight) {
      height = minHeight;
      width = Math.ceil(height * ratio);
    }
    return { width, height };
  }

  function buildExportNode(sourceCard, mode, block) {
    const content = buildExportContent(sourceCard, mode);
    const options = getBlockOptions(block);
    return { content, options };
  }

  async function buildMeasuredExportNode(sourceCard, mode, block) {
    const { content, options } = buildExportNode(sourceCard, mode, block);
    els.exportRoot.replaceChildren(content);
    await waitForFonts();
    await nextFrames();

    if (options.aspectRatio === 'auto') {
      return { node: content, options };
    }

    const rect = content.getBoundingClientRect();
    const padPx = PADDING_MAP[options.padding] || PADDING_MAP.medium;
    const dims = computeFittedCanvas(rect.width, rect.height, options.aspectRatio, padPx);
    const shell = create('div', `export-shell fixed-ratio ${mode}`);
    shell.style.setProperty('--canvas-width', `${dims.width}px`);
    shell.style.setProperty('--canvas-height', `${dims.height}px`);
    shell.style.setProperty('--canvas-pad', `${padPx}px`);

    const canvas = create('div', 'export-canvas');
    const holder = create('div', `export-holder align-${options.align}`);
    holder.appendChild(content);
    canvas.appendChild(holder);
    shell.appendChild(canvas);
    els.exportRoot.replaceChildren(shell);
    await nextFrames();
    return { node: shell, options };
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
    const options = getBlockOptions(block);
    setStatus(`${id} を${mode === 'transparent' ? '透過' : 'カード'}PNGに変換中…`);
    try {
      const { node } = await buildMeasuredExportNode(sourceCard, mode, block);
      const blob = await nodeToPngBlob(node, mode === 'transparent', scale);
      const ratioSuffix = options.aspectRatio === 'auto' ? 'auto' : options.aspectRatio;
      downloadBlob(blob, `${id}__${mode}__${ratioSuffix}@${scale}x.png`);
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

  function applyRecommendedToAll() {
    (currentData.blocks || []).forEach(block => {
      const rec = getRecommendedPreset(block);
      setBlockOptions(block.id, rec);
    });
    render();
    setStatus('おすすめ設定を全ブロックに適用しました。', 'success');
  }

  function applyDefaultsToAll() {
    const defs = getGlobalDefaults();
    (currentData.blocks || []).forEach(block => {
      setBlockOptions(block.id, defs);
    });
    render();
    setStatus('既定設定を全ブロックに適用しました。', 'success');
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
      blockSettings = {};
      scheduleSave();
      saveSettings();
      render();
      setStatus('入力をクリアしました。');
    });
    els.fileInput.addEventListener('change', event => readJsonFile(event.target.files?.[0]));
    els.jsonInput.addEventListener('input', scheduleSave);

    [els.fontSizeRange, els.lineHeightRange, els.textColor].forEach(el => el.addEventListener('input', applyPreviewSettings));
    [els.scaleSelect, els.includeTitleToggle, els.showMetaToggle, els.defaultAspectSelect, els.defaultAlignSelect, els.defaultPaddingSelect].forEach(el => el.addEventListener('change', saveSettings));

    els.applyRecommendedBtn.addEventListener('click', applyRecommendedToAll);
    els.applyDefaultsBtn.addEventListener('click', applyDefaultsToAll);
    els.exportAllTransparentBtn.addEventListener('click', () => exportAll('transparent'));
    els.exportAllCardBtn.addEventListener('click', () => exportAll('card'));
    applyPreviewSettings();
  }

  init();
})();

(() => {
  'use strict';

  const STORAGE_KEY = 'ruby-transparent-generator:data:v3';
  const SETTINGS_KEY = 'ruby-transparent-generator:settings:v3';
  const OLD_STORAGE_KEY = 'ruby-transparent-generator:data:v2';
  const OLD_SETTINGS_KEY = 'ruby-transparent-generator:settings:v2';
  const SAMPLE_URL = './examples/sample.json';
  const DEFAULTS = { aspectRatio: 'auto', align: 'top-left', padding: 'medium' };
  const PADDING_MAP = { small: 28, medium: 52, large: 84 };
  const ASPECT_MAP = {
    '1:1': 1,
    '4:3': 4 / 3,
    '3:4': 3 / 4,
    '16:9': 16 / 9,
    '9:16': 9 / 16,
    'a-landscape': Math.SQRT2,
    'a-portrait': 1 / Math.SQRT2
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
    exportAllTransparentBtn: $('exportAllTransparentBtn'), exportAllCardBtn: $('exportAllCardBtn'), exportRoot: $('exportRoot'),
    zipReadyPanel: $('zipReadyPanel'), zipReadyInfo: $('zipReadyInfo'), savePreparedZipBtn: $('savePreparedZipBtn'), downloadPreparedZipBtn: $('downloadPreparedZipBtn')
  };

  let currentData = { blocks: [] };
  let saveTimer = null;
  let blockSettings = {};
  let preparedZip = null;
  let previewRefreshToken = 0;

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

  function setBlockOptions(blockId, options, refresh = true) {
    blockSettings[blockId] = {
      aspectRatio: normalizeAspect(options.aspectRatio) || DEFAULTS.aspectRatio,
      align: normalizeAlign(options.align) || DEFAULTS.align,
      padding: normalizePadding(options.padding) || DEFAULTS.padding
    };
    saveSettings();
    if (refresh) schedulePreviewRefresh();
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

  function labelAspect(v) {
    return ({'auto':'自動','1:1':'1:1','4:3':'4:3','3:4':'3:4','16:9':'16:9','9:16':'9:16','a-landscape':'A横','a-portrait':'A縦'})[v] || v;
  }
  function labelAlign(v) {
    return ({'top-left':'左上','top-center':'上中央','center-left':'左中央','center':'中央','bottom-left':'左下','bottom-center':'下中央'})[v] || v;
  }
  function labelPadding(v) {
    return ({small:'小', medium:'中', large:'大'})[v] || v;
  }

  function createBlockCard(block) {
    const item = create('article', 'preview-item');
    item.dataset.blockId = block.id || '';

    const stage = create('div', 'preview-stage auto');
    const holder = create('div', 'preview-stage-holder');
    const scaledFrame = create('div', 'preview-scaled-frame');
    const card = create('div', `block-card style-${block.style || 'plain'}`);
    card.dataset.blockId = block.id || '';
    card.appendChild(create('div', 'block-type', escapeHtml(block.type || 'block')));
    card.appendChild(create('div', 'meta', `P${escapeHtml(block.page ?? '-')}｜${escapeHtml(block.section ?? '')}｜${escapeHtml(block.id ?? '')}`));
    if (block.title) card.appendChild(create('div', 'title', escapeHtml(block.title)));
    const content = create('div', 'content');
    appendBlockBody(content, block);
    card.appendChild(content);
    scaledFrame.appendChild(card);
    holder.appendChild(scaledFrame);
    stage.appendChild(holder);
    item.appendChild(stage);

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
      setBlockOptions(block.id, rec, false);
      aspectSelect.value = rec.aspectRatio;
      alignSelect.value = rec.align;
      padSelect.value = rec.padding;
      schedulePreviewRefresh();
      setStatus(`${block.id} におすすめ設定を適用しました。`, 'success');
    });
    const defaultBtn = create('button', 'button subtle small-btn', '既定を適用');
    defaultBtn.type = 'button';
    defaultBtn.addEventListener('click', () => {
      const defs = getGlobalDefaults();
      setBlockOptions(block.id, defs, false);
      aspectSelect.value = defs.aspectRatio;
      alignSelect.value = defs.align;
      padSelect.value = defs.padding;
      schedulePreviewRefresh();
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
    schedulePreviewRefresh();
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
    schedulePreviewRefresh();
  }

  function schedulePreviewRefresh() {
    const token = ++previewRefreshToken;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (token !== previewRefreshToken) return;
      refreshAllPreviewStages();
    }));
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

  function applyPreviewAlignment(holder, align) {
    holder.className = `preview-stage-holder align-${align}`;
  }

  function refreshAllPreviewStages() {
    const items = [...els.previewGrid.querySelectorAll('.preview-item')];
    items.forEach(item => {
      const id = item.dataset.blockId || '';
      const block = currentData.blocks.find(b => (b.id || '') === id) || { id };
      refreshPreviewStage(item, block);
    });
  }

  function refreshPreviewStage(item, block) {
    const stage = item.querySelector('.preview-stage');
    const holder = item.querySelector('.preview-stage-holder');
    const frame = item.querySelector('.preview-scaled-frame');
    const card = item.querySelector('.block-card');
    if (!stage || !holder || !frame || !card) return;

    const options = getBlockOptions(block);
    stage.className = 'preview-stage auto';
    stage.style.removeProperty('width');
    stage.style.removeProperty('height');
    stage.style.removeProperty('--preview-pad');
    holder.className = 'preview-stage-holder';
    holder.style.removeProperty('padding');
    frame.style.removeProperty('width');
    frame.style.removeProperty('height');
    card.style.removeProperty('transform');
    card.style.removeProperty('transform-origin');
    card.style.width = '100%';

    const naturalWidth = Math.max(260, Math.floor(stage.clientWidth || item.clientWidth || 360));
    card.style.width = `${naturalWidth}px`;
    const naturalHeight = Math.ceil(card.getBoundingClientRect().height);
    card.dataset.naturalWidth = String(naturalWidth);
    card.dataset.naturalHeight = String(naturalHeight);

    if (options.aspectRatio === 'auto') {
      stage.className = 'preview-stage auto';
      stage.style.width = '100%';
      frame.style.width = '100%';
      frame.style.height = 'auto';
      card.style.width = '100%';
      return;
    }

    const padPx = PADDING_MAP[options.padding] || PADDING_MAP.medium;
    const dims = computeFittedCanvas(naturalWidth, naturalHeight, options.aspectRatio, padPx);
    const availableWidth = Math.max(260, item.clientWidth || 360);
    const maxPreviewHeight = 560;
    const previewScale = Math.min(availableWidth / dims.width, maxPreviewHeight / dims.height, 1);
    const displayWidth = Math.max(120, Math.round(dims.width * previewScale));
    const displayHeight = Math.max(120, Math.round(dims.height * previewScale));
    const contentDisplayWidth = naturalWidth * previewScale;
    const contentDisplayHeight = naturalHeight * previewScale;

    stage.className = 'preview-stage fixed-ratio';
    stage.style.width = `${displayWidth}px`;
    stage.style.height = `${displayHeight}px`;
    stage.style.marginInline = 'auto';
    holder.style.padding = `${padPx * previewScale}px`;
    applyPreviewAlignment(holder, options.align);
    frame.style.width = `${contentDisplayWidth}px`;
    frame.style.height = `${contentDisplayHeight}px`;
    card.style.width = `${naturalWidth}px`;
    card.style.transformOrigin = 'top left';
    card.style.transform = `scale(${previewScale})`;
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
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || localStorage.getItem(OLD_SETTINGS_KEY) || '{}');
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

  function collectCssText() {
    let css = '';
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) css += `${rule.cssText}\n`;
      } catch {}
    }
    return css;
  }

  function buildExportContent(sourceCard, mode) {
    const shell = create('div', `export-content-shell ${mode}`);
    if (!els.includeTitleToggle.checked) shell.classList.add('hide-title');
    if (!els.showMetaToggle.checked) shell.classList.add('hide-meta');
    const clone = sourceCard.cloneNode(true);
    clone.style.transform = 'none';
    clone.style.transformOrigin = 'top left';
    const naturalWidth = Number(sourceCard.dataset.naturalWidth) || Math.ceil(sourceCard.getBoundingClientRect().width) || 720;
    clone.style.width = `${naturalWidth}px`;
    shell.appendChild(clone);
    return shell;
  }

  async function buildMeasuredExportNode(sourceCard, mode, block) {
    const content = buildExportContent(sourceCard, mode);
    const options = getBlockOptions(block);
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

  async function createBlockPng(sourceCard, block, mode) {
    const scale = Number(els.scaleSelect.value) || 3;
    const id = block.id || 'block';
    const options = getBlockOptions(block);
    const { node } = await buildMeasuredExportNode(sourceCard, mode, block);
    const blob = await nodeToPngBlob(node, mode === 'transparent', scale);
    const ratioSuffix = options.aspectRatio === 'auto' ? 'auto' : options.aspectRatio.replace(':','x');
    const filename = `${safeFilename(id)}__${mode}__${ratioSuffix}@${scale}x.png`;
    els.exportRoot.replaceChildren();
    return { blob, filename };
  }

  function safeFilename(value) {
    return String(value || 'block').replace(/[\\/:*?"<>|]/g, '_');
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
    const id = block.id || 'block';
    setStatus(`${id} を${mode === 'transparent' ? '透過' : 'カード'}PNGに変換中…`);
    try {
      const { blob, filename } = await createBlockPng(sourceCard, block, mode);
      downloadBlob(blob, filename);
      setStatus(`${id} を保存しました。`, 'success');
    } catch (error) {
      console.error(error);
      setStatus(`PNG書き出しエラー: ${error.message}`, 'error');
    } finally {
      els.exportRoot.replaceChildren();
    }
  }

  // --- minimal uncompressed ZIP writer (no external library required) ---
  let CRC_TABLE = null;
  function crcTable() {
    if (CRC_TABLE) return CRC_TABLE;
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[n] = c >>> 0;
    }
    return CRC_TABLE;
  }
  function crc32(bytes) {
    const table = crcTable();
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    const dosTime = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((Math.floor(date.getSeconds() / 2)) & 31);
    const dosDate = (((year - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31);
    return { dosTime, dosDate };
  }
  function u16(v) { const a = new Uint8Array(2); new DataView(a.buffer).setUint16(0, v, true); return a; }
  function u32(v) { const a = new Uint8Array(4); new DataView(a.buffer).setUint32(0, v >>> 0, true); return a; }
  function concatBytes(parts) {
    const len = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(len);
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return out;
  }
  async function makeZipBlob(entries) {
    const enc = new TextEncoder();
    const locals = [];
    const centrals = [];
    let offset = 0;
    const { dosTime, dosDate } = dosDateTime();

    for (const entry of entries) {
      const name = enc.encode(entry.name);
      const data = new Uint8Array(await entry.blob.arrayBuffer());
      const crc = crc32(data);
      const local = concatBytes([
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data
      ]);
      locals.push(local);
      const central = concatBytes([
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(offset), name
      ]);
      centrals.push(central);
      offset += local.length;
    }

    const centralBytes = concatBytes(centrals);
    const localBytes = concatBytes(locals);
    const eocd = concatBytes([
      u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
      u32(centralBytes.length), u32(localBytes.length), u16(0)
    ]);
    return new Blob([localBytes, centralBytes, eocd], { type: 'application/zip' });
  }

  function defaultZipName(mode) {
    const meta = currentData.issue_metadata || {};
    const title = safeFilename(meta.publication || meta.title || 'ruby-blocks');
    const month = meta.month ? `-${String(meta.month).padStart(2,'0')}` : '';
    return `${title}${month}__${mode}-png.zip`;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function clearPreparedZip() {
    preparedZip = null;
    if (els.zipReadyPanel) els.zipReadyPanel.hidden = true;
    if (els.zipReadyInfo) els.zipReadyInfo.textContent = '';
  }

  function showPreparedZip(blob, filename, entriesCount) {
    if (!blob || blob.size <= 22) throw new Error('生成されたZIPが空です。');
    preparedZip = { blob, filename, entriesCount };
    els.zipReadyPanel.hidden = false;
    els.zipReadyInfo.textContent = `${filename} / ${entriesCount}ファイル / ${formatBytes(blob.size)}`;
  }

  async function savePreparedZipWithPicker() {
    if (!preparedZip) return setStatus('先にZIPを生成してください。', 'error');
    const { blob, filename } = preparedZip;
    if (!window.showSaveFilePicker) {
      downloadBlob(blob, filename);
      setStatus(`ZIPをダウンロードしました（${formatBytes(blob.size)}）。`, 'success');
      return;
    }
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }]
      });
      const writable = await handle.createWritable();
      const buffer = await blob.arrayBuffer();
      if (!buffer.byteLength) throw new Error('ZIPデータが0バイトです。');
      await writable.write(new Uint8Array(buffer));
      await writable.close();
      setStatus(`ZIPを保存しました（${formatBytes(blob.size)}）。`, 'success');
    } catch (error) {
      if (error?.name === 'AbortError') {
        setStatus('ZIP保存をキャンセルしました。');
        return;
      }
      console.error(error);
      setStatus(`ZIP保存エラー: ${error.message}`, 'error');
    }
  }

  function downloadPreparedZip() {
    if (!preparedZip) return setStatus('先にZIPを生成してください。', 'error');
    downloadBlob(preparedZip.blob, preparedZip.filename);
    setStatus(`ZIPをダウンロードしました（${formatBytes(preparedZip.blob.size)}）。`, 'success');
  }

  async function exportAll(mode) {
    const cards = [...els.previewGrid.querySelectorAll('.block-card')];
    if (!cards.length) return setStatus('保存するブロックがありません。', 'error');
    const buttons = [els.exportAllTransparentBtn, els.exportAllCardBtn];
    buttons.forEach(button => button.disabled = true);
    clearPreparedZip();
    const entries = [];
    try {
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const id = card.dataset.blockId || 'block';
        const block = currentData.blocks.find(item => (item.id || '') === id) || { id };
        setStatus(`PNG生成中… ${i + 1}/${cards.length}：${id}`);
        const { blob, filename } = await createBlockPng(card, block, mode);
        if (!blob || blob.size === 0) throw new Error(`${id} のPNG生成結果が0バイトです。`);
        entries.push({ name: filename, blob });
      }
      if (!entries.length) throw new Error('ZIPに入れるPNGがありません。');
      setStatus(`PNG ${entries.length}個をZIPにまとめています…`);
      const zipBlob = await makeZipBlob(entries);
      if (!zipBlob || zipBlob.size <= 22) throw new Error('ZIP生成結果が空です。');
      const filename = defaultZipName(mode);
      showPreparedZip(zipBlob, filename, entries.length);
      setStatus(`ZIP生成完了：${entries.length}ファイル / ${formatBytes(zipBlob.size)}。下の保存ボタンを押してください。`, 'success');
    } catch (error) {
      console.error(error);
      clearPreparedZip();
      setStatus(`ZIP生成エラー: ${error.message}`, 'error');
    } finally {
      els.exportRoot.replaceChildren();
      buttons.forEach(button => button.disabled = false);
    }
  }

  async function startBatchExport(mode) {
    await exportAll(mode);
  }

  function applyRecommendedToAll() {
    (currentData.blocks || []).forEach(block => {
      const rec = getRecommendedPreset(block);
      setBlockOptions(block.id, rec, false);
    });
    render();
    setStatus('おすすめ設定を全ブロックに適用しました。', 'success');
  }

  function applyDefaultsToAll() {
    const defs = getGlobalDefaults();
    (currentData.blocks || []).forEach(block => setBlockOptions(block.id, defs, false));
    render();
    setStatus('既定設定を全ブロックに適用しました。', 'success');
  }

  function init() {
    restoreSettings();
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(OLD_STORAGE_KEY);
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
    els.exportAllTransparentBtn.addEventListener('click', () => startBatchExport('transparent'));
    els.exportAllCardBtn.addEventListener('click', () => startBatchExport('card'));
    els.savePreparedZipBtn.addEventListener('click', savePreparedZipWithPicker);
    els.downloadPreparedZipBtn.addEventListener('click', downloadPreparedZip);
    window.addEventListener('resize', schedulePreviewRefresh);
    applyPreviewSettings();
  }

  init();
})();

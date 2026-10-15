const loadedFiles = {
  back: [], logo: [], pokemon: [], ball: [], etc: [], font: []
};

let pendingConfig = null;

const canvas = document.getElementById('thumbnailCanvas');
const ctx = canvas.getContext('2d');
const imageCache = {};

function loadImage(src) {
  if (!src || src === 'none') return Promise.resolve(null);
  if (imageCache[src]) return Promise.resolve(imageCache[src]);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { imageCache[src] = img; resolve(img); };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

let logoList = [{ file: 'none', x: 60, y: 50, scale: 1.0 }];
let pokemonList = [{ pokemon: 'none', ball: 'none', etc: 'none', x: 400, y: 300, scale: 1.0 }];
let titleList = [
  {
    text: '色違い配布交換会',
    font: 'sans-serif',
    size: 70,
    colorMode: 'solid',
    color: '#facc15',
    colorTop: '#ffffff',
    colorBottom: '#facc15',
    strokeMode: 'single',
    strokeColor: '#dc2626',
    strokeWidth: 12,
    strokeColorInner: '#ffffff',
    strokeWidthInner: 6,
    strokeColorOuter: '#dc2626',
    strokeWidthOuter: 14,
    x: 1240,
    y: 40
  }
];

let isDragging = false;
let dragTarget = null;
let dragOffsetX = 0, dragOffsetY = 0;
let currentHitBoxes = [];

window.addEventListener('DOMContentLoaded', () => {
  renderLogoSlots();
  renderTitleSlots();
  renderPokemonSlots();
  updateCanvas();
  setupDragEvents();
  setupDropZone();
});

function switchTab(tabId, evt) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  evt.target.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

function syncColorInput(pickerId, textId) {
  const val = document.getElementById(pickerId).value;
  document.getElementById(textId).value = val.toUpperCase();
}

function syncColorPicker(textId, pickerId) {
  let val = document.getElementById(textId).value.trim();
  if (!val.startsWith('#')) val = '#' + val;
  if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
    document.getElementById(pickerId).value = val;
  }
}

function setupDropZone() {
  const dropZone = document.getElementById('dropZone');

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFilesUpload(files);
    }
  }, false);
}

async function handleFilesUpload(fileList) {
  const files = Array.from(fileList);
  let loadedZipCount = 0;

  for (const file of files) {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.zip')) {
      await processZipFile(file);
      loadedZipCount++;
    } else if (lowerName.endsWith('.json')) {
      await processJsonFile(file);
    }
  }

  if (loadedZipCount > 0 && pendingConfig) {
    applyConfig(pendingConfig);
    pendingConfig = null;
  }
}

async function processZipFile(file) {
  try {
    const zip = await JSZip.loadAsync(file);
    Object.keys(loadedFiles).forEach(key => {
      if (key !== 'font') loadedFiles[key] = [];
    });

    for (const [filename, zipObj] of Object.entries(zip.files)) {
      if (zipObj.dir) continue;
      const lower = filename.toLowerCase();
      let category = null;

      if (lower.includes('back/')) category = 'back';
      else if (lower.includes('logo/')) category = 'logo';
      else if (lower.includes('pokemon/')) category = 'pokemon';
      else if (lower.includes('ball/')) category = 'ball';
      else if (lower.includes('etc/')) category = 'etc';
      else if (lower.includes('font/')) category = 'font';

      if (category) {
        const blob = await zipObj.async('blob');
        const cleanName = filename.split('/').pop();
        if (cleanName && !cleanName.startsWith('.')) {
          const url = URL.createObjectURL(blob);
          loadedFiles[category].push({
            name: cleanName,
            url: url
          });

          if (category === 'font') {
            registerCustomFont(cleanName, url);
          }
        }
      }
    }

    const bgSelect = document.getElementById('bgSelect');
    bgSelect.innerHTML = loadedFiles.back.map(f => `<option value="${f.url}">${f.name}</option>`).join('');

    renderLogoSlots();
    renderTitleSlots();
    renderPokemonSlots();
    updateCanvas();
  } catch (err) {
    console.error(err);
    alert('ZIPファイルの解凍に失敗しました。');
  }
}

async function registerCustomFont(fontFileName, fontUrl) {
  const fontName = fontFileName.replace(/\.[^/.]+$/, '');
  const fontFace = new FontFace(fontName, `url(${fontUrl})`);
  try {
    const loadedFont = await fontFace.load();
    document.fonts.add(loadedFont);
    renderTitleSlots();
    updateCanvas();
  } catch (err) {
    console.error(`フォントの読み込みに失敗しました (${fontFileName}):`, err);
  }
}

async function processJsonFile(file) {
  try {
    const text = await file.text();
    const config = JSON.parse(text);

    const hasImagesLoaded = Object.values(loadedFiles).some(arr => arr.length > 0);
    if (!hasImagesLoaded) {
      pendingConfig = config;
      alert('設定ファイルを先に読み込みました。対応する画像ZIPも一緒にドロップするか読み込んでください。');
      return;
    }

    applyConfig(config);
  } catch (err) {
    console.error(err);
    alert('設定ファイルの読み込みに失敗しました。');
  }
}

function findUrlByName(category, fileName) {
  if (!fileName || fileName === 'none') return 'none';
  const found = loadedFiles[category].find(item => item.name === fileName);
  return found ? found.url : 'none';
}

function applyConfig(config) {
  if (Array.isArray(config.logoList)) {
    logoList = config.logoList.map(item => ({
      ...item,
      file: findUrlByName('logo', item.fileName || item.file)
    }));
  }

  if (Array.isArray(config.pokemonList)) {
    pokemonList = config.pokemonList.map(item => ({
      ...item,
      pokemon: findUrlByName('pokemon', item.pokemonName || item.pokemon),
      ball: findUrlByName('ball', item.ballName || item.ball),
      etc: findUrlByName('etc', item.etcName || item.etc)
    }));
  }

  if (Array.isArray(config.titleList)) {
    titleList = config.titleList;
  } else if (config.titleText !== undefined) {
    titleList = [{
      text: config.titleText || 'タイトル',
      font: config.titleFont || 'sans-serif',
      size: config.titleSize || 70,
      colorMode: config.titleColorMode || 'solid',
      color: config.titleColor || '#facc15',
      colorTop: config.titleColorTop || '#ffffff',
      colorBottom: config.titleColorBottom || '#facc15',
      strokeMode: config.strokeMode || 'single',
      strokeColor: config.strokeColor || '#dc2626',
      strokeWidth: config.strokeWidth || 12,
      strokeColorInner: config.strokeColorInner || '#ffffff',
      strokeWidthInner: config.strokeWidthInner || 6,
      strokeColorOuter: config.strokeColorOuter || '#dc2626',
      strokeWidthOuter: config.strokeWidthOuter || 14,
      x: config.titleX || 1240,
      y: config.titleY || 40
    }];
  }

  renderLogoSlots();
  renderTitleSlots();
  renderPokemonSlots();

  if (config.bg) {
    const bgFileName = config.bg.split('/').pop();
    const matchedBg = loadedFiles.back.find(f => f.name === bgFileName || f.url === config.bg);
    if (matchedBg) document.getElementById('bgSelect').value = matchedBg.url;
  }

  if (config.borderMode) document.getElementById('borderMode').value = config.borderMode;
  if (config.borderWidth) document.getElementById('borderWidth').value = config.borderWidth;
  
  if (config.borderColor1) {
    document.getElementById('borderColor1').value = config.borderColor1;
    syncColorInput('borderColor1', 'borderColor1Text');
  }
  if (config.borderColor2) {
    document.getElementById('borderColor2').value = config.borderColor2;
    syncColorInput('borderColor2', 'borderColor2Text');
  }

  updateCanvas();
  alert('設定と画像を正常に適用しました！');
}

function buildSearchableSelectHTML(category, currentVal, slotIndex, subKey) {
  const list = loadedFiles[category] || [];
  const datalistId = `dl_${category}_${slotIndex}_${subKey}`;

  let currentDisplayName = "なし";
  if (currentVal && currentVal !== 'none') {
    const found = list.find(item => item.url === currentVal);
    if (found) currentDisplayName = found.name;
  }

  const optionsHTML = list.map(item => `<option value="${item.name}">`).join('');

  return `
    <input type="text" list="${datalistId}" class="form-control" value="${currentDisplayName === 'なし' ? '' : currentDisplayName}" placeholder="文字を入力して検索..." onchange="onSearchableSelectChange('${category}', ${slotIndex}, '${subKey}', this.value)">
    <datalist id="${datalistId}">
      <option value="なし">
      ${optionsHTML}
    </datalist>
  `;
}

window.onSearchableSelectChange = function(category, slotIndex, subKey, typedValue) {
  const list = loadedFiles[category] || [];
  let matchedUrl = 'none';

  if (typedValue && typedValue !== 'なし') {
    const found = list.find(item => item.name === typedValue);
    if (found) {
      matchedUrl = found.url;
    } else {
      const partial = list.find(item => item.name.toLowerCase().includes(typedValue.toLowerCase()));
      if (partial) matchedUrl = partial.url;
    }
  }

  if (category === 'logo') {
    logoList[slotIndex][subKey] = matchedUrl;
  } else {
    pokemonList[slotIndex][subKey] = matchedUrl;
  }
  updateCanvas();
};

async function exportConfig() {
  const getFileName = (category, url) => {
    if (!url || url === 'none') return 'none';
    const found = loadedFiles[category].find(item => item.url === url);
    return found ? found.name : url.split('/').pop();
  };

  const exportLogoList = logoList.map(item => ({
    ...item,
    fileName: getFileName('logo', item.file)
  }));

  const exportPokemonList = pokemonList.map(item => ({
    ...item,
    pokemonName: getFileName('pokemon', item.pokemon),
    ballName: getFileName('ball', item.ball),
    etcName: getFileName('etc', item.etc)
  }));

  const bgVal = document.getElementById('bgSelect').value;
  const bgFileName = loadedFiles.back.find(f => f.url === bgVal)?.name || bgVal;

  const configData = {
    bg: bgFileName,
    borderMode: document.getElementById('borderMode').value,
    borderWidth: document.getElementById('borderWidth').value,
    borderColor1: document.getElementById('borderColor1').value,
    borderColor2: document.getElementById('borderColor2').value,
    titleList: titleList,
    logoList: exportLogoList,
    pokemonList: exportPokemonList
  };

  const jsonStr = JSON.stringify(configData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'thumbnail_config.json',
        types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'thumbnail_config.json';
  link.click();
}

async function importConfig(file) {
  if (!file) return;
  processJsonFile(file);
  document.getElementById('configFileInput').value = '';
}

function renderLogoSlots() {
  const container = document.getElementById('logoContainer');
  container.innerHTML = '';
  logoList.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'slot-card';
    card.innerHTML = `
      <div class="slot-title">
        <span>ロゴ #${index + 1}</span>
        <button onclick="removeLogoSlot(${index})" class="btn-delete">削除</button>
      </div>
      <div class="form-group">
        <label>ロゴ画像</label>
        ${buildSearchableSelectHTML('logo', item.file, index, 'file')}
      </div>
      <div class="row">
        <div class="col form-group">
          <label>拡大率</label>
          <input type="number" step="0.1" value="${item.scale}" class="form-control" oninput="updateLogo(${index}, 'scale', parseFloat(this.value))">
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function addLogoSlot() {
  logoList.push({ file: 'none', x: 100, y: 100, scale: 1.0 });
  renderLogoSlots();
  updateCanvas();
}

function removeLogoSlot(index) {
  logoList.splice(index, 1);
  renderLogoSlots();
  updateCanvas();
}

function updateLogo(index, key, value) {
  logoList[index][key] = value;
  updateCanvas();
}

function renderTitleSlots() {
  const container = document.getElementById('titleContainer');
  container.innerHTML = '';

  let fontOptionsHTML = `
    <option value="sans-serif">ゴシック体 (sans-serif)</option>
    <option value="serif">明朝体 (serif)</option>
    <option value="'Impact', sans-serif">Impact (太字)</option>
  `;
  if (loadedFiles.font.length > 0) {
    fontOptionsHTML += `<optgroup label="カスタムフォント (font/)">`;
    loadedFiles.font.forEach(f => {
      const fontName = f.name.replace(/\.[^/.]+$/, '');
      fontOptionsHTML += `<option value="${fontName}">${fontName}</option>`;
    });
    fontOptionsHTML += `</optgroup>`;
  }

  titleList.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'slot-card';
    card.innerHTML = `
      <div class="slot-title">
        <span>タイトル #${index + 1}</span>
        ${titleList.length > 1 ? `<button onclick="removeTitleSlot(${index})" class="btn-delete">削除</button>` : ''}
      </div>
      <div class="form-group">
        <label>配信タイトル文字</label>
        <input type="text" class="form-control" value="${item.text}" oninput="updateTitle(${index}, 'text', this.value)">
      </div>
      <div class="form-group">
        <label>フォント</label>
        <select class="form-control" onchange="updateTitle(${index}, 'font', this.value)">
          ${fontOptionsHTML}
        </select>
      </div>
      <div class="row">
        <div class="col form-group">
          <label>文字サイズ (px)</label>
          <input type="number" class="form-control" value="${item.size}" oninput="updateTitle(${index}, 'size', parseInt(this.value) || 70)">
        </div>
      </div>

      <div class="form-group">
        <label>文字色モード</label>
        <select class="form-control" onchange="updateTitle(${index}, 'colorMode', this.value); renderTitleSlots(); updateCanvas();">
          <option value="solid" ${item.colorMode === 'solid' ? 'selected' : ''}>単色</option>
          <option value="gradient" ${item.colorMode === 'gradient' ? 'selected' : ''}>上下グラデーション</option>
        </select>
      </div>

      ${item.colorMode === 'solid' ? `
        <div class="form-group">
          <label>文字色</label>
          <div class="color-picker-group">
            <input type="color" id="titleColor_${index}" value="${item.color}" onchange="syncColorInput('titleColor_${index}', 'titleColorText_${index}'); updateTitle(${index}, 'color', this.value);">
            <input type="text" id="titleColorText_${index}" class="form-control" value="${item.color.toUpperCase()}" oninput="syncColorPicker('titleColorText_${index}', 'titleColor_${index}'); updateTitle(${index}, 'color', this.value);">
          </div>
        </div>
      ` : `
        <div class="row">
          <div class="col form-group">
            <label>上部カラー</label>
            <div class="color-picker-group">
              <input type="color" id="titleTop_${index}" value="${item.colorTop}" onchange="syncColorInput('titleTop_${index}', 'titleTopText_${index}'); updateTitle(${index}, 'colorTop', this.value);">
              <input type="text" id="titleTopText_${index}" class="form-control" value="${item.colorTop.toUpperCase()}" oninput="syncColorPicker('titleTopText_${index}', 'titleTop_${index}'); updateTitle(${index}, 'colorTop', this.value);">
            </div>
          </div>
          <div class="col form-group">
            <label>下部カラー</label>
            <div class="color-picker-group">
              <input type="color" id="titleBottom_${index}" value="${item.colorBottom}" onchange="syncColorInput('titleBottom_${index}', 'titleBottomText_${index}'); updateTitle(${index}, 'colorBottom', this.value);">
              <input type="text" id="titleBottomText_${index}" class="form-control" value="${item.colorBottom.toUpperCase()}" oninput="syncColorPicker('titleBottomText_${index}', 'titleBottom_${index}'); updateTitle(${index}, 'colorBottom', this.value);">
            </div>
          </div>
        </div>
      `}

      <hr class="separator">

      <div class="form-group">
        <label>縁取りモード</label>
        <select class="form-control" onchange="updateTitle(${index}, 'strokeMode', this.value); renderTitleSlots(); updateCanvas();">
          <option value="none" ${item.strokeMode === 'none' ? 'selected' : ''}>なし</option>
          <option value="single" ${item.strokeMode === 'single' ? 'selected' : ''}>一重縁取り</option>
          <option value="double" ${item.strokeMode === 'double' ? 'selected' : ''}>二重縁取り</option>
        </select>
      </div>

      ${item.strokeMode === 'single' ? `
        <div class="row">
          <div class="col form-group">
            <label>縁取り色</label>
            <div class="color-picker-group">
              <input type="color" id="sColor_${index}" value="${item.strokeColor}" onchange="syncColorInput('sColor_${index}', 'sColorText_${index}'); updateTitle(${index}, 'strokeColor', this.value);">
              <input type="text" id="sColorText_${index}" class="form-control" value="${item.strokeColor.toUpperCase()}" oninput="syncColorPicker('sColorText_${index}', 'sColor_${index}'); updateTitle(${index}, 'strokeColor', this.value);">
            </div>
          </div>
          <div class="col form-group">
            <label>縁取り太さ</label>
            <input type="number" class="form-control" value="${item.strokeWidth}" min="0" oninput="updateTitle(${index}, 'strokeWidth', parseInt(this.value) || 0)">
          </div>
        </div>
      ` : item.strokeMode === 'double' ? `
        <div class="row">
          <div class="col form-group">
            <label>内側 縁取り色</label>
            <div class="color-picker-group">
              <input type="color" id="innerCol_${index}" value="${item.strokeColorInner}" onchange="syncColorInput('innerCol_${index}', 'innerColText_${index}'); updateTitle(${index}, 'strokeColorInner', this.value);">
              <input type="text" id="innerColText_${index}" class="form-control" value="${item.strokeColorInner.toUpperCase()}" oninput="syncColorPicker('innerColText_${index}', 'innerCol_${index}'); updateTitle(${index}, 'strokeColorInner', this.value);">
            </div>
          </div>
          <div class="col form-group">
            <label>内側 太さ</label>
            <input type="number" class="form-control" value="${item.strokeWidthInner}" min="0" oninput="updateTitle(${index}, 'strokeWidthInner', parseInt(this.value) || 0)">
          </div>
        </div>
        <div class="row">
          <div class="col form-group">
            <label>外側 縁取り色</label>
            <div class="color-picker-group">
              <input type="color" id="outerCol_${index}" value="${item.strokeColorOuter}" onchange="syncColorInput('outerCol_${index}', 'outerColText_${index}'); updateTitle(${index}, 'strokeColorOuter', this.value);">
              <input type="text" id="outerColText_${index}" class="form-control" value="${item.strokeColorOuter.toUpperCase()}" oninput="syncColorPicker('outerColText_${index}', 'outerCol_${index}'); updateTitle(${index}, 'strokeColorOuter', this.value);">
            </div>
          </div>
          <div class="col form-group">
            <label>外側 太さ</label>
            <input type="number" class="form-control" value="${item.strokeWidthOuter}" min="0" oninput="updateTitle(${index}, 'strokeWidthOuter', parseInt(this.value) || 0)">
          </div>
        </div>
      ` : ''}
    `;

    const selectElem = card.querySelector('select[onchange*="font"]');
    if (selectElem) selectElem.value = item.font;

    container.appendChild(card);
  });
}

function addTitleSlot() {
  titleList.push({
    text: '新しいタイトル',
    font: 'sans-serif',
    size: 60,
    colorMode: 'solid',
    color: '#ffffff',
    colorTop: '#ffffff',
    colorBottom: '#facc15',
    strokeMode: 'single',
    strokeColor: '#000000',
    strokeWidth: 10,
    strokeColorInner: '#ffffff',
    strokeWidthInner: 6,
    strokeColorOuter: '#000000',
    strokeWidthOuter: 12,
    x: 1240,
    y: 140 + (titleList.length * 80)
  });
  renderTitleSlots();
  updateCanvas();
}

function removeTitleSlot(index) {
  titleList.splice(index, 1);
  renderTitleSlots();
  updateCanvas();
}

function updateTitle(index, key, value) {
  titleList[index][key] = value;
  updateCanvas();
}

function renderPokemonSlots() {
  const container = document.getElementById('pokemonSlotsContainer');
  container.innerHTML = '';
  pokemonList.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'slot-card';
    card.innerHTML = `
      <div class="slot-title">
        <span>ポケモン枠 #${index + 1}</span>
        <button onclick="removePokemonSlot(${index})" class="btn-delete">削除</button>
      </div>
      <div class="form-group">
        <label>ポケモン (文字入力で検索可能)</label>
        ${buildSearchableSelectHTML('pokemon', item.pokemon, index, 'pokemon')}
      </div>
      <div class="form-group">
        <label>ボール</label>
        ${buildSearchableSelectHTML('ball', item.ball, index, 'ball')}
      </div>
      <div class="form-group">
        <label>その他アイコン</label>
        ${buildSearchableSelectHTML('etc', item.etc, index, 'etc')}
      </div>
      <div class="row">
        <div class="col form-group">
          <label>サイズ倍率</label>
          <input type="number" step="0.1" value="${item.scale}" class="form-control" oninput="updatePokemon(${index}, 'scale', parseFloat(this.value))">
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function addPokemonSlot() {
  pokemonList.push({ pokemon: 'none', ball: 'none', etc: 'none', x: 200 + (pokemonList.length * 80), y: 350, scale: 1.0 });
  renderPokemonSlots();
}

function removePokemonSlot(index) {
  pokemonList.splice(index, 1);
  renderPokemonSlots();
  updateCanvas();
}

function updatePokemon(index, key, value) {
  pokemonList[index][key] = value;
  updateCanvas();
}

async function updateCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const newHitBoxes = [];

  const bgSelect = document.getElementById('bgSelect');
  const bgImg = bgSelect ? await loadImage(bgSelect.value) : null;
  if (bgImg) {
    ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  for (let i = 0; i < pokemonList.length; i++) {
    const item = pokemonList[i];
    const pkImg = await loadImage(item.pokemon);
    const ballImg = await loadImage(item.ball);
    const etcImg = await loadImage(item.etc);
    const baseScale = item.scale || 1.0;

    const rawPkWidth = pkImg ? pkImg.width : 200;
    const rawPkHeight = pkImg ? pkImg.height : 200;
    const pkWidth = rawPkWidth * baseScale;
    const pkHeight = rawPkHeight * baseScale;

    if (item.ballOffsetX === undefined) {
      item.ballOffsetX = rawPkWidth * 0.62;
      item.ballOffsetY = rawPkHeight * 0.58;
    }
    if (item.etcOffsetX === undefined) {
      item.etcOffsetX = item.ballOffsetX - 50;
      item.etcOffsetY = item.ballOffsetY + 20;
    }

    if (pkImg) {
      ctx.drawImage(pkImg, item.x, item.y, pkWidth, pkHeight);
      newHitBoxes.push({ type: 'pokemon', index: i, x: item.x, y: item.y, w: pkWidth, h: pkHeight });
    } else {
      newHitBoxes.push({ type: 'pokemon', index: i, x: item.x, y: item.y, w: pkWidth, h: pkHeight });
    }

    if (ballImg) {
      const bW = ballImg.width * baseScale * 0.55;
      const bH = ballImg.height * baseScale * 0.55;
      const bX = item.x + (item.ballOffsetX * baseScale);
      const bY = item.y + (item.ballOffsetY * baseScale);
      ctx.drawImage(ballImg, bX, bY, bW, bH);
      newHitBoxes.push({ type: 'ball', index: i, x: bX, y: bY, w: bW, h: bH });
    }

    if (etcImg) {
      const eW = etcImg.width * baseScale * 0.5;
      const eH = etcImg.height * baseScale * 0.5;
      const eX = item.x + (item.etcOffsetX * baseScale);
      const eY = item.y + (item.etcOffsetY * baseScale);
      ctx.drawImage(etcImg, eX, eY, eW, eH);
      newHitBoxes.push({ type: 'etc', index: i, x: eX, y: eY, w: eW, h: eH });
    }
  }

  for (let i = 0; i < logoList.length; i++) {
    const item = logoList[i];
    const logoImg = await loadImage(item.file);
    if (logoImg) {
      const w = logoImg.width * (item.scale || 1.0);
      const h = logoImg.height * (item.scale || 1.0);
      ctx.drawImage(logoImg, item.x, item.y, w, h);
      newHitBoxes.push({ type: 'logo', index: i, x: item.x, y: item.y, w: w, h: h });
    }
  }

  // --- 複数タイトルの描画処理 ---
  for (let i = 0; i < titleList.length; i++) {
    const tItem = titleList[i];
    if (!tItem.text) continue;

    const fontSize = tItem.size || 70;
    
    // フォント名が総称ファミリー（sans-serif / serif）の場合は対応するフォントスタックを構成
    let fontString = tItem.font;
    if (tItem.font === 'serif') {
      fontString = '"Times New Roman", "Yu Mincho", "MS Mincho", serif';
    } else if (tItem.font === 'sans-serif') {
      fontString = '"Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif';
    } else if (!tItem.font.includes(',') && !tItem.font.includes("'")) {
      fontString = `"${tItem.font}", sans-serif`;
    }

    ctx.font = `bold ${fontSize}px ${fontString}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';

    const metrics = ctx.measureText(tItem.text);
    const textWidth = metrics.width;
    const textHeight = fontSize;

    const boxX = tItem.x - textWidth;
    const boxY = tItem.y;

    // 1. 縁取りの描画
    if (tItem.strokeMode === 'single') {
      const sWidth = tItem.strokeWidth || 0;
      if (sWidth > 0) {
        ctx.strokeStyle = tItem.strokeColor;
        ctx.lineWidth = sWidth;
        ctx.lineJoin = 'round';
        ctx.strokeText(tItem.text, tItem.x, tItem.y);
      }
    } else if (tItem.strokeMode === 'double') {
      const innerW = tItem.strokeWidthInner || 0;
      const outerW = tItem.strokeWidthOuter || 0;

      if (outerW > 0) {
        ctx.strokeStyle = tItem.strokeColorOuter;
        ctx.lineWidth = outerW + innerW;
        ctx.lineJoin = 'round';
        ctx.strokeText(tItem.text, tItem.x, tItem.y);
      }
      if (innerW > 0) {
        ctx.strokeStyle = tItem.strokeColorInner;
        ctx.lineWidth = innerW;
        ctx.lineJoin = 'round';
        ctx.strokeText(tItem.text, tItem.x, tItem.y);
      }
    }

    // 2. メイン文字色の描画
    if (tItem.colorMode === 'solid') {
      ctx.fillStyle = tItem.color;
      ctx.fillText(tItem.text, tItem.x, tItem.y);
    } else if (tItem.colorMode === 'gradient') {
      const grad = ctx.createLinearGradient(0, tItem.y, 0, tItem.y + fontSize);
      grad.addColorStop(0, tItem.colorTop);
      grad.addColorStop(1, tItem.colorBottom);

      ctx.fillStyle = grad;
      ctx.fillText(tItem.text, tItem.x, tItem.y);
    }

    newHitBoxes.push({
      type: 'title',
      index: i,
      x: boxX - 10,
      y: boxY - 5,
      w: textWidth + 20,
      h: textHeight + 10
    });
  }

  // --- 外枠描画 ---
  const borderWidth = parseInt(document.getElementById('borderWidth').value);
  if (borderWidth > 0) {
    const mode = document.getElementById('borderMode').value;
    const c1 = document.getElementById('borderColor1').value;
    const c2 = document.getElementById('borderColor2').value;

    ctx.lineWidth = borderWidth * 2;
    if (mode === 'single') {
      ctx.strokeStyle = c1;
    } else {
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c2);
      ctx.strokeStyle = grad;
    }
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
  }

  currentHitBoxes = newHitBoxes;
}

function setupDragEvents() {
  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    for (let i = currentHitBoxes.length - 1; i >= 0; i--) {
      const box = currentHitBoxes[i];
      if (mouseX >= box.x && mouseX <= box.x + box.w && mouseY >= box.y && mouseY <= box.y + box.h) {
        isDragging = true;
        dragTarget = { type: box.type, index: box.index };
        if (box.type === 'title') {
          const t = titleList[box.index];
          dragOffsetX = t.x - mouseX;
          dragOffsetY = t.y - mouseY;
        } else {
          dragOffsetX = mouseX - box.x;
          dragOffsetY = mouseY - box.y;
        }
        return;
      }
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!isDragging || !dragTarget) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    if (dragTarget.type === 'title') {
      const t = titleList[dragTarget.index];
      t.x = mouseX + dragOffsetX;
      t.y = mouseY + dragOffsetY;
    } else if (dragTarget.type === 'logo') {
      logoList[dragTarget.index].x = mouseX - dragOffsetX;
      logoList[dragTarget.index].y = mouseY - dragOffsetY;
    } else if (dragTarget.type === 'pokemon') {
      pokemonList[dragTarget.index].x = mouseX - dragOffsetX;
      pokemonList[dragTarget.index].y = mouseY - dragOffsetY;
    } else if (dragTarget.type === 'ball') {
      const p = pokemonList[dragTarget.index];
      p.ballOffsetX = ((mouseX - dragOffsetX) - p.x) / p.scale;
      p.ballOffsetY = ((mouseY - dragOffsetY) - p.y) / p.scale;
    } else if (dragTarget.type === 'etc') {
      const p = pokemonList[dragTarget.index];
      p.etcOffsetX = ((mouseX - dragOffsetX) - p.x) / p.scale;
      p.etcOffsetY = ((mouseY - dragOffsetY) - p.y) / p.scale;
    }
    updateCanvas();
  });

  window.addEventListener('mouseup', () => { isDragging = false; dragTarget = null; });
  canvas.addEventListener('mouseleave', () => { isDragging = false; dragTarget = null; });
}

async function saveImage() {
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'pokemon_exchange_thumbnail.png',
        types: [{ description: 'PNG Image', accept: { 'image/png': ['.png'] } }]
      });
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (err) {
      if (err.name !== 'AbortError') fallbackDownload();
    }
  } else {
    fallbackDownload();
  }
}

function fallbackDownload() {
  const link = document.createElement('a');
  link.download = 'pokemon_exchange_thumbnail.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}
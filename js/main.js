const loadedFiles = {
  back: [], logo: [], pokemon: [], ball: [], etc: []
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
let titleConfig = { x: 1240, y: 40 }; // 初期位置 (右上の基準)

let isDragging = false;
let dragTarget = null;
let dragOffsetX = 0, dragOffsetY = 0;
let currentHitBoxes = [];

window.addEventListener('DOMContentLoaded', () => {
  renderLogoSlots();
  renderPokemonSlots();
  toggleTitleColorMode();
  toggleStrokeMode();
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

function toggleTitleColorMode() {
  const mode = document.getElementById('titleColorMode').value;
  document.getElementById('titleSolidColorBox').style.display = (mode === 'solid') ? 'block' : 'none';
  document.getElementById('titleGradColorBox').style.display = (mode === 'gradient') ? 'flex' : 'none';
}

function toggleStrokeMode() {
  const mode = document.getElementById('strokeMode').value;
  document.getElementById('singleStrokeBox').style.display = (mode === 'single') ? 'block' : 'none';
  document.getElementById('doubleStrokeBox').style.display = (mode === 'double') ? 'block' : 'none';
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
    Object.keys(loadedFiles).forEach(key => loadedFiles[key] = []);

    for (const [filename, zipObj] of Object.entries(zip.files)) {
      if (zipObj.dir) continue;
      const lower = filename.toLowerCase();
      let category = null;

      if (lower.includes('back/')) category = 'back';
      else if (lower.includes('logo/')) category = 'logo';
      else if (lower.includes('pokemon/')) category = 'pokemon';
      else if (lower.includes('ball/')) category = 'ball';
      else if (lower.includes('etc/')) category = 'etc';

      if (category) {
        const blob = await zipObj.async('blob');
        const cleanName = filename.split('/').pop();
        if (cleanName && !cleanName.startsWith('.')) {
          loadedFiles[category].push({
            name: cleanName,
            url: URL.createObjectURL(blob)
          });
        }
      }
    }

    const bgSelect = document.getElementById('bgSelect');
    bgSelect.innerHTML = loadedFiles.back.map(f => `<option value="${f.url}">${f.name}</option>`).join('');

    renderLogoSlots();
    renderPokemonSlots();
    updateCanvas();
  } catch (err) {
    console.error(err);
    alert('ZIPファイルの解凍に失敗しました。');
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

  if (config.titleX !== undefined && config.titleY !== undefined) {
    titleConfig = { x: config.titleX, y: config.titleY };
  }

  renderLogoSlots();
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

  if (config.titleText !== undefined) document.getElementById('titleText').value = config.titleText;
  if (config.titleFont) document.getElementById('titleFont').value = config.titleFont;
  if (config.titleSize) document.getElementById('titleSize').value = config.titleSize;
  
  if (config.titleColorMode) document.getElementById('titleColorMode').value = config.titleColorMode;
  if (config.titleColor) {
    document.getElementById('titleColor').value = config.titleColor;
    syncColorInput('titleColor', 'titleColorText');
  }
  if (config.titleColorTop) {
    document.getElementById('titleColorTop').value = config.titleColorTop;
    syncColorInput('titleColorTop', 'titleColorTopText');
  }
  if (config.titleColorBottom) {
    document.getElementById('titleColorBottom').value = config.titleColorBottom;
    syncColorInput('titleColorBottom', 'titleColorBottomText');
  }

  if (config.strokeMode) document.getElementById('strokeMode').value = config.strokeMode;
  if (config.strokeColor) {
    document.getElementById('strokeColor').value = config.strokeColor;
    syncColorInput('strokeColor', 'strokeColorText');
  }
  if (config.strokeWidth !== undefined) document.getElementById('strokeWidth').value = config.strokeWidth;

  if (config.strokeColorInner) {
    document.getElementById('strokeColorInner').value = config.strokeColorInner;
    syncColorInput('strokeColorInner', 'strokeColorInnerText');
  }
  if (config.strokeWidthInner !== undefined) document.getElementById('strokeWidthInner').value = config.strokeWidthInner;
  if (config.strokeColorOuter) {
    document.getElementById('strokeColorOuter').value = config.strokeColorOuter;
    syncColorInput('strokeColorOuter', 'strokeColorOuterText');
  }
  if (config.strokeWidthOuter !== undefined) document.getElementById('strokeWidthOuter').value = config.strokeWidthOuter;

  toggleTitleColorMode();
  toggleStrokeMode();
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
    titleText: document.getElementById('titleText').value,
    titleFont: document.getElementById('titleFont').value,
    titleSize: document.getElementById('titleSize').value,
    titleColorMode: document.getElementById('titleColorMode').value,
    titleColor: document.getElementById('titleColor').value,
    titleColorTop: document.getElementById('titleColorTop').value,
    titleColorBottom: document.getElementById('titleColorBottom').value,
    strokeMode: document.getElementById('strokeMode').value,
    strokeColor: document.getElementById('strokeColor').value,
    strokeWidth: document.getElementById('strokeWidth').value,
    strokeColorInner: document.getElementById('strokeColorInner').value,
    strokeWidthInner: document.getElementById('strokeWidthInner').value,
    strokeColorOuter: document.getElementById('strokeColorOuter').value,
    strokeWidthOuter: document.getElementById('strokeWidthOuter').value,
    titleX: titleConfig.x,
    titleY: titleConfig.y,
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

  // --- タイトル描画処理 ---
  const title = document.getElementById('titleText').value;
  if (title) {
    const fontSize = parseInt(document.getElementById('titleSize').value) || 70;
    const font = document.getElementById('titleFont').value;
    
    ctx.font = `bold ${fontSize}px ${font}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';

    // 当たり判定用にテキストの幅を計測
    const metrics = ctx.measureText(title);
    const textWidth = metrics.width;
    const textHeight = fontSize;

    // titleConfig.x, y は右上の基準位置として扱うため、バウンディングボックスの左上座標に変換してヒットボックス登録
    const boxX = titleConfig.x - textWidth;
    const boxY = titleConfig.y;

    const strokeMode = document.getElementById('strokeMode').value;

    // 1. 縁取りの描画
    if (strokeMode === 'single') {
      const sColor = document.getElementById('strokeColor').value;
      const sWidth = parseInt(document.getElementById('strokeWidth').value) || 0;
      if (sWidth > 0) {
        ctx.strokeStyle = sColor;
        ctx.lineWidth = sWidth;
        ctx.lineJoin = 'round';
        ctx.strokeText(title, titleConfig.x, titleConfig.y);
      }
    } else if (strokeMode === 'double') {
      const innerColor = document.getElementById('strokeColorInner').value;
      const innerWidth = parseInt(document.getElementById('strokeWidthInner').value) || 0;
      const outerColor = document.getElementById('strokeColorOuter').value;
      const outerWidth = parseInt(document.getElementById('strokeWidthOuter').value) || 0;

      if (outerWidth > 0) {
        ctx.strokeStyle = outerColor;
        ctx.lineWidth = outerWidth + innerWidth;
        ctx.lineJoin = 'round';
        ctx.strokeText(title, titleConfig.x, titleConfig.y);
      }
      if (innerWidth > 0) {
        ctx.strokeStyle = innerColor;
        ctx.lineWidth = innerWidth;
        ctx.lineJoin = 'round';
        ctx.strokeText(title, titleConfig.x, titleConfig.y);
      }
    }

    // 2. メイン文字色の描画
    const colorMode = document.getElementById('titleColorMode').value;
    if (colorMode === 'solid') {
      ctx.fillStyle = document.getElementById('titleColor').value;
      ctx.fillText(title, titleConfig.x, titleConfig.y);
    } else if (colorMode === 'gradient') {
      const topColor = document.getElementById('titleColorTop').value;
      const bottomColor = document.getElementById('titleColorBottom').value;
      const grad = ctx.createLinearGradient(0, titleConfig.y, 0, titleConfig.y + fontSize);
      grad.addColorStop(0, topColor);
      grad.addColorStop(1, bottomColor);

      ctx.fillStyle = grad;
      ctx.fillText(title, titleConfig.x, titleConfig.y);
    }

    // タイトル移動用のヒットボックスを登録（余白を持たせて掴みやすくする）
    newHitBoxes.push({
      type: 'title',
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
          // タイトルの場合はマウス位置と基準位置(titleConfig)の差分を保持
          dragOffsetX = titleConfig.x - mouseX;
          dragOffsetY = titleConfig.y - mouseY;
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
      titleConfig.x = mouseX + dragOffsetX;
      titleConfig.y = mouseY + dragOffsetY;
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
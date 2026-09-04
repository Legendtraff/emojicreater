(function () {
  // ---------- Telegram WebApp theming ----------
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    const tp = tg.themeParams || {};
    const root = document.documentElement.style;
    if (tp.bg_color) root.setProperty('--tg-bg', tp.bg_color);
    if (tp.secondary_bg_color) root.setProperty('--tg-secondary-bg', tp.secondary_bg_color);
    if (tp.text_color) root.setProperty('--tg-text', tp.text_color);
    if (tp.hint_color) root.setProperty('--tg-hint', tp.hint_color);
    if (tp.button_color) root.setProperty('--tg-button', tp.button_color);
    if (tp.button_text_color) root.setProperty('--tg-button-text', tp.button_text_color);
  }

  // ---------- State ----------
  let originalAnimationData = null; // pristine copy, for "reset"
  let animationData = null;         // live, mutated copy
  let anim = null;                  // lottie-web instance
  let tree = [];
  let selectedNode = null;
  let logoSvgText = null;

  // ---------- DOM refs ----------
  const templateInput = document.getElementById('templateInput');
  const logoInput = document.getElementById('logoInput');
  const templateStatus = document.getElementById('templateStatus');
  const logoStatus = document.getElementById('logoStatus');
  const previewEl = document.getElementById('preview');
  const emptyHint = document.getElementById('emptyHint');
  const treeSection = document.getElementById('treeSection');
  const layerTreeEl = document.getElementById('layerTree');
  const controlsSection = document.getElementById('controlsSection');
  const selectedSlotLabel = document.getElementById('selectedSlotLabel');
  const fillColor = document.getElementById('fillColor');
  const strokeColor = document.getElementById('strokeColor');
  const strokeWidth = document.getElementById('strokeWidth');
  const strokeWidthOut = document.getElementById('strokeWidthOut');
  const applyBtn = document.getElementById('applyBtn');
  const exportSection = document.getElementById('exportSection');
  const exportBtn = document.getElementById('exportBtn');
  const resetBtn = document.getElementById('resetBtn');

  strokeWidth.addEventListener('input', () => {
    strokeWidthOut.textContent = strokeWidth.value;
  });

  // ---------- Template upload ----------
  templateInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    templateStatus.textContent = file.name;

    const buf = await file.arrayBuffer();
    let text;
    try {
      text = window.LottieTools.gunzipToText(buf);
    } catch (err) {
      alert('Не удалось прочитать файл (ни JSON, ни gzip-tgs): ' + err.message);
      return;
    }

    try {
      animationData = JSON.parse(text);
    } catch (err) {
      alert('Файл не похож на корректный Lottie JSON: ' + err.message);
      return;
    }

    originalAnimationData = JSON.parse(JSON.stringify(animationData));
    rebuildEverything();
  });

  // ---------- Logo upload ----------
  logoInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    logoStatus.textContent = file.name;
    logoSvgText = await file.text();
    updateApplyEnabled();
  });

  // ---------- Rendering ----------
  function rebuildEverything() {
    emptyHint.hidden = true;
    tree = window.LottieTools.buildLayerTree(animationData);
    renderTree();
    treeSection.hidden = false;
    controlsSection.hidden = false;
    exportSection.hidden = false;
    selectedNode = null;
    selectedSlotLabel.textContent = 'Слот не выбран';
    updateApplyEnabled();
    renderPreview();
  }

  function renderPreview() {
    if (anim) { anim.destroy(); anim = null; }
    previewEl.innerHTML = '';
    anim = lottie.loadAnimation({
      container: previewEl,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: animationData,
    });
  }

  function renderTree() {
    layerTreeEl.innerHTML = '';
    tree.forEach(node => layerTreeEl.appendChild(renderNode(node, 0)));
  }

  function renderNode(node, depth) {
    const row = document.createElement('div');
    row.className = 'tree-row';
    if (node.ref.hd) row.classList.add('hidden-node');
    if (node === selectedNode) row.classList.add('selected');
    row.style.paddingLeft = (12 + depth * 18) + 'px';

    const eye = document.createElement('button');
    eye.className = 'eye';
    eye.textContent = node.ref.hd ? '🚫' : '👁';
    eye.addEventListener('click', (ev) => {
      ev.stopPropagation();
      window.LottieTools.toggleHidden(node);
      renderTree();
      renderPreview();
    });

    const name = document.createElement('span');
    name.className = 'row-name';
    name.textContent = node.name;

    const tag = document.createElement('span');
    tag.className = 'row-tag';
    tag.textContent = node.kind === 'layer' ? 'слой' : 'группа';

    row.appendChild(eye);
    row.appendChild(name);
    row.appendChild(tag);

    row.addEventListener('click', () => {
      selectedNode = node;
      selectedSlotLabel.textContent = `Слот: ${node.name} (${tag.textContent})`;
      renderTree();
      updateApplyEnabled();
    });

    const wrapper = document.createElement('div');
    wrapper.appendChild(row);
    node.children.forEach(child => wrapper.appendChild(renderNode(child, depth + 1)));
    return wrapper;
  }

  function updateApplyEnabled() {
    applyBtn.disabled = !(selectedNode && logoSvgText);
  }

  // ---------- Apply logo ----------
  applyBtn.addEventListener('click', () => {
    if (!selectedNode || !logoSvgText) return;
    window.LottieTools.applyLogoToNode(
      selectedNode,
      logoSvgText,
      fillColor.value,
      strokeColor.value,
      Number(strokeWidth.value)
    );
    renderPreview();
  });

  // ---------- Reset ----------
  resetBtn.addEventListener('click', () => {
    if (!originalAnimationData) return;
    animationData = JSON.parse(JSON.stringify(originalAnimationData));
    rebuildEverything();
  });

  // ---------- Export ----------
  exportBtn.addEventListener('click', () => {
    if (!animationData) return;
    const json = JSON.stringify(animationData);
    const gzipped = window.LottieTools.gzipFromText(json);
    const blob = new Blob([gzipped], { type: 'application/gzip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sticker.tgs';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
})();

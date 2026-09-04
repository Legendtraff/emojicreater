/**
 * Tree model over a Lottie animation:
 *   - Each top-level layer (ty === 4, shape layer) is a node.
 *   - Each nested shape group (ty === "gr") inside .shapes / .it is a node.
 * Every node exposes: ref (the raw object), shapesRef (array to inject into),
 * and toggling relies on the standard Lottie "hd" (hidden) boolean, which
 * every layer and every shape-group item supports.
 */

function buildLayerTree(animationData) {
  const layers = animationData.layers || [];
  return layers
    .filter(l => l.ty === 4) // shape layers only
    .map(layer => ({
      kind: 'layer',
      name: layer.nm || `Layer ${layer.ind ?? ''}`,
      ref: layer,
      shapesRef: layer.shapes || (layer.shapes = []),
      children: buildGroupChildren(layer.shapes || []),
    }));
}

function buildGroupChildren(items) {
  return items
    .filter(it => it.ty === 'gr')
    .map(gr => ({
      kind: 'group',
      name: gr.nm || 'Group',
      ref: gr,
      shapesRef: gr.it || (gr.it = []),
      children: buildGroupChildren(gr.it || []),
    }));
}

function toggleHidden(node) {
  node.ref.hd = !node.ref.hd;
  return node.ref.hd;
}

/** Bounding box (in the node's own local coordinate space) of all path-like
 *  shape items directly inside shapesRef (sh / rc / el), ignoring nested
 *  groups. Returns null if nothing found. */
function computeLocalBBox(shapesRef) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let found = false;

  for (const item of shapesRef) {
    if (item.ty === 'sh' && item.ks && item.ks.k && item.ks.k.v) {
      for (const [x, y] of item.ks.k.v) {
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    } else if (item.ty === 'rc' && item.p && item.s) {
      const cx = item.p.k[0], cy = item.p.k[1];
      const w = item.s.k[0], h = item.s.k[1];
      found = true;
      minX = Math.min(minX, cx - w / 2); maxX = Math.max(maxX, cx + w / 2);
      minY = Math.min(minY, cy - h / 2); maxY = Math.max(maxY, cy + h / 2);
    } else if (item.ty === 'el' && item.p && item.s) {
      const cx = item.p.k[0], cy = item.p.k[1];
      const w = item.s.k[0], h = item.s.k[1];
      found = true;
      minX = Math.min(minX, cx - w / 2); maxX = Math.max(maxX, cx + w / 2);
      minY = Math.min(minY, cy - h / 2); maxY = Math.max(maxY, cy + h / 2);
    }
  }

  if (!found) return null;
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/** Removes existing path/paint items (sh, rc, el, sr, fl, st) from shapesRef,
 *  keeping any other items (tr, tm, rd, gf, gs, ...) in place, and returns
 *  the index at which new items should be spliced in (before "tr" if any). */
function stripPathAndPaint(shapesRef) {
  const REMOVE = new Set(['sh', 'rc', 'el', 'sr', 'fl', 'st']);
  let insertIndex = shapesRef.length;
  for (let i = shapesRef.length - 1; i >= 0; i--) {
    if (shapesRef[i].ty === 'tr') { insertIndex = i; }
  }
  for (let i = shapesRef.length - 1; i >= 0; i--) {
    if (REMOVE.has(shapesRef[i].ty)) {
      shapesRef.splice(i, 1);
      if (i < insertIndex) insertIndex--;
    }
  }
  return Math.min(insertIndex, shapesRef.length);
}

function colorHexToLottie(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b, 1];
}

function makeShapeItem(subpath) {
  return {
    ty: 'sh', nm: 'logo-path', hd: false,
    ks: {
      a: 0,
      k: { c: subpath.closed, i: subpath.in, o: subpath.out, v: subpath.verts },
    },
  };
}

function makeFillItem(hex) {
  return {
    ty: 'fl', nm: 'logo-fill', hd: false,
    c: { a: 0, k: colorHexToLottie(hex) },
    o: { a: 0, k: 100 },
    r: 1,
  };
}

function makeStrokeItem(hex, width) {
  return {
    ty: 'st', nm: 'logo-stroke', hd: false,
    c: { a: 0, k: colorHexToLottie(hex) },
    o: { a: 0, k: 100 },
    w: { a: 0, k: width },
    lc: 2, lj: 2,
  };
}

/**
 * Fits `subpaths` (in their own SVG coordinate space) into targetBBox
 * (in the destination node's local space), preserving aspect ratio and
 * centering. Falls back to a default 100x100 box centered at origin
 * if the target had no existing geometry to measure.
 */
function fitSubpathsToBBox(subpaths, targetBBox) {
  let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity;
  for (const sp of subpaths) {
    for (const [x, y] of sp.verts) {
      sMinX = Math.min(sMinX, x); sMaxX = Math.max(sMaxX, x);
      sMinY = Math.min(sMinY, y); sMaxY = Math.max(sMaxY, y);
    }
  }
  const svgW = sMaxX - sMinX || 1;
  const svgH = sMaxY - sMinY || 1;
  const svgCx = (sMinX + sMaxX) / 2;
  const svgCy = (sMinY + sMaxY) / 2;

  const box = targetBBox || { w: 100, h: 100, cx: 0, cy: 0 };
  const scale = Math.min(box.w / svgW, box.h / svgH);

  const tx = (p) => [(p[0] - svgCx) * scale + box.cx, (p[1] - svgCy) * scale + box.cy];
  const tv = (v) => [v[0] * scale, v[1] * scale];

  return subpaths.map(sp => ({
    closed: sp.closed,
    verts: sp.verts.map(tx),
    in: sp.in.map(tv),
    out: sp.out.map(tv),
  }));
}

/** Extracts <path> "d" data (and simple rect/circle/ellipse as fallback)
 *  from an SVG document, returns a flat list of subpaths (in SVG units). */
function extractSubpathsFromSvg(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const paths = Array.from(doc.querySelectorAll('path'));
  let subpaths = [];

  for (const p of paths) {
    const d = p.getAttribute('d');
    if (!d) continue;
    subpaths = subpaths.concat(window.SvgPath.parseSvgPathD(d));
  }

  // Basic fallback shapes if no <path> elements exist
  doc.querySelectorAll('rect').forEach(r => {
    const x = +r.getAttribute('x') || 0, y = +r.getAttribute('y') || 0;
    const w = +r.getAttribute('width') || 0, h = +r.getAttribute('height') || 0;
    subpaths.push({
      closed: true,
      verts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
      in: [[0, 0], [0, 0], [0, 0], [0, 0]],
      out: [[0, 0], [0, 0], [0, 0], [0, 0]],
    });
  });
  doc.querySelectorAll('circle').forEach(c => {
    const cx = +c.getAttribute('cx') || 0, cy = +c.getAttribute('cy') || 0;
    const r = +c.getAttribute('r') || 0;
    const k = r * 0.5522847498;
    subpaths.push({
      closed: true,
      verts: [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]],
      in: [[-k, 0], [0, -k], [k, 0], [0, k]],
      out: [[k, 0], [0, k], [-k, 0], [0, -k]],
    });
  });

  return subpaths;
}

/** Inserts the parsed SVG logo into targetNode, fit to the bbox of whatever
 *  geometry was there before, then applies fill/stroke. */
function applyLogoToNode(targetNode, svgText, fillHex, strokeHex, strokeWidth) {
  const shapesRef = targetNode.shapesRef;
  const bbox = computeLocalBBox(shapesRef);

  const rawSubpaths = extractSubpathsFromSvg(svgText);
  const fitted = fitSubpathsToBBox(rawSubpaths, bbox);

  const insertAt = stripPathAndPaint(shapesRef);

  const newItems = fitted.map(makeShapeItem);
  newItems.push(makeFillItem(fillHex));
  if (strokeWidth > 0) newItems.push(makeStrokeItem(strokeHex, strokeWidth));

  shapesRef.splice(insertAt, 0, ...newItems);
}

/** gzip/gunzip via pako, for .tgs <-> JSON conversion */
function gunzipToText(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  // Plain JSON (not gzipped) starts with '{' (0x7B); gzip starts with 0x1F 0x8B
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return window.pako.ungzip(bytes, { to: 'string' });
  }
  return new TextDecoder('utf-8').decode(bytes);
}

function gzipFromText(text) {
  return window.pako.gzip(text);
}

window.LottieTools = {
  buildLayerTree,
  toggleHidden,
  computeLocalBBox,
  applyLogoToNode,
  gunzipToText,
  gzipFromText,
};

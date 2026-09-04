/**
 * Minimal SVG <path> "d" parser -> array of subpaths in a vertex/tangent
 * format directly compatible with Lottie's bezier shape encoding:
 *
 *   subpath = {
 *     closed: boolean,
 *     verts: [ [x,y], ... ],   // anchor points
 *     in:    [ [dx,dy], ... ], // incoming tangent, relative to same-index vert
 *     out:   [ [dx,dy], ... ], // outgoing tangent, relative to same-index vert
 *   }
 *
 * Supports: M/m L/l H/h V/v C/c S/s Q/q T/t A/a Z/z
 */

function parseSvgPathD(d) {
  const tokens = tokenizePath(d);
  let i = 0;

  const subpaths = [];
  let cur = null; // current subpath being built (array of {p, inT, outT})
  let cx = 0, cy = 0;       // current point
  let sx = 0, sy = 0;       // subpath start point
  let prevCmd = null;
  let prevCtrl = null;      // reflection control point for S/T

  function pushSubpath() {
    if (cur && cur.length > 0) subpaths.push(cur);
  }

  function newSubpath(x, y) {
    pushSubpath();
    cur = [{ p: [x, y], inT: [0, 0], outT: [0, 0] }];
    sx = x; sy = y;
    cx = x; cy = y;
  }

  function lineTo(x, y) {
    cur.push({ p: [x, y], inT: [0, 0], outT: [0, 0] });
    cx = x; cy = y;
  }

  function curveTo(c1x, c1y, c2x, c2y, x, y) {
    // set outgoing tangent of previous vertex
    const prev = cur[cur.length - 1];
    prev.outT = [c1x - prev.p[0], c1y - prev.p[1]];
    cur.push({
      p: [x, y],
      inT: [c2x - x, c2y - y],
      outT: [0, 0],
    });
    cx = x; cy = y;
  }

  function closePath() {
    if (!cur || cur.length === 0) return;
    const first = cur[0];
    const last = cur[cur.length - 1];
    const dx = first.p[0] - last.p[0];
    const dy = first.p[1] - last.p[1];
    if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) {
      // implicit closing line
      lineTo(first.p[0], first.p[1]);
    }
    cx = sx; cy = sy;
  }

  while (i < tokens.length) {
    const cmd = tokens[i++];

    switch (cmd) {
      case 'M': case 'm': {
        let x = +tokens[i++], y = +tokens[i++];
        if (cmd === 'm') { x += cx; y += cy; }
        newSubpath(x, y);
        // subsequent bare coordinate pairs after M are implicit L
        while (isNum(tokens[i])) {
          let lx = +tokens[i++], ly = +tokens[i++];
          if (cmd === 'm') { lx += cx; ly += cy; }
          lineTo(lx, ly);
        }
        break;
      }
      case 'L': case 'l': {
        while (isNum(tokens[i])) {
          let x = +tokens[i++], y = +tokens[i++];
          if (cmd === 'l') { x += cx; y += cy; }
          lineTo(x, y);
        }
        break;
      }
      case 'H': case 'h': {
        while (isNum(tokens[i])) {
          let x = +tokens[i++];
          if (cmd === 'h') x += cx;
          lineTo(x, cy);
        }
        break;
      }
      case 'V': case 'v': {
        while (isNum(tokens[i])) {
          let y = +tokens[i++];
          if (cmd === 'v') y += cy;
          lineTo(cx, y);
        }
        break;
      }
      case 'C': case 'c': {
        while (isNum(tokens[i])) {
          let c1x = +tokens[i++], c1y = +tokens[i++];
          let c2x = +tokens[i++], c2y = +tokens[i++];
          let x = +tokens[i++], y = +tokens[i++];
          if (cmd === 'c') {
            c1x += cx; c1y += cy; c2x += cx; c2y += cy; x += cx; y += cy;
          }
          curveTo(c1x, c1y, c2x, c2y, x, y);
          prevCtrl = [c2x, c2y];
        }
        break;
      }
      case 'S': case 's': {
        while (isNum(tokens[i])) {
          let c2x = +tokens[i++], c2y = +tokens[i++];
          let x = +tokens[i++], y = +tokens[i++];
          if (cmd === 's') { c2x += cx; c2y += cy; x += cx; y += cy; }
          const reflect = (prevCmd && /[CcSs]/.test(prevCmd) && prevCtrl)
            ? [2 * cx - prevCtrl[0], 2 * cx - prevCtrl[1]]
            : [cx, cy];
          const c1x = (prevCmd && /[CcSs]/.test(prevCmd) && prevCtrl) ? (2 * cx - prevCtrl[0]) : cx;
          const c1y = (prevCmd && /[CcSs]/.test(prevCmd) && prevCtrl) ? (2 * cy - prevCtrl[1]) : cy;
          curveTo(c1x, c1y, c2x, c2y, x, y);
          prevCtrl = [c2x, c2y];
        }
        break;
      }
      case 'Q': case 'q': {
        while (isNum(tokens[i])) {
          let qx = +tokens[i++], qy = +tokens[i++];
          let x = +tokens[i++], y = +tokens[i++];
          if (cmd === 'q') { qx += cx; qy += cy; x += cx; y += cy; }
          const c1x = cx + (2 / 3) * (qx - cx);
          const c1y = cy + (2 / 3) * (qy - cy);
          const c2x = x + (2 / 3) * (qx - x);
          const c2y = y + (2 / 3) * (qy - y);
          curveTo(c1x, c1y, c2x, c2y, x, y);
          prevCtrl = [qx, qy];
        }
        break;
      }
      case 'T': case 't': {
        while (isNum(tokens[i])) {
          let x = +tokens[i++], y = +tokens[i++];
          if (cmd === 't') { x += cx; y += cy; }
          const qx = (prevCmd && /[QqTt]/.test(prevCmd) && prevCtrl) ? (2 * cx - prevCtrl[0]) : cx;
          const qy = (prevCmd && /[QqTt]/.test(prevCmd) && prevCtrl) ? (2 * cy - prevCtrl[1]) : cy;
          const c1x = cx + (2 / 3) * (qx - cx);
          const c1y = cy + (2 / 3) * (qy - cy);
          const c2x = x + (2 / 3) * (qx - x);
          const c2y = y + (2 / 3) * (qy - y);
          curveTo(c1x, c1y, c2x, c2y, x, y);
          prevCtrl = [qx, qy];
        }
        break;
      }
      case 'A': case 'a': {
        while (isNum(tokens[i])) {
          let rx = +tokens[i++], ry = +tokens[i++];
          let rot = +tokens[i++];
          let laf = +tokens[i++], swf = +tokens[i++];
          let x = +tokens[i++], y = +tokens[i++];
          if (cmd === 'a') { x += cx; y += cy; }
          arcTo(cx, cy, rx, ry, rot, laf, swf, x, y, curveTo);
          cx = x; cy = y;
        }
        break;
      }
      case 'Z': case 'z': {
        closePath();
        break;
      }
      default:
        // unknown command, skip
        break;
    }
    prevCmd = cmd;
  }
  pushSubpath();

  return subpaths.map((verts) => {
    const closed = subpathIsClosed(verts);
    return {
      closed,
      verts: verts.map(v => v.p),
      in: verts.map(v => v.inT),
      out: verts.map(v => v.outT),
    };
  });
}

function subpathIsClosed(verts) {
  if (verts.length < 2) return false;
  const first = verts[0].p, last = verts[verts.length - 1].p;
  return Math.abs(first[0] - last[0]) < 1e-4 && Math.abs(first[1] - last[1]) < 1e-4;
}

function isNum(tok) {
  return tok !== undefined && /^[-+.\d]/.test(tok);
}

function tokenizePath(d) {
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
  const out = [];
  let m;
  while ((m = re.exec(d)) !== null) {
    out.push(m[1] !== undefined ? m[1] : m[2]);
  }
  return out;
}

/**
 * Converts an SVG elliptical arc segment to one or more cubic beziers,
 * calling curveTo(c1x,c1y,c2x,c2y,x,y) for each resulting segment.
 * Standard endpoint-to-center parameterization (SVG spec appendix F.6).
 */
function arcTo(x0, y0, rx, ry, xAxisRotDeg, largeArcFlag, sweepFlag, x1, y1, curveTo) {
  if (rx === 0 || ry === 0) {
    curveTo(x0, y0, x1, y1, x1, y1);
    return;
  }
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = (xAxisRotDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);

  const dx2 = (x0 - x1) / 2, dy2 = (y0 - y1) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  let rxSq = rx * rx, rySq = ry * ry;
  const x1pSq = x1p * x1p, y1pSq = y1p * y1p;

  const lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s; ry *= s;
    rxSq = rx * rx; rySq = ry * ry;
  }

  const sign = largeArcFlag !== sweepFlag ? 1 : -1;
  let num = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq;
  num = Math.max(num, 0);
  const co = sign * Math.sqrt(num / (rxSq * y1pSq + rySq * x1pSq));

  const cxp = co * (rx * y1p) / ry;
  const cyp = co * -(ry * x1p) / rx;

  const cx = cosPhi * cxp - sinPhi * cyp + (x0 + x1) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y0 + y1) / 2;

  const angle = (ux, uy, vx, vy) => {
    const sign = (ux * vy - uy * vx < 0) ? -1 : 1;
    const dot = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))));
    return sign * Math.acos(dot);
  };

  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);

  if (!sweepFlag && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweepFlag && dTheta < 0) dTheta += 2 * Math.PI;

  const segments = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const delta = dTheta / segments;
  const t = (8 / 3) * Math.sin(delta / 4) * Math.sin(delta / 4) / Math.sin(delta / 2);

  let theta = theta1;
  let prevX = x0, prevY = y0;

  for (let seg = 0; seg < segments; seg++) {
    const theta2 = theta + delta;

    const cosT1 = Math.cos(theta), sinT1 = Math.sin(theta);
    const cosT2 = Math.cos(theta2), sinT2 = Math.sin(theta2);

    const ex1 = cx + rx * cosPhi * cosT1 - ry * sinPhi * sinT1;
    const ey1 = cy + rx * sinPhi * cosT1 + ry * cosPhi * sinT1;
    const ex2 = cx + rx * cosPhi * cosT2 - ry * sinPhi * sinT2;
    const ey2 = cy + rx * sinPhi * cosT2 + ry * cosPhi * sinT2;

    const dx1 = -rx * cosPhi * sinT1 - ry * sinPhi * cosT1;
    const dy1 = -rx * sinPhi * sinT1 + ry * cosPhi * cosT1;
    const dx2 = -rx * cosPhi * sinT2 - ry * sinPhi * cosT2;
    const dy2 = -rx * sinPhi * sinT2 + ry * cosPhi * cosT2;

    const c1x = ex1 + t * dx1, c1y = ey1 + t * dy1;
    const c2x = ex2 - t * dx2, c2y = ey2 - t * dy2;

    curveTo(c1x, c1y, c2x, c2y, ex2, ey2);

    theta = theta2;
    prevX = ex2; prevY = ey2;
  }
}

// Exposed API
window.SvgPath = { parseSvgPathD };

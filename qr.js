/*!
 * Codificador QR propio (sin dependencias).
 * Modo byte (UTF-8), versiones 1–40, niveles de corrección L/M/Q/H.
 * Parte de «Generador QR» — creado por Raúl Pivet.
 */
(function (root) {
  'use strict';

  var ECC_PER_BLOCK = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  };
  var NUM_BLOCKS = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  };
  var FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(str));
    var s = unescape(encodeURIComponent(str)), out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function numRawDataModules(ver) {
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  function numDataCodewords(ver, ecl) {
    return Math.floor(numRawDataModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver];
  }

  // --- Reed-Solomon sobre GF(2^8) ---
  function rsMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function rsDivisor(degree) {
    var result = [];
    for (var i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var rootv = 1;
    for (i = 0; i < degree; i++) {
      for (var j = 0; j < result.length; j++) {
        result[j] = rsMul(result[j], rootv);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      rootv = rsMul(rootv, 2);
    }
    return result;
  }
  function rsRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    for (var k = 0; k < data.length; k++) {
      var factor = data[k] ^ result.shift();
      result.push(0);
      for (var i = 0; i < divisor.length; i++) result[i] ^= rsMul(divisor[i], factor);
    }
    return result;
  }

  function addEccAndInterleave(data, ver, ecl) {
    var numBlocks = NUM_BLOCKS[ecl][ver];
    var blockEccLen = ECC_PER_BLOCK[ecl][ver];
    var rawCodewords = Math.floor(numRawDataModules(ver) / 8);
    var numShortBlocks = numBlocks - rawCodewords % numBlocks;
    var shortBlockLen = Math.floor(rawCodewords / numBlocks);
    var blocks = [];
    var divisor = rsDivisor(blockEccLen);
    for (var i = 0, k = 0; i < numBlocks; i++) {
      var len = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
      var dat = data.slice(k, k + len);
      k += len;
      var ecc = rsRemainder(dat, divisor);
      if (i < numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var result = [];
    for (i = 0; i < blocks[0].length; i++) {
      for (var j = 0; j < blocks.length; j++) {
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(blocks[j][i]);
      }
    }
    return result;
  }

  function alignmentPositions(ver) {
    if (ver === 1) return [];
    var size = ver * 4 + 17;
    var numAlign = Math.floor(ver / 7) + 2;
    var step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    var result = [6];
    for (var pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  function maskBit(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return (x * y) % 2 + (x * y) % 3 === 0;
      case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
      default: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
    }
  }

  function penalty(m, size) {
    var result = 0, x, y, run, color, dark = 0;
    var lines = [];
    for (y = 0; y < size; y++) {
      var row = '', col = '';
      for (x = 0; x < size; x++) {
        row += m[y][x] ? '1' : '0';
        col += m[x][y] ? '1' : '0';
        if (m[y][x]) dark++;
      }
      lines.push(row, col);
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      run = 1; color = line[0];
      for (x = 1; x <= size; x++) {
        if (x < size && line[x] === color) run++;
        else {
          if (run >= 5) result += 3 + (run - 5);
          run = 1; color = line[x];
        }
      }
      var idx = -1;
      while ((idx = line.indexOf('10111010000', idx + 1)) !== -1) result += 40;
      idx = -1;
      while ((idx = line.indexOf('00001011101', idx + 1)) !== -1) result += 40;
    }
    for (y = 0; y < size - 1; y++) {
      for (x = 0; x < size - 1; x++) {
        var c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) result += 3;
      }
    }
    var total = size * size;
    var k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += Math.max(k, 0) * 10;
    return result;
  }

  /**
   * Codifica un texto y devuelve la matriz de módulos.
   * @param {string} text
   * @param {'L'|'M'|'Q'|'H'} ecl
   * @returns {{size:number, version:number, ecl:string, modules:boolean[][]}}
   */
  function encode(text, ecl) {
    ecl = ecl || 'M';
    var bytes = utf8Bytes(text);
    var ver, capacityBits, needed;
    for (ver = 1; ; ver++) {
      if (ver > 40) {
        var err = new Error('El contenido es demasiado largo para un código QR.');
        err.code = 'TOO_LONG';
        throw err;
      }
      capacityBits = numDataCodewords(ver, ecl) * 8;
      needed = 4 + (ver < 10 ? 8 : 16) + bytes.length * 8;
      if (needed <= capacityBits) break;
    }

    // Secuencia de bits: modo byte + longitud + datos + terminador + relleno
    var bits = [];
    function push(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    push(4, 4);
    push(bytes.length, ver < 10 ? 8 : 16);
    for (var b = 0; b < bytes.length; b++) push(bytes[b], 8);
    push(0, Math.min(4, capacityBits - bits.length));
    push(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < capacityBits; pad ^= 0xEC ^ 0x11) push(pad, 8);

    var data = [];
    for (var i = 0; i < bits.length; i += 8) {
      var v = 0;
      for (var j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      data.push(v);
    }
    var codewords = addEccAndInterleave(data, ver, ecl);

    var size = ver * 4 + 17;
    var modules = [], isFn = [];
    var x, y;
    for (y = 0; y < size; y++) {
      modules.push(new Array(size).fill(false));
      isFn.push(new Array(size).fill(false));
    }
    function setFn(px, py, dark) {
      modules[py][px] = !!dark;
      isFn[py][px] = true;
    }

    // Patrones de sincronización
    for (i = 0; i < size; i++) {
      setFn(6, i, i % 2 === 0);
      setFn(i, 6, i % 2 === 0);
    }
    // Patrones de posición (ojos) con separador
    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          var dist = Math.max(Math.abs(dx), Math.abs(dy));
          var xx = cx + dx, yy = cy + dy;
          if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFn(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    // Patrones de alineación
    var align = alignmentPositions(ver), n = align.length;
    for (i = 0; i < n; i++) {
      for (j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        for (var dy = -2; dy <= 2; dy++) {
          for (var dx = -2; dx <= 2; dx++) {
            setFn(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
          }
        }
      }
    }

    function drawFormat(mask) {
      var d = (FORMAT_BITS[ecl] << 3) | mask, rem = d;
      for (var q = 0; q < 10; q++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var fb = ((d << 10) | rem) ^ 0x5412;
      function bit(q) { return ((fb >>> q) & 1) !== 0; }
      var q2;
      for (q2 = 0; q2 <= 5; q2++) setFn(8, q2, bit(q2));
      setFn(8, 7, bit(6));
      setFn(8, 8, bit(7));
      setFn(7, 8, bit(8));
      for (q2 = 9; q2 < 15; q2++) setFn(14 - q2, 8, bit(q2));
      for (q2 = 0; q2 < 8; q2++) setFn(size - 1 - q2, 8, bit(q2));
      for (q2 = 8; q2 < 15; q2++) setFn(8, size - 15 + q2, bit(q2));
      setFn(8, size - 8, true);
    }
    drawFormat(0); // reserva las celdas

    if (ver >= 7) {
      var rem = ver;
      for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vb = (ver << 12) | rem;
      for (i = 0; i < 18; i++) {
        var on = ((vb >>> i) & 1) !== 0;
        var a = size - 11 + i % 3, bb = Math.floor(i / 3);
        setFn(a, bb, on);
        setFn(bb, a, on);
      }
    }

    // Colocación en zigzag de los datos
    i = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (j = 0; j < 2; j++) {
          x = right - j;
          var upward = ((right + 1) & 2) === 0;
          y = upward ? size - 1 - vert : vert;
          if (!isFn[y][x] && i < codewords.length * 8) {
            modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }

    function applyMask(mask) {
      for (var yy = 0; yy < size; yy++) {
        for (var xx = 0; xx < size; xx++) {
          if (!isFn[yy][xx] && maskBit(mask, xx, yy)) modules[yy][xx] = !modules[yy][xx];
        }
      }
    }

    var best = 0, bestPenalty = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      applyMask(mask);
      drawFormat(mask);
      var p = penalty(modules, size);
      if (p < bestPenalty) { bestPenalty = p; best = mask; }
      applyMask(mask); // deshacer (XOR)
    }
    applyMask(best);
    drawFormat(best);

    return { size: size, version: ver, ecl: ecl, modules: modules };
  }

  var api = { encode: encode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QR = api;
})(typeof self !== 'undefined' ? self : this);

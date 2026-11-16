/*!
 * Generador QR — creado por Raúl Pivet (github.com/Sinsapiar1)
 * Lógica de la aplicación: formularios, dibujo del código, descargas e historial.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ------------------------------------------------------------------ *
   * Almacenamiento local (puede fallar en modo privado: nunca rompe la app)
   * ------------------------------------------------------------------ */
  var store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    },
    del: function (key) {
      try { localStorage.removeItem(key); } catch (e) {}
    }
  };

  /* ------------------------------------------------------------------ *
   * Tipos de contenido
   * ------------------------------------------------------------------ */
  function wifiEscape(s) { return String(s).replace(/([\\;,:"])/g, '\\$1'); }
  function vEscape(s) { return String(s).replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n'); }
  function digits(s) { return String(s).replace(/[^\d]/g, ''); }
  function phone(s) { return String(s).replace(/[^\d+]/g, ''); }

  var TYPES = [
    {
      id: 'url', label: 'Enlace',
      fields: [{ name: 'url', label: 'Dirección web', type: 'url', placeholder: 'https://tusitio.com', inputmode: 'url', required: true }],
      build: function (v) {
        var u = (v.url || '').trim();
        if (!u) return '';
        return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : 'https://' + u;
      },
      sample: 'https://github.com/Sinsapiar1/Generadorqr'
    },
    {
      id: 'text', label: 'Texto',
      fields: [{ name: 'text', label: 'Texto', type: 'textarea', placeholder: 'Escribe cualquier texto', required: true }],
      build: function (v) { return (v.text || '').trim(); }
    },
    {
      id: 'wifi', label: 'WiFi',
      fields: [
        { name: 'ssid', label: 'Nombre de la red', type: 'text', placeholder: 'MiRed', required: true },
        { name: 'pass', label: 'Contraseña', type: 'text', placeholder: 'Contraseña de la red' },
        { name: 'sec', label: 'Seguridad', type: 'select', options: [['WPA', 'WPA / WPA2 / WPA3'], ['WEP', 'WEP'], ['nopass', 'Sin contraseña']] },
        { name: 'hidden', label: 'La red está oculta', type: 'checkbox' }
      ],
      build: function (v) {
        var ssid = (v.ssid || '').trim();
        if (!ssid) return '';
        var sec = v.sec || 'WPA';
        var out = 'WIFI:T:' + sec + ';S:' + wifiEscape(ssid) + ';';
        if (sec !== 'nopass') out += 'P:' + wifiEscape(v.pass || '') + ';';
        if (v.hidden) out += 'H:true;';
        return out + ';';
      }
    },
    {
      id: 'vcard', label: 'Contacto',
      fields: [
        { name: 'first', label: 'Nombre', type: 'text', required: true, half: true },
        { name: 'last', label: 'Apellidos', type: 'text', half: true },
        { name: 'org', label: 'Empresa', type: 'text', half: true },
        { name: 'title', label: 'Cargo', type: 'text', half: true },
        { name: 'tel', label: 'Teléfono', type: 'tel', inputmode: 'tel', placeholder: '+34 600 000 000', half: true },
        { name: 'email', label: 'Correo', type: 'email', inputmode: 'email', half: true },
        { name: 'web', label: 'Web', type: 'url', inputmode: 'url' },
        { name: 'adr', label: 'Dirección', type: 'text' }
      ],
      build: function (v) {
        var first = (v.first || '').trim(), last = (v.last || '').trim();
        if (!first && !last) return '';
        var lines = ['BEGIN:VCARD', 'VERSION:3.0',
          'N:' + vEscape(last) + ';' + vEscape(first) + ';;;',
          'FN:' + vEscape((first + ' ' + last).trim())];
        if (v.org) lines.push('ORG:' + vEscape(v.org.trim()));
        if (v.title) lines.push('TITLE:' + vEscape(v.title.trim()));
        if (v.tel) lines.push('TEL;TYPE=CELL:' + phone(v.tel));
        if (v.email) lines.push('EMAIL:' + v.email.trim());
        if (v.web) lines.push('URL:' + v.web.trim());
        if (v.adr) lines.push('ADR:;;' + vEscape(v.adr.trim()) + ';;;;');
        lines.push('END:VCARD');
        return lines.join('\n');
      }
    },
    {
      id: 'email', label: 'Correo',
      fields: [
        { name: 'to', label: 'Para', type: 'email', inputmode: 'email', placeholder: 'nombre@correo.com', required: true },
        { name: 'subject', label: 'Asunto', type: 'text' },
        { name: 'body', label: 'Mensaje', type: 'textarea' }
      ],
      build: function (v) {
        var to = (v.to || '').trim();
        if (!to) return '';
        var q = [];
        if (v.subject) q.push('subject=' + encodeURIComponent(v.subject));
        if (v.body) q.push('body=' + encodeURIComponent(v.body));
        return 'mailto:' + to + (q.length ? '?' + q.join('&') : '');
      }
    },
    {
      id: 'tel', label: 'Teléfono',
      fields: [{ name: 'tel', label: 'Número', type: 'tel', inputmode: 'tel', placeholder: '+34 600 000 000', required: true }],
      build: function (v) { var t = phone(v.tel || ''); return t ? 'tel:' + t : ''; }
    },
    {
      id: 'sms', label: 'SMS',
      fields: [
        { name: 'tel', label: 'Número', type: 'tel', inputmode: 'tel', placeholder: '+34 600 000 000', required: true },
        { name: 'msg', label: 'Mensaje', type: 'textarea' }
      ],
      build: function (v) { var t = phone(v.tel || ''); return t ? 'SMSTO:' + t + ':' + (v.msg || '') : ''; }
    },
    {
      id: 'whatsapp', label: 'WhatsApp',
      fields: [
        { name: 'tel', label: 'Número con prefijo del país', type: 'tel', inputmode: 'tel', placeholder: '34 600 000 000', required: true },
        { name: 'msg', label: 'Mensaje ya escrito', type: 'textarea', placeholder: 'Hola, vengo del código QR' }
      ],
      build: function (v) {
        var t = digits(v.tel || '');
        if (!t) return '';
        return 'https://wa.me/' + t + (v.msg ? '?text=' + encodeURIComponent(v.msg) : '');
      }
    },
    {
      id: 'geo', label: 'Ubicación',
      fields: [
        { name: 'lat', label: 'Latitud', type: 'text', inputmode: 'decimal', placeholder: '40.4168', required: true, half: true },
        { name: 'lng', label: 'Longitud', type: 'text', inputmode: 'decimal', placeholder: '-3.7038', required: true, half: true },
        { name: 'locate', label: 'Usar mi ubicación actual', type: 'button' }
      ],
      build: function (v) {
        var lat = parseFloat(String(v.lat || '').replace(',', '.'));
        var lng = parseFloat(String(v.lng || '').replace(',', '.'));
        if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return '';
        return 'geo:' + lat + ',' + lng;
      }
    }
  ];
  var TYPE_BY_ID = {};
  TYPES.forEach(function (t) { TYPE_BY_ID[t.id] = t; });

  /* ------------------------------------------------------------------ *
   * Estado
   * ------------------------------------------------------------------ */
  var DEFAULT_DESIGN = {
    fg: '#0f1730', fg2: '#2b44ff', bg: '#ffffff',
    gradient: false, transparent: false,
    moduleStyle: 'square', eyeStyle: 'square',
    margin: 2, ecl: 'M', caption: ''
  };
  var PRESETS = [
    { name: 'Tinta', fg: '#0f1730', bg: '#ffffff' },
    { name: 'Cobalto', fg: '#1d2fd6', bg: '#ffffff' },
    { name: 'Bosque', fg: '#0b5d3b', bg: '#f2faf4' },
    { name: 'Granate', fg: '#7a1230', bg: '#fff6f3' },
    { name: 'Señal', fg: '#1c1c1c', bg: '#ffd84a' },
    { name: 'Atardecer', fg: '#c2185b', fg2: '#5b21b6', bg: '#ffffff' },
    { name: 'Océano', fg: '#0b7285', fg2: '#1d2fd6', bg: '#f3fbff' }
  ];

  var saved = store.get('qr-ajustes', {});
  var state = {
    type: TYPE_BY_ID[saved.type] ? saved.type : 'url',
    values: {},
    design: Object.assign({}, DEFAULT_DESIGN, saved.design || {}),
    logo: null // { dataUrl, name } — solo en memoria
  };
  var current = { payload: '', qr: null, isSample: true };

  function saveSettings() {
    store.set('qr-ajustes', { type: state.type, design: state.design });
  }

  /* ------------------------------------------------------------------ *
   * Dibujo del código en SVG
   * ------------------------------------------------------------------ */
  function xml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function f(n) { return +n.toFixed(3); }

  function roundRect(x, y, w, h, r) {
    return 'M' + f(x + r) + ' ' + f(y) + 'h' + f(w - 2 * r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r +
      'v' + f(h - 2 * r) + 'a' + r + ' ' + r + ' 0 0 1 -' + r + ' ' + r +
      'h-' + f(w - 2 * r) + 'a' + r + ' ' + r + ' 0 0 1 -' + r + ' -' + r +
      'v-' + f(h - 2 * r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' -' + r + 'z';
  }
  function circle(cx, cy, r) {
    return 'M' + f(cx - r) + ' ' + f(cy) + 'a' + r + ' ' + r + ' 0 1 0 ' + f(2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 -' + f(2 * r) + ' 0z';
  }
  function eyePath(ox, oy, style) {
    if (style === 'circle') {
      return circle(ox + 3.5, oy + 3.5, 3.5) + circle(ox + 3.5, oy + 3.5, 2.5) + circle(ox + 3.5, oy + 3.5, 1.5);
    }
    if (style === 'rounded') {
      return roundRect(ox, oy, 7, 7, 2) + roundRect(ox + 1, oy + 1, 5, 5, 1.1) + roundRect(ox + 2, oy + 2, 3, 3, 0.9);
    }
    return 'M' + ox + ' ' + oy + 'h7v7h-7z' + 'M' + (ox + 1) + ' ' + (oy + 1) + 'h5v5h-5z' + 'M' + (ox + 2) + ' ' + (oy + 2) + 'h3v3h-3z';
  }

  /** Geometría común al SVG y al PNG. */
  function geometry(qr, d, hasLogo) {
    var n = qr.size, m = d.margin, W = n + 2 * m, H = W;
    var cap = (d.caption || '').trim(), capInfo = null;
    if (cap) {
      var fs = Math.min(W * 0.09, (W * 0.92) / (cap.length * 0.6));
      var baseline = m + n + Math.max(m, 1) * 0.55 + fs;
      H = baseline + fs * 0.55 + Math.max(m * 0.5, 0.8);
      capInfo = { text: cap, fs: fs, baseline: baseline };
    }
    var logo = null;
    if (hasLogo) {
      var ls = Math.max(5, Math.round(n * 0.24));
      if ((n - ls) % 2) ls += 1;
      var start = (n - ls) / 2;
      logo = { x: m + start, y: m + start, size: ls, start: start };
    }
    return { n: n, m: m, W: W, H: H, cap: capInfo, logo: logo };
  }

  /**
   * Construye el SVG del código.
   * opts.embedLogo: incluye la imagen del logo dentro del SVG.
   * opts.px: ancho en píxeles (si se omite, el SVG es fluido).
   */
  function buildSvg(qr, d, logoData, opts) {
    opts = opts || {};
    var g = geometry(qr, d, !!logoData);
    var n = g.n, m = g.m, mods = qr.modules;
    var path = '';
    var x, y;

    function inEye(px, py) {
      return (px < 7 && py < 7) || (px >= n - 7 && py < 7) || (px < 7 && py >= n - 7);
    }
    function inLogo(px, py) {
      if (!g.logo) return false;
      var s = g.logo.start, e = s + g.logo.size;
      return px >= s && px < e && py >= s && py < e;
    }

    for (y = 0; y < n; y++) {
      for (x = 0; x < n; x++) {
        if (!mods[y][x] || inEye(x, y) || inLogo(x, y)) continue;
        if (d.moduleStyle === 'dots') path += circle(x + 0.5, y + 0.5, 0.47);
        else if (d.moduleStyle === 'rounded') path += roundRect(x, y, 1, 1, 0.36);
        else path += 'M' + x + ' ' + y + 'h1v1h-1z';
      }
    }
    path += eyePath(0, 0, d.eyeStyle) + eyePath(n - 7, 0, d.eyeStyle) + eyePath(0, n - 7, d.eyeStyle);

    var uid = 'qrg' + (opts.uid || '');
    var fill = d.gradient ? 'url(#' + uid + ')' : d.fg;
    var size = opts.px ? ' width="' + opts.px + '" height="' + Math.round(opts.px * g.H / g.W) + '"' : '';
    var out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f(g.W) + ' ' + f(g.H) + '"' + size + '>';
    if (d.gradient) {
      out += '<defs><linearGradient id="' + uid + '" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="' + n + '" y2="' + n + '">' +
        '<stop offset="0" stop-color="' + d.fg + '"/><stop offset="1" stop-color="' + d.fg2 + '"/></linearGradient></defs>';
    }
    if (!d.transparent) out += '<rect width="' + f(g.W) + '" height="' + f(g.H) + '" fill="' + d.bg + '"/>';
    out += '<path transform="translate(' + m + ' ' + m + ')" fill="' + fill + '" fill-rule="evenodd" d="' + path + '"/>';
    if (g.logo) {
      var L = g.logo, pad = 0.5;
      out += '<rect x="' + f(L.x + 0.25) + '" y="' + f(L.y + 0.25) + '" width="' + f(L.size - 0.5) + '" height="' + f(L.size - 0.5) +
        '" rx="' + f(L.size * 0.16) + '" fill="' + (d.transparent ? '#ffffff' : d.bg) + '"/>';
      if (opts.embedLogo) {
        out += '<image href="' + xml(logoData) + '" x="' + f(L.x + 0.25 + pad) + '" y="' + f(L.y + 0.25 + pad) +
          '" width="' + f(L.size - 0.5 - 2 * pad) + '" height="' + f(L.size - 0.5 - 2 * pad) + '" preserveAspectRatio="xMidYMid meet"/>';
      }
    }
    if (g.cap) {
      out += '<text x="' + f(g.W / 2) + '" y="' + f(g.cap.baseline) + '" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="700" font-size="' +
        f(g.cap.fs) + '" fill="' + d.fg + '">' + xml(g.cap.text) + '</text>';
    }
    return out + '</svg>';
  }

  function effectiveEcl() { return state.logo ? 'H' : state.design.ecl; }

  /* ------------------------------------------------------------------ *
   * Contraste
   * ------------------------------------------------------------------ */
  function luminance(hex) {
    var c = [1, 3, 5].map(function (i) {
      var v = parseInt(hex.substr(i, 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrastMessage(d) {
    var bg = luminance(d.transparent ? '#ffffff' : d.bg);
    var fgs = d.gradient ? [d.fg, d.fg2] : [d.fg];
    var worst = Infinity, inverted = false;
    fgs.forEach(function (c) {
      var l = luminance(c);
      var ratio = (Math.max(l, bg) + 0.05) / (Math.min(l, bg) + 0.05);
      if (ratio < worst) worst = ratio;
      if (l > bg) inverted = true;
    });
    if (worst < 2.5) return 'Hay poco contraste entre el código y el fondo: es probable que las cámaras no lo lean. Oscurece el código o aclara el fondo.';
    if (inverted) return 'El código es más claro que el fondo. Muchos lectores esperan lo contrario: pruébalo antes de usarlo.';
    if (worst < 4) return 'El contraste es justo. Funciona mejor con un código más oscuro.';
    return '';
  }

  /* ------------------------------------------------------------------ *
   * Render principal
   * ------------------------------------------------------------------ */
  var els = {};
  var ECL_NAMES = { L: 'baja', M: 'media', Q: 'alta', H: 'máxima' };

  function payloadNow() {
    var t = TYPE_BY_ID[state.type];
    return t.build(state.values[state.type] || {});
  }

  function render() {
    var d = state.design;
    var payload = payloadNow();
    var isSample = !payload;
    var text = payload || TYPES[0].sample;
    var qr = null, error = '';
    try {
      qr = QR.encode(text, effectiveEcl());
    } catch (e) {
      error = e.code === 'TOO_LONG'
        ? 'El contenido es demasiado largo para un código QR. Acórtalo o baja la resistencia a daños.'
        : 'No se pudo generar el código. Revisa el contenido.';
    }

    current = { payload: payload, qr: isSample ? null : qr, isSample: isSample };
    var usable = !!qr && !isSample;

    if (qr) els.qr.innerHTML = buildSvg(qr, d, state.logo && state.logo.dataUrl, { embedLogo: true, uid: 'p' });
    els.sticker.classList.toggle('is-sample', isSample || !qr);
    els.sticker.classList.toggle('is-transparent', d.transparent);
    els.placeholder.textContent = error || 'Escribe tu contenido y el código aparece aquí';
    els.placeholder.classList.toggle('is-error', !!error);

    if (usable) {
      var dense = qr.size > 77 ? ' Es un código denso: imprímelo grande o acorta el contenido.' : '';
      els.meta.textContent = qr.size + ' × ' + qr.size + ' módulos, resistencia ' + ECL_NAMES[qr.ecl] + '.' + dense;
    } else {
      els.meta.textContent = error ? '' : 'Vista de ejemplo';
    }

    [els.dlPng, els.dlSvg, els.copyBtn, els.shareBtn, els.pngSize].forEach(function (b) { b.disabled = !usable; });

    var msg = contrastMessage(d);
    els.contrastMsg.hidden = !msg;
    els.contrastMsg.textContent = msg;
  }

  var raf = 0;
  function scheduleRender() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(render);
  }

  /* ------------------------------------------------------------------ *
   * Formulario de contenido
   * ------------------------------------------------------------------ */
  function renderTypes() {
    els.types.innerHTML = '';
    TYPES.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('role', 'radio');
      b.dataset.type = t.id;
      b.textContent = t.label;
      els.types.appendChild(b);
    });
    syncTypes();
  }
  function syncTypes() {
    Array.prototype.forEach.call(els.types.children, function (b) {
      var on = b.dataset.type === state.type;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
  }

  function renderFields() {
    var t = TYPE_BY_ID[state.type];
    var vals = state.values[state.type] || (state.values[state.type] = {});
    els.fields.innerHTML = '';
    t.fields.forEach(function (fd) {
      var id = 'f-' + fd.name;
      var wrap;
      if (fd.type === 'button') {
        wrap = document.createElement('button');
        wrap.type = 'button';
        wrap.className = 'btn ghost full';
        wrap.id = id;
        wrap.textContent = fd.label;
        wrap.addEventListener('click', locate);
        els.fields.appendChild(wrap);
        return;
      }
      if (fd.type === 'checkbox') {
        wrap = document.createElement('label');
        wrap.className = 'check full';
        var cb = document.createElement('input');
        cb.type = 'checkbox'; cb.id = id; cb.checked = !!vals[fd.name];
        cb.addEventListener('change', function () { vals[fd.name] = cb.checked; scheduleRender(); });
        var sp = document.createElement('span'); sp.textContent = fd.label;
        wrap.appendChild(cb); wrap.appendChild(sp);
        els.fields.appendChild(wrap);
        return;
      }
      wrap = document.createElement('label');
      wrap.className = 'field' + (fd.half ? ' half' : ' full');
      var lab = document.createElement('span');
      lab.textContent = fd.label + (fd.required ? '' : ' (opcional)');
      var input;
      if (fd.type === 'textarea') {
        input = document.createElement('textarea');
        input.rows = 3;
      } else if (fd.type === 'select') {
        input = document.createElement('select');
        fd.options.forEach(function (o) {
          var op = document.createElement('option');
          op.value = o[0]; op.textContent = o[1];
          input.appendChild(op);
        });
        lab.textContent = fd.label;
      } else {
        input = document.createElement('input');
        input.type = fd.type;
      }
      input.id = id;
      if (fd.placeholder) input.placeholder = fd.placeholder;
      if (fd.inputmode) input.setAttribute('inputmode', fd.inputmode);
      input.setAttribute('autocapitalize', 'off');
      input.spellcheck = fd.type === 'textarea';
      if (vals[fd.name] != null) input.value = vals[fd.name];
      else if (fd.type === 'select') vals[fd.name] = input.value;
      input.addEventListener('input', function () { vals[fd.name] = input.value; scheduleRender(); });
      wrap.appendChild(lab); wrap.appendChild(input);
      els.fields.appendChild(wrap);
    });
  }

  function setType(id, focus) {
    state.type = id;
    syncTypes();
    renderFields();
    saveSettings();
    render();
    if (focus) {
      var btn = els.types.querySelector('[data-type="' + id + '"]');
      if (btn) btn.focus();
    }
  }

  function locate() {
    if (!navigator.geolocation) { toast('Este navegador no permite obtener la ubicación.'); return; }
    toast('Buscando tu ubicación…');
    navigator.geolocation.getCurrentPosition(function (pos) {
      var v = state.values.geo || (state.values.geo = {});
      v.lat = pos.coords.latitude.toFixed(6);
      v.lng = pos.coords.longitude.toFixed(6);
      renderFields();
      render();
      toast('Ubicación añadida');
    }, function () {
      toast('No se pudo obtener la ubicación. Revisa los permisos del navegador.');
    }, { timeout: 10000 });
  }

  /* ------------------------------------------------------------------ *
   * Controles de diseño
   * ------------------------------------------------------------------ */
  var MODULE_STYLES = [
    ['square', 'Cuadrados', '<path d="M2 2h6v6H2zM8 8h6v6H8zM14 2h6v6h-6zM2 14h6v6H2z"/>'],
    ['rounded', 'Suaves', '<rect x="2" y="2" width="6" height="6" rx="2"/><rect x="8.5" y="8.5" width="6" height="6" rx="2"/><rect x="15" y="2" width="6" height="6" rx="2"/><rect x="2" y="15" width="6" height="6" rx="2"/>'],
    ['dots', 'Círculos', '<circle cx="5" cy="5" r="3"/><circle cx="12" cy="12" r="3"/><circle cx="19" cy="5" r="3"/><circle cx="5" cy="19" r="3"/>']
  ];
  var EYE_STYLES = [
    ['square', 'Rectas', '<path fill-rule="evenodd" d="M2 2h20v20H2zM5 5v14h14V5z"/><path d="M8.5 8.5h7v7h-7z"/>'],
    ['rounded', 'Redondeadas', '<path fill-rule="evenodd" d="M8 2h8a6 6 0 0 1 6 6v8a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6V8a6 6 0 0 1 6-6zm0 3a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3z"/><rect x="8.5" y="8.5" width="7" height="7" rx="2.2"/>'],
    ['circle', 'Circulares', '<path fill-rule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14z"/><circle cx="12" cy="12" r="3.8"/>']
  ];

  function buildSegmented(container, options, key) {
    container.innerHTML = '';
    options.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.value = o[0];
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + o[2] + '</svg><span>' + o[1] + '</span>';
      b.addEventListener('click', function () {
        state.design[key] = o[0];
        syncDesign();
        commitDesign();
      });
      container.appendChild(b);
    });
    radioKeys(container, function (b) { b.click(); });
  }

  /** Navegación con flechas dentro de un grupo de radio. */
  function radioKeys(container, activate) {
    container.addEventListener('keydown', function (e) {
      var keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!keys[e.key]) return;
      var items = Array.prototype.slice.call(container.querySelectorAll('[role="radio"]'));
      var i = items.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      var next = items[(i + keys[e.key] + items.length) % items.length];
      activate(next);
      next.focus();
    });
  }

  function buildPresets() {
    els.presets.innerHTML = '';
    PRESETS.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset';
      b.title = p.name;
      b.setAttribute('aria-label', 'Paleta ' + p.name);
      var ink = p.fg2 ? 'linear-gradient(135deg,' + p.fg + ',' + p.fg2 + ')' : p.fg;
      b.innerHTML = '<span class="preset-dot" style="background:' + p.bg + '"><i style="background:' + ink + '"></i></span><span>' + p.name + '</span>';
      b.addEventListener('click', function () {
        state.design.fg = p.fg;
        state.design.bg = p.bg;
        state.design.gradient = !!p.fg2;
        if (p.fg2) state.design.fg2 = p.fg2;
        state.design.transparent = false;
        syncDesign();
        commitDesign();
      });
      els.presets.appendChild(b);
    });
  }

  function syncDesign() {
    var d = state.design;
    els.fg.value = d.fg; els.fg2.value = d.fg2; els.bg.value = d.bg;
    els.gradient.checked = d.gradient;
    els.transparent.checked = d.transparent;
    els.fg2Wrap.hidden = !d.gradient;
    els.bgWrap.classList.toggle('is-off', d.transparent);
    els.bg.disabled = d.transparent;
    els.margin.value = d.margin; els.marginOut.textContent = d.margin;
    els.ecl.value = state.logo ? 'H' : d.ecl;
    els.ecl.disabled = !!state.logo;
    els.caption.value = d.caption;
    [[els.moduleStyle, d.moduleStyle], [els.eyeStyle, d.eyeStyle]].forEach(function (pair) {
      Array.prototype.forEach.call(pair[0].children, function (b) {
        var on = b.dataset.value === pair[1];
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
    });
    els.logoRemove.hidden = !state.logo;
    els.logoLabel.textContent = state.logo ? 'Cambiar imagen' : 'Subir imagen';
  }

  function commitDesign() {
    saveSettings();
    scheduleRender();
  }

  function loadLogo(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Ese archivo no es una imagen.'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        // Reduce la imagen para que el SVG final no pese de más
        var max = 512, w = img.naturalWidth || max, h = img.naturalHeight || max;
        var k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * k));
        c.height = Math.max(1, Math.round(h * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        var dataUrl;
        try { dataUrl = c.toDataURL('image/png'); } catch (e) { dataUrl = reader.result; }
        state.logo = { dataUrl: dataUrl };
        syncDesign();
        render();
        toast('Logo añadido');
      };
      img.onerror = function () { toast('No se pudo leer esa imagen. Prueba con un PNG o JPG.'); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* ------------------------------------------------------------------ *
   * Exportar
   * ------------------------------------------------------------------ */
  function fileBase() {
    var v = state.values[state.type] || {};
    var first = TYPE_BY_ID[state.type].fields[0].name;
    var slug = String(v[first] || '')
      .replace(/^https?:\/\//i, '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      .slice(0, 30).toLowerCase();
    return 'qr-' + state.type + (slug ? '-' + slug : '');
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('imagen')); };
      img.src = src;
    });
  }

  function svgString(px) {
    return buildSvg(current.qr, state.design, state.logo && state.logo.dataUrl, { embedLogo: true, px: px, uid: 'x' });
  }

  /** Rasteriza el código. El logo se pinta aparte para que funcione igual en todos los navegadores. */
  function pngBlob(px) {
    var d = state.design, qr = current.qr;
    var logoData = state.logo && state.logo.dataUrl;
    var g = geometry(qr, d, !!logoData);
    var svg = buildSvg(qr, d, logoData, { embedLogo: false, px: px, uid: 'r' });
    var url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    return loadImage(url).then(function (img) {
      URL.revokeObjectURL(url);
      var c = document.createElement('canvas');
      c.width = px;
      c.height = Math.round(px * g.H / g.W);
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      if (!logoData) return c;
      return loadImage(logoData).then(function (logo) {
        var u = px / g.W, L = g.logo;
        var box = (L.size - 1.5) * u, bx = (L.x + 0.75) * u, by = (L.y + 0.75) * u;
        var lw = logo.naturalWidth || 1, lh = logo.naturalHeight || 1;
        var k = Math.min(box / lw, box / lh);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(logo, bx + (box - lw * k) / 2, by + (box - lh * k) / 2, lw * k, lh * k);
        return c;
      });
    }).then(function (c) {
      return new Promise(function (resolve, reject) {
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('png')); }, 'image/png');
      });
    });
  }

  function onDownloadPng() {
    if (!current.qr) return;
    var px = parseInt(els.pngSize.value, 10) || 1024;
    pngBlob(px).then(function (blob) {
      download(blob, fileBase() + '.png');
      toast('PNG descargado');
      remember();
    }).catch(function () { toast('No se pudo crear el PNG. Prueba con un tamaño menor.'); });
  }

  function onDownloadSvg() {
    if (!current.qr) return;
    download(new Blob([svgString(1024)], { type: 'image/svg+xml' }), fileBase() + '.svg');
    toast('SVG descargado');
    remember();
  }

  function onCopy() {
    if (!current.qr) return;
    if (!navigator.clipboard || !window.ClipboardItem) {
      toast('Este navegador no permite copiar imágenes. Descarga el PNG.');
      return;
    }
    // Se pasa la promesa directamente: Safari exige crear el ClipboardItem dentro del clic
    var item = new ClipboardItem({ 'image/png': pngBlob(1024) });
    navigator.clipboard.write([item]).then(function () {
      toast('Imagen copiada');
      remember();
    }).catch(function () { toast('No se pudo copiar. Descarga el PNG.'); });
  }

  function onShare() {
    if (!current.qr) return;
    pngBlob(1024).then(function (blob) {
      var file = new File([blob], fileBase() + '.png', { type: 'image/png' });
      return navigator.share({ files: [file], title: 'Código QR' });
    }).then(remember).catch(function (e) {
      if (e && e.name !== 'AbortError') toast('No se pudo compartir. Descarga el PNG.');
    });
  }

  /* ------------------------------------------------------------------ *
   * Historial
   * ------------------------------------------------------------------ */
  var HISTORY_MAX = 12;

  function remember() {
    if (!current.payload) return;
    var list = store.get('qr-historial', []);
    var payload = current.payload;
    list = list.filter(function (e) { return e.payload !== payload; });
    list.unshift({
      type: state.type,
      values: Object.assign({}, state.values[state.type]),
      payload: payload,
      design: Object.assign({}, state.design),
      ts: Date.now()
    });
    store.set('qr-historial', list.slice(0, HISTORY_MAX));
    renderHistory();
  }

  function historyTitle(e) {
    var t = TYPE_BY_ID[e.type];
    var v = e.values || {};
    var first = t ? v[t.fields[0].name] : '';
    if (e.type === 'vcard') first = ((v.first || '') + ' ' + (v.last || '')).trim();
    if (e.type === 'geo') first = (v.lat || '') + ', ' + (v.lng || '');
    return String(first || e.payload).replace(/^https?:\/\//i, '');
  }

  function renderHistory() {
    var list = store.get('qr-historial', []).filter(function (e) { return TYPE_BY_ID[e.type]; });
    els.history.innerHTML = '';
    els.historyEmpty.hidden = list.length > 0;
    els.clearHistory.hidden = list.length === 0;
    list.forEach(function (e, i) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'history-item';
      var thumb = '';
      try {
        var d = Object.assign({}, DEFAULT_DESIGN, e.design, { caption: '', margin: 1 });
        thumb = buildSvg(QR.encode(e.payload, d.ecl), d, null, { uid: 'h' + i });
      } catch (err) {}
      var title = historyTitle(e);
      b.innerHTML = '<span class="thumb">' + thumb + '</span><span class="history-text"><strong></strong><small></small></span>';
      b.querySelector('strong').textContent = title;
      b.querySelector('small').textContent = TYPE_BY_ID[e.type].label;
      b.setAttribute('aria-label', 'Recuperar código de ' + TYPE_BY_ID[e.type].label + ': ' + title);
      b.addEventListener('click', function () {
        state.values[e.type] = Object.assign({}, e.values);
        state.design = Object.assign({}, DEFAULT_DESIGN, e.design);
        syncDesign();
        setType(e.type);
        toast('Código recuperado');
        window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      });
      li.appendChild(b);
      els.history.appendChild(li);
    });
  }

  /* ------------------------------------------------------------------ *
   * Avisos y tema
   * ------------------------------------------------------------------ */
  var toastTimer = 0;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove('show'); }, 2600);
  }

  function toggleTheme() {
    var rootEl = document.documentElement;
    var dark = rootEl.dataset.theme
      ? rootEl.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    var next = dark ? 'light' : 'dark';
    rootEl.dataset.theme = next;
    try { localStorage.setItem('qr-tema', next); } catch (e) {}
  }

  /* ------------------------------------------------------------------ *
   * Inicio
   * ------------------------------------------------------------------ */
  function init() {
    ['types', 'fields', 'presets', 'fg', 'fg2', 'bg', 'fg2Wrap', 'bgWrap', 'gradient', 'transparent', 'contrastMsg',
      'moduleStyle', 'eyeStyle', 'margin', 'marginOut', 'ecl', 'logoFile', 'logoLabel', 'logoRemove', 'caption',
      'resetDesign', 'history', 'historyEmpty', 'clearHistory', 'sticker', 'qr', 'placeholder', 'meta',
      'dlPng', 'pngSize', 'dlSvg', 'copyBtn', 'shareBtn', 'toast', 'themeBtn', 'year'
    ].forEach(function (id) { els[id] = $(id); });

    els.year.textContent = new Date().getFullYear();

    renderTypes();
    els.types.addEventListener('click', function (e) {
      var b = e.target.closest('[data-type]');
      if (b) setType(b.dataset.type);
    });
    radioKeys(els.types, function (b) { setType(b.dataset.type); });
    els.fields.addEventListener('submit', function (e) { e.preventDefault(); });

    buildPresets();
    buildSegmented(els.moduleStyle, MODULE_STYLES, 'moduleStyle');
    buildSegmented(els.eyeStyle, EYE_STYLES, 'eyeStyle');

    [['fg', 'fg'], ['fg2', 'fg2'], ['bg', 'bg']].forEach(function (p) {
      els[p[0]].addEventListener('input', function () { state.design[p[1]] = els[p[0]].value; commitDesign(); });
    });
    els.gradient.addEventListener('change', function () { state.design.gradient = els.gradient.checked; syncDesign(); commitDesign(); });
    els.transparent.addEventListener('change', function () { state.design.transparent = els.transparent.checked; syncDesign(); commitDesign(); });
    els.margin.addEventListener('input', function () {
      state.design.margin = parseInt(els.margin.value, 10);
      els.marginOut.textContent = els.margin.value;
      commitDesign();
    });
    els.ecl.addEventListener('change', function () { state.design.ecl = els.ecl.value; commitDesign(); });
    els.caption.addEventListener('input', function () { state.design.caption = els.caption.value; commitDesign(); });
    els.logoFile.addEventListener('change', function () { loadLogo(els.logoFile.files[0]); els.logoFile.value = ''; });
    els.logoRemove.addEventListener('click', function () { state.logo = null; syncDesign(); render(); toast('Logo quitado'); });
    els.resetDesign.addEventListener('click', function () {
      state.design = Object.assign({}, DEFAULT_DESIGN);
      state.logo = null;
      syncDesign();
      commitDesign();
      toast('Diseño restablecido');
    });

    els.dlPng.addEventListener('click', onDownloadPng);
    els.dlSvg.addEventListener('click', onDownloadSvg);
    els.copyBtn.addEventListener('click', onCopy);
    els.shareBtn.addEventListener('click', onShare);
    try {
      var probe = new File([''], 'qr.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [probe] })) els.shareBtn.hidden = false;
    } catch (e) {}

    els.clearHistory.addEventListener('click', function () {
      store.del('qr-historial');
      renderHistory();
      toast('Historial borrado');
    });
    els.themeBtn.addEventListener('click', toggleTheme);

    // Arrastrar una imagen sobre la vista previa la usa como logo
    els.sticker.addEventListener('dragover', function (e) { e.preventDefault(); });
    els.sticker.addEventListener('drop', function (e) {
      e.preventDefault();
      if (e.dataTransfer.files[0]) loadLogo(e.dataTransfer.files[0]);
    });

    syncDesign();
    renderFields();
    renderHistory();
    render();

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

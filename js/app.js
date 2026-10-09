'use strict';
/*
 * Interfaz del instructor: selección de ritmo, intervenciones, escenarios
 * y sincronización con la ventana de proyección.
 */
(function () {
  const { lista: RITMOS, porId, categorias } = window.Ritmos;
  const { crearPaso, PREDEFINIDOS, Reproductor, Almacen, validarPasos } = window.Escenarios;
  const $ = (id) => document.getElementById(id);

  const soloMonitor = new URLSearchParams(location.search).get('vista') === 'monitor';
  if (soloMonitor) document.body.classList.add('solo-monitor');

  const motor = new window.Motor();
  const monitor = new window.Monitor($('monitor'), motor);
  const Sonido = window.Sonido;

  const CAMPOS_SIGNOS = [
    ['spo2', 'SpO₂ %', 50, 100],
    ['tas', 'PAS mmHg', 30, 260],
    ['tad', 'PAD mmHg', 10, 160],
    ['fr', 'FR rpm', 0, 60],
    ['etco2', 'EtCO₂ mmHg', 0, 99],
  ];

  // Estado aplicado actualmente al monitor.
  let actual = { ritmo: 'rsn', fc: 75, signos: { ...porId('rsn').signos } };

  // ---------- Utilidades ----------
  const mmss = (s) => {
    s = Math.max(0, Math.floor(s));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  function llenarSelectRitmos(sel, idSel) {
    sel.innerHTML = '';
    for (const cat of categorias) {
      const og = document.createElement('optgroup');
      og.label = cat;
      for (const r of RITMOS.filter((x) => x.cat === cat)) {
        const o = new Option(r.nombre, r.id, false, r.id === idSel);
        og.append(o);
      }
      sel.append(og);
    }
  }

  // Crea los campos de signos vitales; devuelve una función que lee sus valores.
  function camposSignos(cont, ritmo, signos, alCambiar) {
    cont.innerHTML = '';
    const inputs = {};
    for (const [clave, etq, min, max] of CAMPOS_SIGNOS) {
      const lab = document.createElement('label');
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.min = min;
      inp.max = max;
      const sinPulso = !ritmo.pulso && ['spo2', 'tas', 'tad'].includes(clave);
      inp.disabled = sinPulso;
      inp.placeholder = sinPulso ? 'sin pulso' : '';
      inp.value = sinPulso || signos[clave] == null ? '' : signos[clave];
      if (alCambiar) inp.addEventListener('change', alCambiar);
      lab.append(etq, inp);
      cont.append(lab);
      inputs[clave] = inp;
    }
    return () => {
      const s = {};
      for (const [clave, , min, max] of CAMPOS_SIGNOS) {
        const i = inputs[clave];
        if (i.disabled || i.value === '') { s[clave] = i.disabled ? null : ritmo.signos[clave]; continue; }
        s[clave] = Math.min(max, Math.max(min, Math.round(Number(i.value))));
      }
      return s;
    };
  }

  // ---------- Aplicar un estado al monitor ----------
  function aplicar(estado) {
    const r = porId(estado.ritmo);
    actual = { ritmo: r.id, fc: r.fija || r.fc == null ? r.fc ?? null : estado.fc, signos: { ...estado.signos } };
    motor.ponerRitmo(r, actual.fc, actual.signos);
    monitor.actualizarNumeros(true);
    difundir();
  }

  // ---------- Panel «Ritmo» ----------
  const selRitmo = $('selRitmo');
  const rngFc = $('rngFc');
  const numFc = $('numFc');
  let leerSignos = () => ({});

  function mostrarFormulario(ritmoId, fc, signos) {
    const r = porId(ritmoId);
    selRitmo.value = r.id;
    const sinFc = r.fija || r.fc == null;
    rngFc.disabled = numFc.disabled = sinFc;
    if (r.rango) { rngFc.min = numFc.min = r.rango[0]; rngFc.max = numFc.max = r.rango[1]; }
    const valor = sinFc ? r.fc ?? '' : fc ?? r.fc;
    rngFc.value = numFc.value = valor;
    $('notaFc').textContent = r.fija ? '(fija por la conducción)' : r.fc == null ? '(no aplica)' : r.notaFc ? `(${r.notaFc})` : `(${r.rango[0]}–${r.rango[1]})`;
    leerSignos = camposSignos($('signosRitmo'), r, signos ?? r.signos);
    mostrarFicha(r);
  }

  function mostrarFicha(r) {
    const f = $('fichaRitmo');
    f.className = 'ficha' + (r.pulso ? '' : ' sin-pulso');
    f.innerHTML = '';
    const h = document.createElement('h3');
    h.textContent = r.nombre;
    const cat = document.createElement('div');
    cat.className = 'cat';
    cat.textContent = r.cat + (r.pulso ? '' : ' · sin pulso');
    const ul = document.createElement('ul');
    for (const c of r.claves) { const li = document.createElement('li'); li.textContent = c; ul.append(li); }
    f.append(h, cat, ul);
  }

  function leerFormulario() {
    const r = porId(selRitmo.value);
    let fc = Number(numFc.value) || r.fc;
    if (r.rango) fc = Math.min(r.rango[1], Math.max(r.rango[0], fc));
    return { ritmo: r.id, fc: r.fija || r.fc == null ? null : fc, signos: leerSignos() };
  }

  selRitmo.addEventListener('change', () => mostrarFormulario(selRitmo.value));
  rngFc.addEventListener('input', () => { numFc.value = rngFc.value; });
  numFc.addEventListener('change', () => { rngFc.value = numFc.value; });
  $('btnAplicar').addEventListener('click', () => aplicar(leerFormulario()));
  $('btnAgregar').addEventListener('click', () => {
    const e = leerFormulario();
    rep.pasos.push(crearPaso(e.ritmo, e.fc, 30, e.signos));
    dibujarPasos();
  });

  // ---------- Intervenciones y opciones de pantalla ----------
  function alternar(btn, valor) { btn.setAttribute('aria-pressed', String(valor)); }

  function ponerRcp(v) { motor.rcp = v; alternar($('btnRcp'), v); monitor.actualizarNumeros(true); difundir(); }
  function descarga() { motor.descarga(); difundir({ tipo: 'descarga' }); }
  function ponerOpcion(o) {
    monitor.ponerOpciones(o);
    alternar($('btnCongelar'), monitor.opc.congelado);
    alternar($('btnSilenciar'), monitor.opc.silenciarAlarmas);
    $('etqGanancia').textContent = `x${String(monitor.opc.ganancia).replace('.', ',')} · ${monitor.opc.ventana} s`;
    difundir();
  }

  $('btnRcp').addEventListener('click', () => ponerRcp(!motor.rcp));
  $('btnDescarga').addEventListener('click', descarga);
  $('btnCongelar').addEventListener('click', () => ponerOpcion({ congelado: !monitor.opc.congelado }));
  $('btnSilenciar').addEventListener('click', () => ponerOpcion({ silenciarAlarmas: !monitor.opc.silenciarAlarmas }));
  $('chkNombre').addEventListener('change', (e) => ponerOpcion({ mostrarNombre: e.target.checked }));
  $('chkCuadricula').addEventListener('change', (e) => ponerOpcion({ cuadricula: e.target.checked }));
  $('selVentana').addEventListener('change', (e) => ponerOpcion({ ventana: Number(e.target.value) }));
  $('selGanancia').addEventListener('change', (e) => ponerOpcion({ ganancia: Number(e.target.value) }));

  // ---------- Sonido ----------
  function actualizarBotonesSonido() {
    $('btnSonido').textContent = Sonido.activo ? '🔊 Sonido activado' : '🔇 Sonido apagado';
    $('btnSonidoMonitor').hidden = Sonido.activo;
  }
  function alternarSonido() {
    if (Sonido.activo) Sonido.desactivar(); else Sonido.activar();
    actualizarBotonesSonido();
  }
  $('btnSonido').addEventListener('click', alternarSonido);
  $('btnSonidoMonitor').addEventListener('click', alternarSonido);

  // ---------- Pantalla completa ----------
  function pantallaCompleta() {
    const el = $('monitor');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }
  $('btnCompleta').addEventListener('click', pantallaCompleta);
  $('monitor').addEventListener('dblclick', pantallaCompleta);

  // ---------- Escenario ----------
  const rep = new Reproductor((paso) => {
    aplicar(paso);
    mostrarFormulario(paso.ritmo, paso.fc, paso.signos);
  });

  function dibujarPasos() {
    const ol = $('listaPasos');
    ol.innerHTML = '';
    rep.pasos.forEach((p, i) => {
      const r = porId(p.ritmo);
      const li = document.createElement('li');
      li.className = 'paso' + (i === rep.indice && rep.estado !== 'detenido' ? ' activo' : '');

      const fila = document.createElement('div');
      fila.className = 'paso-fila';
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', `Ritmo del paso ${i + 1}`);
      llenarSelectRitmos(sel, p.ritmo);
      sel.addEventListener('change', () => { rep.pasos[i] = crearPaso(sel.value, null, p.dur); dibujarPasos(); });
      const btn = (txt, titulo, fn, deshab) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = txt; b.title = titulo; b.disabled = !!deshab;
        b.addEventListener('click', fn);
        return b;
      };
      const mover = (d) => () => {
        const [x] = rep.pasos.splice(i, 1);
        rep.pasos.splice(i + d, 0, x);
        if (rep.indice === i) rep.indice = i + d; else if (rep.indice === i + d) rep.indice = i;
        dibujarPasos();
      };
      fila.append(sel,
        btn('▶', 'Ir a este paso ahora', () => { if (rep.estado === 'detenido' || rep.estado === 'terminado') rep.estado = 'corriendo'; rep.ir(i); }),
        btn('↑', 'Subir', mover(-1), i === 0),
        btn('↓', 'Bajar', mover(1), i === rep.pasos.length - 1),
        btn('✕', 'Quitar', () => {
          rep.pasos.splice(i, 1);
          if (rep.indice >= rep.pasos.length) rep.detener();
          else if (i < rep.indice) rep.indice--;
          dibujarPasos();
        }));

      const det = document.createElement('div');
      det.className = 'paso-det';
      const num = (etq, valor, fn, opc = {}) => {
        const l = document.createElement('label');
        const inp = document.createElement('input');
        inp.type = 'number'; inp.value = valor ?? ''; inp.min = opc.min ?? 0;
        if (opc.max) inp.max = opc.max;
        inp.disabled = !!opc.deshab;
        inp.addEventListener('change', () => fn(inp));
        l.append(etq + ' ', inp, opc.sufijo ? ' ' + opc.sufijo : '');
        return l;
      };
      const sinFc = r.fija || r.fc == null;
      det.append(
        num('FC', sinFc ? r.fc : p.fc, (inp) => {
          const v = Math.min(r.rango[1], Math.max(r.rango[0], Number(inp.value) || r.fc));
          p.fc = v; inp.value = v;
        }, { deshab: sinFc, min: r.rango?.[0], max: r.rango?.[1] }),
        num('Duración', p.dur, (inp) => { p.dur = Math.max(0, Math.round(Number(inp.value) || 0)); inp.value = p.dur; dibujarProgreso(); }, { sufijo: 's' }),
      );
      const ayuda = document.createElement('span');
      ayuda.textContent = p.dur > 0 ? `(${mmss(p.dur)})` : '(espera «Siguiente»)';
      det.append(ayuda);

      const sig = document.createElement('details');
      const sum = document.createElement('summary');
      sum.textContent = 'Signos vitales del paso';
      const rej = document.createElement('div');
      rej.className = 'rejilla-signos';
      sig.append(sum, rej);
      const leer = camposSignos(rej, r, p.signos, () => { p.signos = leer(); });
      det.append(sig);

      li.append(fila, det);
      ol.append(li);
    });
    $('pasosVacio').hidden = rep.pasos.length > 0;
    dibujarProgreso();
  }

  function dibujarProgreso() {
    const p = rep.pasos[rep.indice];
    let txt = 'Detenido';
    let pct = 0;
    if (rep.estado === 'terminado') { txt = 'Escenario terminado (el último ritmo sigue en el monitor)'; pct = 100; }
    else if (p && rep.estado !== 'detenido') {
      const nombre = porId(p.ritmo).nombre;
      const pref = rep.estado === 'pausado' ? '⏸ ' : '';
      const tiempo = p.dur > 0 ? `${mmss(rep.transcurrido)} / ${mmss(p.dur)}` : `${mmss(rep.transcurrido)} · espera «Siguiente»`;
      txt = `${pref}Paso ${rep.indice + 1}/${rep.pasos.length} · ${nombre} · ${tiempo}`;
      pct = p.dur > 0 ? Math.min(100, (rep.transcurrido / p.dur) * 100) : 100;
    }
    $('txtProgreso').textContent = txt;
    $('barraProgreso').style.width = pct + '%';
    $('btnPlay').textContent = rep.estado === 'pausado' ? '▶ Reanudar' : rep.estado === 'corriendo' ? '↺ Reiniciar' : '▶ Iniciar';
  }

  let indiceDibujado = null;
  rep.alCambiar = () => {
    const clave = rep.estado + rep.indice;
    if (clave !== indiceDibujado) { indiceDibujado = clave; dibujarPasos(); } else dibujarProgreso();
  };

  $('btnPlay').addEventListener('click', () => {
    if (rep.estado === 'corriendo') { rep.detener(); }
    rep.iniciar();
  });
  $('btnPausa').addEventListener('click', () => rep.pausar());
  $('btnSig').addEventListener('click', () => rep.siguiente());
  $('btnAnt').addEventListener('click', () => rep.anterior());
  $('btnStop').addEventListener('click', () => rep.detener());
  $('chkRepetir').addEventListener('change', (e) => { rep.repetir = e.target.checked; });

  // Ejemplos
  const selPredef = $('selPredef');
  selPredef.append(new Option('— Escenarios de ejemplo —', ''));
  PREDEFINIDOS.forEach((e, i) => selPredef.append(new Option(e.nombre, String(i))));
  $('btnCargarPredef').addEventListener('click', () => {
    const e = PREDEFINIDOS[Number(selPredef.value)];
    if (!selPredef.value || !e) return;
    cargarPasos(e.pasos, e.nombre);
  });

  function cargarPasos(pasos, nombre) {
    rep.detener();
    rep.pasos = pasos.map((p) => ({ ...p, signos: { ...p.signos } }));
    if (nombre) $('txtNombreEsc').value = nombre;
    dibujarPasos();
  }

  // Mensajes en la propia página (algunos visores bloquean alert/confirm).
  let tAviso = null;
  function aviso(texto) {
    const el = $('avisoEsc');
    el.textContent = texto;
    el.hidden = false;
    clearTimeout(tAviso);
    tAviso = setTimeout(() => { el.hidden = true; }, 6000);
  }

  // Confirmación con un segundo clic sobre el mismo botón.
  function confirmarConClic(btn, accion) {
    if (btn.dataset.confirmar) {
      delete btn.dataset.confirmar;
      btn.textContent = btn.dataset.texto;
      accion();
      return;
    }
    btn.dataset.texto = btn.textContent;
    btn.dataset.confirmar = '1';
    btn.textContent = '¿Seguro? Pulsa otra vez';
    setTimeout(() => {
      if (btn.dataset.confirmar) { delete btn.dataset.confirmar; btn.textContent = btn.dataset.texto; }
    }, 3000);
  }

  // Guardar / abrir
  function dibujarGuardados() {
    const sel = $('selGuardados');
    sel.innerHTML = '';
    const nombres = Object.keys(Almacen.leer());
    sel.append(new Option(nombres.length ? '— Escenarios guardados —' : '(no hay escenarios guardados)', ''));
    nombres.forEach((n) => sel.append(new Option(n, n)));
  }
  $('btnGuardar').addEventListener('click', () => {
    const nombre = $('txtNombreEsc').value.trim();
    if (!nombre) { $('txtNombreEsc').focus(); return; }
    if (!rep.pasos.length) { aviso('El escenario no tiene pasos.'); return; }
    if (!Almacen.guardar(nombre, rep.pasos)) { aviso('No se pudo guardar en este navegador. Usa «Exportar».'); return; }
    dibujarGuardados();
    $('selGuardados').value = nombre;
    aviso(`Escenario «${nombre}» guardado en este navegador.`);
  });
  $('btnAbrir').addEventListener('click', () => {
    const n = $('selGuardados').value;
    const pasos = Almacen.leer()[n];
    if (!n || !pasos) return;
    try { cargarPasos(validarPasos(pasos), n); } catch (err) { aviso(err.message); }
  });
  $('btnBorrarGuardado').addEventListener('click', (e) => {
    const n = $('selGuardados').value;
    if (n) confirmarConClic(e.currentTarget, () => { Almacen.borrar(n); dibujarGuardados(); aviso(`Escenario «${n}» borrado.`); });
  });
  $('btnVaciar').addEventListener('click', (e) => {
    if (rep.pasos.length) confirmarConClic(e.currentTarget, () => cargarPasos([]));
  });
  $('btnExportar').addEventListener('click', () => {
    if (!rep.pasos.length) { aviso('El escenario no tiene pasos.'); return; }
    const nombre = $('txtNombreEsc').value.trim() || 'escenario';
    const json = JSON.stringify({ nombre, pasos: rep.pasos }, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = nombre.replace(/[^\p{L}\p{N}_-]+/gu, '_') + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    // Si el navegador bloquea la descarga, el texto queda disponible para copiarlo.
    $('txtJson').value = json;
    $('cajaJson').hidden = false;
  });
  $('btnCopiarJson').addEventListener('click', () => {
    const t = $('txtJson');
    const seleccionar = () => { t.focus(); t.select(); aviso('Texto seleccionado: cópialo con Ctrl+C.'); };
    if (navigator.clipboard) navigator.clipboard.writeText(t.value).then(() => aviso('Escenario copiado al portapapeles.'), seleccionar);
    else seleccionar();
  });
  $('btnPegarJson').addEventListener('click', () => {
    try {
      const datos = JSON.parse($('txtJson').value);
      cargarPasos(validarPasos(Array.isArray(datos) ? datos : datos.pasos), datos.nombre);
      aviso('Escenario cargado.');
    } catch (err) {
      aviso('No se pudo cargar el texto: ' + err.message);
    }
  });
  $('btnMostrarJson').addEventListener('click', () => { $('cajaJson').hidden = !$('cajaJson').hidden; });
  $('fileImportar').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const datos = JSON.parse(await f.text());
      cargarPasos(validarPasos(Array.isArray(datos) ? datos : datos.pasos), datos.nombre);
    } catch (err) {
      aviso('No se pudo importar: ' + err.message);
    }
  });

  // ---------- Ventana de proyección ----------
  let ventanaMonitor = null;

  function estadoCompleto() {
    return { tipo: 'estado', actual, rcp: motor.rcp, opc: { ...monitor.opc } };
  }

  function difundir(msg) {
    if (soloMonitor || !ventanaMonitor || ventanaMonitor.closed) return;
    ventanaMonitor.postMessage(msg || estadoCompleto(), '*');
  }

  $('btnVentana').addEventListener('click', () => {
    if (ventanaMonitor && !ventanaMonitor.closed) { ventanaMonitor.focus(); return; }
    const url = new URL(location.href);
    url.search = '?vista=monitor';
    url.hash = '';
    ventanaMonitor = window.open(url.href, 'monitorArritmias', 'width=1200,height=720');
    if (!ventanaMonitor) {
      $('btnVentana').hidden = true;
      $('btnCompleta').textContent = '⛶ Pantalla completa (para proyectar)';
    }
  });

  window.addEventListener('message', (e) => {
    const d = e.data || {};
    if (!soloMonitor) {
      if (e.source === ventanaMonitor && d.tipo === 'listo') difundir();
      return;
    }
    if (e.source !== window.opener) return;
    if (d.tipo === 'descarga') motor.descarga();
    if (d.tipo === 'estado') {
      const a = d.actual;
      if (a.ritmo !== actual.ritmo || a.fc !== actual.fc) {
        actual = a;
        motor.ponerRitmo(porId(a.ritmo), a.fc, a.signos);
      } else {
        actual = a;
        motor.actualizarSignos(a.signos);
      }
      motor.rcp = d.rcp;
      monitor.ponerOpciones(d.opc);
    }
  });

  // ---------- Teclado ----------
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'f') pantallaCompleta();
    else if (k === 's') alternarSonido();
    else if (soloMonitor) return;
    else if (k === 'n') rep.siguiente();
    else if (k === 'c') ponerRcp(!motor.rcp);
    else if (k === 'd') descarga();
    else if (k === 'a') ponerOpcion({ silenciarAlarmas: !monitor.opc.silenciarAlarmas });
    else if (k === ' ') { e.preventDefault(); ponerOpcion({ congelado: !monitor.opc.congelado }); }
    else return;
    if (e.target.tagName === 'BUTTON') e.target.blur();
  });

  // ---------- Inicio ----------
  llenarSelectRitmos(selRitmo, actual.ritmo);
  mostrarFormulario(actual.ritmo, actual.fc, actual.signos);
  motor.ponerRitmo(porId(actual.ritmo), actual.fc, actual.signos);
  dibujarPasos();
  dibujarGuardados();
  ponerOpcion({});
  actualizarBotonesSonido();
  if (soloMonitor && window.opener) window.opener.postMessage({ tipo: 'listo' }, '*');

  // Funcionamiento sin conexión cuando se sirve desde un sitio web (no aplica a file://).
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  let ultimo = performance.now();
  let tProgreso = 0;
  function cuadro(ahora) {
    const dt = Math.min(0.1, Math.max(0, (ahora - ultimo) / 1000));
    ultimo = ahora;
    motor.avanzar(dt);
    rep.tick(dt);
    monitor.cuadro();
    tProgreso += dt;
    if (tProgreso > 0.25) { tProgreso = 0; if (rep.estado === 'corriendo') dibujarProgreso(); }
    requestAnimationFrame(cuadro);
  }
  requestAnimationFrame(cuadro);
})();

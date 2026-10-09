'use strict';
/*
 * Pantalla del monitor: trazos con barrido (borrado por delante del cursor),
 * valores numéricos, alarmas y sonido.
 */
(function (global) {
  const SUBMUESTRAS = 4;
  const HUECO = 14; // px CSS borrados por delante del cursor

  // ---------- Trazo ----------
  class Trazo {
    constructor(contenedor, canal, color, aY, conCuadricula) {
      this.canal = canal;
      this.color = color;
      this.aY = aY; // (valor, alto, opciones) -> y
      this.conCuadricula = conCuadricula;
      this.fondo = document.createElement('canvas');
      this.lienzo = document.createElement('canvas');
      this.fondo.className = 'trazo-fondo';
      this.lienzo.className = 'trazo-lienzo';
      contenedor.append(this.fondo, this.lienzo);
      this.contenedor = contenedor;
      this.ctx = this.lienzo.getContext('2d');
      this.tCursor = null;
    }

    redimensionar(opc) {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(this.contenedor.clientWidth * dpr));
      const h = Math.max(1, Math.round(this.contenedor.clientHeight * dpr));
      for (const c of [this.fondo, this.lienzo]) { c.width = w; c.height = h; }
      this.w = w; this.h = h; this.dpr = dpr;
      this.x = 0; this.prevY = null; this.tCursor = null;
      this.dibujarCuadricula(opc);
    }

    dibujarCuadricula(opc) {
      const ctx = this.fondo.getContext('2d');
      ctx.clearRect(0, 0, this.w, this.h);
      if (!this.conCuadricula || !opc.cuadricula) return;
      // 1 mm = 0,04 s a 25 mm/s; líneas gruesas cada 5 mm (0,2 s).
      const mm = (this.w / opc.ventana) * 0.04;
      if (mm < 3) return;
      for (let i = 0, x = 0; x < this.w; i++, x = i * mm) {
        ctx.fillStyle = i % 5 === 0 ? 'rgba(80,255,140,0.16)' : 'rgba(80,255,140,0.06)';
        ctx.fillRect(Math.round(x), 0, 1, this.h);
      }
      for (let i = 0, y = this.h; y > 0; i++, y = this.h - i * mm) {
        ctx.fillStyle = i % 5 === 0 ? 'rgba(80,255,140,0.16)' : 'rgba(80,255,140,0.06)';
        ctx.fillRect(0, Math.round(y), this.w, 1);
      }
    }

    borrarAdelante(x) {
      const hueco = Math.round(HUECO * this.dpr);
      this.ctx.clearRect(x + 1, 0, hueco, this.h);
      const sobra = x + 1 + hueco - this.w;
      if (sobra > 0) this.ctx.clearRect(0, 0, sobra, this.h);
    }

    dibujar(motor, opc) {
      const tAhora = motor.t;
      const dtCol = opc.ventana / this.w;
      if (this.tCursor === null || tAhora - this.tCursor > 2) this.tCursor = tAhora;
      const ctx = this.ctx;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2 * this.dpr;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      while (this.tCursor + dtCol <= tAhora) {
        let mn = Infinity, mx = -Infinity, primero = 0, ultimo = 0;
        for (let i = 0; i < SUBMUESTRAS; i++) {
          const y = this.aY(motor.valor(this.canal, this.tCursor + (dtCol * i) / SUBMUESTRAS), this.h, opc);
          if (i === 0) primero = y;
          ultimo = y;
          if (y < mn) mn = y;
          if (y > mx) mx = y;
        }
        this.borrarAdelante(this.x);
        if (this.prevY !== null && this.x > 0) {
          ctx.moveTo(this.x - 1, this.prevY);
          ctx.lineTo(this.x, primero);
        }
        ctx.moveTo(this.x, mn);
        ctx.lineTo(this.x, mx);
        this.prevY = ultimo;
        this.tCursor += dtCol;
        this.x += 1;
        if (this.x >= this.w) this.x = 0;
      }
      ctx.stroke();
    }

    saltar(motor) {
      this.tCursor = motor.t;
    }
  }

  const recortar = (y, h) => Math.max(2, Math.min(h - 2, y));

  // ---------- Sonido ----------
  const Sonido = {
    ctx: null,
    activo: false,
    activar() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.activo = true;
      return true;
    },
    desactivar() { this.activo = false; },
    tono(freq, dur, vol = 0.12, tipo = 'sine', retraso = 0) {
      if (!this.activo || !this.ctx) return;
      const t0 = this.ctx.currentTime + retraso;
      const osc = this.ctx.createOscillator();
      const gan = this.ctx.createGain();
      osc.type = tipo;
      osc.frequency.value = freq;
      gan.gain.setValueAtTime(0, t0);
      gan.gain.linearRampToValueAtTime(vol, t0 + 0.005);
      gan.gain.setValueAtTime(vol, t0 + dur - 0.02);
      gan.gain.linearRampToValueAtTime(0, t0 + dur);
      osc.connect(gan).connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.01);
    },
  };

  // ---------- Monitor ----------
  class Monitor {
    constructor(raiz, motor) {
      this.raiz = raiz;
      this.motor = motor;
      this.opc = { ventana: 6, ganancia: 1, cuadricula: false, mostrarNombre: false, congelado: false, silenciarAlarmas: false };
      const $ = (sel) => raiz.querySelector(sel);
      this.el = {
        fc: $('[data-v="fc"]'), spo2: $('[data-v="spo2"]'), pa: $('[data-v="pa"]'), pam: $('[data-v="pam"]'),
        etco2: $('[data-v="etco2"]'), fr: $('[data-v="fr"]'), corazon: $('[data-v="corazon"]'),
        alarma: $('[data-v="alarma"]'), nombre: $('[data-v="nombre"]'), reloj: $('[data-v="reloj"]'),
        estado: $('[data-v="estado"]'),
      };
      this.trazos = [
        new Trazo($('[data-trazo="ecg"]'), 'ecg', '#3dff7a',
          (v, h, o) => recortar(h * 0.55 - v * o.ganancia * h * 0.28, h), true),
        new Trazo($('[data-trazo="pleth"]'), 'pleth', '#38d9ff',
          (v, h) => recortar(h * 0.85 - v * h * 0.55, h), false),
        new Trazo($('[data-trazo="co2"]'), 'co2', '#ffd43b',
          (v, h) => recortar(h * 0.9 - (v / 50) * h * 0.8, h), false),
      ];
      this.tAlarma = 0;
      this.tNumeros = 0;

      motor.alLatido = () => this.latido();
      new ResizeObserver(() => this.redimensionar()).observe(raiz);
      this.redimensionar();
    }

    redimensionar() {
      this.trazos.forEach((t) => t.redimensionar(this.opc));
    }

    ponerOpciones(opc) {
      const antes = { ...this.opc };
      Object.assign(this.opc, opc);
      if (antes.ventana !== this.opc.ventana || antes.cuadricula !== this.opc.cuadricula) this.redimensionar();
      if (antes.congelado && !this.opc.congelado) this.trazos.forEach((t) => t.saltar(this.motor));
      this.raiz.classList.toggle('congelado', this.opc.congelado);
      this.actualizarNumeros(true);
    }

    latido() {
      const c = this.el.corazon;
      c.classList.remove('late');
      void c.offsetWidth;
      c.classList.add('late');
      const s = this.motor.signos.spo2;
      // Tono del pulsioxímetro: más grave cuanto menor es la SpO2.
      const freq = this.motor.ritmo.pulso && s ? 380 + Math.max(0, s - 80) * 22 : 660;
      Sonido.tono(freq, 0.07, 0.1);
    }

    alarmaActual() {
      const m = this.motor;
      const r = m.ritmo;
      if (!r) return null;
      if (r.alarma) return { texto: r.alarma, nivel: 'alta' };
      const fc = m.fcMedida();
      if (typeof fc === 'number' && fc > 0) {
        if (fc < 40) return { texto: 'FC BAJA', nivel: 'alta' };
        if (fc > 150) return { texto: 'FC ALTA', nivel: 'alta' };
        if (fc < 50) return { texto: 'FC BAJA', nivel: 'media' };
        if (fc > 120) return { texto: 'FC ALTA', nivel: 'media' };
      }
      if (m.signos.spo2 && m.signos.spo2 < 90) return { texto: 'SpO2 BAJA', nivel: 'media' };
      if (m.signos.tas && m.signos.tas < 90) return { texto: 'PA BAJA', nivel: 'media' };
      return null;
    }

    actualizarNumeros(forzar) {
      const m = this.motor;
      if (!forzar && m.t - this.tNumeros < 0.5) return;
      this.tNumeros = m.t;
      const r = m.ritmo;
      if (!r) return;
      const fc = m.fcMedida();
      // Mientras se miden los primeros latidos del nuevo ritmo se mantiene el valor anterior.
      if (fc != null) this.el.fc.textContent = fc;
      else if (!this.el.fc.textContent) this.el.fc.textContent = '--';
      const conPulso = r.pulso;
      const s = m.signos;
      this.el.spo2.textContent = conPulso && s.spo2 ? s.spo2 : '--';
      if (conPulso && s.tas) {
        this.el.pa.textContent = `${s.tas}/${s.tad}`;
        this.el.pam.textContent = `(${Math.round((s.tas + 2 * s.tad) / 3)})`;
      } else {
        this.el.pa.textContent = '--/--';
        this.el.pam.textContent = '';
      }
      this.el.etco2.textContent = s.fr ? Math.round(m.etco2Efectivo()) : '--';
      this.el.fr.textContent = s.fr || '--';
      this.el.nombre.textContent = this.opc.mostrarNombre ? r.nombre + (m.rcp ? ' · RCP' : '') : '';

      const al = this.alarmaActual();
      this.el.alarma.textContent = al ? al.texto : '';
      this.el.alarma.className = 'alarma' + (al ? ' ' + al.nivel : '');
      this.raiz.classList.toggle('en-alarma', !!(al && al.nivel === 'alta'));
      this.el.estado.textContent = this.opc.silenciarAlarmas ? '🔕 Alarmas silenciadas' : '';
      this.alarma = al;
    }

    sonarAlarma() {
      const al = this.alarma;
      if (!al || this.opc.silenciarAlarmas) return;
      const periodo = al.nivel === 'alta' ? 2 : 4;
      if (this.motor.t - this.tAlarma < periodo) return;
      this.tAlarma = this.motor.t;
      if (al.nivel === 'alta') {
        [0, 0.18, 0.36].forEach((d) => Sonido.tono(988, 0.13, 0.09, 'triangle', d));
      } else {
        [0, 0.25].forEach((d) => Sonido.tono(740, 0.18, 0.07, 'triangle', d));
      }
    }

    cuadro() {
      if (!this.opc.congelado) this.trazos.forEach((t) => t.dibujar(this.motor, this.opc));
      this.actualizarNumeros(false);
      this.sonarAlarma();
      const d = new Date();
      this.el.reloj.textContent = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    }
  }

  global.Monitor = Monitor;
  global.Sonido = Sonido;
})(window);

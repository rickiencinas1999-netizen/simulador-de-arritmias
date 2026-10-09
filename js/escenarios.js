'use strict';
/*
 * Escenarios: secuencias programadas de ritmos.
 * Cada paso: { ritmo, fc, dur (s; 0 = espera a «Siguiente»), signos }.
 */
(function (global) {
  const { porId } = global.Ritmos;

  function crearPaso(ritmoId, fc, dur, signos) {
    const r = porId(ritmoId);
    return {
      ritmo: r.id,
      fc: r.fija || r.fc == null ? null : fc ?? r.fc,
      dur: dur ?? 30,
      signos: { ...r.signos, ...signos },
    };
  }

  const P = crearPaso;
  const PREDEFINIDOS = [
    {
      nombre: 'Paro cardiaco: ritmo desfibrilable',
      pasos: [P('rsn', 80, 20), P('tv', 170, 20), P('tvsp', 180, 0), P('fvg', null, 0), P('fvf', null, 0),
        P('taqui', 110, 0, { spo2: 94, tas: 100, tad: 60, fr: 12, etco2: 40 })],
    },
    {
      nombre: 'Paro cardiaco: ritmo no desfibrilable',
      pasos: [P('bradi', 40, 20, { spo2: 90, tas: 80, tad: 45 }), P('idiov', 25, 15), P('aesp', 40, 0), P('asistolia', null, 0),
        P('rsn', 85, 0, { spo2: 94, tas: 105, tad: 65, fr: 12, etco2: 42 })],
    },
    {
      nombre: 'Bradiarritmias y bloqueos AV',
      pasos: [P('rsn', 72, 30), P('bradi', 48, 30), P('bav1', 65, 30), P('mobitz1', 80, 30), P('mobitz2', 75, 30), P('bav3', 35, 30), P('mp', 70, 30)],
    },
    {
      nombre: 'Taquiarritmias',
      pasos: [P('rsn', 80, 30), P('taqui', 125, 30), P('fa', 120, 30), P('flutter21', null, 30), P('tsv', 190, 30), P('tv', 170, 30)],
    },
    {
      nombre: 'Extrasístoles ventriculares',
      pasos: [P('rsn', 75, 25), P('esv', 75, 30), P('bigeminismo', 75, 30), P('trigeminismo', 75, 30), P('tv', 160, 20)],
    },
    {
      nombre: 'Problemas de marcapasos',
      pasos: [P('mp', 70, 30), P('mpfallo', 70, 30), P('bav3', 30, 0)],
    },
  ];

  class Reproductor {
    constructor(aplicarPaso) {
      this.aplicarPaso = aplicarPaso;
      this.pasos = [];
      this.indice = -1;
      this.transcurrido = 0;
      this.estado = 'detenido'; // detenido | corriendo | pausado | terminado
      this.repetir = false;
      this.alCambiar = null;
    }

    avisar() { if (this.alCambiar) this.alCambiar(); }

    iniciar() {
      if (!this.pasos.length) return;
      if (this.estado === 'pausado') { this.estado = 'corriendo'; this.avisar(); return; }
      this.ir(0);
      this.estado = 'corriendo';
      this.avisar();
    }

    pausar() {
      if (this.estado === 'corriendo') this.estado = 'pausado';
      this.avisar();
    }

    detener() {
      this.estado = 'detenido';
      this.indice = -1;
      this.transcurrido = 0;
      this.avisar();
    }

    ir(i) {
      this.indice = i;
      this.transcurrido = 0;
      this.aplicarPaso(this.pasos[i]);
      this.avisar();
    }

    siguiente() {
      if (!this.pasos.length) return;
      if (this.estado === 'detenido' || this.estado === 'terminado') { this.estado = 'corriendo'; this.ir(0); return; }
      const sig = this.indice + 1;
      if (sig < this.pasos.length) this.ir(sig);
      else if (this.repetir) this.ir(0);
      else { this.estado = 'terminado'; this.avisar(); }
    }

    anterior() {
      if (this.indice > 0) this.ir(this.indice - 1);
    }

    tick(dt) {
      if (this.estado !== 'corriendo') return;
      const p = this.pasos[this.indice];
      if (!p) { this.detener(); return; }
      this.transcurrido += dt;
      if (p.dur > 0 && this.transcurrido >= p.dur) this.siguiente();
    }
  }

  // ---------- Almacenamiento local ----------
  const CLAVE = 'simArritmias.escenarios';
  const Almacen = {
    leer() {
      try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch { return {}; }
    },
    guardar(nombre, pasos) {
      const todos = this.leer();
      todos[nombre] = pasos;
      try { localStorage.setItem(CLAVE, JSON.stringify(todos)); return true; } catch { return false; }
    },
    borrar(nombre) {
      const todos = this.leer();
      delete todos[nombre];
      try { localStorage.setItem(CLAVE, JSON.stringify(todos)); } catch { /* sin almacenamiento */ }
    },
  };

  // Valida pasos importados de un archivo.
  function validarPasos(pasos) {
    if (!Array.isArray(pasos)) throw new Error('El archivo no contiene una lista de pasos.');
    return pasos.map((p, i) => {
      if (!p || !porId(p.ritmo)) throw new Error(`Paso ${i + 1}: ritmo desconocido.`);
      return crearPaso(p.ritmo, Number(p.fc) || null, Math.max(0, Number(p.dur) || 0), p.signos || {});
    });
  }

  global.Escenarios = { crearPaso, PREDEFINIDOS, Reproductor, Almacen, validarPasos };
})(window);

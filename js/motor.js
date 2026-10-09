'use strict';
/*
 * Motor de simulación: lleva el reloj, programa los latidos del ritmo activo
 * y devuelve el valor de cada canal (ecg, pleth, co2) en cualquier instante.
 */
(function (global) {
  const TAU = Math.PI * 2;
  const { g } = global.Ritmos;
  const ANTICIPACION = 0.3; // s que se programan por delante del reloj
  const PERIODO_RCP = 60 / 110; // compresiones a 110/min

  class Motor {
    constructor() {
      this.t = 0;
      this.comps = [];
      this.eventos = [];
      this.qrs = [];
      this.ritmo = null;
      this.gen = null;
      this.fc = null;
      this.signos = {};
      this.rcp = false;
      this.tDescarga = -100;
      this.ultimoQRS = -100;
      this.tCambio = 0;
      this.alLatido = null;
    }

    // --- API usada por los ritmos ---
    emitir(canal, t0, dur, f) {
      this.comps.push({ canal, t0, t1: t0 + dur, f });
    }

    latido(t, opc = {}) {
      this.eventos.push({ t, opc });
      this.ultimoQRS = Math.max(this.ultimoQRS, t);
      if (this.ritmo.pulso && opc.pulso !== false) {
        const a = opc.ampPulso ?? 1;
        this.emitir('pleth', t + 0.2, 0.75, (d) => a * (g(d, 0.12, 0.05, 1) + g(d, 0.33, 0.07, 0.32)));
      }
    }

    // --- Control ---
    ponerRitmo(ritmo, fc, signos) {
      // Descarta lo programado a futuro del ritmo anterior.
      this.comps = this.comps.filter((c) => c.t0 <= this.t);
      this.eventos = this.eventos.filter((e) => e.t <= this.t);
      this.ultimoQRS = this.qrs.length ? this.qrs[this.qrs.length - 1] : -100;

      this.tCambio = this.t;
      this.ritmo = ritmo;
      this.fc = ritmo.fija ? ritmo.fc : fc ?? ritmo.fc;
      this.signos = { ...ritmo.signos, ...signos };
      const inicio = Math.max(this.t + 0.05, this.ultimoQRS + 0.3);
      this.gen = ritmo.gen ? ritmo.gen(this.fc, inicio) : null;
    }

    actualizarSignos(signos) {
      this.signos = { ...this.signos, ...signos };
    }

    descarga() {
      this.tDescarga = this.t;
    }

    avanzar(dt) {
      this.t += dt;
      if (this.gen) this.gen.llenar(this, this.t + ANTICIPACION);

      const pendientes = [];
      for (const e of this.eventos) {
        if (e.t <= this.t) {
          this.qrs.push(e.t);
          if (this.alLatido) this.alLatido(e);
        } else {
          pendientes.push(e);
        }
      }
      this.eventos = pendientes;

      const limite = this.t - 1;
      this.comps = this.comps.filter((c) => c.t1 >= limite);
      while (this.qrs.length && this.qrs[0] < this.t - 12) this.qrs.shift();
    }

    // --- Lectura de canales ---
    suma(canal, t) {
      let v = 0;
      for (const c of this.comps) {
        if (c.canal === canal && t >= c.t0 && t < c.t1) v += c.f(t - c.t0);
      }
      return v;
    }

    ecg(t) {
      let v = this.suma('ecg', t) + 0.03 * Math.sin(TAU * 0.21 * t);
      if (this.ritmo && this.ritmo.base) v += this.ritmo.base(t);
      if (this.rcp) {
        const d = t % PERIODO_RCP;
        v += g(d, 0.12, 0.06, 1.0) - g(d, 0.3, 0.08, 0.35);
      }
      const dd = t - this.tDescarga;
      if (dd >= 0 && dd < 2.5) v += dd < 0.04 ? 6 : -2.5 * Math.exp(-(dd - 0.04) / 0.35);
      return v;
    }

    pleth(t) {
      let v = this.suma('pleth', t) + 0.01 * Math.sin(TAU * 0.25 * t);
      if (this.rcp) v += g(t % PERIODO_RCP, 0.2, 0.07, 0.55);
      return v;
    }

    etco2Efectivo() {
      const e = this.signos.etco2 ?? 0;
      if (this.ritmo && !this.ritmo.pulso && !this.rcp) return Math.min(e, 4);
      return e;
    }

    co2(t) {
      const fr = this.signos.fr;
      if (!fr) return 0;
      const per = 60 / fr;
      const p = (t % per) / per;
      const e = this.etco2Efectivo();
      const suave = (x) => x * x * (3 - 2 * x);
      if (p < 0.4) return 0;
      if (p < 0.48) return e * 0.9 * suave((p - 0.4) / 0.08);
      if (p < 0.9) return e * (0.9 + 0.1 * ((p - 0.48) / 0.42));
      if (p < 0.96) return e * (1 - suave((p - 0.9) / 0.06));
      return 0;
    }

    valor(canal, t) {
      if (canal === 'ecg') return this.ecg(t);
      if (canal === 'pleth') return this.pleth(t);
      return this.co2(t);
    }

    // FC que mostraría el monitor, a partir de los últimos intervalos RR.
    fcMedida() {
      if (!this.ritmo) return null;
      if (this.ritmo.fcPantalla != null) return this.ritmo.fcPantalla;
      // Solo cuentan los latidos del ritmo actual (null mientras no haya dos).
      const q = this.qrs.filter((x) => x >= this.tCambio);
      if (this.t - Math.max(this.tCambio, q[q.length - 1] ?? -Infinity) > 5) return 0;
      if (q.length < 2) return null;
      const n = Math.min(5, q.length - 1);
      const media = (q[q.length - 1] - q[q.length - 1 - n]) / n;
      return Math.round(60 / media);
    }
  }

  global.Motor = Motor;
})(window);

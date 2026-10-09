'use strict';
/*
 * Biblioteca de ritmos cardiacos.
 * Tiempos en segundos y amplitudes en mV (derivación II aproximada).
 * Cada ritmo define:
 *   gen(fc, inicio)  -> generador con llenar(motor, hasta) que programa latidos
 *   base(t)          -> (opcional) actividad continua: ondas f, F, FV, torsades...
 * Las morfologías son aproximaciones didácticas, no registros reales.
 */
(function (global) {
  const TAU = Math.PI * 2;
  const g = (t, mu, s, a) => a * Math.exp(-((t - mu) * (t - mu)) / (2 * s * s));
  const azar = (min, max) => min + Math.random() * (max - min);

  // ---------- Componentes de onda ----------

  function ondaP(m, t, amp = 0.15) {
    m.emitir('ecg', t, 0.12, (d) => g(d, 0.05, 0.02, amp));
  }

  // La posición de la T se acorta con la frecuencia (QT dependiente del RR).
  const tiempoT = (rr) => 0.1 + 0.22 * Math.sqrt(Math.min(rr, 2));
  const anchoT = (rr) => 0.045 * Math.sqrt(Math.min(rr, 2)) + 0.012;

  // QRS supraventricular. opc.ancho > 1 ensancha el complejo.
  function qrsEstrecho(m, t, rr, opc = {}) {
    const k = opc.ancho || 1;
    const tT = tiempoT(rr) + (k - 1) * 0.04;
    const sT = anchoT(rr);
    const ampR = opc.ampR ?? 1.1;
    const ampT = opc.ampT ?? 0.28;
    m.emitir('ecg', t, tT + 4 * sT, (d) =>
      g(d, 0.012 * k, 0.007 * k, -0.08) +
      g(d, 0.035 * k, 0.010 * k, ampR) +
      g(d, 0.060 * k, 0.010 * k, -0.25) +
      g(d, tT, sT, ampT));
    m.latido(t + 0.035 * k, opc);
  }

  // QRS de origen ventricular: ancho, con T discordante. opc.signo = -1 lo invierte.
  function qrsAncho(m, t, rr, opc = {}) {
    const s = opc.signo ?? 1;
    const ampR = opc.ampR ?? 1.3;
    const tT = tiempoT(rr) + 0.06;
    const sT = 0.05 * Math.sqrt(Math.min(rr, 2)) + 0.02;
    m.emitir('ecg', t, tT + 4 * sT, (d) =>
      s * (g(d, 0.05, 0.028, ampR) - g(d, 0.12, 0.03, 0.35)) + g(d, tT, sT, -s * 0.45));
    m.latido(t + 0.05, opc);
  }

  function espigaMarcapasos(m, t) {
    m.emitir('ecg', t, 0.004, () => 1.6);
  }

  // ---------- Generadores ----------

  // paso(m, t, k, fc) programa un ciclo que empieza en t y devuelve su duración.
  function secuencia(paso) {
    return (fc, inicio) => {
      let t = inicio;
      let k = 0;
      return {
        llenar(m, hasta) {
          while (t < hasta) t += paso(m, t, k++, fc);
        },
      };
    };
  }

  // Varias secuencias independientes (p. ej. aurículas y ventrículos disociados).
  function combinar(...gens) {
    return (fc, inicio) => {
      const gs = gens.map((f) => f(fc, inicio));
      return { llenar: (m, hasta) => gs.forEach((x) => x.llenar(m, hasta)) };
    };
  }

  const rrDe = (fc, variab = 0.02) => (60 / fc) * azar(1 - variab, 1 + variab);

  // Latido sinusal conducido: P y QRS tras el PR indicado.
  function latidoSinusal(m, t, rr, pr = 0.16, opc) {
    ondaP(m, t);
    qrsEstrecho(m, t + pr, rr, opc);
  }

  // ---------- Actividad continua (línea de base) ----------

  const baseFA = (t) =>
    0.05 * Math.sin(TAU * 6.1 * t) + 0.035 * Math.sin(TAU * 7.3 * t + 1) + 0.03 * Math.sin(TAU * 4.7 * t + 2);

  // Ondas F en dientes de sierra a 300/min (periodo 0,2 s), negativas en II.
  const PERIODO_F = 0.2;
  function baseFlutter(t) {
    const p = (((t % PERIODO_F) + PERIODO_F) % PERIODO_F) / PERIODO_F;
    return p < 0.8 ? 0.15 - 0.45 * (p / 0.8) : -0.3 + 0.45 * ((p - 0.8) / 0.2);
  }

  function ondaFV(t, escala) {
    const a = 0.55 + 0.25 * Math.sin(TAU * 0.37 * t) + 0.1 * Math.sin(TAU * 1.1 * t);
    return escala * a * (
      Math.sin(TAU * 5 * t + 1.5 * Math.sin(TAU * 0.6 * t)) +
      0.45 * Math.sin(TAU * 7.7 * t + 0.8 * Math.sin(TAU * 0.9 * t)) +
      0.25 * Math.sin(TAU * 3.3 * t));
  }

  function baseTorsades(t) {
    const env = 0.2 + 1.0 * Math.abs(Math.sin((Math.PI * t) / 3));
    const ph = TAU * 4 * t;
    return env * (Math.sin(ph) + 0.35 * Math.sin(2 * ph + 0.5));
  }

  // ---------- Signos vitales por defecto ----------

  const sv = (spo2, tas, tad, fr, etco2) => ({ spo2, tas, tad, fr, etco2 });
  const SIN_PULSO = sv(null, null, null, 10, 15);

  // ---------- Catálogo ----------

  const RITMOS = [
    // ----- Sinusales -----
    {
      id: 'rsn', nombre: 'Ritmo sinusal normal', cat: 'Sinusales',
      fc: 75, rango: [60, 100], pulso: true, signos: sv(98, 120, 75, 16, 38),
      claves: ['FC 60–100 lpm, ritmo regular.', 'Onda P positiva antes de cada QRS.', 'PR 0,12–0,20 s; QRS < 0,12 s.'],
      gen: secuencia((m, t, k, fc) => { const rr = rrDe(fc); latidoSinusal(m, t, rr); return rr; }),
    },
    {
      id: 'bradi', nombre: 'Bradicardia sinusal', cat: 'Sinusales',
      fc: 45, rango: [25, 59], pulso: true, signos: sv(96, 100, 60, 14, 38),
      claves: ['FC < 60 lpm con características sinusales.', 'P antes de cada QRS, PR normal.', 'Valorar si hay datos de inestabilidad.'],
      gen: secuencia((m, t, k, fc) => { const rr = rrDe(fc); latidoSinusal(m, t, rr); return rr; }),
    },
    {
      id: 'taqui', nombre: 'Taquicardia sinusal', cat: 'Sinusales',
      fc: 120, rango: [101, 180], pulso: true, signos: sv(96, 130, 80, 22, 34),
      claves: ['FC > 100 lpm con P sinusal antes de cada QRS.', 'Inicio y fin graduales.', 'Suele ser secundaria: buscar la causa (dolor, fiebre, hipovolemia, hipoxia).'],
      gen: secuencia((m, t, k, fc) => { const rr = rrDe(fc, 0.01); latidoSinusal(m, t, rr, 0.13); return rr; }),
    },
    {
      id: 'arrsin', nombre: 'Arritmia sinusal', cat: 'Sinusales',
      fc: 70, rango: [50, 100], pulso: true, signos: sv(98, 115, 70, 14, 38),
      claves: ['P sinusal antes de cada QRS.', 'El RR varía de forma cíclica con la respiración.', 'Frecuente y benigna en jóvenes.'],
      gen: secuencia((m, t, k, fc) => {
        const rr = (60 / fc) * (1 + 0.2 * Math.sin((TAU * t) / 5));
        latidoSinusal(m, t, rr); return rr;
      }),
    },

    // ----- Supraventriculares -----
    {
      id: 'fa', nombre: 'Fibrilación auricular', cat: 'Supraventriculares',
      fc: 110, rango: [40, 200], pulso: true, signos: sv(95, 120, 78, 18, 36),
      claves: ['RR irregularmente irregular.', 'Sin ondas P; línea de base con ondas f.', 'QRS estrecho (si no hay aberrancia).'],
      base: baseFA,
      gen: secuencia((m, t, k, fc) => { const rr = (60 / fc) * azar(0.6, 1.4); qrsEstrecho(m, t, rr, { ampPulso: Math.min(1, rr / 0.7) }); return rr; }),
    },
    {
      id: 'flutter21', nombre: 'Flutter auricular 2:1', cat: 'Supraventriculares',
      fc: 150, fija: true, pulso: true, signos: sv(95, 110, 72, 20, 35),
      claves: ['Ondas F en «dientes de sierra» a ~300/min.', 'Conducción 2:1 → FC ventricular regular ~150 lpm.', 'Sospechar ante una taquicardia regular a 150 lpm.'],
      base: baseFlutter,
      gen: flutter(2),
    },
    {
      id: 'flutter41', nombre: 'Flutter auricular 4:1', cat: 'Supraventriculares',
      fc: 75, fija: true, pulso: true, signos: sv(96, 120, 75, 16, 37),
      claves: ['Ondas F en «dientes de sierra» a ~300/min.', 'Conducción 4:1 → FC ventricular ~75 lpm.', 'Las ondas F se ven claramente entre los QRS.'],
      base: baseFlutter,
      gen: flutter(4),
    },
    {
      id: 'tsv', nombre: 'Taquicardia supraventricular', cat: 'Supraventriculares',
      fc: 180, rango: [140, 260], pulso: true, signos: sv(95, 100, 65, 22, 33),
      claves: ['Taquicardia regular de QRS estrecho, 150–250 lpm.', 'Ondas P no visibles (ocultas en el QRS o la T).', 'Inicio y fin bruscos.'],
      gen: secuencia((m, t, k, fc) => { const rr = 60 / fc; qrsEstrecho(m, t, rr, { ampPulso: 0.7 }); return rr; }),
    },
    {
      id: 'union', nombre: 'Ritmo de la unión', cat: 'Supraventriculares',
      fc: 50, rango: [35, 100], pulso: true, signos: sv(96, 100, 60, 14, 37),
      claves: ['QRS estrecho regular, 40–60 lpm (acelerado 60–100).', 'P ausente o invertida (antes o después del QRS).', 'Ritmo de escape del nodo AV.'],
      gen: secuencia((m, t, k, fc) => { const rr = rrDe(fc, 0.01); qrsEstrecho(m, t, rr); ondaP(m, t + 0.06, -0.1); return rr; }),
    },

    // ----- Extrasístoles -----
    {
      id: 'esv', nombre: 'Extrasístoles ventriculares aisladas', cat: 'Extrasístoles',
      fc: 75, rango: [50, 110], pulso: true, signos: sv(97, 120, 75, 16, 38),
      claves: ['Latido prematuro con QRS ancho (> 0,12 s) sin P previa.', 'T de polaridad opuesta al QRS.', 'Pausa compensadora completa tras la extrasístole.'],
      gen: secuencia((m, t, k, fc) => {
        const rr = rrDe(fc);
        latidoSinusal(m, t, rr);
        if (k > 1 && Math.random() < 0.15) { qrsAncho(m, t + 0.16 + 0.55 * rr, 0.55 * rr, { ampPulso: 0.4 }); return 2 * rr; }
        return rr;
      }),
    },
    {
      id: 'bigeminismo', nombre: 'Bigeminismo ventricular', cat: 'Extrasístoles',
      fc: 75, rango: [50, 110], pulso: true, signos: sv(97, 115, 72, 16, 37),
      claves: ['Alternancia: un latido sinusal, una extrasístole ventricular.', 'Patrón N–V–N–V.', 'El pulso palpado puede ser la mitad de la FC del monitor.'],
      gen: secuencia((m, t, k, fc) => {
        const rr = rrDe(fc);
        latidoSinusal(m, t, rr);
        qrsAncho(m, t + 0.16 + 0.55 * rr, 0.55 * rr, { ampPulso: 0.3 });
        return 2 * rr;
      }),
    },
    {
      id: 'trigeminismo', nombre: 'Trigeminismo ventricular', cat: 'Extrasístoles',
      fc: 75, rango: [50, 110], pulso: true, signos: sv(97, 118, 74, 16, 38),
      claves: ['Una extrasístole ventricular cada dos latidos sinusales.', 'Patrón N–N–V.'],
      gen: secuencia((m, t, k, fc) => {
        const rr = rrDe(fc);
        latidoSinusal(m, t, rr);
        if (k % 2 === 1) { qrsAncho(m, t + 0.16 + 0.55 * rr, 0.55 * rr, { ampPulso: 0.3 }); return 2 * rr; }
        return rr;
      }),
    },

    // ----- Bloqueos AV -----
    {
      id: 'bav1', nombre: 'Bloqueo AV de 1.er grado', cat: 'Bloqueos AV',
      fc: 70, rango: [45, 100], pulso: true, signos: sv(98, 120, 75, 16, 38),
      claves: ['PR > 0,20 s, constante.', 'Todas las P conducen (una P por cada QRS).'],
      gen: secuencia((m, t, k, fc) => { const rr = rrDe(fc); latidoSinusal(m, t, rr, 0.30); return rr; }),
    },
    {
      id: 'mobitz1', nombre: 'BAV 2.º grado Mobitz I (Wenckebach)', cat: 'Bloqueos AV',
      fc: 80, rango: [60, 110], pulso: true, signos: sv(97, 110, 70, 16, 37), notaFc: 'FC auricular',
      claves: ['Alargamiento progresivo del PR hasta que una P no conduce.', 'Agrupación de latidos («latidos en grupo»).', 'Habitualmente QRS estrecho; suele ser benigno.'],
      gen: secuencia((m, t, k, fc) => {
        const rr = 60 / fc;
        const pr = [0.16, 0.26, 0.32, null][k % 4];
        if (pr === null) ondaP(m, t); else latidoSinusal(m, t, rr, pr);
        return rr;
      }),
    },
    {
      id: 'mobitz2', nombre: 'BAV 2.º grado Mobitz II', cat: 'Bloqueos AV',
      fc: 75, rango: [60, 110], pulso: true, signos: sv(95, 95, 60, 16, 36), notaFc: 'FC auricular',
      claves: ['PR constante con P que súbitamente no conducen.', 'QRS con frecuencia ancho.', 'Riesgo de progresar a bloqueo completo.'],
      gen: secuencia((m, t, k, fc) => {
        const rr = 60 / fc;
        if (k % 3 === 2) ondaP(m, t); else latidoSinusal(m, t, rr, 0.18, { ancho: 1.6 });
        return rr;
      }),
    },
    {
      id: 'bav3', nombre: 'BAV de 3.er grado (completo)', cat: 'Bloqueos AV',
      fc: 35, rango: [20, 60], pulso: true, signos: sv(92, 80, 45, 20, 34), notaFc: 'FC del escape ventricular',
      claves: ['Disociación AV: P y QRS sin relación.', 'P regulares (~80/min) y QRS regulares lentos.', 'Escape ventricular (ancho) o de la unión (estrecho).'],
      gen: combinar(
        secuencia((m, t) => { ondaP(m, t); return 60 / 82; }),
        secuencia((m, t, k, fc) => { const rr = 60 / fc; qrsAncho(m, t + 0.3, rr); return rr; }),
      ),
    },

    // ----- Ventriculares -----
    {
      id: 'idiov', nombre: 'Ritmo idioventricular', cat: 'Ventriculares',
      fc: 32, rango: [15, 40], pulso: true, signos: sv(88, 70, 40, 12, 30),
      claves: ['QRS ancho y regular, 20–40 lpm.', 'Sin ondas P relacionadas.', 'Ritmo de escape ventricular.'],
      gen: secuencia((m, t, k, fc) => { const rr = rrDe(fc, 0.01); qrsAncho(m, t, rr, { ampPulso: 0.6 }); return rr; }),
    },
    {
      id: 'riva', nombre: 'Ritmo idioventricular acelerado (RIVA)', cat: 'Ventriculares',
      fc: 75, rango: [41, 110], pulso: true, signos: sv(96, 110, 70, 16, 37),
      claves: ['QRS ancho regular, 40–100 lpm.', 'Típico tras reperfusión coronaria.', 'Generalmente bien tolerado.'],
      gen: secuencia((m, t, k, fc) => { const rr = rrDe(fc, 0.01); qrsAncho(m, t, rr); return rr; }),
    },
    {
      id: 'tv', nombre: 'Taquicardia ventricular con pulso', cat: 'Ventriculares',
      fc: 170, rango: [120, 250], pulso: true, signos: sv(92, 85, 50, 24, 30),
      claves: ['Taquicardia regular de QRS ancho (> 0,12 s), > 100 lpm.', 'Puede verse disociación AV.', 'Valorar estabilidad del paciente.'],
      gen: secuencia((m, t, k, fc) => { const rr = 60 / fc; qrsAncho(m, t, rr, { ampR: 1.4, ampPulso: 0.45 }); return rr; }),
    },
    {
      id: 'tvsp', nombre: 'Taquicardia ventricular sin pulso', cat: 'Paro cardiaco',
      fc: 180, rango: [120, 250], pulso: false, signos: SIN_PULSO, alarma: 'TV',
      claves: ['Mismo trazo que la TV, pero el paciente NO tiene pulso.', 'Ritmo DESFIBRILABLE.', 'Iniciar RCP y desfibrilar.'],
      gen: secuencia((m, t, k, fc) => { const rr = 60 / fc; qrsAncho(m, t, rr, { ampR: 1.5 }); return rr; }),
    },
    {
      id: 'torsades', nombre: 'Torsades de pointes', cat: 'Paro cardiaco',
      fcPantalla: '---', pulso: false, signos: SIN_PULSO, alarma: 'TV',
      claves: ['TV polimórfica: los QRS «giran» alrededor de la línea de base.', 'Asociada a QT largo.', 'Sin pulso: ritmo DESFIBRILABLE.'],
      base: baseTorsades,
    },
    {
      id: 'fvg', nombre: 'Fibrilación ventricular gruesa', cat: 'Paro cardiaco',
      fcPantalla: '---', pulso: false, signos: SIN_PULSO, alarma: 'FV',
      claves: ['Actividad eléctrica caótica, sin QRS identificables.', 'Ondas de gran amplitud.', 'Ritmo DESFIBRILABLE.'],
      base: (t) => ondaFV(t, 0.8),
    },
    {
      id: 'fvf', nombre: 'Fibrilación ventricular fina', cat: 'Paro cardiaco',
      fcPantalla: '---', pulso: false, signos: SIN_PULSO, alarma: 'FV',
      claves: ['Ondulaciones caóticas de baja amplitud.', 'Puede confundirse con asistolia: revisar ganancia.', 'Ritmo DESFIBRILABLE.'],
      base: (t) => ondaFV(t, 0.22),
    },
    {
      id: 'asistolia', nombre: 'Asistolia', cat: 'Paro cardiaco',
      fcPantalla: '0', pulso: false, signos: SIN_PULSO, alarma: 'ASISTOLIA',
      claves: ['Línea prácticamente isoeléctrica.', 'Confirmar: conexiones, derivación y ganancia.', 'Ritmo NO desfibrilable.'],
      base: (t) => 0.03 * Math.sin(TAU * 0.23 * t) + 0.01 * Math.sin(TAU * 1.7 * t),
    },
    {
      id: 'aesp', nombre: 'Actividad eléctrica sin pulso (AESP)', cat: 'Paro cardiaco',
      fc: 50, rango: [20, 120], pulso: false, signos: SIN_PULSO, alarma: 'SIN PULSO',
      claves: ['Ritmo organizado en el monitor SIN pulso palpable.', 'Ritmo NO desfibrilable.', 'Buscar causas reversibles (H y T).'],
      gen: secuencia((m, t, k, fc) => { const rr = rrDe(fc, 0.01); latidoSinusal(m, t, rr, 0.18, { ancho: 1.5, ampR: 0.8 }); return rr; }),
    },

    // ----- Marcapasos -----
    {
      id: 'mp', nombre: 'Ritmo de marcapasos (VVI)', cat: 'Marcapasos',
      fc: 70, rango: [50, 100], pulso: true, signos: sv(97, 120, 75, 16, 38),
      claves: ['Espiga de marcapasos seguida de QRS ancho.', 'Frecuencia fija igual a la programada.', 'Captura 1:1.'],
      gen: secuencia((m, t, k, fc) => { const rr = 60 / fc; espigaMarcapasos(m, t); qrsAncho(m, t + 0.01, rr, { signo: -1 }); return rr; }),
    },
    {
      id: 'mpfallo', nombre: 'Marcapasos con fallo de captura', cat: 'Marcapasos',
      fc: 70, rango: [50, 100], pulso: true, signos: sv(93, 95, 55, 18, 35), notaFc: 'Frecuencia programada',
      claves: ['Espigas de marcapasos que NO van seguidas de QRS.', 'Puede producir bradicardia grave.', 'Comprobar umbral, electrodo y batería.'],
      gen: secuencia((m, t, k, fc) => {
        const rr = 60 / fc;
        espigaMarcapasos(m, t);
        if (k % 3 !== 2) qrsAncho(m, t + 0.01, rr, { signo: -1 });
        return rr;
      }),
    },
  ];

  function flutter(conduccion) {
    return (fc, inicio) => {
      // Alinear los QRS con las ondas F.
      const t0 = Math.ceil(inicio / PERIODO_F) * PERIODO_F + 0.1;
      return secuencia((m, t) => {
        const rr = PERIODO_F * conduccion;
        qrsEstrecho(m, t, rr, { ampPulso: conduccion === 2 ? 0.75 : 1 });
        return rr;
      })(fc, t0);
    };
  }

  const PORID = Object.fromEntries(RITMOS.map((r) => [r.id, r]));
  const CATEGORIAS = [...new Set(RITMOS.map((r) => r.cat))];

  global.Ritmos = { lista: RITMOS, porId: (id) => PORID[id], categorias: CATEGORIAS, g };
})(window);

document.addEventListener("DOMContentLoaded", () => {
  // Configurar mes y año actual por defecto
  const fechaActual = new Date();
  document.getElementById("mes").value = fechaActual.getMonth() + 1;
  document.getElementById("anio").value = fechaActual.getFullYear();

  const formulario = document.getElementById("formularioSimulador");
  let instanciaGrafico = null;
  let datosActuales = null; // Guardará los datos para el CSV
  let detallesAparatos = null; // Guardará el objeto con totales por aparato
  let matrizAparatos = null; // Guardará el desglose [dia][hora][id_aparato] = kwh

  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();

    const consumoTotalIngresado = parseFloat(document.getElementById("consumoTotal").value);
    const mesIngresado = parseInt(document.getElementById("mes").value);
    const anioIngresado = parseInt(document.getElementById("anio").value);

    if (isNaN(consumoTotalIngresado) || consumoTotalIngresado <= 0) {
      alert("Por favor, introduce un consumo válido.");
      return;
    }

    // Ejecutar simulación
    const simulacion = ejecutarSimulacion(consumoTotalIngresado, mesIngresado, anioIngresado);
    datosActuales = simulacion;

    // Actualizar UI
    actualizarInterfaz(simulacion);
  });

  document.getElementById("botonDescargarCSV").addEventListener("click", () => {
    if (datosActuales) {
      descargarArchivoCSV(datosActuales);
    }
  });

  /**
   * Lógica de Simulación
   */
  function ejecutarSimulacion(consumoObjetivo, mes, anio) {
    const diasDelMes = new Date(anio, mes, 0).getDate();

    // -- Base de datos de equipos (basada en la imagen) --
    // El 'tipoHorario' es una heurística para asignar probabilidades de uso a lo largo del día
    // basándonos en si es horario laboral, de comida, noches, o 24h.
    let aparatos = [
      { id: 'iluminacion_led', nombre: 'Iluminación LED', cant: 30, pot: 0.018, usoNormalizado: 0.8, tipoHorario: 'laboral' },
      { id: 'iluminacion_emergencia', nombre: 'Iluminación emergencia', cant: 7, pot: 0.006, usoNormalizado: 1, tipoHorario: '24h' },
      { id: 'aire_acond', nombre: 'Aire acond. (split)', cant: 3, pot: 4, usoNormalizado: 0.4, tipoHorario: 'climatizacion' },
      { id: 'ordenadores', nombre: 'Ordenadores', cant: 6, pot: 0.1, usoNormalizado: 0.7, tipoHorario: 'laboral' },
      { id: 'ordenador_jefe', nombre: 'Ordenador jefe', cant: 1, pot: 0.1, usoNormalizado: 0.8, tipoHorario: '24h_alto' },
      { id: 'microondas', nombre: 'Microondas', cant: 2, pot: 0.7, usoNormalizado: 1, tipoHorario: 'comida' },
      { id: 'impresora_20a', nombre: 'Impresora 20A', cant: 1, pot: 4.6, usoNormalizado: 0.2, tipoHorario: 'picos_laborales' },
      { id: 'impresora_32a', nombre: 'Impresora 32A monofásica', cant: 1, pot: 7.36, usoNormalizado: 1, tipoHorario: '24h_bajo' },
      { id: 'impresora_2_3kw', nombre: 'Impresora 2,3kW', cant: 1, pot: 2.3, usoNormalizado: 0.6, tipoHorario: 'picos_laborales' },
      { id: 'impresora_900w', nombre: 'Impresora 900W', cant: 1, pot: 0.9, usoNormalizado: 0.6, tipoHorario: 'picos_laborales' },
      { id: 'destructora', nombre: 'Destructora de papel', cant: 2, pot: 0.1, usoNormalizado: 1, tipoHorario: 'picos_laborales' },
      { id: 'calentador', nombre: 'Calentador', cant: 1, pot: 0.4, usoNormalizado: 0.4, tipoHorario: 'mañana' },
      { id: 'secador', nombre: 'Secador', cant: 1, pot: 0.9, usoNormalizado: 1, tipoHorario: 'mañana' },
      { id: 'videovigilancia', nombre: 'Videovigilancia', cant: 6, pot: 0.006, usoNormalizado: 1, tipoHorario: '24h' },
      { id: 'telefono_fijo', nombre: 'Teléfono fijo', cant: 4, pot: 0.003, usoNormalizado: 0.5, tipoHorario: '24h' },
      { id: 'pantallas', nombre: 'Pantallas ordenador', cant: 9, pot: 0.1, usoNormalizado: 1, tipoHorario: 'laboral' },
      { id: 'servidores', nombre: 'Servidores', cant: 3, pot: 0.9, usoNormalizado: 1, tipoHorario: '24h' },
      { id: 'sai', nombre: 'SAI', cant: 2, pot: 1.5, usoNormalizado: 1, tipoHorario: 'nulo' },
      { id: 'fantasmas', nombre: 'Consumos "fantasma"', cant: 7, pot: 0.066, usoNormalizado: 0.1, tipoHorario: '24h' },
      { id: 'router_65w', nombre: 'Router 65W', cant: 1, pot: 0.065, usoNormalizado: 0.8, tipoHorario: '24h' },
      { id: 'router_12w', nombre: 'Router 12W', cant: 1, pot: 0.012, usoNormalizado: 0.8, tipoHorario: '24h' }
    ];


    aparatos.forEach(ap => {
      ap.pesoMaximoHora = ap.cant * ap.pot * ap.usoNormalizado;
      ap.consumoAcumuladoMes = 0;
      ap.horasEncendidoMes = 0;
      ap.diasDeUso = new Set();
    });

    // Función para saber qué factor de su peso usar según la hora y tipo
    const obtenerFactorUso = (hora, tipoHorario, esFinde) => {
      if (tipoHorario === 'nulo') return 0;

      // Equipos 24 horas varían levemente, pero en general están constantes
      if (tipoHorario === '24h' || tipoHorario === '24h_alto' || tipoHorario === '24h_bajo') {
        const factorBase = tipoHorario === '24h_bajo' ? 0.3 : (tipoHorario === '24h_alto' ? 0.9 : 0.6);
        return factorBase + (Math.random() * 0.1);
      }

      if (esFinde) {
        // En finde solo cosas 24h o nulo (SAI) funcionan realmente en la simulación
        // Como el tipo 24h ya se devolvió arriba, lo que llegue aquí es 0
        return 0;
      }

      // A partir de aqui solo días laborables
      if (tipoHorario === 'laboral') {
        if (hora >= 8 && hora <= 18) return (hora === 13 || hora === 14) ? 0.1 : 0.9;
        return 0;
      }
      if (tipoHorario === 'comida') {
        if (hora >= 13 && hora <= 15) return 0.8;
        return 0;
      }
      if (tipoHorario === 'mañana') {
        if (hora >= 7 && hora <= 10) return 0.8;
        return 0;
      }
      if (tipoHorario === 'picos_laborales') {
        if ([9, 11, 12, 16, 17].includes(hora)) return Math.random() * 0.7; // Tienen picos variables
        return 0.05; // Standby u ocasional
      }
      if (tipoHorario === 'climatizacion') {
        if (!esClimaExtremo) return 0; // Apagado gran parte del año
        if (hora >= 8 && hora <= 18) return 0.8;
        return 0;
      }
      return 0;
    };

    // El perfil base ya no será estático para cada día, 
    // lo generaremos dependiendo de si es entre semana o fin de semana.

    // Perfil basado en la curva de carga con madrugadas y noches estables
    // con picos fuertes de 09-11h y 15-18h, y valle a mediodía.
    // Noche (20:00 a 08:00) estabilizada en 0.10.
    let perfilLaboral = [
      0.10, // 00:00 - 01:00 (Noche estable)
      0.10, // 01:00 - 02:00
      0.10, // 02:00 - 03:00
      0.10, // 03:00 - 04:00
      0.10, // 04:00 - 05:00
      0.10, // 05:00 - 06:00
      0.10, // 06:00 - 07:00
      0.10, // 07:00 - 08:00
      0.15, // 08:00 - 09:00 (Arrancando)
      0.65, // 09:00 - 10:00 (Subida fuerte)
      0.60, // 10:00 - 11:00 (Pico matutino)
      0.55, // 11:00 - 12:00 (Mantenimiento alto a mediodía)
      0.45, // 12:00 - 13:00 (Valle muy suave para comer)
      0.45, // 13:00 - 14:00 (Valle muy suave para comer)
      0.50, // 14:00 - 15:00 (Ascenso vespertino moderado)
      0.35, // 15:00 - 16:00 (Pico moderado de tarde)
      0.30, // 16:00 - 17:00 
      0.25, // 17:00 - 18:00
      0.15, // 18:00 - 19:00 (Bajando tras jornada)
      0.25, // 19:00 - 20:00
      0.10, // 20:00 - 21:00 (Noche estable)
      0.10, // 21:00 - 22:00
      0.10, // 22:00 - 23:00
      0.10  // 23:00 - 24:00
    ];

    // Lógica Estacional:
    // Los meses de clima extremo (Verano: 6, 7, 8, 9 / Invierno: 1, 2, 12) 
    // tienen los equipos de climatización ('aires') encendidos todo el día.
    const mesesExtremos = [1, 2, 6, 7, 8, 9, 12];
    const esClimaExtremo = mesesExtremos.includes(mes);

    if (esClimaExtremo) {
      // Elevamos significativamente la base de consumo durante el horario laboral
      perfilLaboral = perfilLaboral.map((valor, hora) => {
        if (hora >= 8 && hora <= 18) {
          // Rellenamos los valles porque la climatización es una carga base constante
          return valor + 0.40;
        }
        return valor;
      });
    }

    // Perfil típico de Empresa Fin de Semana: Mucho más plano y bajo, representando solo la base 24h
    let perfilFinDeSemana = [
      0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10,
      0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10
    ];

    const sumaLaboral = perfilLaboral.reduce((a, b) => a + b, 0);
    const laboralNormalizado = perfilLaboral.map((p) => p / sumaLaboral);

    const sumaFinde = perfilFinDeSemana.reduce((a, b) => a + b, 0);
    const findeNormalizado = perfilFinDeSemana.map((p) => p / sumaFinde);

    // 2. Generar matriz de horas
    const datosGenerados = [];
    let totalActualAcumulado = 0;

    // Calculamos qué peso tiene cada día (los findes consumen menos que los laborables)
    let pesoTotalMes = 0;
    const diasInfo = [];
    for (let dia = 1; dia <= diasDelMes; dia++) {
      const fecha = new Date(anio, mes - 1, dia);
      const diaSemana = fecha.getDay(); // 0(Dom) a 6(Sab)
      const esFinde = diaSemana === 0 || diaSemana === 6;
      const peso = esFinde ? 0.3 : 1.0; // El Finde la empresa gasta un 30% de un día normal
      pesoTotalMes += peso;
      diasInfo.push({ esFinde, peso });
    }

    // Distribuimos el consumo ponderado
    const valorBasePonderado = consumoObjetivo / pesoTotalMes;

    for (let dia = 0; dia < diasDelMes; dia++) {
      const datosDiarios = [];
      const info = diasInfo[dia];

      // Variación aleatoria del día (± 10%)
      const modificadorDiario = 1 + (Math.random() * 0.2 - 0.1);
      let objetivoTotalDiario = (valorBasePonderado * info.peso) * modificadorDiario;
      let totalDiarioActual = 0;

      const perfilUsado = info.esFinde ? findeNormalizado : laboralNormalizado;

      for (let hora = 0; hora < 24; hora++) {
        // Variación horaria (± 10%)
        const modificadorHorario = 1 + (Math.random() * 0.2 - 0.1);
        let valorHora = objetivoTotalDiario * perfilUsado[hora] * modificadorHorario;

        datosDiarios.push(valorHora);
        totalDiarioActual += valorHora;
      }

      // Re-normalizar el día para que cuadre exactamente con objetivoTotalDiario
      for (let hora = 0; hora < 24; hora++) {
        datosDiarios[hora] = (datosDiarios[hora] / totalDiarioActual) * objetivoTotalDiario;
      }

      datosGenerados.push(datosDiarios);
      totalActualAcumulado += objetivoTotalDiario;
    }

    // 3. Ajuste final severo para garantizar el total exacto (compensación de sobrantes/faltantes)
    const proporcionAjuste = consumoObjetivo / totalActualAcumulado;
    let sumaFinal = 0;
    let registroDePicos = []; // Para calcular el estadístico de picos

    let matrizAparatosKwh = []; // Para almacenar desglose exacto

    for (let dia = 0; dia < diasDelMes; dia++) {
      const info = diasInfo[dia]; // Reutilizamos diasInfo del paso anterior
      matrizAparatosKwh.push([]);

      for (let hora = 0; hora < 24; hora++) {
        datosGenerados[dia][hora] = datosGenerados[dia][hora] * proporcionAjuste;
        let kwhHoraReal = datosGenerados[dia][hora];
        sumaFinal += kwhHoraReal;
        registroDePicos.push(kwhHoraReal);

        // --- 4. Distribuimos este kwhHoraReal entre los aparatos ---
        let desgloseHora = {};
        let sumaPesos = 0;

        // Calcular "peso" de cada aparato para esta hora exacta
        aparatos.forEach(ap => {
          let factor = obtenerFactorUso(hora, ap.tipoHorario, info.esFinde);
          let pesoInstante = ap.pesoMaximoHora * factor;

          if (pesoInstante > 0) {
            desgloseHora[ap.id] = pesoInstante;
            sumaPesos += pesoInstante;
          }
        });

        // Reparto proporcional del consumo real de esa hora
        let desgloseCalculado = {};
        aparatos.forEach(ap => {
          if (desgloseHora[ap.id]) {
            let proporcion = desgloseHora[ap.id] / (sumaPesos || 1);
            let kwhAparato = kwhHoraReal * proporcion;
            desgloseCalculado[ap.id] = kwhAparato;

            // Acumular en estadísticas del mes para el aparato
            ap.consumoAcumuladoMes += kwhAparato;
            if (kwhAparato > 0.001) { // Umbral mínimo para contar que se encendió 1 hora
              ap.horasEncendidoMes++;
              ap.diasDeUso.add(dia);
            }
          } else {
            desgloseCalculado[ap.id] = 0;
          }
        });

        matrizAparatosKwh[dia][hora] = desgloseCalculado;
      }
    }

    // Convertir de Set a Número
    aparatos.forEach(ap => {
      ap.numDiasDeUso = ap.diasDeUso.size;
      delete ap.diasDeUso; // Limpieza
    });

    detallesAparatos = aparatos; // Global para poder pintar el modal después
    matrizAparatos = matrizAparatosKwh; // Global

    return {
      matriz: datosGenerados,
      totalKwh: consumoObjetivo,
      dias: diasDelMes,
      picoMaximo: Math.max(...registroDePicos),
    };
  }

  /**
   * Actualización de Interfaz
   */
  function actualizarInterfaz(simulacion) {
    const contenedorResultados = document.getElementById("resultados");
    contenedorResultados.classList.remove("oculto");

    // Actualizar stats
    document.getElementById("estadisticaTotal").textContent =
      `${simulacion.totalKwh.toFixed(2)} kWh`;
    document.getElementById("estadisticaDias").textContent = simulacion.dias;
    document.getElementById("estadisticaPico").textContent =
      `${simulacion.picoMaximo.toFixed(3)} kWh`;

    // Calcular medias para el gráfico
    const mediasHorarias = new Array(24).fill(0);
    for (let hora = 0; hora < 24; hora++) {
      let suma = 0;
      for (let dia = 0; dia < simulacion.dias; dia++) {
        suma += simulacion.matriz[dia][hora];
      }
      mediasHorarias[hora] = suma / simulacion.dias;
    }

    dibujarGrafico(mediasHorarias);
    dibujarTabla(simulacion);

    // Scroll suave
    contenedorResultados.scrollIntoView({ behavior: "smooth" });
  }



  /**
   * Renderizado del Gráfico
   */
  function dibujarGrafico(mediasHorarias) {
    const contextoGrafico = document.getElementById("graficoConsumo").getContext("2d");

    if (instanciaGrafico) {
      instanciaGrafico.destroy();
    }

    const etiquetasHoras = Array.from(
      { length: 24 },
      (_, i) => `${i.toString().padStart(2, "0")}:00`,
    );

    instanciaGrafico = new Chart(contextoGrafico, {
      type: "line",
      data: {
        labels: etiquetasHoras,
        datasets: [
          {
            label: "Consumo Medio por Hora (kWh)",
            data: mediasHorarias,
            borderColor: "#ec4899",
            backgroundColor: "rgba(236, 72, 153, 0.2)",
            borderWidth: 3,
            tension: 0.4,
            fill: true,
            pointBackgroundColor: "#6366f1",
            pointBorderColor: "#fff",
            pointHoverBackgroundColor: "#fff",
            pointHoverBorderColor: "#ec4899",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: "#cbd5e1" },
          },
          tooltip: {
            mode: "index",
            intersect: false,
            callbacks: {
              label: function (contexto) {
                return ` ${contexto.parsed.y.toFixed(3)} kWh`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "rgba(255, 255, 255, 0.1)" },
            ticks: { color: "#cbd5e1" },
          },
          x: {
            grid: { color: "rgba(255, 255, 255, 0.1)" },
            ticks: { color: "#cbd5e1" },
          },
        },
      },
    });
  }

  /**
   * Renderizado de la Tabla
   */
  function dibujarTabla(simulacion) {
    // Cabeceras
    const cabeceraFila = document.getElementById("cabeceraTabla");
    cabeceraFila.innerHTML = "<th>Hora \\ Día</th>";
    for (let dia = 0; dia < simulacion.dias; dia++) {
      cabeceraFila.innerHTML += `<th>Día ${dia + 1}</th>`;
    }
    cabeceraFila.innerHTML += "<th>Suma Hora</th>";

    // Cuerpo
    const cuerpoTabla = document.getElementById("cuerpoTabla");
    cuerpoTabla.innerHTML = "";

    let sumasDiarias = new Array(simulacion.dias).fill(0);
    let sumaTotalAbsoluta = 0;

    for (let h = 0; h < 24; h++) {
      const fila = document.createElement("tr");
      fila.innerHTML = `<td><strong>${h.toString().padStart(2, "0")}:00</strong></td>`;

      let totalPorHora = 0;
      for (let dia = 0; dia < simulacion.dias; dia++) {
        const valorParcial = simulacion.matriz[dia][h];
        totalPorHora += valorParcial;
        sumasDiarias[dia] += valorParcial;

        // Color coding based on value
        let claseColor = "celda-clicable "; // Añadido para UX
        if (valorParcial > simulacion.picoMaximo * 0.7) claseColor += "valor-alto";
        else if (valorParcial < simulacion.picoMaximo * 0.2) claseColor += "valor-bajo";
        else claseColor += "valor-medio";

        // Creamos la celda y le añadimos el evento onclick
        const celda = document.createElement("td");
        celda.className = claseColor;
        celda.textContent = valorParcial.toFixed(3);

        // Construimos el Tooltip para que muestre el consumo sin necesidad de hacer clic
        let desglose = matrizAparatos[dia][h];
        let tooltipInfo = `Hora: ${h.toString().padStart(2, "0")}:00 | Total: ${valorParcial.toFixed(4)} kWh\n---\n`;
        let listaTooltip = [];
        detallesAparatos.forEach(ap => {
          let consumido = desglose[ap.id] || 0;
          if (consumido > 0.0001) listaTooltip.push({ nombre: ap.nombre, consumo: consumido });
        });
        listaTooltip.sort((a, b) => b.consumo - a.consumo);
        listaTooltip.forEach(item => {
          tooltipInfo += `${item.nombre}: ${item.consumo.toFixed(4)} kWh\n`;
        });
        celda.title = tooltipInfo + "\n(Clic para ver gráfico en grande)";

        // --- Evento para abrir el modal ---
        celda.addEventListener("click", () => abirModalDesglose(dia, h, valorParcial));

        fila.appendChild(celda);
      }
      sumaTotalAbsoluta += totalPorHora;
      const celdaTotal = document.createElement("td");
      celdaTotal.innerHTML = `<strong>${totalPorHora.toFixed(2)}</strong>`;
      fila.appendChild(celdaTotal);
      cuerpoTabla.appendChild(fila);
    }

    // Fila de totales
    const filaTotales = document.createElement("tr");
    filaTotales.style.background = "rgba(255,255,255,0.1)";
    filaTotales.innerHTML = "<td><strong>Total Día</strong></td>";

    for (let dia = 0; dia < simulacion.dias; dia++) {
      filaTotales.innerHTML += `<td><strong>${sumasDiarias[dia].toFixed(2)}</strong></td>`;
    }
    filaTotales.innerHTML += `<td style="color:#6366f1;"><strong>${sumaTotalAbsoluta.toFixed(2)} kWh</strong></td>`;
    cuerpoTabla.appendChild(filaTotales);
  }

  /**
   * Exportar a CSV
   */
  function descargarArchivoCSV(simulacion) {
    let contenidoCSV = "data:text/csv;charset=utf-8,";

    // Cabeceras
    const cabecerasCSV = ["Fecha", "Hora", "Consumo_kWh"];
    contenidoCSV += cabecerasCSV.join(";") + "\r\n";

    // Obtener mes y año seleccionados
    const mesStr = document.getElementById("mes").value.padStart(2, '0');
    const anioStr = document.getElementById("anio").value;

    // Filas
    for (let dia = 0; dia < simulacion.dias; dia++) {
      const diaStr = String(dia + 1).padStart(2, '0');
      const fechaFormat = `${diaStr}/${mesStr}/${anioStr}`;

      for (let h = 0; h < 24; h++) {
        const horaConfigurada = h + 1; // Ajuste para que vaya de 1 a 24
        const valorHora = simulacion.matriz[dia][h];
        
        const filaTexto = [
          fechaFormat,
          horaConfigurada,
          valorHora.toFixed(3).replace(".", ",")
        ];
        
        contenidoCSV += filaTexto.join(";") + "\r\n";
      }
    }

    const uriCodificada = encodeURI(contenidoCSV);
    const enlace = document.createElement("a");
    enlace.setAttribute("href", uriCodificada);
    enlace.setAttribute("download", "simulacion_consumo.csv");
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
  }

  /**
   * Lógica del Modal
   */
  const modal = document.getElementById("modalDesglose");
  const cerrarModalBtn = document.getElementById("cerrarModal");
  let instanciaGraficoPie = null;

  cerrarModalBtn.addEventListener("click", () => {
    modal.classList.add("oculto");
  });

  window.addEventListener("click", (evento) => {
    if (evento.target === modal) {
      modal.classList.add("oculto");
    }
  });

  function abirModalDesglose(dia, hora, totalGastoHora) {
    document.getElementById("tituloModal").textContent = `Desglose - Día ${dia + 1}, ${hora.toString().padStart(2, "0")}:00`;
    document.getElementById("totalHoraModal").textContent = `${totalGastoHora.toFixed(4)} kWh`;

    const desgloseExacto = matrizAparatos[dia][hora];
    const cuerpoTablaDesglose = document.getElementById("cuerpoTablaDesgloseHora");
    cuerpoTablaDesglose.innerHTML = "";

    let datosPie = [];
    let labelsPie = [];
    let porcentajesPie = [];

    // Formatear array para ordenar
    let listaAparatosHora = [];
    detallesAparatos.forEach(ap => {
      let consumido = desgloseExacto[ap.id] || 0;
      if (consumido > 0.0001) {
        listaAparatosHora.push({ nombre: ap.nombre, consumo: consumido, cant: ap.cant, pot: ap.pot });
      }
    });

    listaAparatosHora.sort((a, b) => b.consumo - a.consumo);

    listaAparatosHora.forEach(item => {
      const porcentaje = ((item.consumo / totalGastoHora) * 100).toFixed(1);

      let tiempoH = (item.pot > 0 && item.cant > 0) ? (item.consumo / (item.pot * item.cant)) : 0;

      // Aseguramos matemáticamente que el tiempo efectivo jamás supere 1 hora real por celda.
      if (tiempoH > 1) {
        tiempoH = 1;
      }

      const tiempoMin = Math.round(tiempoH * 60);
      let tiempoStr = tiempoMin + " min";
      if (tiempoMin >= 60) {
        tiempoStr = "60 min"; // Lo topamos visualmente en 60 mins para evitar mostrar "1.0 h" que confunde si es de 1 hora
      }

      const fila = document.createElement("tr");
      fila.innerHTML = `
        <td>${item.nombre}</td>
        <td><strong>${item.cant}</strong></td>
        <td>${item.pot} kW</td>
        <td style="color: #10b981; font-weight: bold;">${tiempoStr}</td>
        <td>${item.consumo.toFixed(4)}</td>
        <td>${porcentaje}%</td>
      `;
      cuerpoTablaDesglose.appendChild(fila);

      // Siempre mostramos en la tabla
      labelsPie.push(item.nombre);
      datosPie.push(item.consumo);
      porcentajesPie.push(porcentaje);
    });

    // Guardar para el toggle
    window.datosActualesModal = {
      labels: labelsPie,
      datos: datosPie,
      porcentajes: porcentajesPie
    };

    dibujarGraficoModal();
    modal.classList.remove("oculto");
  }

  function dibujarGraficoModal() {
    if (!window.datosActualesModal) return;

    const mostrarTodos = document.getElementById("toggleSlices").checked;

    let labelsFiltrados = [];
    let datosFiltrados = [];

    for (let i = 0; i < window.datosActualesModal.labels.length; i++) {
      let pct = window.datosActualesModal.porcentajes[i];
      if (mostrarTodos || pct >= 1.0) {
        labelsFiltrados.push(window.datosActualesModal.labels[i]);
        datosFiltrados.push(window.datosActualesModal.datos[i]);
      }
    }

    // Dibujar gráfico
    const ctxModal = document.getElementById("graficoDesglosePie").getContext("2d");
    if (instanciaGraficoPie) {
      instanciaGraficoPie.destroy();
    }

    instanciaGraficoPie = new Chart(ctxModal, {
      type: "doughnut",
      data: {
        labels: labelsFiltrados,
        datasets: [{
          data: datosFiltrados,
          backgroundColor: [
            '#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#14b8a6', '#f43f5e', '#d946ef', '#0ea5e9'
          ],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#cbd5e1',
              boxWidth: 12,
              padding: 10,
              font: { size: 11 }
            }
          }
        }
      }
    });
  }

  document.getElementById("toggleSlices").addEventListener("change", dibujarGraficoModal);
});

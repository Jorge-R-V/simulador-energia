document.addEventListener("DOMContentLoaded", () => {
  // Configurar mes y año actual por defecto
  const fechaActual = new Date();
  document.getElementById("mes").value = fechaActual.getMonth() + 1;
  document.getElementById("anio").value = fechaActual.getFullYear();

  const formulario = document.getElementById("formularioSimulador");
  let instanciaGrafico = null;
  let datosActuales = null; // Guardará los datos para el CSV

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

    // Perfil típico de Empresa Fin de Semana: Mucho más plano y bajo
    let perfilFinDeSemana = [
      0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.02, 0.02, 0.02, 0.02,
      0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.01, 0.01, 0.01, 0.01
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

    for (let dia = 0; dia < diasDelMes; dia++) {
      for (let hora = 0; hora < 24; hora++) {
        datosGenerados[dia][hora] = datosGenerados[dia][hora] * proporcionAjuste;
        sumaFinal += datosGenerados[dia][hora];
        registroDePicos.push(datosGenerados[dia][hora]);
      }
    }

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
        let claseColor = "";
        if (valorParcial > simulacion.picoMaximo * 0.7) claseColor = "valor-alto";
        else if (valorParcial < simulacion.picoMaximo * 0.2) claseColor = "valor-bajo";
        else claseColor = "valor-medio";

        fila.innerHTML += `<td class="${claseColor}">${valorParcial.toFixed(3)}</td>`;
      }
      sumaTotalAbsoluta += totalPorHora;
      fila.innerHTML += `<td><strong>${totalPorHora.toFixed(2)}</strong></td>`;
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
    const cabecerasCSV = ["Hora"];
    for (let d = 0; d < simulacion.dias; d++) cabecerasCSV.push(`Dia ${d + 1}`);
    cabecerasCSV.push("Total_Hora");
    contenidoCSV += cabecerasCSV.join(";") + "\r\n";

    let sumasDiarias = new Array(simulacion.dias).fill(0);
    let sumaTotalAbsoluta = 0;

    // Filas
    for (let h = 0; h < 24; h++) {
      const filaTexto = [`${h.toString().padStart(2, "0")}:00`];
      let totalPorHora = 0;
      
      for (let dia = 0; dia < simulacion.dias; dia++) {
        const valorHora = simulacion.matriz[dia][h];
        filaTexto.push(valorHora.toFixed(4).replace(".", ","));
        totalPorHora += valorHora;
        sumasDiarias[dia] += valorHora;
      }
      sumaTotalAbsoluta += totalPorHora;
      filaTexto.push(totalPorHora.toFixed(4).replace(".", ","));
      contenidoCSV += filaTexto.join(";") + "\r\n";
    }

    // Totales diarios guardados
    const filaTotales = ["Total_Dia"];
    for (let dia = 0; dia < simulacion.dias; dia++) {
      filaTotales.push(sumasDiarias[dia].toFixed(4).replace(".", ","));
    }
    filaTotales.push(sumaTotalAbsoluta.toFixed(4).replace(".", ","));
    contenidoCSV += filaTotales.join(";") + "\r\n";

    const uriCodificada = encodeURI(contenidoCSV);
    const enlace = document.createElement("a");
    enlace.setAttribute("href", uriCodificada);
    enlace.setAttribute("download", "simulacion_consumo.csv");
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
  }
});

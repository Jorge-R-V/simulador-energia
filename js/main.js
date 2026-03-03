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

    // Perfil típico de consumo diario en un hogar español (porcentajes por hora de 0 a 23)
    // Ejemplo: menos de noche, picos a mediodía y noche.
    const perfilBase = [
      0.015, // 00:00
      0.012, // 01:00
      0.01,  // 02:00
      0.009, // 03:00
      0.009, // 04:00
      0.01,  // 05:00
      0.02,  // 06:00
      0.04,  // 07:00
      0.05,  // 08:00
      0.045, // 09:00
      0.04,  // 10:00
      0.04,  // 11:00
      0.045, // 12:00
      0.06,  // 13:00
      0.075, // 14:00
      0.065, // 15:00
      0.045, // 16:00
      0.04,  // 17:00
      0.05,  // 18:00
      0.06,  // 19:00
      0.08,  // 20:00
      0.09,  // 21:00
      0.065, // 22:00
      0.03,  // 23:00
    ];

    // 1. Verificar que la suma del perfil base es = 1
    const sumaPerfil = perfilBase.reduce((a, b) => a + b, 0);
    const perfilNormalizado = perfilBase.map((p) => p / sumaPerfil);

    // 2. Generar matriz de horas
    const datosGenerados = []; // Array de días, cada día es un array de 24h
    let totalActualAcumulado = 0;

    // Distribuimos el consumo diario medio y aplicamos pequeñas variaciones
    const consumoMedioDiario = consumoObjetivo / diasDelMes;

    for (let dia = 0; dia < diasDelMes; dia++) {
      const datosDiarios = [];

      // Variación aleatoria del día (± 15%)
      // Simula que unos días en casa se gasta más y otros menos
      const modificadorDiario = 1 + (Math.random() * 0.3 - 0.15);
      let objetivoTotalDiario = consumoMedioDiario * modificadorDiario;
      let totalDiarioActual = 0;

      for (let hora = 0; hora < 24; hora++) {
        // Variación horaria (± 10%) para que no todos los días sean idénticos
        const modificadorHorario = 1 + (Math.random() * 0.2 - 0.1);
        let valorHora = objetivoTotalDiario * perfilNormalizado[hora] * modificadorHorario;

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
    cabeceraFila.innerHTML = "<th>Día \\ Hora</th>";
    for (let h = 0; h < 24; h++) {
      cabeceraFila.innerHTML += `<th>${h.toString().padStart(2, "0")}:00</th>`;
    }
    cabeceraFila.innerHTML += "<th>Total Día</th>";

    // Cuerpo
    const cuerpoTabla = document.getElementById("cuerpoTabla");
    cuerpoTabla.innerHTML = "";

    for (let dia = 0; dia < simulacion.dias; dia++) {
      const fila = document.createElement("tr");
      fila.innerHTML = `<td>Día ${dia + 1}</td>`;

      let totalDiario = 0;
      for (let hora = 0; hora < 24; hora++) {
        const valorHora = simulacion.matriz[dia][hora];
        totalDiario += valorHora;

        // Color coding based on value
        let claseColor = "";
        if (valorHora > simulacion.picoMaximo * 0.7) claseColor = "valor-alto";
        else if (valorHora < simulacion.picoMaximo * 0.2) claseColor = "valor-bajo";
        else claseColor = "valor-medio";

        fila.innerHTML += `<td class="${claseColor}">${valorHora.toFixed(3)}</td>`;
      }

      fila.innerHTML += `<td><strong>${totalDiario.toFixed(2)}</strong></td>`;
      cuerpoTabla.appendChild(fila);
    }

    // Fila de totales
    const filaTotales = document.createElement("tr");
    filaTotales.style.background = "rgba(255,255,255,0.1)";
    filaTotales.innerHTML = "<td><strong>Suma Hora M.</strong></td>";
    let sumaTotalAbsoluta = 0;

    for (let h = 0; h < 24; h++) {
      let totalPorHora = 0;
      for (let d = 0; d < simulacion.dias; d++) {
        totalPorHora += simulacion.matriz[d][h];
      }
      sumaTotalAbsoluta += totalPorHora;
      filaTotales.innerHTML += `<td><strong>${totalPorHora.toFixed(2)}</strong></td>`;
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
    const cabecerasCSV = ["Dia"];
    for (let i = 0; i < 24; i++) cabecerasCSV.push(`${i}:00`);
    cabecerasCSV.push("Total_Dia");
    contenidoCSV += cabecerasCSV.join(";") + "\r\n";

    // Filas
    for (let dia = 0; dia < simulacion.dias; dia++) {
      const filaTexto = [(dia + 1).toString()];
      let sumaDia = 0;
      for (let h = 0; h < 24; h++) {
        const valorHora = simulacion.matriz[dia][h];
        filaTexto.push(valorHora.toFixed(4).replace(".", ",")); // Excel en ES usa coma para decimales
        sumaDia += valorHora;
      }
      filaTexto.push(sumaDia.toFixed(4).replace(".", ","));
      contenidoCSV += filaTexto.join(";") + "\r\n";
    }

    const uriCodificada = encodeURI(contenidoCSV);
    const enlace = document.createElement("a");
    enlace.setAttribute("href", uriCodificada);
    enlace.setAttribute("download", "simulacion_consumo.csv");
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
  }
});

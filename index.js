const apiUrl = "https://media.githubusercontent.com/media/leonellam07/Grupo_3_1003_Actividad_3_Herramientas_Visualizacion/refs/heads/main/Walmart_Sales.csv";


function csvToJson(csvText) {
    const lines = csvText.trim().split("\n");
    const headers = lines[0].split(",");

    return lines.slice(1).map(line => {
        const values = line.split(",");
        return headers.reduce((obj, header, index) => {
            obj[header.trim()] = values[index]?.trim();
            return obj;
        }, {});
    });
}


async function cargarDatos() {
    fetch(apiUrl)
        .then(response => response.text())
        .then(csv => {
            let datos = csvToJson(csv);

            // Mostrar tabla
            const tabla = $('#tabla-sales tbody');
            tabla.empty();

            datos = datos.map(sale => {
                const d = `${sale.Date}`;
                const anio = `${d.slice(6)}`;
                const mes = `${d.slice(3, 5)}`;
                const dia = `${d.slice(0, 2)}`;

                const formattedDate = `${anio}-${mes}-${dia}`;
                return { ...sale, Date: formattedDate, Periodo: `${anio}-${mes}` };
            });


            datos.sort((a, b) => a.Date - b.Date);

            datos.forEach(sale => {
                const fila = `
                            <tr>
                            <td>${sale.Store}</td>
                            <td>${sale.Date}</td>
                            <td>${sale.Weekly_Sales?.toLocaleString() ?? 'N/A'}</td>
                            <td>${sale.Holiday_Flag?.toLocaleString() ?? 'N/A'}</td>
                            <td>${sale.Temperature?.toLocaleString() ?? 'N/A'}</td>
                            <td>${sale.Fuel_Price?.toLocaleString() ?? 'N/A'}</td>
                            <td>${sale.CPI?.toLocaleString() ?? 'N/A'}</td>
                            <td>${sale.Unemployment?.toLocaleString() ?? 'N/A'}</td>
                            </tr>
                        `;
                tabla.append(fila);
            });

            // Inicializar DataTables
            $('#tabla-sales').DataTable({
                pageLength: 10,
                language: {
                    url: "https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json"
                }
            });

            dibujarGraficoVentas();
            dibujarGraficoVentasDiasFestivos();
            dibujarTreemapTop20(); // Reemplaza con `apiUrl` correcto

        })
        .catch(error => console.error('Error al cargar el CSV:', error));
}


function dibujarGraficoVentas() {
    const margin = { top: 20, right: 20, bottom: 30, left: 70 };
    const width = 1600 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const svg = d3.select("#grafico-ventas")
        .append("svg")
        .attr("width", width)
        .attr("height", height)


    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);


    d3.csv(apiUrl).then(data => {

        // Convertir strings a números y fechas
        data.forEach(d => {
            d.date = d3.timeParse("%d-%m-%Y")(d.Date);
            d.sales = +d.Weekly_Sales;
            d.store = `Tienda ${d.Store}`;
        });

        // Agrupar por tienda
        const ventasPorTienda = d3.rollups(
            data,
            v => d3.sum(v, d => d.sales),
            d => d.store
        );

        // Ordenar por ventas totales y tomar top 5
        const top5Tiendas = ventasPorTienda
            .sort((a, b) => d3.descending(a[1], b[1]))
            .slice(0, 5)
            .map(d => d[0]);

        // Filtrar solo datos de las tiendas top
        const datosFiltrados = data.filter(d => top5Tiendas.includes(d.store));

        const color = d3.scaleOrdinal()
            .domain(datosFiltrados.map(d => d.store))
            .range(d3.schemeCategory10);

        // Agrupar por tienda para graficar
        const series = d3.groups(datosFiltrados, d => d.store);

        // Escalas
        const x = d3.scaleUtc()
            .domain([datosFiltrados[0].date, datosFiltrados[datosFiltrados.length - 1].date])
            .range([margin.left, width - margin.right]);


        const y = d3.scaleLinear()
            .domain([0, d3.max(series, ([, values]) => d3.max(values, d => d.sales))])
            .nice()
            .range([height, 0]);

        // Ejes
        g.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x));

        g.append("g")
            .call(d3.axisLeft(y).ticks(height / 25))
            .call(g => g.select(".domain").remove())
            .call(g => g.selectAll(".tick line").clone()
                .attr("x2", width)
                .attr("stroke-opacity", 0.1))
            .call(g => g.append("text")
                .attr("x", -(margin.left - 20))
                .attr("y", -width - margin.left - margin.right)
                .attr("fill", "currentColor")
                .attr("text-anchor", "start")
                .text("Ventas ($)"));

        // Compute the points in pixel space as [x, y, z], where z is the name of the series.
        const points = datosFiltrados.map((d) => [x(d.date), y(d.sales), d.store]);

        // Group the points by series.
        const groups = d3.rollup(points, v => Object.assign(v, { z: v[0][2] }), d => d[2]);


        const line = d3.line();

        const path = svg.append("g")
            .attr("fill", "none")
            .attr("stroke-width", 1.5)
            .attr("stroke-linejoin", "round")
            .attr("stroke-linecap", "round")
            .selectAll("path")
            .data(groups.values())
            .join("path")
            .style("mix-blend-mode", "multiply")
            .attr("stroke", d => color(d[0][2]))
            .attr("d", line);


        // Add an invisible layer for the interactive tip.
        const dot = svg.append("g")
            .attr("display", "none");

        dot.append("circle")
            .attr("r", 2.5);

        dot.append("text")
            .attr("text-anchor", "middle")
            .attr("y", -8);

        svg
            .on("pointerenter", () => {
                path.style("mix-blend-mode", null).style("stroke", "#ddd");
                dot.attr("display", null);
            })
            .on("pointermove", (event) => {
                const [xm, ym] = d3.pointer(event);
                const i = d3.leastIndex(points, ([x, y]) => Math.hypot(x - xm, y - ym));
                const [x, y, k] = points[i];
                path.style("stroke", ({ z }) => z === k ? null : "#ddd").filter(({ z }) => z === k).raise();
                dot.attr("transform", `translate(${x},${y})`);
                dot.select("text").text(`${k}: ($) ${datosFiltrados[i].sales} - Fecha: ${formatearFecha(datosFiltrados[i].date)}`);
                svg.property("value", datosFiltrados[i]).dispatch("input", { bubbles: true });
            })
            .on("pointerleave", () => {
                path.style("mix-blend-mode", "multiply").style("stroke", null);
                dot.attr("display", "none");
                svg.node().value = null;
                svg.dispatch("input", { bubbles: true });
            })
            .on("touchstart", event => event.preventDefault());

        series.forEach(([store, values], i) => {
            let colorSpecify = color(store);

            // Leyenda
            svg.append("text")
                .attr("class", "legend")
                .attr("x", width + margin.left + 20)
                .attr("y", margin.top + i * 30)
                .attr("fill", colorSpecify)
                .text(store);
        });


    });

}

function dibujarGraficoVentasDiasFestivos() {
    const margin = { top: 20, right: 20, bottom: 30, left: 70 };
    const width = 1600 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const svg = d3.select("#grafico-dias-festivos")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    d3.csv(apiUrl).then(data => {
        // Parsear fechas y campos necesarios
        data.forEach(d => {
            const fecha = d.Date;
            const anio = fecha.slice(6);
            const mes = fecha.slice(3, 5);

            d.date = d3.timeParse("%d-%m-%Y")(d.Date);
            d.sales = +d.Weekly_Sales;
            d.store = `Tienda ${d.Store}`;
            d.periodo = `${anio}-${mes}`;
            d.holiday = d.Holiday_Flag === "1" ? "Festivo" : "No Festivo";
        });

        // Agrupar por periodo (mes) y si es festivo o no
        const ventasAgrupadas = d3.rollups(
            data,
            v => d3.sum(v, d => d.sales),
            d => d.periodo,
            d => d.holiday
        );

        // Convertir a estructura adecuada para stack()
        const datosPorMes = Array.from(ventasAgrupadas, ([periodo, valores]) => {
            const entrada = { periodo, "Festivo": 0, "No Festivo": 0 };
            valores.forEach(([holiday, ventas]) => {
                entrada[holiday] = ventas;
            });
            return entrada;
        });

        const keys = ["Festivo", "No Festivo"];

        // Stack layout
        const series = d3.stack()
            .keys(keys)
            (datosPorMes);

        // Escalas
        const x = d3.scaleBand()
            .domain(datosPorMes.map(d => d.periodo))
            .range([margin.left, width - margin.right])
            .padding(0.1);

        const y = d3.scaleLinear()
            .domain([0, d3.max(series, d => d3.max(d, d => d[1]))])
            .nice()
            .range([height - margin.bottom, margin.top]);

        const color = d3.scaleOrdinal()
            .domain(keys)
            .range(["#fca311", "#14213d"]); // colores para festivo / no festivo

        // Dibujar barras apiladas
        svg.append("g")
            .selectAll("g")
            .data(series)
            .join("g")
            .attr("fill", d => color(d.key))
            .selectAll("rect")
            .data(d => d)
            .join("rect")
            .attr("x", d => x(d.data.periodo))
            .attr("y", d => y(d[1]))
            .attr("height", d => y(d[0]) - y(d[1]))
            .attr("width", x.bandwidth())
            .append("title")
            .text(d => `Festivo: $ ${(d.data["Festivo"] || 0).toFixed(2)} \n No Festivo: $ ${(d.data["No Festivo"] || 0).toFixed(2)}`);



        // Eje X
        svg.append("g")
            .attr("transform", `translate(0,${height - margin.bottom})`)
            .call(d3.axisBottom(x).tickSizeOuter(0))
            .selectAll("text")
            .attr("transform", "rotate(-45)")
            .style("text-anchor", "end");

        // Eje Y
        svg.append("g")
            .attr("transform", `translate(${margin.left},0)`)
            .call(d3.axisLeft(y).ticks(10).tickFormat(d3.format("$.2s")))
            .call(g => g.selectAll(".domain").remove());

        // Leyenda
        const legend = svg.append("g")
            .attr("transform", `translate(${width - 150},${margin.top})`);

        keys.forEach((key, i) => {
            const g = legend.append("g").attr("transform", `translate(0, ${i * 20})`);
            g.append("rect")
                .attr("width", 15)
                .attr("height", 15)
                .attr("fill", color(key));
            g.append("text")
                .attr("x", 20)
                .attr("y", 12)
                .text(key)
                .attr("fill", "#000");

        });

        series.forEach(([serie, values], i) => {
            let colorSpecify = color(serie);

            // Leyenda
            svg.append("text")
                .attr("class", "legend")
                .attr("x", width + margin.left + 20)
                .attr("y", margin.top + i * 30)
                .attr("fill", colorSpecify)
                .text(serie.key);
        });
    });
}

function dibujarTreemapTop20() {
    const width = 800;
    const height = 300;
    const legendHeight = 60;

    const svg = d3.select("#grafico-treemap")
        .append("svg")
        .attr("viewBox", [0, 0, width, height + legendHeight])
        .attr("width", width)
        .attr("height", height + legendHeight)
        .attr("style", "max-width: 100%; height: auto; font: 10px sans-serif;");

    d3.csv(apiUrl).then(data => {
        data.forEach(d => {
            d.sales = +d.Weekly_Sales;
            d.store = `Tienda ${d.Store}`;
        });

        const ventasPorTienda = Array.from(
            d3.rollup(data, v => d3.sum(v, d => d.sales), d => d.store),
            ([store, total]) => ({ name: store, value: total })
        );

        const top20 = ventasPorTienda
            .sort((a, b) => d3.descending(a.value, b.value))
            .slice(0, 20);

        const maxVal = d3.max(top20, d => d.value);
        const minVal = d3.min(top20, d => d.value);

        const root = d3.hierarchy({ children: top20 })
            .sum(d => d.value)
            .sort((a, b) => b.value - a.value);

        d3.treemap()
            .size([width, height])
            .padding(2)(root);

        const color = d3.scaleSequential()
            .domain([minVal, maxVal])
            .interpolator(d3.interpolateBlues);

        const nodes = svg.selectAll("g")
            .data(root.leaves())
            .enter().append("g")
            .attr("transform", d => `translate(${d.x0},${d.y0})`);

        nodes.append("rect")
            .attr("width", d => d.x1 - d.x0)
            .attr("height", d => d.y1 - d.y0)
            .attr("fill", d => color(d.data.value))
            .append("title")
            .text(d => `${d.data.name}\n Ventas: $${d.data.value.toFixed(2)}`);

        nodes.append("text")
            .attr("x", 4)
            .attr("y", 14)
            .text(d => `${d.data.name}\n Ventas: $${d.data.value.toFixed(2)}`)
            .style("font-size", "5px")
            // .style("fill", "white")
            .style("pointer-events", "none");

        // Leyenda de color
        const legendWidth = 300;
        const legendX = d3.scaleLinear()
            .domain([minVal, maxVal])
            .range([0, legendWidth]);

        const legendAxis = d3.axisBottom(legendX)
            .ticks(5)
            .tickFormat(d => `$${Math.round(d / 1e6)}M`);

        const defs = svg.append("defs");
        const gradientId = "legend-gradient";

        const gradient = defs.append("linearGradient")
            .attr("id", gradientId)
            .attr("x1", "0%").attr("x2", "100%")
            .attr("y1", "0%").attr("y2", "0%");

        for (let i = 0; i <= 100; i++) {
            gradient.append("stop")
                .attr("offset", `${i}%`)
                .attr("stop-color", color(minVal + i / 100 * (maxVal - minVal)));
        }

        svg.append("g")
            .attr("transform", `translate(${(width - legendWidth) / 2}, ${height + 10})`)
            .append("rect")
            .attr("width", legendWidth)
            .attr("height", 12)
            .style("fill", `url(#${gradientId})`);

        svg.append("g")
            .style("font-size", "8px")
            .attr("transform", `translate(${(width - legendWidth) / 2}, ${height + 22})`)
            .call(legendAxis)
            .select(".domain").remove();

        svg.append("text")
            .attr("x", width / 2)
            .attr("y", height + 50)
            .attr("text-anchor", "middle")
            .style("font-size", "8px")
            .style("fill", "gray")
            .text("Total de Ventas (escala de color)");
    });
}


function formatearFecha(fecha) {
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0'); // Los meses empiezan en 0
    const anio = fecha.getFullYear();
    return `${dia}-${mes}-${anio}`;
}




cargarDatos();
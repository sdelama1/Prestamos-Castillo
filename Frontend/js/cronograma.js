// Frontend/js/cronograma.js

// Importar la URL base de la API desde config.js
// Asegúrate de que js/config.js se cargue ANTES de este script en tu HTML
const API_URL_LOANS = `${API_BASE_URL}/loans`; // Para obtener préstamos y sus cronogramas
const API_URL_CLIENTS = `${API_BASE_URL}/clients`; // Solo si en el futuro quisieras cargar clientes por separado
const API_URL_AUTH = `${API_BASE_URL}/auth`;     // Para el logout (si está en login.js no necesitas importarlo aquí)

// Asegúrate de que estas funciones existan en js/login.js y estén disponibles globalmente
// checkAuth(), logout(), showCustomModal(), closeModal(), getAuthToken()

let allLoans = []; // Para almacenar todos los préstamos cargados y evitar múltiples llamadas

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Verificar autenticación al cargar la página
    if (typeof checkAuth === 'function') {
        checkAuth();
    }

    // 2. Cargar la lista de préstamos en el select (renombrada para mayor claridad)
    await cargarPrestamosParaSelect();

    // 3. Verificar si hay un loanId en la URL (cuando se viene de prestamos.html)
    const urlParams = new URLSearchParams(window.location.search);
    const loanIdFromUrl = urlParams.get('loanId');

    if (loanIdFromUrl) {
        const clienteSelect = document.getElementById("clienteSelect");
        if (clienteSelect) {
            // Asegurarse de que la opción exista antes de intentar seleccionarla
            // Pequeño delay para asegurar que el select se haya populado
            setTimeout(() => {
                const optionExists = Array.from(clienteSelect.options).some(option => option.value === loanIdFromUrl);
                if (optionExists) {
                    clienteSelect.value = loanIdFromUrl;
                    mostrarCronograma(); // Mostrar el cronograma para el préstamo seleccionado
                } else {
                    showCustomModal("El préstamo solicitado no fue encontrado o no está disponible.", "alert");
                }
            }, 100); // Pequeño delay de 100ms
        }
    }

    // 4. Event listener para el botón de imprimir PDF
    const btnImprimir = document.getElementById('btn-imprimir-pdf');
    if (btnImprimir) {
        btnImprimir.addEventListener('click', () => {
            imprimirCronogramaPDF();
        });
    }
});

// Función para cargar préstamos en el select desde el backend (renombrada)
async function cargarPrestamosParaSelect() {
    const token = getAuthToken();
    if (!token) {
        return;
    }

    try {
        // Usar la constante API_URL_LOANS
        const response = await fetch(API_URL_LOANS, {
            method: "GET",
            headers: {
                "x-auth-token": token,
            },
        });

        const loans = await response.json();

        if (response.ok) {
            allLoans = loans; // Almacenar todos los préstamos
            const select = document.getElementById("clienteSelect");
            if (!select) return;

            select.innerHTML = '<option value="">Seleccionar préstamo...</option>'; // Cambiado el texto
            loans.forEach((loan) => {
                const option = document.createElement("option");
                option.value = loan._id; // Usar el _id de MongoDB como valor
                option.textContent = `${loan.nombreCliente} - DNI: ${loan.dniCliente} (Monto: S/.${loan.montoPrestamo.toFixed(2)})`; // Más descriptivo
                select.appendChild(option);
            });
        } else {
            showCustomModal(loans.msg || "Error al cargar la lista de préstamos.", "alert");
        }
    } catch (error) {
        console.error("Error al cargar la lista de préstamos:", error);
        showCustomModal("Error de conexión con el servidor al cargar la lista de préstamos.", "alert");
    }
}

// Función principal para mostrar el cronograma en la tabla
async function mostrarCronograma() {
    const loanId = document.getElementById("clienteSelect").value; // Cambiado de clienteId a loanId
    const cronogramaCard = document.getElementById("cronogramaCard");
    const cronogramaTableBody = document.getElementById("cronogramaTableBody");

    if (!loanId) {
        cronogramaCard.style.display = "none";
        cronogramaTableBody.innerHTML = ""; // Limpiar tabla
        return;
    }

    const token = getAuthToken();
    if (!token) {
        return;
    }

    try {
        // Obtener el préstamo específico del backend
        // Usar la constante API_URL_LOANS
        const response = await fetch(`${API_URL_LOANS}/${loanId}`, {
            method: "GET",
            headers: {
                "x-auth-token": token,
            },
        });

        const loan = await response.json();

        if (response.ok) {
            if (!loan || !loan.cronogramaPagos || loan.cronogramaPagos.length === 0) {
                showCustomModal("No se encontró cronograma de pagos para este préstamo.", 'alert');
                cronogramaCard.style.display = "none";
                cronogramaTableBody.innerHTML = "";
                return;
            }

            // Actualizar la información de resumen del préstamo
            document.getElementById("clienteInfo").textContent = `Cliente: ${loan.nombreCliente} - DNI: ${loan.dniCliente}`;
            document.getElementById("montoPrestado").textContent = `S/.${loan.montoPrestamo.toFixed(2)}`;

            let totalMontoCuota = 0;
            let totalCapital = 0;
            let totalInteres = 0;
            let cuotaMensualPromedio = 0;

            if (loan.cronogramaPagos.length > 0) {
                cuotaMensualPromedio = loan.cronogramaPagos[0].montoCuota;
                loan.cronogramaPagos.forEach(cuota => {
                    totalMontoCuota += cuota.montoCuota;
                    totalCapital += cuota.capital;
                    totalInteres += cuota.interes;
                });
            }

            document.getElementById("cuotaMensual").textContent = `S/.${cuotaMensualPromedio.toFixed(2)}`;
            document.getElementById("totalPagar").textContent = `S/.${totalMontoCuota.toFixed(2)}`;
            document.getElementById("interesTotal").textContent = `S/.${totalInteres.toFixed(2)}`;

            // Llenar la tabla del cronograma
            cronogramaTableBody.innerHTML = "";

            loan.cronogramaPagos.forEach((cuota, index) => {
                // --- CORRECCIÓN DE FECHA INICIO ---
                let fechaVencimiento;
                // El backend envía la fecha como 'fechaVencimiento', no 'fechaPago'
                if (typeof cuota.fechaVencimiento === 'string' && cuota.fechaVencimiento.includes('-')) {
                    // Para "YYYY-MM-DD" o "YYYY-MM-DDTHH:mm:ss.sssZ"
                    const dateParts = cuota.fechaVencimiento.split('T')[0].split('-');
                    // monthIndex es 0-based (enero es 0), por eso restamos 1 a dateParts[1]
                    fechaVencimiento = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
                } else {
                    // Para otros formatos o si ya es un objeto Date
                    fechaVencimiento = new Date(cuota.fechaVencimiento);
                }
                // Asegurarse de normalizar la fecha a inicio del día para comparaciones precisas
                fechaVencimiento.setHours(0, 0, 0, 0);
                // --- CORRECCIÓN DE FECHA FIN ---

                const hoy = new Date();
                hoy.setHours(0, 0, 0, 0); // Normalizar hoy a inicio del día

                let estadoClase = `estado-${cuota.estado.toLowerCase()}`;
                let estadoTexto = cuota.estado;

                // Lógica para estado "VENCIDA" (si la cuota está pendiente y la fecha ya pasó)
                // Esto se superpondrá al estado original si es necesario
                if (cuota.estado.toLowerCase() === "pendiente" && fechaVencimiento < hoy) {
                    estadoClase = "estado-vencida"; // Sobrescribir para que solo aplique vencida
                    estadoTexto = "VENCIDA";
                }

                // Aquí puedes agregar más lógica de color si el backend no lo maneja
                // Por ejemplo: si cuota.montoMora > 0, añadir una clase.
                // Pero lo ideal es que el backend ya envíe el estado "Vencida" si corresponde.

                const row = document.createElement("tr");
                row.innerHTML = `
                    <td>${cuota.cuota}</td>
                    <td>${fechaVencimiento.toLocaleDateString('es-PE')}</td>
                    <td>S/.${cuota.montoCuota.toFixed(2)}</td>
                    <td>S/.${cuota.capital.toFixed(2)}</td>
                    <td>S/.${cuota.interes.toFixed(2)}</td>
                    <td>S/.${cuota.saldoPendiente.toFixed(2)}</td>
                    <td>
                        <span class="${estadoClase}">
                            ${estadoTexto}
                        </span>
                    </td>
                    <td>
                        <!-- eliminado -->
                    </td>
                `;
                cronogramaTableBody.appendChild(row);
            });

            // Fila resumen al final
            const resumenRow = document.createElement("tr");
            resumenRow.innerHTML = `
                <td colspan="2"><strong>Totales</strong></td>
                <td><strong>S/.${totalMontoCuota.toFixed(2)}</strong></td>
                <td><strong>S/.${totalCapital.toFixed(2)}</strong></td>
                <td><strong>S/.${totalInteres.toFixed(2)}</strong></td>
                <td><strong>S/.${loan.cronogramaPagos[loan.cronogramaPagos.length - 1].saldoPendiente.toFixed(2)}</strong></td>
                <td colspan="2"></td>
            `;
            cronogramaTableBody.appendChild(resumenRow);

            cronogramaCard.style.display = "block";
        } else {
            showCustomModal(loan.msg || "Error al obtener el cronograma del préstamo.", "alert");
            cronogramaCard.style.display = "none";
            cronogramaTableBody.innerHTML = "";
        }
    } catch (error) {
        console.error("Error al obtener el cronograma del préstamo:", error);
        showCustomModal("Error de conexión con el servidor al obtener el cronograma.", "alert");
        cronogramaCard.style.display = "none";
        cronogramaTableBody.innerHTML = "";
    }
}

// Marcar cuota como pagada o pendiente (actualiza en el backend)
async function marcarCuota(loanId, cuotaIndex, newStatus) {
    // Aquí es importante recordar que cuotaIndex debe ser el índice del array (0-based)
    // El 'cuota.cuota' en el HTML es 1-based. Por eso se envía 'cuota.cuota - 1'
    const confirmacion = await showCustomModal(`¿Desea marcar esta cuota como ${newStatus}?`, 'confirm');
    if (!confirmacion) {
        return;
    }

    const token = getAuthToken();
    if (!token) {
        await showCustomModal("No estás autenticado. Por favor, inicia sesión.", "alert");
        logout();
        return;
    }

    try {
        // La ruta del backend espera el ID de la cuota (paymentScheduleItem._id)
        // O si estás usando el índice en el array del backend, el índice correcto.
        // Asumiendo que el backend espera el índice basado en 0:
        const response = await fetch(`${API_URL_LOANS}/${loanId}/payments/${cuotaIndex}/status`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "x-auth-token": token,
            },
            body: JSON.stringify({ status: newStatus }),
        });

        const data = await response.json();

        if (response.ok) {
            await showCustomModal(data.msg || `Cuota marcada como ${newStatus.toLowerCase()}.`, 'alert');
            mostrarCronograma(); // Recargar el cronograma para ver los cambios
        } else {
            await showCustomModal(data.msg || "Error al actualizar el estado de la cuota.", 'alert');
        }
    } catch (error) {
        console.error("Error al actualizar la cuota:", error);
        await showCustomModal("Error de conexión con el servidor al actualizar la cuota.", 'alert');
    }
}

// Función para imprimir el cronograma en PDF
function imprimirCronogramaPDF() {
    const element = document.getElementById('cronograma-printable');
    const clienteInfo = document.getElementById('clienteInfo').textContent;
    const filename = `cronograma_pagos_${clienteInfo.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    const options = {
        margin: [10, 10, 10, 10],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            logging: true,
            useCORS: true,
            scrollY: 0,
            windowWidth: document.documentElement.offsetWidth,
            windowHeight: document.documentElement.offsetHeight
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    const pdfContent = document.createElement('div');
    pdfContent.style.width = '210mm';

    pdfContent.innerHTML = `
        <h1 style="text-align: center; color: #667eea; margin-top: 0; padding-top: 0;">Cronograma de Pagos</h1>
        <p style="text-align: center; margin-bottom: 20px;">${clienteInfo}</p>
    `;
    const printableClone = element.cloneNode(true);

    const table = printableClone.querySelector('table');
    if (table) {
        let accionIndex = -1;
        const headerRow = table.querySelector('thead tr');
        if (headerRow) {
            const ths = Array.from(headerRow.querySelectorAll('th'));
            accionIndex = ths.findIndex(th => th.textContent.trim() === 'Acción');
            if (accionIndex !== -1) {
                ths[accionIndex].remove();
            }
        }

        const bodyRows = table.querySelectorAll('tbody tr');
        bodyRows.forEach(row => {
            const tds = Array.from(row.querySelectorAll('td'));
            if (accionIndex !== -1 && tds.length > accionIndex && !tds[accionIndex].hasAttribute('colspan')) {
                tds[accionIndex].remove();
            }
        });

        if (accionIndex !== -1) {
            const lastRow = table.querySelector('tbody tr:last-child');
            if (lastRow) {
                const colspanTd = lastRow.querySelector('td[colspan]');
                if (colspanTd) {
                    let currentColspan = parseInt(colspanTd.getAttribute('colspan'));
                    if (!isNaN(currentColspan) && currentColspan > 0) {
                        colspanTd.setAttribute('colspan', currentColspan - 1);
                    }
                }
            }
        }
    }
    printableClone.style.marginTop = '0';
    printableClone.style.paddingTop = '0';
    pdfContent.appendChild(printableClone);

    html2pdf().set(options).from(pdfContent).save();
}

// Asegúrate de que `logout` y `checkAuth` estén definidos en `login.js` y sean globales
// o importados de alguna manera. Si no, necesitarás definirlos aquí o importarlos correctamente.
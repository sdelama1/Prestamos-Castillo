// Frontend/js/prestamos.js

// Importar la URL base de la API desde config.js
// Asegúrate de que js/config.js se cargue ANTES de este script en tu HTML
const API_URL_LOANS = `${API_BASE_URL}/loans`; // Definida en config.js
// --- NUEVA CONSTANTE: URL para los endpoints de DNI/RUC en TU BACKEND ---
const API_URL_EXTERNAL = `${API_BASE_URL}/external`; // Define el prefijo para las rutas de API externas en tu backend

// Asegúrate de que estas funciones existan en js/login.js y estén disponibles globalmente
// checkAuth(), logout(), showCustomModal(), closeModal(), getAuthToken()

document.addEventListener("DOMContentLoaded", () => {
    // 1. Verificar autenticación al cargar la página
    checkAuth(); // Esta función debe estar definida en login.js para proteger la ruta

    const prestamoForm = document.getElementById("prestamoForm");
    const formaPagoSelect = document.getElementById("formaPago");
    const diaFijoGroup = document.getElementById("diaFijoGroup");
    const diaFijoInput = document.getElementById("diaFijo");
    const prestamosTableBody = document.getElementById("prestamosTableBody");
    const fechaInput = document.getElementById("fecha");

    // --- NUEVAS REFERENCIAS PARA LOS CAMPOS DNI/RUC Y NOMBRE ---
    const dniRucInput = document.getElementById("dni");
    const nombreClienteInput = document.getElementById("nombre");

    // Establecer la fecha actual por defecto en el input de fecha
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0'); // Meses son 0-index
    const day = String(today.getDate()).padStart(2, '0');
    fechaInput.value = `${year}-${month}-${day}`;

    // 2. Manejar la visibilidad del campo "Día Fijo de Pago"
    formaPagoSelect.addEventListener("change", () => {
        if (formaPagoSelect.value === "fecha_fija") {
            diaFijoGroup.style.display = "block";
            diaFijoInput.setAttribute("required", "true");
        } else {
            diaFijoGroup.style.display = "none";
            diaFijoInput.removeAttribute("required");
            diaFijoInput.value = ""; // Limpiar el valor cuando se oculta
        }
    });

    // Disparar el evento change al cargar para establecer el estado inicial
    formaPagoSelect.dispatchEvent(new Event('change'));

    // --- INICIO: LÓGICA DE INTEGRACIÓN DE API DNI/RUC (AHORA LLAMA A TU BACKEND) ---
    dniRucInput.addEventListener("blur", async () => {
        const numero = dniRucInput.value.trim();
        // Solo consultar si la longitud es la de un DNI (8) o RUC (11)
        if (numero.length === 8 || numero.length === 11) {
            await consultarDniRuc(numero);
        } else if (numero.length > 0) {
            // Opcional: mostrar un mensaje si la longitud es incorrecta
            showCustomModal("Por favor, ingrese un DNI de 8 dígitos o un RUC de 11 dígitos.", "alert");
            nombreClienteInput.value = ""; // Limpiar el campo si el número es inválido
        }
    });

    dniRucInput.addEventListener("keypress", async (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); // Evita el envío del formulario si hay uno
            const numero = dniRucInput.value.trim();
            if (numero.length === 8 || numero.length === 11) {
                await consultarDniRuc(numero);
            } else if (numero.length > 0) {
                showCustomModal("Por favor, ingrese un DNI de 8 dígitos o un RUC de 11 dígitos.", "alert");
                nombreClienteInput.value = "";
            }
        }
    });

    async function consultarDniRuc(numero) {
        nombreClienteInput.value = "Consultando..."; // Mensaje temporal
        nombreClienteInput.disabled = true; // Deshabilitar mientras consulta
        nombreClienteInput.style.backgroundColor = '#e9ecef'; // Estilo para indicar que está deshabilitado

        try {
            let url;
            if (numero.length === 8) {
                url = `${API_URL_EXTERNAL}/dni/${numero}`; // Llama a tu endpoint de DNI en tu backend
            } else if (numero.length === 11) {
                url = `${API_URL_EXTERNAL}/ruc/${numero}`; // Llama a tu endpoint de RUC en tu backend
            } else {
                // Esta condición ya se maneja en los event listeners, pero es una buena salvaguarda
                showCustomModal("Número de DNI/RUC inválido.", "alert");
                nombreClienteInput.value = "";
                return;
            }

            const response = await fetch(url);
            const result = await response.json(); // La respuesta ya incluye success, msg, y los datos

            if (response.ok && result.success) {
                if (numero.length === 8) { // Es un DNI
                    // Tu backend ya te devuelve nombreCompleto
                    nombreClienteInput.value = result.nombreCompleto || "";
                } else { // Es un RUC
                    nombreClienteInput.value = result.razonSocial || "";
                }
            } else {
                // Si la respuesta no es OK o success es false
                showCustomModal(result.msg || "No se pudo obtener información del DNI/RUC. Intente nuevamente.", "alert");
                nombreClienteInput.value = ""; // Limpiar el campo si no se encuentra o hay error
            }
        } catch (error) {
            console.error("Error al consultar DNI/RUC a través del backend:", error);
            showCustomModal("Error de conexión al consultar DNI/RUC. Verifique su conexión o el servidor.", "alert");
            nombreClienteInput.value = ""; // Limpiar en caso de error grave
        } finally {
            nombreClienteInput.disabled = false; // Habilitar el campo nuevamente
            nombreClienteInput.style.backgroundColor = ''; // Restablecer estilo
            // Si el nombre no se autocompletó, el usuario puede ingresarlo manualmente
            if (nombreClienteInput.value === "") {
                nombreClienteInput.focus();
            }
        }
    }
    // --- FIN: LÓGICA DE INTEGRACIÓN DE API DNI/RUC ---


    // 3. Manejar el envío del formulario de registro de préstamo
    if (prestamoForm) {
        prestamoForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const token = getAuthToken(); // Obtener el token JWT del localStorage
            if (!token) {
                showCustomModal("No estás autenticado. Por favor, inicia sesión.", "alert");
                logout(); // Redirigir al login
                return;
            }

            // Recolectar datos del formulario
            // Asegúrate de usar las referencias a los inputs para obtener los valores actuales
            const dniCliente = dniRucInput.value;
            const nombreCliente = nombreClienteInput.value;
            const montoPrestamo = parseFloat(document.getElementById("monto").value);
            const plazoMeses = parseInt(document.getElementById("cuotas").value);
            // La tasaInteresAnual se envía tal cual el usuario la ingresa (ej. 10 para 10%)
            const tasaInteresAnual = parseFloat(document.getElementById("interes").value);
            const fechaPrestamo = document.getElementById("fecha").value;
            const frecuenciaPago = formaPagoSelect.value;
            let diaFijoPago = null;

            if (frecuenciaPago === "fecha_fija") {
                diaFijoPago = parseInt(diaFijoInput.value);
                if (isNaN(diaFijoPago) || diaFijoPago < 1 || diaFijoPago > 31) {
                    showCustomModal("Por favor, ingresa un día fijo de pago válido (1-31).", "alert");
                    return;
                }
            }

            try {
                // Usar la constante API_URL_LOANS
                const response = await fetch(`${API_URL_LOANS}/register`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-auth-token": token,
                    },
                    body: JSON.stringify({
                        dniCliente,
                        nombreCliente,
                        montoPrestamo,
                        plazoMeses,
                        tasaInteresAnual, // Se envía el valor del input, el backend lo convertirá a decimal
                        fechaPrestamo,
                        frecuenciaPago,
                        diaFijoPago,
                    }),
                });

                const data = await response.json();

                if (response.ok) {
                    showCustomModal(data.msg || "Préstamo registrado con éxito.", "alert");
                    prestamoForm.reset(); // Limpiar el formulario
                    // Volver a establecer la fecha actual después de resetear
                    fechaInput.value = `${year}-${month}-${day}`;
                    formaPagoSelect.dispatchEvent(new Event('change')); // Resetear visibilidad del día fijo
                    cargarPrestamos(); // Recargar la tabla de préstamos
                } else {
                    showCustomModal(data.msg || "Error al registrar el préstamo.", "alert");
                }
            } catch (error) {
                console.error("Error al registrar el préstamo:", error);
                showCustomModal("Error de conexión con el servidor al registrar el préstamo.", "alert");
            }
        });
    }

    // 4. Función para cargar y mostrar los préstamos registrados
    async function cargarPrestamos() {
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
                // allLoans = loans; // Esta variable no se usa en prestamos.js, es de cronograma.js
                prestamosTableBody.innerHTML = ""; // Limpiar la tabla antes de añadir nuevos datos
                loans.forEach((loan) => {
                    const row = prestamosTableBody.insertRow();
                    row.insertCell().textContent = loan.dniCliente;
                    row.insertCell().textContent = loan.nombreCliente;
                    row.insertCell().textContent = `S/. ${loan.montoPrestamo.toFixed(2)}`;
                    row.insertCell().textContent = loan.plazoMeses;
                    // --- CORRECCIÓN AQUÍ ---
                    // Asumiendo que el backend ahora enviará la tasa como decimal (ej. 0.10 para 10%)
                    row.insertCell().textContent = `${(loan.tasaInteresAnual * 100).toFixed(2)}%`; 
                    // Si el backend sigue enviando '10' para 10%, entonces debería ser:
                    // row.insertCell().textContent = `${loan.tasaInteresAnual.toFixed(2)}%`;
                    // Pero la solución robusta es que el backend lo guarde como decimal.
                    // --- FIN CORRECCIÓN ---
                    row.insertCell().textContent = new Date(loan.fechaPrestamo).toLocaleDateString();
                    // Formatear la frecuencia de pago para mostrarla de forma legible
                    let displayFrecuencia = loan.frecuenciaPago.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    if (loan.frecuenciaPago === "fecha_fija" && loan.diaFijoPago) {
                        displayFrecuencia += ` (Día ${loan.diaFijoPago})`;
                    }
                    row.insertCell().textContent = displayFrecuencia;

                    // Botones de acción (ej. Ver Cronograma)
                    const actionsCell = row.insertCell();
                    const viewButton = document.createElement("button");
                    viewButton.textContent = "Ver Cronograma";
                    viewButton.className = "btn-small btn-info";
                    viewButton.onclick = () => {
                        // Redirigir a cronograma.html con el ID del préstamo
                        window.location.href = `cronograma.html?loanId=${loan._id}`;
                    };
                    actionsCell.appendChild(viewButton);
                });
            } else {
                showCustomModal(loans.msg || "Error al cargar los préstamos.", "alert");
            }
        } catch (error) {
            console.error("Error al cargar los préstamos:", error);
            showCustomModal("Error de conexión con el servidor al cargar los préstamos.", "alert");
        }
    }

    // Cargar los préstamos al iniciar la página
    cargarPrestamos();
});
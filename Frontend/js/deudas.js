// js/deudas.js

// Importar la URL base de la API (asume que config.js ya la define)
const API_URL_LOANS = `${API_BASE_URL}/loans`;
const API_URL_AUTH = `${API_BASE_URL}/auth`;
const API_URL_PAYMENTS = `${API_BASE_URL}/payments`; // <-- ¡NUEVA URL PARA PAGOS!

// Función para obtener el token JWT del localStorage
function getToken() {
    return localStorage.getItem('token');
}

// Lógica de Modales (Mantenida, pero adaptada para el nuevo flujo)
const customModal = document.getElementById('customModal');
const modalMessage = document.getElementById('modalMessage');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalAlertBtn = document.getElementById('modalAlertBtn');

const closeCustomModalButton = document.getElementById('closeCustomModalButton');
const closePagoModalButton = document.getElementById('closePagoModalButton');
const closeComprobanteModalButton = document.getElementById('closeComprobanteModalButton'); // Asegúrate que este elemento exista en tu HTML

function showCustomModal(message, type = 'alert', onConfirm = null) {
    modalMessage.textContent = message;
    modalConfirmBtn.style.display = 'none';
    modalCancelBtn.style.display = 'none';
    modalAlertBtn.style.display = 'none';

    return new Promise((resolve) => {
        if (type === 'confirm') {
            modalConfirmBtn.style.display = 'inline-block';
            modalCancelBtn.style.display = 'inline-block';
            modalConfirmBtn.onclick = () => {
                closeModal();
                resolve(true);
            };
            modalCancelBtn.onclick = () => {
                closeModal();
                resolve(false);
            };
        } else { // 'alert'
            modalAlertBtn.style.display = 'inline-block';
            modalAlertBtn.onclick = () => {
                closeModal();
                resolve(true);
            };
        }
        customModal.style.display = 'flex';
    });
}

function closeModal() {
    customModal.style.display = 'none';
    modalConfirmBtn.onclick = null;
    modalCancelBtn.onclick = null;
    modalAlertBtn.onclick = null;
}

document.addEventListener("DOMContentLoaded", () => {
    if (typeof checkAuth === 'function') {
        checkAuth();
    }

    cargarDeudas('currentMonth');

    const metodoPagoSelect = document.getElementById('metodoPago');
    const tarjetaDetails = document.getElementById('tarjetaDetails');
    const billeteraDigitalDetails = document.getElementById('billeteraDigitalDetails');
    const paypalDetails = document.getElementById('paypalDetails'); // <-- Nuevo div para PayPal si necesitas info extra

    metodoPagoSelect.addEventListener('change', () => {
        tarjetaDetails.style.display = 'none';
        billeteraDigitalDetails.style.display = 'none';
        if (paypalDetails) paypalDetails.style.display = 'none'; // Ocultar si existe

        document.getElementById('numeroTarjeta').value = '';
        document.getElementById('nombreTarjeta').value = '';
        document.getElementById('tipoBilletera').value = '';
        document.getElementById('numeroBilletera').value = '';
        // Puedes agregar más reseteo para PayPal si agregas campos

        if (metodoPagoSelect.value === 'Tarjeta') {
            tarjetaDetails.style.display = 'block';
        } else if (metodoPagoSelect.value === 'Billetera Digital') {
            billeteraDigitalDetails.style.display = 'block';
        } else if (metodoPagoSelect.value === 'PayPal') { // Aquí manejamos PayPal
            if (paypalDetails) paypalDetails.style.display = 'block';
            // No se necesita pedir datos adicionales aquí, el pago se gestiona en PayPal
            // Podrías poner un mensaje tipo "Serás redirigido a PayPal para completar el pago."
        }
    });

    if (closeCustomModalButton) {
        closeCustomModalButton.addEventListener('click', closeModal);
    }
    if (closePagoModalButton) {
        closePagoModalButton.addEventListener('click', closePagoModal);
    }
    if (closeComprobanteModalButton) {
        closeComprobanteModalButton.addEventListener('click', closeComprobanteModal);
    }
});

let currentLoadedDebts = [];
let currentDebtCategory = 'currentMonth';

async function cargarDeudas(type) {
    const tbody = document.getElementById("deudasTableBody");
    const tableTitle = document.getElementById("tableTitle");
    const noDebtsMessage = document.getElementById("noDebtsMessage");
    tbody.innerHTML = "";
    noDebtsMessage.style.display = 'none';

    currentDebtCategory = type;

    let endpoint = '';
    let title = '';

    switch (type) {
        case 'currentMonth':
            endpoint = `${API_URL_LOANS}/debts/current-month`;
            title = 'Cuotas del Mes Actual';
            break;
        case 'overdue':
            endpoint = `${API_URL_LOANS}/debts/overdue`;
            title = 'Cuotas Vencidas';
            break;
        case 'upcoming':
            endpoint = `${API_URL_LOANS}/debts/upcoming`;
            title = 'Cuotas Próximas a Vencer (Semana)';
            break;
        default:
            await showCustomModal("Tipo de deuda no reconocido.", 'alert');
            return;
    }

    tableTitle.textContent = title;

    try {
        const token = getToken();
        const response = await fetch(endpoint, {
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                await showCustomModal("Su sesión ha expirado o no está autorizado. Por favor, inicie sesión nuevamente.", 'alert');
                logout();
                return;
            }
            const errorData = await response.json();
            throw new Error(errorData.msg || `Error al cargar deudas: ${response.statusText}`);
        }

        currentLoadedDebts = await response.json();
        if (currentLoadedDebts.length === 0) {
            noDebtsMessage.style.display = 'block';
            return;
        }

        currentLoadedDebts.forEach(cuotaInfo => {
            const row = document.createElement("tr");

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let fechaVencimiento;
            if (typeof cuotaInfo.fechaVencimiento === 'string' && cuotaInfo.fechaVencimiento.includes('-')) {
                const dateParts = cuotaInfo.fechaVencimiento.split('T')[0].split('-');
                fechaVencimiento = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
            } else {
                fechaVencimiento = new Date(cuotaInfo.fechaVencimiento);
            }
            fechaVencimiento.setHours(0, 0, 0, 0);

            const interesMoratorio = cuotaInfo.montoMora || 0;
            const montoTotalAPagar = cuotaInfo.montoCuota + interesMoratorio;

            let estadoClase = '';
            let estadoTexto = cuotaInfo.estado;

            if (cuotaInfo.estado === "Pagada") {
                estadoClase = "estado-pagada";
                estadoTexto = "PAGADA";
            } else if (fechaVencimiento < today) {
                estadoClase = "estado-vencida";
                estadoTexto = "VENCIDA";
            } else if (fechaVencimiento.toDateString() === today.toDateString()) {
                estadoClase = "estado-vence-hoy";
                estadoTexto = "VENCE HOY!";
            } else {
                const dayOfWeek = fechaVencimiento.getDay();
                const currentDayOfWeek = today.getDay();
                const diffToMonday = currentDayOfWeek === 0 ? -6 : -(currentDayOfWeek - 1);
                const startOfCurrentWorkingWeek = new Date(today);
                startOfCurrentWorkingWeek.setDate(today.getDate() + diffToMonday);
                startOfCurrentWorkingWeek.setHours(0,0,0,0);

                const endOfCurrentWorkingWeek = new Date(startOfCurrentWorkingWeek);
                endOfCurrentWorkingWeek.setDate(startOfCurrentWorkingWeek.getDate() + 4);
                endOfCurrentWorkingWeek.setHours(23,59,59,999);

                if (cuotaInfo.estado === "Pendiente" &&
                    fechaVencimiento >= startOfCurrentWorkingWeek &&
                    fechaVencimiento <= endOfCurrentWorkingWeek &&
                    dayOfWeek >= 1 && dayOfWeek <= 5) {
                    estadoClase = "estado-por-vencer-semana";
                    estadoTexto = "Por Vencer (Semana)";
                } else {
                    estadoClase = "estado-pendiente";
                    estadoTexto = "PENDIENTE";
                }
            }

            row.innerHTML = `
                <td>${cuotaInfo.nombreCliente}</td>
                <td>${cuotaInfo.dniCliente}</td>
                <td>${cuotaInfo.cuota}</td>
                <td>${fechaVencimiento.toLocaleDateString('es-PE')}</td>
                <td>S/.${cuotaInfo.montoCuota.toFixed(2)}</td>
                <td>S/.${interesMoratorio.toFixed(2)}</td>
                <td>S/.${montoTotalAPagar.toFixed(2)}</td>
                <td><span class="${estadoClase}">${estadoTexto}</span></td>
                <td>
                    ${cuotaInfo.estado !== "Pagada"
? `
    <button class="btn-success" onclick="abrirModalPago('${cuotaInfo.loanId}', '${cuotaInfo.cuotaId}', '${cuotaInfo.nombreCliente}', ${montoTotalAPagar.toFixed(2)})">Registrar Pago</button>
`
: `<button class="btn-secondary" disabled>Pagado</button>`}
                </td>
            `;
            tbody.appendChild(row);
        });

    } catch (err) {
        console.error("Error al cargar las deudas:", err);
        await showCustomModal(err.message, 'alert');
    }
}

// --- Lógica del Modal de Pago ---
let currentPagoData = {};

function abrirModalPago(loanId, cuotaId, clienteNombre, montoAPagar) {
    currentPagoData = { loanId, cuotaId, clienteNombre, montoAPagar };

    document.getElementById('pagoClienteNombre').textContent = clienteNombre;
    document.getElementById('pagoCuotaNumero').textContent = currentLoadedDebts.find(d => d.cuotaId === cuotaId)?.cuota || 'N/A';
    document.getElementById('pagoMonto').textContent = `S/.${montoAPagar.toFixed(2)}`;

    const metodoPagoSelect = document.getElementById('metodoPago');
    const tarjetaDetails = document.getElementById('tarjetaDetails');
    const billeteraDigitalDetails = document.getElementById('billeteraDigitalDetails');
    const paypalDetails = document.getElementById('paypalDetails'); // Referencia al nuevo div

    metodoPagoSelect.value = "";
    tarjetaDetails.style.display = 'none';
    billeteraDigitalDetails.style.display = 'none';
    if (paypalDetails) paypalDetails.style.display = 'none'; // Asegurarse de ocultar al abrir
    document.getElementById('numeroTarjeta').value = '';
    document.getElementById('nombreTarjeta').value = '';
    document.getElementById('tipoBilletera').value = '';
    document.getElementById('numeroBilletera').value = '';

    document.getElementById('pagoModal').style.display = 'flex';
}

function closePagoModal() {
    document.getElementById('pagoModal').style.display = 'none';
    // currentPagoData = {}; // <-- ¡Esta línea ha sido comentada/eliminada!
}

async function confirmarPago() {
    const metodoPago = document.getElementById('metodoPago').value;
    if (!metodoPago) {
        await showCustomModal("Por favor, selecciona un método de pago.", 'alert');
        return;
    }

    // Extrae los datos NECESARIOS de currentPagoData ANTES de cerrar el modal
    const { loanId, cuotaId, montoAPagar } = currentPagoData; // Mueve esta línea aquí

    if (metodoPago === 'PayPal') {
        // Si el método es PayPal, llamamos a la función dedicada
        closePagoModal(); // Cerrar el modal de pago manual (ahora no resetea currentPagoData)
        await handlePayWithPaypal(loanId, cuotaId); // Usa las variables locales que ya extrajimos
        return; // Salir de la función para evitar el flujo de pago manual
    }

    // Lógica para otros métodos de pago (Efectivo, Tarjeta, Billetera Digital)
    let detallesPago = {};
    if (metodoPago === 'Tarjeta') {
        const numeroTarjeta = document.getElementById('numeroTarjeta').value;
        const nombreTarjeta = document.getElementById('nombreTarjeta').value;
        if (!numeroTarjeta || !nombreTarjeta) {
            await showCustomModal("Por favor, completa los últimos 4 dígitos de la tarjeta y el nombre.", 'alert');
            return;
        }
        detallesPago = { numeroTarjeta, nombreTarjeta };
    } else if (metodoPago === 'Billetera Digital') {
        const tipoBilletera = document.getElementById('tipoBilletera').value;
        const numeroBilletera = document.getElementById('numeroBilletera').value;
        if (!tipoBilletera || !numeroBilletera) {
            await showCustomModal("Por favor, completa el tipo y número/ID de la billetera digital.", 'alert');
            return;
        }
        detallesPago = { tipoBilletera, numeroBilletera };
    }

    // Las variables loanId, cuotaId, montoAPagar ya están disponibles aquí.
    const token = getToken();

    try {
        const response = await fetch(`${API_URL_LOANS}/${loanId}/pay-installment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token
            },
            body: JSON.stringify({
                cuotaId: cuotaId,
                montoPagado: montoAPagar,
                medioPago: metodoPago,
                ...(metodoPago === 'Tarjeta' && { tarjeta: { ultimosDigitos: detallesPago.numeroTarjeta, nombre: detallesPago.nombreTarjeta } }),
                ...(metodoPago === 'Billetera Digital' && { billetera: { tipo: detallesPago.tipoBilletera, numero: detallesPago.numeroBilletera } })
            })
        });

        const data = await response.json();

        if (!response.ok) {
            if (response.status === 401) {
                await showCustomModal("Su sesión ha expirado o no está autorizado. Por favor, inicie sesión nuevamente.", 'alert');
                logout();
                return;
            }
            throw new Error(data.msg || "Error al registrar el pago.");
        }

        closePagoModal();
        closeModal(); // Asegura que el customModal esté cerrado

        // =========================================================================
        // ¡¡¡ CORRECCIÓN CRÍTICA AQUÍ !!!
        // Asegúrate de que comprobanteData realmente contenga loanId y cuotaId.
        // Si tu backend no los devuelve dentro de data.comprobante, necesitarás
        // pasarlos explícitamente o modificar tu backend.
        // Aquí se asume que data.comprobante ya los incluye o se los añadimos.
        // =========================================================================
        const comprobanteCompleto = {
            ...data.comprobante, // Propiedades que vienen del backend
            loanId: loanId,      // Añade loanId que ya tienes
            cuotaId: cuotaId     // Añade cuotaId que ya tienes
        };

        console.log("DEBUG: Datos de comprobante enviados a generarComprobante:", comprobanteCompleto); // Para depuración
        generarComprobante(comprobanteCompleto, { // Usamos el objeto comprobanteCompleto
            tipoBilletera: detallesPago.tipoBilletera || '',
            numeroBilletera: detallesPago.numeroBilletera || '',
            numeroTarjeta: detallesPago.numeroTarjeta || '',
            nombreTarjeta: detallesPago.nombreTarjeta || ''
        });

        cargarDeudas(currentDebtCategory);

    } catch (err) {
        console.error("Error al confirmar pago:", err);
        await showCustomModal(err.message, 'alert');
    }
}


// --- FUNCIÓN PARA PAYPAL (ÚNICA DEFINICIÓN) ---
async function handlePayWithPaypal(loanId, cuotaId) {
    try {
        const token = getToken();
        if (!token) {
            await showCustomModal("No autenticado. Por favor, inicie sesión.", 'alert');
            logout();
            return;
        }

        // Puedes mostrar un mensaje al usuario aquí, como "Redirigiendo a PayPal..."
        await showCustomModal("Redirigiendo a PayPal para completar el pago...", 'alert');
        closeModal(); // Asegurarse de cerrar el modal de alerta rápidamente.

        // Añadido para depuración, puedes quitarlo después
        console.log("DEBUG: handlePayWithPaypal se llama con - loanId:", loanId, "cuotaId:", cuotaId);

        const response = await fetch(`${API_URL_PAYMENTS}/paypal/create-order/${loanId}/${cuotaId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token
            },
        });

        const data = await response.json();

        if (response.ok && data.approveUrl) {
            window.location.href = data.approveUrl; // Redirige al usuario a PayPal
        } else {
            // alert(`Error al iniciar pago con PayPal: ${data.msg || 'Error desconocido'}`); // Eliminado, ya se usa showCustomModal
            console.error("Error al crear orden de PayPal:", data);
            await showCustomModal(`Error al iniciar pago con PayPal: ${data.msg || 'Error desconocido'}`, 'alert');
        }

    } catch (error) {
        console.error('Error en handlePayWithPaypal:', error);
        await showCustomModal('Error de conexión al intentar pagar con PayPal.', 'alert');
    }
}

// --- Lógica del Comprobante de Pago ---
function generarComprobante(comprobanteData, localPaymentDetails = {}) {
    const comprobanteContentDiv = document.getElementById('comprobanteContent');
    if (!comprobanteContentDiv) return;

    closeModal(); // Cierra explícitamente el customModal

    // =========================================================================
    // ¡¡¡ CORRECCIÓN EN LA VERIFICACIÓN DE SUBSTRING Y ACCESO A PROPIEDADES !!!
    // Aseguramos que loanId y cuotaId existan antes de llamar a substring.
    // Usamos el operador de encadenamiento opcional (?.) para mayor seguridad.
    // =========================================================================
    const loanIdShort = comprobanteData.loanId ? comprobanteData.loanId.substring(0, 8) : 'N/A';
    const cuotaIdShort = comprobanteData.cuotaId ? comprobanteData.cuotaId.substring(0, 8) : 'N/A';


    const fechaPago = new Date(comprobanteData.fechaPagoReal).toLocaleDateString('es-PE', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const fechaVencimientoOriginal = new Date(comprobanteData.fechaVencimientoOriginal).toLocaleDateString('es-PE');

    let detallesPagoHTML = '';
    if (comprobanteData.medioPago === 'Tarjeta' && localPaymentDetails.numeroTarjeta) {
        detallesPagoHTML = `
            <p><strong>Número de Tarjeta:</strong> **** **** **** ${localPaymentDetails.numeroTarjeta}</p>
            <p><strong>Nombre en Tarjeta:</strong> ${localPaymentDetails.nombreTarjeta}</p>
        `;
    } else if (comprobanteData.medioPago === 'Billetera Digital' && localPaymentDetails.tipoBilletera) {
        detallesPagoHTML = `
            <p><strong>Tipo de Billetera:</strong> ${localPaymentDetails.tipoBilletera}</p>
            <p><strong>ID/Número Transacción:</strong> ${localPaymentDetails.numeroBilletera}</p>
        `;
    } else if (comprobanteData.medioPago === 'PayPal' && comprobanteData.paypalTransactionId) { // Mostrar ID de PayPal si existe
        detallesPagoHTML = `
            <p><strong>ID de Transacción PayPal:</strong> ${comprobanteData.paypalTransactionId}</p>
        `;
    }

    comprobanteContentDiv.innerHTML = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 600px; margin: 20px auto; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <h2 style="text-align: center; color: #667eea; margin-bottom: 20px;">COMPROBANTE DE PAGO</h2>
            <p style="text-align: center; font-size: 0.9em; color: #666;">Préstamos Castillo - RUC: 20XXXXXXXXX</p>
            <hr style="border: 0; border-top: 1px dashed #ccc; margin: 20px 0;">

            <p><strong>Fecha de Pago:</strong> ${fechaPago}</p>
            <p><strong>ID de Transacción Interna:</strong> ${loanIdShort}-${cuotaIdShort}</p>
            <br>
            <p><strong>Cliente:</strong> ${comprobanteData.nombreCliente || 'N/A'}</p>
            <p><strong>DNI/RUC:</strong> ${comprobanteData.dniCliente || 'N/A'}</p>
            <br>
            <p><strong>Préstamo ID:</strong> ${comprobanteData.loanId || 'N/A'}</p>
            <p><strong>Cuota Pagada:</strong> ${comprobanteData.cuotaNumero || 'N/A'}</p>
            <p><strong>Fecha de Vencimiento Original:</strong> ${fechaVencimientoOriginal || 'N/A'}</p>
            <br>
            <p><strong>Monto Cuota Original:</strong> S/.${(comprobanteData.montoCuotaOriginal || 0).toFixed(2)}</p>
            <p><strong>Interés Moratorio Aplicado:</strong> S/.${(comprobanteData.montoMoraAplicada || 0).toFixed(2)}</p>
            <p style="font-size: 1.2em; font-weight: bold; color: #28a745;"><strong>Monto Total Pagado:</strong> S/.${(comprobanteData.montoPagado || 0).toFixed(2)}</p>
            <br>
            <p><strong>Método de Pago:</strong> ${comprobanteData.medioPago || 'N/A'}</p>
            ${detallesPagoHTML}
            <hr style="border: 0; border-top: 1px dashed #ccc; margin: 20px 0;">
            <p style="text-align: center; font-size: 0.8em; color: #999;">¡Gracias por su pago!</p>
        </div>
    `;

    document.getElementById('comprobanteModal').style.display = 'flex';
}

function closeComprobanteModal() {
    document.getElementById('comprobanteModal').style.display = 'none';
}

function imprimirComprobante() {
    const element = document.getElementById('comprobanteContent');
    const clienteNombreSeguro = (currentPagoData.clienteNombre || '').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `comprobante_pago_${clienteNombreSeguro}_${new Date().getTime()}.pdf`;

    const options = {
        margin: 10,
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, logging: true, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Es crucial que html2pdf.js esté cargado en tu HTML
    if (typeof html2pdf !== 'undefined') {
        html2pdf().set(options).from(element).save();
    } else {
        alert("La librería para generar PDF no está cargada. Asegúrate de incluir html2pdf.js.");
        console.error("html2pdf.js no encontrado.");
    }
}

// Asegúrate de que `logout` y `checkAuth` estén definidos y accesibles globalmente (ej. en login.js)
// o se importen según tu configuración.
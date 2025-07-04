// Backend/routes/payments.js
const express = require("express");
const router = express.Router();
const fetch = require("node-fetch"); // Si no lo tienes, instala: npm install node-fetch@2
const Loan = require("../models/Loan");
const authMiddleware = require("./auth").authMiddleware; // Asegúrate de que auth.js exporte authMiddleware

// Cargar variables de entorno
require('dotenv').config();
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_API_BASE_URL = process.env.PAYPAL_API_BASE_URL;
const PAYPAL_RETURN_URL = process.env.PAYPAL_RETURN_URL;
const PAYPAL_CANCEL_URL = process.env.PAYPAL_CANCEL_URL;

// Función auxiliar para obtener el Access Token de PayPal
async function generateAccessToken() {
    try {
        if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
            console.error("Error: MISSING_API_CREDENTIALS for PayPal. Check .env file.");
            throw new Error("Credenciales de PayPal no configuradas.");
        }
        const auth = Buffer.from(
            PAYPAL_CLIENT_ID + ":" + PAYPAL_CLIENT_SECRET,
        ).toString("base64");
        const response = await fetch(`${PAYPAL_API_BASE_URL}/v1/oauth2/token`, {
            method: "POST",
            body: "grant_type=client_credentials",
            headers: {
                Authorization: `Basic ${auth}`,
            },
        });

        const data = await response.json();
        if (!response.ok) {
            console.error("Error generating PayPal Access Token:", data);
            throw new Error(data.error_description || "Error al generar token de acceso de PayPal.");
        }
        return data.access_token;
    } catch (error) {
        console.error("Failed to generate Access Token:", error);
        throw error;
    }
}

// @route   POST /api/payments/paypal/create-order/:loanId/:cuotaId
// @desc    Crea una orden de pago con PayPal para una cuota específica
// @access  Private
router.post("/paypal/create-order/:loanId/:cuotaId", authMiddleware, async (req, res) => {

    console.log("Parámetros recibidos en create-order:", req.params);

    const { loanId, cuotaId } = req.params;

    try {
        const loan = await Loan.findById(loanId);
        if (!loan) {
            return res.status(404).json({ msg: "Préstamo no encontrado." });
        }

        const cuota = loan.cronogramaPagos.id(cuotaId);
        if (!cuota) {
            return res.status(404).json({ msg: "Cuota no encontrada en el cronograma." });
        }

        if (cuota.estado === "Pagada") {
            return res.status(400).json({ msg: "Esta cuota ya ha sido pagada." });
        }

        // Calcula el monto total a pagar (monto de la cuota + monto de mora si aplica)
        // Asegúrate de que montoMora esté calculado y actualizado antes de este punto si es dinámico.
        let montoTotalAPagar = cuota.montoCuota;
        if (cuota.montoMora && cuota.montoMora > 0) {
            montoTotalAPagar += cuota.montoMora;
        }

        // Formatea el monto a 2 decimales y como string
        const amountValue = montoTotalAPagar.toFixed(2);

        const accessToken = await generateAccessToken();

        const orderResponse = await fetch(`${PAYPAL_API_BASE_URL}/v2/checkout/orders`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                intent: "CAPTURE",
                purchase_units: [
                    {
                        amount: {
                            currency_code: "USD", // CAMBIA ESTO A TU MONEDA SI NO ES USD (ej. "PEN" si PayPal lo soporta en tu país)
                            value: amountValue,
                        },
                        description: `Pago Cuota #${cuota.cuota} - Préstamo de ${loan.nombreCliente}`,
                        custom_id: `${loanId}_${cuotaId}`, // Un ID para rastrear en tu sistema
                    },
                ],
                application_context: {
                    return_url: `${PAYPAL_RETURN_URL}?loanId=${loanId}&cuotaId=${cuotaId}`,
                    cancel_url: `${PAYPAL_CANCEL_URL}?loanId=${loanId}&cuotaId=${cuotaId}`,
                    brand_name: "PrestamosCastillo",
                    shipping_preference: "NO_SHIPPING",
                    user_action: "PAY_NOW",
                },
            }),
        });

        const orderData = await orderResponse.json();

        if (orderResponse.ok && orderData.id) {
            const approveLink = orderData.links.find(link => link.rel === "approve");
            if (approveLink) {
                res.status(200).json({ approveUrl: approveLink.href });
            } else {
                console.error("No se encontró el enlace de aprobación en la respuesta de PayPal:", orderData);
                res.status(500).json({ msg: "Error al obtener el enlace de pago de PayPal." });
            }
        } else {
            console.error("Error al crear la orden de PayPal:", orderData);
            res.status(orderResponse.status).json({ msg: "Error al iniciar el pago con PayPal.", details: orderData });
        }

    } catch (error) {
        console.error("Error en /paypal/create-order:", error.message);
        res.status(500).json({ msg: "Error del servidor al iniciar el pago con PayPal." });
    }
});

// @route   GET /api/payments/paypal/success
// @desc    Endpoint al que PayPal redirige después de un pago exitoso
// @access  Public (PayPal hace la llamada)
router.get("/paypal/success", async (req, res) => {
    const { token, PayerID, loanId, cuotaId } = req.query; // PayPal envía 'token' y 'PayerID'

    if (!token || !PayerID || !loanId || !cuotaId) {
        console.error("Parámetros faltantes en la redirección de éxito de PayPal.");
        // Redirige a una página de error genérica o al dashboard
        return res.redirect("/error.html?msg=paypal_params_missing");
    }

    try {
        const accessToken = await generateAccessToken();

        // Capturar la orden de PayPal
        const captureResponse = await fetch(`${PAYPAL_API_BASE_URL}/v2/checkout/orders/${token}/capture`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${accessToken}`,
            },
        });

        const captureData = await captureResponse.json();

        // Verifica si la captura fue exitosa
        if (captureResponse.ok && captureData.status === "COMPLETED") {
            const loan = await Loan.findById(loanId);
            if (!loan) {
                console.error(`Préstamo no encontrado al confirmar pago PayPal: ${loanId}`);
                return res.redirect("/error.html?msg=loan_not_found");
            }

            const cuota = loan.cronogramaPagos.id(cuotaId);
            if (!cuota) {
                console.error(`Cuota no encontrada al confirmar pago PayPal: ${cuotaId} en préstamo ${loanId}`);
                return res.redirect("/error.html?msg=installment_not_found");
            }

            if (cuota.estado === "Pagada") {
                console.warn(`Cuota ${cuotaId} del préstamo ${loanId} ya estaba pagada. Posible doble notificación o recarga.`);
                return res.redirect(`/comprobante.html?loanId=${loanId}&cuotaId=${cuotaId}&transactionId=${cuota.paypalTransactionId || 'N/A'}&method=paypal&status=already_paid`);
            }

            // Encuentra el monto capturado por PayPal
            const capturedAmount = parseFloat(captureData.purchase_units[0].payments.captures[0].amount.value);

            cuota.montoPagado = capturedAmount;
            cuota.fechaPagoReal = new Date();
            cuota.medioPago = "PayPal";
            cuota.estado = "Pagada";
            cuota.paypalTransactionId = captureData.id; // Guarda el ID de transacción de PayPal

            // Actualizar el estado general del préstamo
            const allPaid = loan.cronogramaPagos.every(item => item.estado === "Pagada");
            if (allPaid) {
                loan.estadoPrestamo = "Finalizado";
            } else {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const anyOverdue = loan.cronogramaPagos.some(item =>
                    item.estado !== "Pagada" && new Date(item.fechaVencimiento) < today
                );
                if (anyOverdue) {
                    loan.estadoPrestamo = "Moroso";
                } else {
                    loan.estadoPrestamo = "Activo";
                }
            }

            await loan.save();
            console.log(`Pago PayPal exitoso y cuota ${cuotaId} actualizada para préstamo ${loanId}.`);

            // Redirigir al usuario a la página de comprobante con los detalles
            res.redirect(`/comprobante.html?loanId=${loanId}&cuotaId=${cuotaId}&transactionId=${captureData.id}&method=paypal`);

        } else {
            console.error("Fallo al capturar la orden de PayPal:", captureData);
            res.redirect(`/error.html?msg=paypal_capture_failed&details=${JSON.stringify(captureData)}`);
        }

    } catch (error) {
        console.error("Error al procesar el éxito del pago PayPal:", error);
        res.redirect(`/error.html?msg=server_error_paypal_success&error=${error.message}`);
    }
});

// @route   GET /api/payments/paypal/cancel
// @desc    Endpoint al que PayPal redirige si el usuario cancela el pago
// @access  Public (PayPal hace la llamada)
router.get("/paypal/cancel", (req, res) => {
    const { loanId, cuotaId } = req.query;
    console.log(`Pago PayPal cancelado por el usuario para préstamo ${loanId}, cuota ${cuotaId}.`);
    // Redirigir al usuario de vuelta a la página de deudas o a un mensaje de cancelación
    res.redirect("/deudas.html?msg=payment_cancelled");
});

module.exports = router;
// backend/routes/externalApi.js
const express = require('express');
const router = express.Router();
// const fetch = require('node-fetch'); // ¡¡¡ELIMINA O COMENTA ESTA LÍNEA!!!

// Tu nuevo token de apis.net.pe
const APIS_NET_PE_TOKEN = "apis-token-16773.a9yurBk1R9KlswVQORGS6yOtTt6TLjTX";
const API_BASE_URL_APISNETPE = "https://api.apis.net.pe";

// Endpoint para consultar DNI
router.get('/dni/:numero', async (req, res) => {
    const dni = req.params.numero;
    if (!dni || dni.length !== 8) {
        return res.status(400).json({ success: false, msg: "Número de DNI inválido. Debe tener 8 dígitos." });
    }

    try {
        console.log(`[Backend DNI] Intentando consultar DNI: ${dni}`);
        const response = await fetch(`${API_BASE_URL_APISNETPE}/v2/reniec/dni?numero=${dni}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${APIS_NET_PE_TOKEN}`,
                'Accept': 'application/json'
            }
        });

        console.log(`[Backend DNI] Estado de la respuesta de apis.net.pe: ${response.status} ${response.statusText}`);

        // Es crucial leer el cuerpo de la respuesta incluso si no es 'ok' para ver el mensaje de error de la API externa
        const data = await response.json();
        console.log('[Backend DNI] Datos recibidos de apis.net.pe:', data);

        if (response.ok) {
            if (data && data.nombres) {
                res.json({
                    success: true,
                    nombres: data.nombres,
                    apellidoPaterno: data.apellidoPaterno,
                    apellidoMaterno: data.apellidoMaterno,
                    nombreCompleto: `${data.nombres} ${data.apellidoPaterno || ''} ${data.apellidoMaterno || ''}`.trim()
                });
            } else {
                console.error('[Backend DNI] apis.net.pe respondió OK, pero faltan datos de nombre:', data);
                res.status(404).json({ success: false, msg: "DNI no encontrado o datos incompletos." });
            }
        } else {
            console.error('[Backend DNI] Error de la API de apis.net.pe (DNI):', data);
            // Reenviamos el código de estado y el mensaje de error de la API externa si existe
            res.status(response.status).json({ success: false, msg: data.message || `Error externo al consultar DNI: ${response.statusText}` });
        }
    } catch (error) {
        console.error('[Backend DNI] Error al llamar a la API de DNI (catch block):', error);
        res.status(500).json({ success: false, msg: "Error interno del servidor al consultar DNI." });
    }
});

// Endpoint para consultar RUC
router.get('/ruc/:numero', async (req, res) => {
    const ruc = req.params.numero;
    if (!ruc || ruc.length !== 11) {
        return res.status(400).json({ success: false, msg: "Número de RUC inválido. Debe tener 11 dígitos." });
    }

    try {
        console.log(`[Backend RUC] Intentando consultar RUC: ${ruc}`);
        const response = await fetch(`${API_BASE_URL_APISNETPE}/v2/sunat/ruc?numero=${ruc}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${APIS_NET_PE_TOKEN}`,
                'Accept': 'application/json'
            }
        });

        console.log(`[Backend RUC] Estado de la respuesta de apis.net.pe: ${response.status} ${response.statusText}`);

        const data = await response.json();
        console.log('[Backend RUC] Datos recibidos de apis.net.pe:', data);

        if (response.ok) {
            if (data && data.razonSocial) {
                res.json({
                    success: true,
                    razonSocial: data.razonSocial,
                    direccion: data.direccion || 'No especificada'
                });
            } else {
                console.error('[Backend RUC] apis.net.pe respondió OK, pero faltan datos de razón social:', data);
                res.status(404).json({ success: false, msg: "RUC no encontrado o datos incompletos." });
            }
        } else {
            console.error('[Backend RUC] Error de la API de apis.net.pe (RUC):', data);
            res.status(response.status).json({ success: false, msg: data.message || `Error externo al consultar RUC: ${response.statusText}` });
        }
    } catch (error) {
        console.error('[Backend RUC] Error al llamar a la API de RUC (catch block):', error);
        res.status(500).json({ success: false, msg: "Error interno del servidor al consultar RUC." });
    }
});

module.exports = router;
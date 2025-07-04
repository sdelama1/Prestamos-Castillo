// Backend/routes/clients.js
const express = require("express");
const router = express.Router();
const Loan = require("../models/Loan"); // Usamos el modelo Loan ya que contiene la info del cliente
const authMiddleware = require("../routes/auth").authMiddleware;

// @route   GET /api/clients
// @desc    Obtener una lista de todos los clientes únicos (extraídos de los préstamos)
// @access  Private
router.get("/", authMiddleware, async (req, res) => {
    try {
        // Usamos aggregate para obtener clientes únicos y sus datos de contacto más recientes
        const clients = await Loan.aggregate([
            {
                $group: {
                    _id: "$dniCliente", // Agrupar por DNI para obtener clientes únicos
                    nombreCliente: { $first: "$nombreCliente" }, // Tomar el primer nombre encontrado
                    telefonoCliente: { $first: "$telefonoCliente" },
                    direccionCliente: { $first: "$direccionCliente" },
                    totalPrestamos: { $sum: 1 } // Contar cuántos préstamos tiene este DNI
                }
            },
            {
                $project: {
                    _id: 0, // Excluir el _id de la agrupación
                    dniCliente: "$_id",
                    nombreCliente: 1,
                    telefonoCliente: 1,
                    direccionCliente: 1,
                    totalPrestamos: 1
                }
            },
            {
                $sort: { nombreCliente: 1 } // Opcional: ordenar por nombre del cliente
            }
        ]);
        res.json(clients);
    } catch (err) {
        console.error("Error en /api/clients GET:", err.message);
        res.status(500).json({ msg: "Error del servidor al obtener la lista de clientes." });
    }
});

// @route   GET /api/clients/:dni
// @desc    Obtener los datos de un cliente específico por DNI y todos sus préstamos
// @access  Private
router.get("/:dni", authMiddleware, async (req, res) => {
    try {
        const dni = req.params.dni;
        // Buscar todos los préstamos asociados a ese DNI
        const loans = await Loan.find({ dniCliente: dni }).sort({ fechaPrestamo: -1 });

        if (loans.length === 0) {
            return res.status(404).json({ msg: "Cliente no encontrado o no tiene préstamos registrados." });
        }

        // Tomar la información del cliente del primer préstamo (asumiendo que es consistente)
        const clientInfo = {
            nombreCliente: loans[0].nombreCliente,
            dniCliente: loans[0].dniCliente,
            telefonoCliente: loans[0].telefonoCliente,
            direccionCliente: loans[0].direccionCliente,
            prestamos: loans.map(loan => ({
                _id: loan._id,
                montoPrestamo: loan.montoPrestamo,
                fechaPrestamo: loan.fechaPrestamo,
                estadoPrestamo: loan.estadoPrestamo,
                plazoMeses: loan.plazoMeses,
                tasaInteresAnual: loan.tasaInteresAnual,
                // No incluir cronogramaPagos completo aquí para evitar respuestas muy grandes.
                // El cronograma se obtendría en una ruta de detalle de préstamo individual (/api/loans/:id).
                cuotasPendientes: loan.cronogramaPagos.filter(c => c.estado !== "Pagada").length,
                cuotasVencidas: loan.cronogramaPagos.filter(c => c.estado === "Vencida").length, // Las que ya tienen mora
            }))
        };

        res.json(clientInfo);
    } catch (err) {
        console.error("Error en /api/clients/:dni GET:", err.message);
        res.status(500).json({ msg: "Error del servidor al obtener los datos del cliente." });
    }
});

module.exports = router;
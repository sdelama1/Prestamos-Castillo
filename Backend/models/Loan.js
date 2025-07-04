// Backend/models/Loan.js
const mongoose = require("mongoose");

// Esquema para cada cuota del cronograma
const paymentScheduleItemSchema = new mongoose.Schema({
    cuota: { type: Number, required: true },
    fechaVencimiento: { type: Date, required: true },
    montoCuota: { type: Number, required: true },
    capital: { type: Number, required: true },
    interes: { type: Number, required: true },
    saldoPendiente: { type: Number, required: true },
    estado: { type: String, enum: ["Pendiente", "Pagada", "Vencida"], default: "Pendiente" },

    fechaPagoReal: { type: Date },
    montoPagado: { type: Number, default: 0 },
    medioPago: { type: String, enum: ["Tarjeta", "Billetera Digital", "Efectivo", "Transferencia", "PayPal", null] }, // <-- ¡AÑADIDO "PayPal"!
    
    // Campos para la gestión de mora
    montoMora: { type: Number, default: 0 },
    fechaMoraAplicada: { type: Date },

    // Nuevo campo para el ID de transacción de PayPal
    paypalTransactionId: { type: String }, // <-- ¡NUEVO CAMPO!
});

// Esquema principal del préstamo
const loanSchema = new mongoose.Schema({
    // Datos del cliente
    nombreCliente: { type: String, required: true },
    dniCliente: { type: String, required: true }, // VERIFICA ESTO: SI UN CLIENTE PUEDE TENER VARIOS PRESTAMOS, DEBE SER unique: false. Si quieres que sea único, déjalo, pero tendrás que manejarlo.
    telefonoCliente: { type: String },
    direccionCliente: { type: String },

    // Detalles del préstamo
    montoPrestamo: { type: Number, required: true },
    tasaInteresAnual: { type: Number, required: true },
    plazoMeses: { type: Number, required: true },
    fechaPrestamo: { type: Date, default: Date.now },

    // Nuevos campos para la frecuencia de pago
    frecuenciaPago: {
        type: String,
        enum: ["mensual", "fecha_fija", "fin_de_mes", "cada_30_dias"],
        default: "mensual",
        required: true,
    },
    diaFijoPago: {
        type: Number,
        min: 1,
        max: 31,
    },

    cronogramaPagos: [paymentScheduleItemSchema],

    // Otros datos relevantes
    estadoPrestamo: { type: String, enum: ["Activo", "Finalizado", "Moroso"], default: "Activo" },
    fechaCreacion: { type: Date, default: Date.now },
    userId: { // Asegúrate de tener este campo si los préstamos se asocian a un usuario
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        // required: true, // Si es un campo requerido
    },
});

const Loan = mongoose.model("Loan", loanSchema);

module.exports = Loan;
// Backend/routes/loans.js
const express = require("express");
const router = express.Router();
const Loan = require("../models/Loan"); // Importa el modelo de Préstamo
const authMiddleware = require("../routes/auth").authMiddleware; // Importar el middleware de autenticación

// Para manejar operaciones con Decimal128 de forma segura en Node.js si decides usarlo
// Instala: npm install decimal.js
const Decimal = require('decimal.js'); // Asegúrate de instalar esta librería si usas Decimal128

// Función auxiliar para calcular el cronograma de pagos (Método de Amortización Francés)
// Esta función incorpora la nueva lógica de fechas de pago
function generarCronograma(
    montoPrestamo,
    tasaInteresAnual, // Ya viene en decimal (ej. 0.10 para 10%)
    plazoMeses,
    fechaInicio, // Fecha en que se otorga el préstamo (Date object)
    frecuenciaPago,
    diaFijoPago = null
) {
    console.log("generarCronograma: Inicio con", { montoPrestamo, tasaInteresAnual, plazoMeses, fechaInicio, frecuenciaPago, diaFijoPago });
    const cronograma = [];
    const tasaInteresMensual = tasaInteresAnual / 12;

    let montoCuotaFija;
    if (tasaInteresMensual === 0) {
        montoCuotaFija = montoPrestamo / plazoMeses;
    } else {
        const factorAmortizacion =
            (tasaInteresMensual * Math.pow(1 + tasaInteresMensual, plazoMeses)) /
            (Math.pow(1 + tasaInteresMensual, plazoMeses) - 1);
        montoCuotaFija = montoPrestamo * factorAmortizacion;
    }

    let saldoPendiente = montoPrestamo;
    let fechaCalculoBase = new Date(fechaInicio); // Usamos esta para calcular la siguiente fecha

    for (let i = 1; i <= plazoMeses; i++) {
        let interesCuota = saldoPendiente * tasaInteresMensual;
        let capitalCuota = montoCuotaFija - interesCuota;

        // Ajuste para la última cuota para asegurar que el saldo sea 0 y los montos cuadren
        if (i === plazoMeses) {
            capitalCuota = saldoPendiente; // Capital es el saldo restante
            interesCuota = montoCuotaFija - capitalCuota; // Interés es el remanente de la cuota fija
            if (interesCuota < 0) interesCuota = 0; // Evitar interés negativo por pequeños errores de flotante
            montoCuotaFija = capitalCuota + interesCuota; // Recalcular montoCuotaFija para el último pago
            saldoPendiente = 0;
        }

        let fechaVencimientoCuota = new Date(fechaCalculoBase); // Partimos de la base para calcular el siguiente

        // Lógica de cálculo de fecha de vencimiento para la cuota actual
        if (frecuenciaPago === "mensual") {
            // La primera cuota es un mes después de la fecha de inicio del préstamo
            // Las subsiguientes son un mes después de la cuota anterior
            if (i === 1) {
                fechaVencimientoCuota.setMonth(fechaVencimientoCuota.getMonth() + 1);
            } else {
                // Ya se actualiza en el loop con fechaCalculoBase
                fechaVencimientoCuota.setMonth(fechaVencimientoCuota.getMonth() + 1);
            }
            // Ajuste para el día: si el día original no existe en el mes siguiente, se ajusta al último día de ese mes
            const originalDay = fechaVencimientoCuota.getDate();
            if (fechaVencimientoCuota.getDate() !== originalDay) {
                fechaVencimientoCuota.setDate(0); // Esto establece la fecha al último día del mes anterior, que es lo que queremos si el día no existe
            }

        } else if (frecuenciaPago === "fecha_fija") {
            let targetMonth, targetYear;
            // Para la primera cuota
            if (i === 1) {
                // Si el diaFijoPago es hoy o ya pasó en este mes, la primera cuota es el día fijo del PRÓXIMO mes.
                // Simplificamos: siempre el próximo día fijo después de la fecha de inicio.
                let tempDate = new Date(fechaInicio);
                tempDate.setDate(diaFijoPago);
                if (tempDate.getTime() <= fechaInicio.getTime()) {
                    // Si el día fijo ya pasó en el mes de inicio, ir al mes siguiente
                    targetMonth = fechaInicio.getMonth() + 1;
                } else {
                    // Si el día fijo es en el mes de inicio y aún no pasa
                    targetMonth = fechaInicio.getMonth();
                }
                targetYear = fechaInicio.getFullYear();

                // Asegurar que avanzamos al menos un mes si la fecha ya es posterior al día fijo
                if (diaFijoPago <= fechaInicio.getDate() && targetMonth === fechaInicio.getMonth()) {
                    targetMonth++;
                }

            } else {
                // Para cuotas subsiguientes, siempre es el diaFijoPago del siguiente mes respecto a la cuota anterior
                targetMonth = fechaCalculoBase.getMonth() + 1;
                targetYear = fechaCalculoBase.getFullYear();
            }

            // Manejar desbordamiento de año
            if (targetMonth > 11) {
                targetMonth -= 12;
                targetYear++;
            }

            fechaVencimientoCuota = new Date(targetYear, targetMonth, diaFijoPago);

            // Si el día fijo no existe en el mes (ej. 31 en febrero), Date() lo ajustará automáticamente.
            // Para asegurar que estamos en el mes objetivo, ajustamos al último día de ese mes si se desbordó.
            if (fechaVencimientoCuota.getMonth() !== targetMonth) {
                fechaVencimientoCuota = new Date(targetYear, targetMonth + 1, 0);
            }

        } else if (frecuenciaPago === "fin_de_mes") {
            // La primera cuota es el último día del PRÓXIMO mes.
            // Las subsiguientes son el último día del mes siguiente a la cuota anterior.
            if (i === 1) {
                fechaVencimientoCuota.setMonth(fechaVencimientoCuota.getMonth() + 2, 0); // Último día del mes siguiente al actual
            } else {
                fechaVencimientoCuota.setMonth(fechaCalculoBase.getMonth() + 2, 0); // Último día del mes siguiente
            }
        } else if (frecuenciaPago === "cada_30_dias") {
            // Siempre 30 días después de la fecha de inicio del préstamo (para la primera)
            // o 30 días después de la fecha de vencimiento de la cuota anterior (para subsiguientes)
            fechaVencimientoCuota.setDate(fechaVencimientoCuota.getDate() + 30);
        }

        // Actualizar saldo después de calcular capital y antes de guardar
        saldoPendiente -= capitalCuota;
        // Asegurarse de que el saldo no sea negativo por errores de punto flotante
        if (saldoPendiente < 0.005 && saldoPendiente > -0.005) {
            saldoPendiente = 0;
        }

        cronograma.push({
            cuota: i,
            fechaVencimiento: fechaVencimientoCuota,
            montoCuota: parseFloat(montoCuotaFija.toFixed(2)),
            capital: parseFloat(capitalCuota.toFixed(2)),
            interes: parseFloat(interesCuota.toFixed(2)),
            saldoPendiente: parseFloat(saldoPendiente.toFixed(2)),
            estado: "Pendiente",
            montoPagado: 0, // Inicializar
            montoMora: 0, // Inicializar
        });

        fechaCalculoBase = fechaVencimientoCuota; // Actualizar la base para la siguiente iteración
    }

    // Asegurar que el último saldo pendiente sea 0
    if (cronograma.length > 0) {
        cronograma[cronograma.length - 1].saldoPendiente = 0.00;
    }
    console.log("generarCronograma: Finalizado.");
    return cronograma;
}


// @route   POST /api/loans/register
// @desc    Registrar un nuevo préstamo y generar su cronograma
// @access  Private (solo el dueño del negocio)
router.post("/register", authMiddleware, async (req, res) => {
    console.log("Datos recibidos para registrar préstamo:", req.body);

    const {
        nombreCliente,
        dniCliente,
        telefonoCliente,
        direccionCliente,
        montoPrestamo,
        tasaInteresAnual, // Esto es lo que viene del frontend (ej. 10 para 10%)
        plazoMeses,
        fechaPrestamo, // Se puede enviar desde el frontend o se usa Date.now()
        frecuenciaPago,
        diaFijoPago,
    } = req.body;

    // --- Definir el límite máximo de préstamo diario en soles ---
    // Este valor debe ser el equivalente a 5000 dólares en soles, ajusta según tu tipo de cambio real
    const LIMITE_PRESTAMO_DIARIO_POR_PERSONA = 17922.81; // Ejemplo: Si 5000 USD es 17922.81 PEN

    try {
        // Validaciones básicas
        if (
            !nombreCliente ||
            !dniCliente ||
            !montoPrestamo ||
            !tasaInteresAnual ||
            !plazoMeses ||
            !frecuenciaPago
        ) {
            return res.status(400).json({ msg: "Por favor, complete todos los campos requeridos." });
        }

        const loanDate = fechaPrestamo ? new Date(fechaPrestamo) : new Date();

        // Normalizar la fecha a solo el día (sin hora, minutos, segundos) para la consulta
        // Esto es crucial para sumar préstamos del "mismo día" sin importar la hora exacta
        const startOfDay = new Date(loanDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(loanDate);
        endOfDay.setHours(23, 59, 59, 999);

        // --- INICIO: Lógica para verificar el límite diario por persona ---

        // 1. Obtener todos los préstamos ya concedidos a este DNI para el día actual
        const existingLoansToday = await Loan.find({
            dniCliente: dniCliente,
            fechaPrestamo: {
                $gte: startOfDay,
                $lte: endOfDay
            }
        });

        // 2. Sumar el monto de los préstamos existentes
        let totalLentToday = new Decimal(0); // Usamos Decimal.js para suma precisa
        existingLoansToday.forEach(loan => {
            // Asegúrate de que loan.montoPrestamo se convierta a String si es Decimal128 en el modelo
            // y luego se use con Decimal() para la suma precisa.
            // Si tu modelo sigue con `Number`, usa: totalLentToday = totalLentToday.plus(loan.montoPrestamo);
            totalLentToday = totalLentToday.plus(new Decimal(loan.montoPrestamo.toString()));
        });
        
        // Convertir el nuevo montoPrestamo a Decimal para la suma
        const newLoanAmountDecimal = new Decimal(montoPrestamo);

        // Sumar el monto del préstamo actual solicitado
        const totalAmountAfterNewLoan = totalLentToday.plus(newLoanAmountDecimal);

        console.log(`Cliente DNI: ${dniCliente}`);
        console.log(`Monto ya prestado hoy: ${totalLentToday.toFixed(2)} PEN`);
        console.log(`Monto del nuevo préstamo: ${newLoanAmountDecimal.toFixed(2)} PEN`);
        console.log(`Total acumulado con el nuevo préstamo: ${totalAmountAfterNewLoan.toFixed(2)} PEN`);
        console.log(`Límite diario: ${LIMITE_PRESTAMO_DIARIO_POR_PERSONA.toFixed(2)} PEN`);


        // 3. Verificar si el nuevo préstamo excede el límite
        if (totalAmountAfterNewLoan.greaterThan(LIMITE_PRESTAMO_DIARIO_POR_PERSONA)) {
            const remainingAmount = new Decimal(LIMITE_PRESTAMO_DIARIO_POR_PERSONA).minus(totalLentToday);
            let errorMessage = `El cliente con DNI ${dniCliente} excede el límite de préstamos diarios.`;
            if (remainingAmount.isPositive()) {
                errorMessage += ` Solo se le puede prestar S/ ${remainingAmount.toFixed(2)} más hoy.`;
            } else {
                errorMessage += ` Ya ha alcanzado o superado su límite diario de S/ ${LIMITE_PRESTAMO_DIARIO_POR_PERSONA.toFixed(2)}.`;
            }
            console.warn(errorMessage);
            return res.status(400).json({ msg: errorMessage });
        }

        // --- FIN: Lógica para verificar el límite diario por persona ---


        // Convertir la tasa de interés anual a su forma decimal antes de pasársela a generarCronograma
        const tasaInteresDecimal = tasaInteresAnual / 100; // Si el frontend envía '10' para 10%, esto será 0.10

        let cronogramaPagos;
        try {
            cronogramaPagos = generarCronograma(
                montoPrestamo, // Aquí se sigue usando el Number si no cambiaste el modelo
                tasaInteresDecimal, // Usar la tasa decimal para el cálculo del cronograma
                plazoMeses,
                loanDate,
                frecuenciaPago,
                diaFijoPago
            );
        } catch (cronogramaError) {
            console.error("Error al generar cronograma (interno):", cronogramaError.message);
            return res.status(500).json({ msg: "Error interno al generar el cronograma de pagos. Por favor, revise los datos del préstamo." });
        }

        const newLoan = new Loan({
            nombreCliente,
            dniCliente,
            telefonoCliente,
            direccionCliente,
            montoPrestamo: montoPrestamo, // Se guarda el Number o Decimal128 según tu modelo
            tasaInteresAnual: tasaInteresDecimal, // Guardar la tasa como decimal
            plazoMeses,
            fechaPrestamo: loanDate,
            frecuenciaPago,
            diaFijoPago,
            cronogramaPagos,
            userId: req.user.id // Asocia el préstamo al usuario autenticado (asumo que tienes userId en el modelo Loan)
        });

        await newLoan.save();

        res.status(201).json({
            msg: "Préstamo registrado y cronograma generado con éxito",
            loan: newLoan,
        });
    } catch (err) {
        console.error("Error en /api/loans/register (catch principal):", err.message);
        res.status(500).json({ msg: "Error del servidor al registrar el préstamo." });
    }
});

// @route   GET /api/loans
// @desc    Obtener todos los préstamos
// @access  Private
router.get("/", authMiddleware, async (req, res) => {
    try {
        const loans = await Loan.find().sort({ fechaCreacion: -1 });
        res.json(loans);
    } catch (err) {
        console.error("Error en /api/loans GET:", err.message);
        res.status(500).json({ msg: "Error del servidor al obtener los préstamos." });
    }
});

// @route   GET /api/loans/:id
// @desc    Obtener un préstamo por ID
// @access  Private
router.get("/:id", authMiddleware, async (req, res) => {
    try {
        const loan = await Loan.findById(req.params.id);
        if (!loan) {
            return res.status(404).json({ msg: "Préstamo no encontrado." });
        }
        res.json(loan);
    } catch (err) {
        console.error("Error en /api/loans/:id GET:", err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: "ID de préstamo inválido." });
        }
        res.status(500).json({ msg: "Error del servidor al obtener el préstamo." });
    }
});

// @route   POST /api/loans/:loanId/pay-installment
// @desc    Registrar un pago para una cuota específica de un préstamo
// @access  Private
router.post("/:loanId/pay-installment", authMiddleware, async (req, res) => {
    const { loanId } = req.params;
    const { cuotaId, montoPagado, medioPago } = req.body; // cuotaId es el _id del sub-documento de cuota

    try {
        const loan = await Loan.findById(loanId);
        if (!loan) {
            return res.status(404).json({ msg: "Préstamo no encontrado." });
        }

        const cuota = loan.cronogramaPagos.id(cuotaId); // Busca por _id del sub-documento
        if (!cuota) {
            return res.status(404).json({ msg: "Cuota no encontrada en el cronograma." });
        }

        if (cuota.estado === "Pagada") {
            return res.status(400).json({ msg: "Esta cuota ya ha sido pagada." });
        }

        // Lógica para aplicar el interés de mora (25%) si la cuota está vencida y no se ha aplicado
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalizar a inicio del día
        const fechaVencimientoCuota = new Date(cuota.fechaVencimiento);
        fechaVencimientoCuota.setHours(0, 0, 0, 0); // Normalizar a inicio del día

        let montoEsperado = cuota.montoCuota;

        // Si la cuota está vencida (fecha de vencimiento anterior a hoy) y no está pagada
        // y aún no se le ha aplicado monto de mora
        if (fechaVencimientoCuota < today && cuota.estado !== "Pagada" && cuota.montoMora === 0) {
            const interesMora = cuota.montoCuota * 0.25;
            cuota.montoMora = parseFloat(interesMora.toFixed(2)); // Usar el campo correcto del esquema
            cuota.fechaMoraAplicada = today;
            // No cambiamos el estado a "Vencida" aquí, ya que el estado se actualizará a "Pagada" si el pago es completo.
            // Si el pago no fuera completo, se mantendría "Vencida".
            montoEsperado += cuota.montoMora; // El monto esperado para el pago incluye la mora
            console.log(`Mora del 25% (${interesMora.toFixed(2)}) aplicada a la cuota ${cuota.cuota} del préstamo ${loanId}. Nuevo monto esperado: ${montoEsperado.toFixed(2)}`);
        } else if (cuota.montoMora > 0) { // Usar el campo correcto del esquema
            // Si ya tiene mora aplicada, sumarla al monto esperado
            montoEsperado += cuota.montoMora;
        }

        // Validar que el monto pagado sea al menos el monto esperado (incluyendo mora si aplica)
        if (montoPagado < montoEsperado - 0.01) { // Pequeña tolerancia para flotantes
            return res.status(400).json({ msg: `El monto pagado es insuficiente. Se esperaba al menos ${montoEsperado.toFixed(2)}.` });
        }

        // Registrar el pago
        cuota.montoPagado = parseFloat(montoPagado.toFixed(2));
        cuota.fechaPagoReal = new Date();
        cuota.medioPago = medioPago;
        cuota.estado = "Pagada"; // Marca la cuota como pagada

        // Actualizar el estado del préstamo
        const allPaid = loan.cronogramaPagos.every(item => item.estado === "Pagada");
        if (allPaid) {
            loan.estadoPrestamo = "Finalizado";
        } else {
            // Si no todas están pagadas, revisar si alguna está vencida para marcar el préstamo como "Moroso"
            const anyOverdue = loan.cronogramaPagos.some(item =>
                item.estado !== "Pagada" && new Date(item.fechaVencimiento) < today
            );
            if (anyOverdue) {
                loan.estadoPrestamo = "Moroso";
            } else {
                // Si no hay deudas vencidas, pero no está finalizado, vuelve a "Activo"
                loan.estadoPrestamo = "Activo";
            }
        }

        await loan.save();

        // Preparar datos para el comprobante de pago
        const comprobanteData = {
            loanId: loan._id,
            nombreCliente: loan.nombreCliente,
            dniCliente: loan.dniCliente,
            cuotaNumero: cuota.cuota,
            fechaVencimientoOriginal: cuota.fechaVencimiento,
            montoCuotaOriginal: cuota.montoCuota,
            montoMoraAplicada: cuota.montoMora, // Usar el campo correcto del esquema
            montoPagado: cuota.montoPagado,
            medioPago: cuota.medioPago,
            fechaPagoReal: cuota.fechaPagoReal,
            // Puedes añadir más detalles del préstamo si lo deseas
        };

        res.status(200).json({ msg: "Pago registrado exitosamente.", cuotaActualizada: cuota, comprobante: comprobanteData });

    } catch (err) {
        console.error("Error en /api/loans/:loanId/pay-installment POST:", err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: "ID de préstamo o cuota inválido." });
        }
        res.status(500).json({ msg: "Error del servidor al registrar el pago." });
    }
});

// @route   GET /api/loans/debts/current-month
// @desc    Obtener cuotas que vencen en el mes actual
// @access  Private
router.get("/debts/current-month", authMiddleware, async (req, res) => {
    try {
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999); // Último día del mes

        const loans = await Loan.find({
            "cronogramaPagos.fechaVencimiento": { $gte: startOfMonth, $lte: endOfMonth }
        });

        let currentMonthDebts = [];
        loans.forEach(loan => {
            loan.cronogramaPagos.forEach(cuota => {
                const fechaVencimientoCuota = new Date(cuota.fechaVencimiento);
                if (fechaVencimientoCuota >= startOfMonth && fechaVencimientoCuota <= endOfMonth) {
                    currentMonthDebts.push({
                        loanId: loan._id,
                        cuotaId: cuota._id, // Importante para identificar la sub-cuota
                        nombreCliente: loan.nombreCliente,
                        dniCliente: loan.dniCliente,
                        montoPrestamo: loan.montoPrestamo, // Para referencia
                        ...cuota.toObject() // Clona la cuota para evitar modificar el objeto original del loan
                    });
                }
            });
        });

        res.json(currentMonthDebts);
    } catch (err) {
        console.error("Error en /api/loans/debts/current-month GET:", err.message);
        res.status(500).json({ msg: "Error del servidor al obtener deudas del mes." });
    }
});

// @route   GET /api/loans/debts/overdue
// @desc    Obtener cuotas vencidas de meses pasados y aplicar 25% de mora si corresponde
// @access  Private
router.get("/debts/overdue", authMiddleware, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalizar a inicio del día

        // Buscar préstamos que tienen al menos una cuota que está vencida Y no está pagada
        // Incluimos tanto "Pendiente" como "Vencida" para asegurar que se muestren
        const loans = await Loan.find({
            "cronogramaPagos.fechaVencimiento": { $lt: today },
            "cronogramaPagos.estado": { $in: ["Pendiente", "Vencida"] } // Busca cuotas pendientes O ya marcadas como vencidas
        });

        let overdueDebts = [];
        let loansToSave = []; // Para acumular préstamos que necesitan ser guardados

        for (const loan of loans) {
            let hasLoanChanges = false; // Indica si este préstamo necesita ser guardado
            let loanHasOverdueInstallment = false; // Indica si el préstamo tiene al menos una cuota vencida (para estadoPrestamo)

            for (const cuota of loan.cronogramaPagos) {
                const fechaVencimientoCuota = new Date(cuota.fechaVencimiento);
                fechaVencimientoCuota.setHours(0, 0, 0, 0); // Normalizar

                // Si la cuota está vencida y no pagada
                if (fechaVencimientoCuota < today && cuota.estado !== "Pagada") {
                    // 1. Aplicar mora si no se ha aplicado antes
                    if (cuota.montoMora === 0) { // Usar el campo correcto del esquema
                        const interesMora = cuota.montoCuota * 0.25;
                        cuota.montoMora = parseFloat(interesMora.toFixed(2)); // Usar el campo correcto del esquema
                        cuota.fechaMoraAplicada = today;
                        console.log(`Mora aplicada a cuota ${cuota.cuota} de ${loan.nombreCliente}`);
                        hasLoanChanges = true; // Indica que el préstamo ha cambiado y necesita guardarse
                    }

                    // 2. Asegurarse de que el estado de la cuota sea "Vencida"
                    // Esto garantiza que todas las cuotas vencidas no pagadas tengan este estado
                    if (cuota.estado === "Pendiente") { // Solo si era pendiente, la marcamos como Vencida
                         cuota.estado = "Vencida";
                         hasLoanChanges = true;
                    }
                    
                    // 3. Añadir la cuota a la lista de deudas vencidas a devolver al frontend
                    overdueDebts.push({
                        loanId: loan._id,
                        cuotaId: cuota._id,
                        nombreCliente: loan.nombreCliente,
                        dniCliente: loan.dniCliente,
                        montoPrestamo: loan.montoPrestamo, // Para referencia
                        ...cuota.toObject() // Asegúrate de que el objeto que devuelves refleje el estado actual
                    });
                    loanHasOverdueInstallment = true; // Este préstamo tiene al menos una cuota vencida para el estado general
                }
            }

            // Fuera del bucle de cuotas: Actualizar estado del préstamo si aplica
            if (loanHasOverdueInstallment && loan.estadoPrestamo !== "Moroso" && loan.estadoPrestamo !== "Finalizado") { // Si tiene vencidas y no está "Moroso" ni "Finalizado"
                loan.estadoPrestamo = "Moroso";
                hasLoanChanges = true;
            } else if (!loanHasOverdueInstallment && loan.estadoPrestamo === "Moroso" && loan.cronogramaPagos.some(c => c.estado !== "Pagada")) {
                // Si ya no tiene cuotas vencidas, pero estaba en "Moroso" y no todas están pagadas, vuelve a "Activo"
                loan.estadoPrestamo = "Activo";
                hasLoanChanges = true;
            }
            
            // Si hubo algún cambio en el préstamo (mora aplicada o estado de préstamo), agrégalo para guardar
            if (hasLoanChanges) {
                loansToSave.push(loan);
            }
        }

        // Guardar todos los préstamos que tuvieron cambios de forma eficiente
        // Usamos Promise.all para guardar todos los préstamos modificados en paralelo
        await Promise.all(loansToSave.map(loan => loan.save()));

        res.json(overdueDebts);
    } catch (err) {
        console.error("Error en /api/loans/debts/overdue GET:", err.message);
        res.status(500).json({ msg: "Error del servidor al obtener deudas vencidas." });
    }
});

// @route   GET /api/loans/debts/upcoming
// @desc    Obtener cuotas que vencen en la semana actual (Lunes a Viernes) y hoy
// @access  Private
router.get("/debts/upcoming", authMiddleware, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Calcular el inicio de la semana (Lunes)
        const startOfWeek = new Date(today);
        const dayOfWeek = startOfWeek.getDay(); // 0 para Domingo, 1 para Lunes...
        startOfWeek.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)); // Lunes de la semana actual
        startOfWeek.setHours(0, 0, 0, 0);

        // Calcular el fin de la semana (Viernes)
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 4); // Sumar 4 días para llegar al viernes
        endOfWeek.setHours(23, 59, 59, 999);

        const loans = await Loan.find({
            "cronogramaPagos.fechaVencimiento": { $gte: startOfWeek, $lte: endOfWeek },
            "cronogramaPagos.estado": { $ne: "Pagada" }
        });

        let upcomingDebts = [];
        loans.forEach(loan => {
            loan.cronogramaPagos.forEach(cuota => {
                const fechaVencimientoCuota = new Date(cuota.fechaVencimiento);
                fechaVencimientoCuota.setHours(0, 0, 0, 0);

                if (fechaVencimientoCuota >= startOfWeek && fechaVencimientoCuota <= endOfWeek && cuota.estado !== "Pagada") {
                    upcomingDebts.push({
                        loanId: loan._id,
                        cuotaId: cuota._id,
                        nombreCliente: loan.nombreCliente,
                        dniCliente: loan.dniCliente,
                        montoPrestamo: loan.montoPrestamo,
                        ...cuota.toObject()
                    });
                }
            });
        });

        res.json(upcomingDebts);
    } catch (err) {
        console.error("Error en /api/loans/debts/upcoming GET:", err.message);
        res.status(500).json({ msg: "Error del servidor al obtener deudas próximas a vencer." });
    }
});

module.exports = router;
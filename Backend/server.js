// server.js
const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");

// Importar rutas
const authRoutes = require("./routes/auth");
const loanRoutes = require("./routes/loans");
const clientRoutes = require("./routes/clients"); // <-- ¡CORREGIDA ESTA LÍNEA!
const externalApiRoutes = require("./routes/externalApi");
const paymentRoutes = require("./routes/payments");

dotenv.config();

// =========================================================
// !!! AÑADIDO PARA DEPURACIÓN: VERIFICAR VARIABLES DE ENTORNO PAYPAL !!!
// Por favor, copia la salida de estos console.log cuando reinicies el servidor.
console.log('PAYPAL_CLIENT_ID cargado:', process.env.PAYPAL_CLIENT_ID);
console.log('PAYPAL_CLIENT_SECRET cargado:', process.env.PAYPAL_CLIENT_SECRET);
// =========================================================

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Conectar a la base de datos MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("Conectado a MongoDB"))
    .catch((err) => console.log("Error al conectar a MongoDB:", err));

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../Frontend')));

// Definir rutas de API
app.use("/api/auth", authRoutes);
app.use("/api/loans", loanRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/external", externalApiRoutes);
app.use("/api/payments", paymentRoutes);

// Ruta de prueba
app.get("/api/", (req, res) => res.send("API Corriendo"));

app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
        res.sendFile(path.resolve(__dirname, '../Frontend', 'index.html'));
    }
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor corriendo en el puerto ${port}`);
});
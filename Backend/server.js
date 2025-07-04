// server.js
const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs"); // Necesario para hashear contraseñas en la ruta de registro temporal
const jwt = require("jsonwebtoken"); // Necesario si quieres generar un token en la ruta de registro temporal

// Importar rutas
const authRoutes = require("./routes/auth");
const loanRoutes = require("./routes/loans");
const clientRoutes = require("./routes/clients");
const externalApiRoutes = require("./routes/externalApi");
const paymentRoutes = require("./routes/payments");

// Importar el modelo de usuario (asegúrate de que esta ruta sea correcta)
// Si tu modelo User.js está en Backend/models/User.js, esta ruta es correcta.
const User = require("./models/User"); // <-- ¡IMPORTA TU MODELO DE USUARIO AQUÍ!

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
app.use(express.json()); // Permite que Express lea JSON en el cuerpo de las peticiones

// --- RUTA TEMPORAL PARA REGISTRO (¡ELIMINAR O PROTEGER ANTES DE PRODUCCIÓN!) ---
// Esta ruta te permitirá crear un usuario para pruebas.
app.post('/api/auth/register-temp', async (req, res) => {
    const { email, password } = req.body;

    try {
        // 1. Verificar si el usuario ya existe
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: 'El usuario ya existe con ese email.' });
        }

        // 2. Crear nuevo usuario
        user = new User({
            email,
            password
        });

        // 3. Hashear la contraseña
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        // 4. Guardar usuario en la base de datos
        await user.save();

        // Opcional: Generar un token JWT para iniciar sesión inmediatamente después de registrar
        /*
        const payload = { user: { id: user.id } };
        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '1h' },
            (err, token) => {
                if (err) throw err;
                res.status(201).json({ message: 'Usuario registrado con éxito', user: { id: user.id, email: user.email }, token });
            }
        );
        */
        // Si no necesitas el token de inmediato, solo devuelve un mensaje de éxito:
        res.status(201).json({ message: 'Usuario registrado con éxito. Ahora puedes intentar iniciar sesión.' });

    } catch (err) {
        console.error('Error al registrar usuario temporal:', err.message);
        res.status(500).json({ message: 'Error interno del servidor al registrar.' });
    }
});
// --------------------------------------------------------------------------


// Conectar a la base de datos MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("Conectado a MongoDB"))
    .catch((err) => console.log("Error al conectar a MongoDB:", err));

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../Frontend')));

// Definir rutas de API (¡asegúrate de que estas rutas no colisionen con /api/auth/register-temp si ya la tenías!)
app.use("/api/auth", authRoutes);
app.use("/api/loans", loanRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/external", externalApiRoutes);
app.use("/api/payments", paymentRoutes);


// Ruta de prueba
app.get("/api/", (req, res) => res.send("API Corriendo"));

// Maneja cualquier otra ruta que no sea de API y sirve el index.html del frontend
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
        res.sendFile(path.resolve(__dirname, '../Frontend', 'index.html'));
    }
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor corriendo en el puerto ${port}`);
});
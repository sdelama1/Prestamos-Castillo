// Backend/routes/auth.js
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const bcrypt = require("bcryptjs");

// Asegúrate de que esta variable de entorno esté configurada
const jwtSecret = process.env.JWT_SECRET || "mi_clave_secreta_por_defecto_si_no_hay_env";

// Middleware de autenticación para proteger rutas
const authMiddleware = (req, res, next) => {
  const token = req.header("x-auth-token");
  if (!token) {
    return res.status(401).json({ msg: "No hay token, autorización denegada" });
  }
  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ msg: "Token no es válido" });
  }
};

// @route   POST /api/auth/login
// @desc    Autenticar usuario y obtener token
// @access  Public
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ msg: "Credenciales inválidas" });
    }
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(400).json({ msg: "Credenciales inválidas" });
    }

    const payload = {
      user: {
        id: user.id,
        username: user.username,
      },
    };

    jwt.sign(
      payload,
      jwtSecret,
      { expiresIn: "1h" }, // Token expira en 1 hora
      (err, token) => {
        if (err) throw err;
        res.json({ token });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: "Error del servidor." });
  }
});

// @route   PUT /api/auth/change-password
// @desc    Cambiar la contraseña del usuario autenticado
// @access  Private (requiere token JWT)
router.put("/change-password", authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ msg: "Usuario no encontrado." });
    }
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ msg: "La contraseña actual es incorrecta." });
    }
    if (newPassword.includes(' ')) {
      return res.status(400).json({ msg: "La nueva contraseña no puede contener espacios en blanco." });
    }
    // No permitir que la nueva contraseña sea igual a la actual
    if (await user.matchPassword(newPassword)) {
      return res.status(400).json({ msg: "La nueva contraseña no puede ser igual a la actual." });
    }
    if (newPassword.length < 6) { // Añadir una validación de longitud mínima
        return res.status(400).json({ msg: "La nueva contraseña debe tener al menos 6 caracteres." });
    }


    user.password = newPassword; // El hook pre("save") en User.js la hasheará automáticamente.
    await user.save();

    res.json({ msg: "Contraseña actualizada exitosamente." });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: "Error del servidor al cambiar la contraseña." });
  }
});

module.exports = router;
module.exports.authMiddleware = authMiddleware; // Exporta el middleware
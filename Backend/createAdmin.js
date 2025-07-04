// Backend/createAdmin.js
require("dotenv").config(); // Cargar las variables de entorno
const mongoose = require("mongoose");
const User = require("./models/User"); // Importa tu modelo de usuario
const bcrypt = require("bcryptjs"); // Necesario para hashear si creas sin el método pre-save

async function createAdminUser() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Conectado a MongoDB para crear admin.");

    const username = "admin";
    const password = "admin123";

    // Primero, verifica si el usuario ya existe para no duplicarlo
    let existingUser = await User.findOne({ username });
    if (existingUser) {
      console.log("El usuario 'admin' ya existe en la base de datos.");
      // Si necesitas actualizar la contraseña del admin existente, descomenta y usa:
      // existingUser.password = await bcrypt.hash(password, 10);
      // await existingUser.save();
      // console.log("Contraseña de 'admin' actualizada.");
      mongoose.disconnect();
      return;
    }

    // Hashear la contraseña manualmente antes de crear el usuario,
    // ya que el hook 'pre("save")' en tu modelo User.js manejará esto automáticamente si usas .save()
    // Pero si creas directamente, es bueno entender el proceso.
    // En tu caso, User.js ya tiene el hook pre("save"), entonces solo crea el usuario.

    const newAdmin = new User({
      username: username,
      password: password, // La contraseña se hasheará automáticamente por el hook 'pre("save")'
    });

    await newAdmin.save();
    console.log(`Usuario '${username}' creado con éxito.`);
  } catch (error) {
    console.error("Error al crear el usuario admin:", error);
  } finally {
    mongoose.disconnect();
  }
}

createAdminUser();
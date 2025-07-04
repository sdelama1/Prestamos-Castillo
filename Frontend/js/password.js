// Frontend/js/password.js

// Verificar autenticación al cargar el script
document.addEventListener("DOMContentLoaded", () => {
    // checkAuth() y logout() deben estar definidos en js/login.js
    if (typeof checkAuth === 'function') {
        checkAuth();
    }
});

const passwordForm = document.getElementById("passwordForm");
if (passwordForm) {
    passwordForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        // Obtener valores y eliminar espacios en blanco al inicio/final
        const currentPassword = document.getElementById("currentPassword").value.trim();
        const newPassword = document.getElementById("newPassword").value.trim();
        const confirmPassword = document.getElementById("confirmPassword").value.trim();

        // Validaciones en el frontend
        if (!currentPassword || !newPassword || !confirmPassword) {
            await showCustomModal("Todos los campos de contraseña son requeridos.", "alert");
            return;
        }

        if (newPassword.includes(' ') || confirmPassword.includes(' ')) {
            await showCustomModal("La nueva contraseña no puede contener espacios en blanco.", "alert");
            return;
        }

        if (newPassword !== confirmPassword) {
            await showCustomModal("Las nuevas contraseñas no coinciden.", "alert");
            return;
        }

        if (newPassword.length < 6) {
            await showCustomModal("La nueva contraseña debe tener al menos 6 caracteres.", "alert");
            return;
        }

        // Obtener el token de autenticación del localStorage
        const token = getAuthToken(); // Esta función debe estar en js/login.js
        if (!token) {
            await showCustomModal("No estás autenticado. Por favor, inicia sesión.", "alert");
            logout(); // Redirigir al login
            return;
        }

        try {
            // Enviar la solicitud al backend para cambiar la contraseña
            const response = await fetch("http://localhost:5000/api/auth/change-password", {
                method: "PUT", // Usamos PUT para actualizar un recurso existente
                headers: {
                    "Content-Type": "application/json",
                    "x-auth-token": token, // Enviar el token JWT
                },
                body: JSON.stringify({ currentPassword, newPassword }),
            });

            const data = await response.json();

            if (response.ok) {
                await showCustomModal(data.msg || "Contraseña cambiada exitosamente.", "alert");
                passwordForm.reset(); // Limpiar el formulario
                // Después de cambiar la contraseña, es buena práctica forzar un nuevo login
                // o al menos limpiar el token para que el usuario inicie sesión con la nueva contraseña.
                logout(); 
            } else {
                await showCustomModal(data.msg || "Error al cambiar la contraseña.", "alert");
            }
        } catch (error) {
            console.error("Error al cambiar la contraseña:", error);
            await showCustomModal("Error de conexión con el servidor al intentar cambiar la contraseña.", "alert");
        }
    });
}

// Validación en tiempo real para coincidencia de contraseñas
const newPasswordInput = document.getElementById("newPassword");
const confirmPasswordInput = document.getElementById("confirmPassword");

if (newPasswordInput && confirmPasswordInput) {
    const validatePasswords = () => {
        const newPass = newPasswordInput.value.trim();
        const confirmPass = confirmPasswordInput.value.trim();

        if (confirmPass && newPass !== confirmPass) {
            confirmPasswordInput.setCustomValidity("Las contraseñas no coinciden.");
        } else {
            confirmPasswordInput.setCustomValidity("");
        }
    };

    newPasswordInput.addEventListener("input", validatePasswords);
    confirmPasswordInput.addEventListener("input", validatePasswords);
}

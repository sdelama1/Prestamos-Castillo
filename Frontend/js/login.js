// Frontend/js/login.js

// Configuración inicial
document.addEventListener("DOMContentLoaded", () => {
    // Si ya está logueado y está en la página de login, redirige
    const currentPage = window.location.pathname.split("/").pop();
    if (localStorage.getItem("loggedIn") === "true" && currentPage === "index.html") {
        window.location.href = "prestamos.html";
    }
});

// Manejo del formulario de login (solo si existe en la página actual, ej. index.html)
const loginForm = document.getElementById("loginForm");
if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;
        const errorMessage = document.getElementById("error-message");

        // Realizar la solicitud al backend para autenticar
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();

        if (response.ok) {
            // Si el login es exitoso, almacenar el token y marcar como logueado
            localStorage.setItem("token", data.token); // Almacenar el token JWT
            localStorage.setItem("loggedIn", "true");
            window.location.href = "prestamos.html"; // Redirigir a la página de préstamos
        } else {
            // Si las credenciales no son correctas
            errorMessage.textContent = "Usuario o contraseña incorrectos";
            errorMessage.style.display = "block";

            // Ocultar el mensaje de error después de 3 segundos
            setTimeout(() => {
                errorMessage.style.display = "none";
            }, 3000);
        }
    });
}

// Función para cerrar sesión
function logout() {
    localStorage.removeItem("loggedIn");
    localStorage.removeItem("token"); // Eliminar el token JWT
    window.location.href = "index.html";
}

// Función para verificar la autenticación en páginas protegidas
function checkAuth() {
    if (localStorage.getItem("loggedIn") !== "true") {
        window.location.href = "index.html";
    }
}

// Función para obtener el token de autenticación
function getAuthToken() {
    return localStorage.getItem("token");
}

// --- Funciones para Modales Personalizados (Reemplazan alert y confirm) ---

let resolveModalPromise; // Para manejar la promesa de confirmación

/**
 * Muestra un modal de alerta o confirmación.
 * @param {string} message - El mensaje a mostrar en el modal.
 * @param {'alert'|'confirm'} type - El tipo de modal ('alert' para OK, 'confirm' para Aceptar/Cancelar).
 * @returns {Promise<boolean>} - Resuelve a true si se confirma, false si se cancela (solo para 'confirm').
 */
function showCustomModal(message, type = 'alert') {
    const modal = document.getElementById('customModal');
    const modalMessage = document.getElementById('modalMessage');
    const modalActions = document.getElementById('modalActions');
    const modalAlertBtn = document.getElementById('modalAlertBtn');
    const modalConfirmBtn = document.getElementById('modalConfirmBtn');
    const modalCancelBtn = document.getElementById('modalCancelBtn');

    modalMessage.textContent = message;

    // Ocultar todos los botones por defecto
    modalAlertBtn.style.display = 'none';
    modalConfirmBtn.style.display = 'none';
    modalCancelBtn.style.display = 'none';

    return new Promise((resolve) => {
        resolveModalPromise = resolve; // Guarda la función resolve para usarla en los handlers de botones

        if (type === 'alert') {
            modalAlertBtn.style.display = 'block';
            modalAlertBtn.onclick = () => {
                closeModal();
                resolve(true); // Siempre resuelve a true para alertas
            };
        } else if (type === 'confirm') {
            modalConfirmBtn.style.display = 'block';
            modalCancelBtn.style.display = 'block';

            modalConfirmBtn.onclick = () => {
                closeModal();
                resolve(true); // Resuelve a true si se hace clic en Aceptar
            };
            modalCancelBtn.onclick = () => {
                closeModal();
                resolve(false); // Resuelve a false si se hace clic en Cancelar
            };
        }

        modal.style.display = 'flex'; // Mostrar el modal
    });
}

/**
 * Cierra el modal personalizado.
 */
function closeModal() {
    const modal = document.getElementById('customModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Asignar closeModal a los botones de cerrar (X) en los modales
document.addEventListener('DOMContentLoaded', () => {
    const closeButtons = document.querySelectorAll('.modal .close-button');
    closeButtons.forEach(button => {
        button.onclick = closeModal;
    });

    // Cerrar modal si se hace clic fuera del contenido
    const customModal = document.getElementById('customModal');
    if (customModal) {
        customModal.addEventListener('click', (e) => {
            if (e.target === customModal) {
                closeModal();
                // Si es un modal de confirmación y se cierra haciendo clic fuera, se considera cancelar
                if (resolveModalPromise) {
                    resolveModalPromise(false);
                    resolveModalPromise = null; // Limpiar la referencia
                }
            }
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // Seleccionar todos los elementos HTML necesarios
    const qrText = document.getElementById('qr-text');
    const colorInput = document.getElementById('color');
    const backgroundInput = document.getElementById('background');
    const sizeInput = document.getElementById('size');
    
    // qrcode.js necesita un div como contenedor, no directamente un canvas
    const qrcodeContainer = document.getElementById('qrcode-container');
    const generateBtn = document.getElementById('generateBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const messageArea = document.getElementById('message-area'); // Área para mostrar mensajes al usuario

    // Inicializar una variable para almacenar el objeto QRCode
    let qrcodeInstance;

    /**
     * Muestra un mensaje al usuario con animación.
     * @param {string} message - El texto del mensaje.
     * @param {string} type - Tipo de mensaje ('error', 'warning', 'success').
     */
    function displayMessage(message, type = 'error') {
        messageArea.textContent = message;
        messageArea.className = `message ${type}`; // Añade clases para estilos CSS
        messageArea.style.display = 'block'; // Asegura que sea visible
        messageArea.style.animation = 'fadeInDown 0.4s ease-out forwards'; // Aplica animación de entrada

        // Opcional: Ocultar el mensaje automáticamente después de unos segundos
        setTimeout(() => {
            if (messageArea.style.display === 'block') { // Solo si sigue visible
                messageArea.style.animation = 'fadeOutUp 0.4s ease-in forwards'; // Aplica animación de salida
                messageArea.addEventListener('animationend', function handler() {
                    messageArea.style.display = 'none';
                    messageArea.style.animation = ''; // Limpia la animación para la próxima vez
                    messageArea.removeEventListener('animationend', handler);
                });
            }
        }, 5000); // El mensaje desaparecerá después de 5 segundos
    }

    /**
     * Limpia cualquier mensaje mostrado en el área de mensajes.
     * Si un mensaje está visible, activa la animación de salida.
     */
    function clearMessage() {
        if (messageArea.style.display === 'block') {
            messageArea.style.animation = 'fadeOutUp 0.4s ease-in forwards';
            messageArea.addEventListener('animationend', function handler() {
                messageArea.textContent = '';
                messageArea.className = 'message';
                messageArea.style.display = 'none';
                messageArea.style.animation = ''; // Limpia la animación para la próxima vez
                messageArea.removeEventListener('animationend', handler);
            });
        }
    }

    /**
     * Función para generar el código QR.
     * Obtiene los valores de los inputs y usa qrcode.js para dibujar el QR.
     */
    function generateQRCode() {
        const text = qrText.value.trim();
        const color = colorInput.value;
        const background = backgroundInput.value;
        const size = parseInt(sizeInput.value);

        console.log("Botón 'Generar Código QR' clickeado");
        clearMessage(); // Limpiar cualquier mensaje previo

        try {
            // Validación de entrada básica
            if (!text) {
                throw new Error("Por favor, ingresa un texto o enlace válido para generar el código QR.");
            }
            if (isNaN(size) || size < 64 || size > 512) {
                throw new Error("El tamaño del QR debe ser un número entre 64 y 512.");
            }

            // Limpiar el contenedor del código QR anterior antes de generar uno nuevo
            qrcodeContainer.innerHTML = '';
            
            // Crear una nueva instancia de QRCode.
            qrcodeInstance = new QRCode(qrcodeContainer, {
                text: text,
                width: size,
                height: size,
                colorDark: color,
                colorLight: background,
                correctLevel: QRCode.CorrectLevel.H 
            });

            // Dar un pequeño retraso para asegurar que el canvas del QR ya esté creado y dibujado
            setTimeout(() => {
                const generatedCanvas = qrcodeContainer.querySelector('canvas');
                if (generatedCanvas) {
                    displayMessage("Código QR generado exitosamente.", "success");
                } else {
                    console.warn("Canvas del QR no encontrado después de la generación. ¿Problema con qrcode.js?");
                    displayMessage("Error interno: No se pudo acceder al canvas del QR.", "error");
                }
            }, 100); 

            // Habilitar el botón de descarga
            downloadBtn.disabled = false;

        } catch (error) {
            console.error("Error al generar el código QR:", error);
            // Manejo específico del error "code length overflow"
            if (error.message.includes("code length overflow")) {
                displayMessage(`Error: El texto es demasiado largo para el tamaño actual del QR (${size}px). Intenta un texto más corto o un tamaño de QR mayor (ej. 512).`, "error");
            } else {
                displayMessage(`Error al generar el código QR: ${error.message || "Por favor, verifica tu entrada."}`, "error");
            }
            // Deshabilitar el botón de descarga si hay un error
            downloadBtn.disabled = true;
        }
    }

    /**
     * Función para descargar el código QR generado como una imagen PNG.
     */
    function downloadQRCode() {
        if (!qrcodeInstance) {
            displayMessage("Por favor, genera un código QR primero para poder descargarlo.", "warning");
            return;
        }

        const generatedCanvas = qrcodeContainer.querySelector('canvas');

        if (!generatedCanvas) {
            displayMessage("No se encontró el canvas del código QR para descargar.", "error");
            return;
        }

        const dataURL = generatedCanvas.toDataURL("image/png");

        const link = document.createElement('a');
        link.href = dataURL;
        link.download = "codigo_qr.png"; 

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        displayMessage("Código QR descargado exitosamente.", "success");
    }

    // --- Event Listeners ---

    // Generar QR al hacer clic en el botón
    generateBtn.addEventListener('click', generateQRCode);

    // Descargar QR al hacer clic en el botón
    downloadBtn.addEventListener('click', downloadQRCode);

    // Eventos para regenerar el QR automáticamente al cambiar opciones clave
    qrText.addEventListener('input', generateQRCode);
    colorInput.addEventListener('input', generateQRCode);
    backgroundInput.addEventListener('input', generateQRCode);
    sizeInput.addEventListener('input', generateQRCode);

    // --- Inicialización ---
    // Generar el código QR inicial al cargar la página (con el valor por defecto)
    generateQRCode(); 
});
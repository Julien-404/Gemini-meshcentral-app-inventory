// This script is loaded within the inventory.html iframe.
// It communicates with the main MeshCentral page via the parent window's plugin API.

// Safely get the parent API
var parentApi = null;
try {
    if (window.parent && window.parent.pluginApi) {
        parentApi = window.parent.pluginApi;
    }
} catch (e) {
    // Cross-origin issues might prevent access, though unlikely in this context.
    console.error("Could not access parent plugin API.", e);
}

if (parentApi) {
    const startBtn = document.getElementById('startInventoryBtn');
    const statusDiv = document.getElementById('inventoryStatus');

    startBtn.addEventListener('click', function() {
        // Show status and disable the button to prevent multiple clicks
        startBtn.disabled = true;
        statusDiv.style.display = 'block';
        statusDiv.className = 'status-info';
        statusDiv.textContent = 'Lancement de l\'inventaire, veuillez patienter... Cette opération peut prendre plusieurs minutes.';

        // Get the current device group ID (meshid) from the parent window's context
        const meshId = window.parent.meshid;
        if (!meshId) {
            statusDiv.className = 'status-error';
            statusDiv.innerHTML = '<strong>Erreur :</strong> Impossible de trouver l\'ID du groupe actuel.';
            startBtn.disabled = false;
            return;
        }

        // Call the backend function 'startInventory' defined in softwareinventory.js
        parentApi.call('startInventory', { meshId: meshId }, function(result) {
            if (result && result.success) {
                statusDiv.className = 'status-success';
                statusDiv.innerHTML = `<strong>Succès !</strong><br>Inventaire terminé. Le fichier a été sauvegardé dans l'onglet "Fichiers" : <br><code>${result.filePath}</code>`;
            } else {
                statusDiv.className = 'status-error';
                statusDiv.innerHTML = `<strong>Erreur :</strong><br>${(result && result.message) ? result.message : 'Une erreur inconnue est survenue.'}`;
            }
            // Re-enable the button once the operation is complete
            startBtn.disabled = false;
        });
    });
} else {
    // This block runs if the plugin API isn't available.
    const container = document.querySelector('.container');
    container.innerHTML = '<p style="color: red;">Erreur: Impossible de communiquer avec l\'interface principale de MeshCentral.</p>';
}

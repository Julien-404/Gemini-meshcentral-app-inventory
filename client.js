// Fichier de la logique client (navigateur) pour notre onglet.

// Cette fonction s'exécute quand l'onglet est chargé.
(function() {
    // Récupère les éléments de notre onglet
    const runButton = document.getElementById('runInventoryButton');
    const statusDiv = document.getElementById('inventoryStatus');

    // Vérifie que les éléments existent
    if (!runButton || !statusDiv) {
        console.error("Plugin Inventory: Impossible de trouver les éléments du DOM.");
        return;
    }

    // Ajoute l'événement au clic sur le bouton
    runButton.onclick = function() {
        // 'mesh.MGR.activeDeviceGroup' contient les informations du groupe actuellement affiché
        const group = mesh.MGR.activeDeviceGroup;
        if (!group) {
            statusDiv.innerText = "Erreur: Impossible de trouver les informations du groupe actif.";
            return;
        }

        const confirmationMessage = "Voulez-vous lancer l'inventaire des applications sur tous les appareils en ligne de ce groupe ? Les résultats seront stockés dans les fichiers du groupe.";
        if (confirm(confirmationMessage)) {
            statusDiv.innerHTML = "<i>Lancement de l'inventaire en cours...</i>";
            runButton.disabled = true; // Désactive le bouton pendant l'opération

            // Appelle la fonction du serveur
            mesh.server.send({
                action: 'plugin',
                plugin: 'app-inventory',
                pluginaction: 'getAppInventory',
                domain: group.domain,
                deviceGroupId: group._id
            }).then(function(response) {
                // Affiche le résultat
                statusDiv.innerText = response.message || "Opération terminée.";
                runButton.disabled = false; // Réactive le bouton
            }).catch(function(err) {
                statusDiv.innerText = "Erreur: " + err;
                runButton.disabled = false; // Réactive le bouton en cas d'erreur
            });
        }
    };
})();

/**
 * @description Plugin d'inventaire d'applications pour MeshCentral
 * @author Votre Nom
 * @copyright 2025
 * @license Apache-2.0
 * @version 1.0.5
 */

"use strict";

module.exports.inventory = function (parent) {
    var obj = {};
    obj.parent = parent;
    obj.meshServer = parent.parent;
    obj.exports = [
        'runInventoryForSelectedGroup'
    ];
    
    // Cette fonction est appelée une seule fois au démarrage du serveur.
    // Nous savons qu'elle fonctionne grâce à vos logs précédents.
    obj.server_startup = function() {
        console.log("Plugin Inventory: Démarrage du plugin d'inventaire applicatif v1.0.5.");

        // --- TECHNIQUE DE DÉBOGAGE RADICALE ---
        // Nous allons "monkey-patcher" (modifier à la volée) une fonction de base de l'interface MeshCentral.
        // La fonction 'common.FormatBytes' est utilisée partout pour afficher des tailles de fichiers.
        // Si notre code est bien exécuté par le navigateur, cette modification sera active.
        try {
            var originalFormatBytes = common.FormatBytes;
            common.FormatBytes = function(bytes, decimals) {
                // On ajoute notre propre message de log.
                console.log("Plugin Inventory: Preuve que le JS est exécuté !");
                // On appelle ensuite la fonction originale pour ne pas casser l'interface.
                return originalFormatBytes(bytes, decimals);
            };
        } catch (e) {
            // Si 'common' n'existe pas encore, ce n'est pas grave.
            // Le but principal est de voir si ce bloc de code s'exécute.
        }
    };

    // Le reste du code est pour l'instant mis en commentaire pour ne pas interférer
    // avec notre test. Nous le réactiverons une fois le problème de chargement résolu.
    /*
    obj.registerPluginTab = function (args) {
        if (args.device == null) return;
        return { tabId: 'inventory', tabTitle: 'Inventaire' };
    };

    obj.onPluginTab = function(tabId, mesh) {
        // ... (code de l'onglet) ...
    };

    obj.runInventoryForSelectedGroup = function() {
        // ... (code de l'action) ...
    };
    */

    // Le code backend reste inchangé car il fonctionne.
    obj.hook_processAgentData = function(nodeid, data) {
        if (data == null || typeof data != 'object' || data.plugin !== 'inventory') return;
        if (data.action === 'inventoryResults') { saveInventory(nodeid, data.results); }
        return;
    };
    
    function saveInventory(nodeid, results) {
        const fs = require('fs');
        const path = require('path');
        var node = obj.meshServer.nodes[nodeid];
        if (!node) return;
        const meshid = node.meshid;
        const pluginDir = path.join(obj.meshServer.datapath, 'plugin-inventory');
        if (!fs.existsSync(pluginDir)) { fs.mkdirSync(pluginDir); }
        const cleanMeshId = meshid.replace(/[^a-zA-Z0-9]/g, '_');
        const filePath = path.join(pluginDir, `${cleanMeshId}.json`);
        var inventoryData = {};
        if (fs.existsSync(filePath)) {
            try { inventoryData = JSON.parse(fs.readFileSync(filePath)); } catch (e) { console.error(e); }
        }
        inventoryData[node.name] = {
            nodeid: node._id,
            timestamp: new Date().toISOString(),
            apps: results
        };
        fs.writeFileSync(filePath, JSON.stringify(inventoryData, null, 2));
        console.log(`Plugin Inventory: Inventaire pour ${node.name} (${node._id}) sauvegardé.`);
    };
    
    return obj;
};

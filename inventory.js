/**
 * @description Plugin d'inventaire d'applications pour MeshCentral
 * @author Votre Nom
 * @copyright 2025
 * @license Apache-2.0
 * @version 1.0.2
 */

"use strict";

module.exports.inventory = function (parent) {
    var obj = {};
    obj.parent = parent;
    obj.meshServer = parent.parent;
    obj.exports = [
        'runInventory'
    ];
    
    // --- NOUVEAU : Hook de démarrage du serveur ---
    // Cette fonction est appelée une seule fois lorsque le serveur démarre ou que le plugin est activé.
    obj.server_startup = function() {
        console.log("Plugin Inventory: Démarrage du plugin d'inventaire applicatif v1.0.2.");
    };

    // Hook pour ajouter un onglet à la page d'un groupe d'appareils
    obj.registerPluginTab = function (args) {
        // --- NOUVEAU : Journalisation pour le débogage ---
        // Affiche les arguments reçus pour voir pourquoi l'onglet ne s'affiche pas.
        console.log("Plugin Inventory: Hook 'registerPluginTab' appelé avec les arguments:", args);
        
        // On vérifie si nous sommes sur la page d'un groupe d'appareils.
        if (args.group == null) { return; }
        
        console.log("Plugin Inventory: Condition 'args.group != null' remplie. Ajout de l'onglet.");
        return {
            tabId: 'inventory',
            tabTitle: 'Inventaire Applicatif'
        };
    };

    // Fonction appelée lorsque l'onglet est affiché
    obj.onPluginTab = function(tabId, mesh) {
        if (tabId !== 'inventory') return;

        var content = document.getElementById('tab_inventory');
        if (!content) return;

        content.innerHTML = `
            <div class="p-3">
                <h5>Inventaire des applications Windows</h5>
                <p>Cliquez sur le bouton pour lancer un scan d'inventaire sur toutes les machines Windows connectées de ce groupe.</p>
                <button class="btn btn-primary" onclick="plugin.inventory.runInventory('${mesh._id}');">Lancer l'inventaire</button>
                <hr/>
                <div id="inventory_results"></div>
                <div id="inventory_file_path" class="mt-3" style="font-style: italic; color: grey;"></div>
            </div>
        `;
    };

    // Fonction pour lancer le scan sur les agents
    obj.runInventory = function(meshid) {
        var statusDiv = document.getElementById('inventory_results');
        if (statusDiv) statusDiv.innerHTML = "Demande d'inventaire envoyée aux machines Windows en ligne...";
        
        obj.meshServer.send({
            action: 'nodes',
            meshid: meshid,
            responseid: 'plugin_inventory_nodes'
        });

        obj.meshServer.once('nodes_plugin_inventory_nodes', function(nodes) {
            var onlineWindowsNodes = 0;
            for (var i in nodes) {
                var node = nodes[i];
                if (node.osdesc && node.osdesc.includes('Windows') && (node.conn & 1)) {
                    obj.meshServer.send({
                        action: 'msg',
                        type: 'plugin',
                        plugin: 'inventory',
                        pluginaction: 'getInventory',
                        nodeid: node._id
                    });
                    onlineWindowsNodes++;
                }
            }
            if (statusDiv) statusDiv.innerHTML = `Inventaire en cours sur ${onlineWindowsNodes} machine(s) Windows.`;
            var pathDiv = document.getElementById('inventory_file_path');
            if(pathDiv) pathDiv.innerText = `Les résultats seront stockés dans le dossier 'plugin-inventory' du serveur.`;
        });
    };

    // Hook appelé quand l'agent envoie des données
    obj.hook_processAgentData = function(nodeid, data) {
        if (data == null || typeof data != 'object' || data.plugin !== 'inventory') return;
        
        switch (data.action) {
            case 'inventoryResults':
                saveInventory(nodeid, data.results);
                break;
        }
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
            try {
                inventoryData = JSON.parse(fs.readFileSync(filePath));
            } catch (e) { console.error(e); }
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

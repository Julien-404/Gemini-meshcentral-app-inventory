/**
 * @description Plugin d'inventaire d'applications pour MeshCentral
 * @author Julien-404 & Gemini
 * @copyright 2025
 * @license Apache-2.0
 * @version 2.0.0
 */

"use strict";

module.exports.inventory = function (parent) {
    var obj = {};
    obj.parent = parent;
    obj.meshServer = parent.parent;
    obj.exports = [
        'runInventoryForSelectedGroup'
    ];
    
    // --- PARTIE SERVEUR ---
    // Cette partie s'exécute uniquement sur le serveur Node.js.

    obj.server_startup = function() {
        console.log("Plugin Inventory: Démarrage du plugin v2.0.0 (Serveur).");
    };

    obj.hook_processAgentData = function(nodeid, data) {
        // On s'assure que le message vient bien de notre plugin sur l'agent.
        if (data == null || typeof data !== 'object' || data.plugin !== 'inventory' || data.action !== 'inventoryResults') {
            return;
        }
        saveInventory(nodeid, data.results);
    };
    
    function saveInventory(nodeid, results) {
        const fs = require('fs');
        const path = require('path');
        const node = obj.meshServer.nodes[nodeid];
        if (!node) return;

        const meshid = node.meshid;
        const pluginDir = path.join(obj.meshServer.datapath, 'plugin-inventory');
        if (!fs.existsSync(pluginDir)) { fs.mkdirSync(pluginDir); }

        // Nettoyage du nom de fichier pour une compatibilité maximale.
        const cleanMeshId = meshid.replace(/[^a-zA-Z0-9]/g, '_');
        const filePath = path.join(pluginDir, `${cleanMeshId}.json`);
        
        let inventoryData = {};
        if (fs.existsSync(filePath)) {
            try {
                inventoryData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            } catch (e) {
                console.error(`Plugin Inventory: Erreur de lecture du fichier JSON existant ${filePath}`, e);
            }
        }
        
        inventoryData[node.name] = {
            nodeid: node._id,
            timestamp: new Date().toISOString(),
            apps: results
        };
        
        try {
            fs.writeFileSync(filePath, JSON.stringify(inventoryData, null, 2));
            console.log(`Plugin Inventory: Inventaire pour ${node.name} (${node._id}) sauvegardé.`);
        } catch (e) {
            console.error(`Plugin Inventory: Erreur d'écriture dans le fichier ${filePath}`, e);
        }
    }

    // --- PARTIE CLIENT ---
    // Les fonctions ci-dessous sont envoyées et exécutées dans le navigateur de l'utilisateur.

    // Hook qui s'exécute quand l'interface web est prête.
    obj.onWebUIStartupEnd = function() {
        console.log("Plugin Inventory: Le script client v2.0.0 est bien exécuté.");
    };

    // Hook pour ajouter un onglet à la page d'un périphérique.
    obj.registerPluginTab = function (args) {
        if (args.device == null) return;
        return { tabId: 'inventory', tabTitle: 'Inventaire' };
    };

    // Fonction appelée quand l'utilisateur clique sur notre onglet.
    obj.onPluginTab = function(tabId, mesh) {
        if (tabId !== 'inventory') return;

        const content = document.getElementById('tab_inventory');
        if (!content) return;
        
        content.innerHTML = '<div class="p-3">Chargement des groupes...</div>';

        // On demande la liste des groupes au serveur.
        obj.meshServer.send({ action: 'meshes', responseid: 'plugin_inventory_meshes' });

        obj.meshServer.once('meshes_plugin_inventory_meshes', function(meshes) {
            let groupOptions = '';
            meshes.filter(m => m.type === 2) // On ne garde que les groupes d'appareils
                  .forEach(m => groupOptions += `<option value="${m._id}">${m.name}</option>`);

            if (groupOptions === '') {
                content.innerHTML = '<div class="p-3">Aucun groupe d\'appareils trouvé.</div>';
                return;
            }

            // On affiche l'interface de contrôle.
            content.innerHTML = `
                <div class="p-3">
                    <h5>Lancer un inventaire sur un groupe</h5>
                    <p>Sélectionnez un groupe, puis cliquez sur le bouton pour lancer le scan sur tous ses agents Windows en ligne.</p>
                    <div class="form-group">
                        <label for="inventoryGroupSelect">Groupe d'appareils :</label>
                        <select class="form-control" id="inventoryGroupSelect">${groupOptions}</select>
                    </div>
                    <button class="btn btn-primary mt-3" onclick="plugin.inventory.runInventoryForSelectedGroup()">Lancer l'inventaire</button>
                    <hr/>
                    <div id="inventory_results"></div>
                </div>
            `;
        });
    };

    // Fonction appelée par le bouton "Lancer l'inventaire".
    obj.runInventoryForSelectedGroup = function() {
        const select = document.getElementById('inventoryGroupSelect');
        const statusDiv = document.getElementById('inventory_results');
        if (!select || !statusDiv) return;

        const meshid = select.value;
        statusDiv.innerHTML = "Récupération de la liste des agents...";
        
        obj.meshServer.send({ action: 'nodes', meshid: meshid, responseid: 'plugin_inventory_nodes' });

        obj.meshServer.once('nodes_plugin_inventory_nodes', function(nodes) {
            let onlineWindowsNodes = 0;
            for (const i in nodes) {
                const node = nodes[i];
                // On cible les agents Windows connectés.
                if (node.osdesc && node.osdesc.includes('Windows') && (node.conn & 1)) {
                    obj.meshServer.send({ action: 'msg', type: 'plugin', plugin: 'inventory', pluginaction: 'getInventory', nodeid: node._id });
                    onlineWindowsNodes++;
                }
            }
            statusDiv.innerHTML = `Demande d'inventaire envoyée à ${onlineWindowsNodes} machine(s) Windows. Les résultats seront stockés sur le serveur.`;
        });
    };
    
    return obj;
};

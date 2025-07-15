/**
 * @description Plugin d'inventaire d'applications pour MeshCentral
 * @author Julien-404 & Gemini
 * @copyright 2025
 * @license Apache-2.0
 * @version 2.0.2
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

    obj.server_startup = function() {
        console.log("Plugin Inventory: Démarrage du plugin v2.0.2 (Serveur).");
    };

    obj.admin_page = function(req, res, user) {
        // Le contenu de cette fonction ne change pas.
        let html = `
            <div class="plugin-admin-container">
                <h5>Inventaire applicatif Windows par groupe</h5>
                <p>Cette page vous permet de lancer un scan d'inventaire sur tous les agents Windows connectés d'un groupe d'appareils spécifique.</p>
                
                <div class="form-group">
                    <label for="inventoryGroupSelect">Sélectionnez un groupe :</label>
                    <select class="form-control" id="inventoryGroupSelect" disabled>
                        <option>Chargement...</option>
                    </select>
                </div>
                
                <button class="btn btn-primary mt-3" id="inventoryRunButton" onclick="plugin.inventory.runInventoryForSelectedGroup()" disabled>Lancer l'inventaire</button>
                <hr/>
                <div id="inventory_results" class="mt-3"></div>
            </div>

            <script>
                obj.server.send({ action: 'meshes', responseid: 'plugin_inventory_meshes' });
                obj.server.once('meshes_plugin_inventory_meshes', function(meshes) {
                    const select = document.getElementById('inventoryGroupSelect');
                    const runButton = document.getElementById('inventoryRunButton');
                    if (!select || !runButton) return;
                    select.innerHTML = '';
                    let groupCount = 0;
                    meshes.filter(m => m.type === 2).forEach(m => {
                        select.options.add(new Option(m.name, m._id));
                        groupCount++;
                    });
                    if (groupCount > 0) {
                        select.disabled = false;
                        runButton.disabled = false;
                    } else {
                        select.options.add(new Option('Aucun groupe trouvé', ''));
                    }
                });
            </script>
            <style>
                .plugin-admin-container { max-width: 800px; margin: 20px; padding: 20px; background: #fff; border: 1px solid #ddd; border-radius: 8px; }
            </style>
        `;
        res.end(html);
    };

    // --- LE CORRECTIF EST ICI ---
    // On déclare que pour voir la page, l'utilisateur doit avoir le droit de modifier les paramètres du serveur.
    obj.admin_page.rights = { "server-settings": true };


    obj.hook_processAgentData = function(nodeid, data) {
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
        const cleanMeshId = meshid.replace(/[^a-zA-Z0-9]/g, '_');
        const filePath = path.join(pluginDir, `${cleanMeshId}.json`);
        let inventoryData = {};
        if (fs.existsSync(filePath)) {
            try { inventoryData = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) { console.error(`Plugin Inventory: Erreur de lecture du fichier JSON existant ${filePath}`, e); }
        }
        inventoryData[node.name] = { nodeid: node._id, timestamp: new Date().toISOString(), apps: results };
        try {
            fs.writeFileSync(filePath, JSON.stringify(inventoryData, null, 2));
            console.log(`Plugin Inventory: Inventaire pour ${node.name} (${node._id}) sauvegardé.`);
        } catch (e) { console.error(`Plugin Inventory: Erreur d'écriture dans le fichier ${filePath}`, e); }
    }

    // --- PARTIE CLIENT ---
    obj.runInventoryForSelectedGroup = function() {
        const select = document.getElementById('inventoryGroupSelect');
        const statusDiv = document.getElementById('inventory_results');
        if (!select || !statusDiv) return;
        const meshid = select.value;
        if (!meshid) return;
        statusDiv.innerHTML = "Récupération de la liste des agents...";
        obj.server.send({ action: 'nodes', meshid: meshid, responseid: 'plugin_inventory_nodes' });
        obj.server.once('nodes_plugin_inventory_nodes', function(nodes) {
            let onlineWindowsNodes = 0;
            for (const i in nodes) {
                const node = nodes[i];
                if (node.osdesc && node.osdesc.includes('Windows') && (node.conn & 1)) {
                    obj.server.send({ action: 'msg', type: 'plugin', plugin: 'inventory', pluginaction: 'getInventory', nodeid: node._id });
                    onlineWindowsNodes++;
                }
            }
            statusDiv.innerHTML = `Demande d'inventaire envoyée à ${onlineWindowsNodes} machine(s) Windows.`;
        });
    };
    
    return obj;
};

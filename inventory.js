/**
 * @description Plugin d'inventaire d'applications pour MeshCentral
 * @author Votre Nom
 * @copyright 2025
 * @license Apache-2.0
 * @version 1.0.4
 */

"use strict";

module.exports.inventory = function (parent) {
    var obj = {};
    obj.parent = parent;
    obj.meshServer = parent.parent;
    obj.exports = [
        'runInventoryForSelectedGroup'
    ];
    
    obj.server_startup = function() {
        console.log("Plugin Inventory: Démarrage du plugin d'inventaire applicatif v1.0.4.");
    };

    // --- APPROCHE FINALE ---
    // Ce hook est appelé pour chaque périphérique et fonctionne comme attendu.
    obj.registerPluginTab = function (args) {
        // On vérifie qu'on est bien sur la page d'un périphérique.
        if (args.device == null) return;
        
        console.log("Plugin Inventory: Ajout de l'onglet 'Inventaire' au périphérique.");
        return {
            tabId: 'inventory',
            tabTitle: 'Inventaire' // Nom court pour l'onglet
        };
    };

    // Cette fonction est appelée quand l'utilisateur clique sur notre onglet.
    obj.onPluginTab = function(tabId, mesh) {
        if (tabId !== 'inventory') return;

        var content = document.getElementById('tab_inventory');
        if (!content) return;
        
        // Affiche un message de chargement
        content.innerHTML = '<div class="p-3">Chargement des groupes...</div>';

        // Demande la liste de tous les groupes au serveur
        obj.meshServer.send({
            action: 'meshes',
            responseid: 'plugin_inventory_meshes'
        });

        // Une fois que le serveur répond avec la liste des groupes...
        obj.meshServer.once('meshes_plugin_inventory_meshes', function(meshes) {
            var groupOptions = '';
            for (var i in meshes) {
                // On ne garde que les groupes d'appareils (type 2)
                if (meshes[i].type == 2) {
                    groupOptions += `<option value="${meshes[i]._id}">${meshes[i].name}</option>`;
                }
            }

            // On construit l'interface HTML avec la liste déroulante
            content.innerHTML = `
                <div class="p-3">
                    <h5>Lancer un inventaire sur un groupe</h5>
                    <p>Sélectionnez un groupe d'appareils dans la liste ci-dessous, puis cliquez sur le bouton pour lancer le scan.</p>
                    
                    <div class="form-group">
                        <label for="inventoryGroupSelect">Groupe d'appareils :</label>
                        <select class="form-control" id="inventoryGroupSelect">
                            ${groupOptions}
                        </select>
                    </div>
                    
                    <button class="btn btn-primary mt-3" onclick="plugin.inventory.runInventoryForSelectedGroup()">Lancer l'inventaire</button>
                    <hr/>
                    <div id="inventory_results"></div>
                </div>
            `;
        });
    };

    // Fonction appelée par le bouton "Lancer l'inventaire"
    obj.runInventoryForSelectedGroup = function() {
        var select = document.getElementById('inventoryGroupSelect');
        if (!select) return;
        var meshid = select.value; // On récupère l'ID du groupe sélectionné
        
        var statusDiv = document.getElementById('inventory_results');
        if (statusDiv) statusDiv.innerHTML = "Demande d'inventaire envoyée aux machines Windows en ligne du groupe sélectionné...";
        
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
            if (statusDiv) statusDiv.innerHTML = `Inventaire en cours sur ${onlineWindowsNodes} machine(s) Windows. Les résultats seront stockés sur le serveur.`;
        });
    };

    // Le reste du code (backend) ne change pas...
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

/**
 * @description Plugin d'inventaire d'applications pour MeshCentral
 * @author Votre Nom
 * @copyright 2025
 * @license Apache-2.0
 * @version 1.0.0
 */

"use strict";

module.exports.inventory = function (parent) {
    var obj = {};
    obj.parent = parent;
    obj.meshServer = parent.parent;
    obj.exports = [
        'runInventory',
        'saveInventory'
    ];
    
    // Hook pour ajouter un onglet à la page d'un groupe d'appareils
    obj.registerPluginTab = function (args) {
        // On s'assure que l'onglet n'est ajouté que pour les groupes d'appareils
        if (args.meshid == null || !args.meshid.startsWith('mesh//')) { return; }
        
        // Retourne l'objet de configuration de l'onglet
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

        // Contenu HTML de notre onglet
        content.innerHTML = `
            <div class="p-3">
                <h5>Inventaire des applications Windows</h5>
                <p>Cliquez sur le bouton pour lancer un scan d'inventaire sur toutes les machines Windows connectées de ce groupe.</p>
                <button class="btn btn-primary" onclick="plugin.inventory.runInventory('${mesh._id}');">Lancer l'inventaire</button>
                <hr/>
                <div id="inventory_results"></div>
            </div>
        `;
    };

    // Fonction pour lancer le scan sur les agents
    obj.runInventory = function(meshid) {
        var statusDiv = document.getElementById('inventory_results');
        statusDiv.innerHTML = "Demande d'inventaire envoyée aux machines Windows en ligne...";
        
        // On demande au serveur de nous envoyer la liste des noeuds du groupe
        obj.meshServer.send({
            action: 'nodes',
            meshid: meshid,
            responseid: 'plugin_inventory_nodes'
        });

        // Quand le serveur répond...
        obj.meshServer.once('nodes_plugin_inventory_nodes', function(nodes) {
            var onlineWindowsNodes = 0;
            for (var i in nodes) {
                var node = nodes[i];
                // On vérifie si le noeud est une machine Windows et si elle est en ligne
                if (node.osdesc && node.osdesc.includes('Windows') && (node.conn & 1)) {
                    // On envoie une commande à l'agent
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
            statusDiv.innerHTML = `Inventaire en cours sur ${onlineWindowsNodes} machine(s) Windows. Les résultats seront stockés sur le serveur.`;
        });
    };

    // Hook appelé quand l'agent envoie des données
    obj.hook_processAgentData = function(nodeid, data) {
        // On s'assure que la donnée nous est destinée
        if (!data.plugin || data.plugin !== 'inventory') return;
        
        switch (data.action) {
            case 'inventoryResults':
                obj.saveInventory(nodeid, data.results);
                break;
        }
        return;
    };
    
    // Fonction pour sauvegarder les résultats
    obj.saveInventory = function(nodeid, results) {
        const fs = require('fs');
        const path = require('path');
        
        var node = obj.meshServer.nodes[nodeid];
        if (!node) return;
        
        // On récupère l'identifiant du groupe
        const meshid = node.meshid;
        // On s'assure que le dossier du plugin existe
        const pluginDir = path.join(obj.meshServer.datapath, 'plugin-inventory');
        if (!fs.existsSync(pluginDir)) { fs.mkdirSync(pluginDir); }
        
        // On crée un fichier JSON avec les résultats
        const filePath = path.join(pluginDir, `${meshid.replace('mesh//', '')}.json`);
        
        var inventoryData = {};
        // On lit le fichier existant pour le mettre à jour
        if (fs.existsSync(filePath)) {
            try {
                inventoryData = JSON.parse(fs.readFileSync(filePath));
            } catch (e) { console.error(e); }
        }
        
        // On met à jour l'inventaire pour le noeud spécifique
        inventoryData[node.name] = {
            timestamp: new Date().toLocaleString(),
            apps: results
        };
        
        // On sauvegarde le fichier
        fs.writeFileSync(filePath, JSON.stringify(inventoryData, null, 2));
        console.log(`Inventaire pour ${node.name} sauvegardé.`);
    };
    
    return obj;
};
// Fichier de la logique serveur du plugin

module.exports = function(server) {
    // Ce message devrait maintenant apparaître dans vos logs serveur au démarrage !
    console.log("Plugin 'app-inventory' SERVER part is loading...");

    const obj = {};

    // Helper function to find or create the target folder within the group's files.
    function findOrCreateInventoryFolder(domain, parentMeshId, callback) {
        const inventoryFolderName = 'Software Inventory';
        server.db.GetFolders(domain, [parentMeshId], function(err, folders) {
            if (err || !folders || !folders[parentMeshId]) { return callback(new Error("Could not get group folders.")); }
            const existingFolder = folders[parentMeshId].find(f => f.name === inventoryFolderName);
            if (existingFolder) { return callback(null, existingFolder.meshid); }
            server.db.CreateFolder(domain, parentMeshId, inventoryFolderName, function(err, newFolder) {
                if (err) { return callback(err); }
                return callback(null, newFolder._id);
            });
        });
    }

    // Cette fonction est appelée par le client (navigateur)
    obj.getAppInventory = function(domain, deviceGroupId, user, args, callback) {
        const response = { success: false, message: "Erreur inconnue." };
        let onlineAgents = 0;

        server.db.GetDeviceGroup(domain, deviceGroupId, user._id, function(err, groups) {
            if (err || groups.length === 0) {
                response.message = "Accès refusé ou groupe non trouvé.";
                return callback(response);
            }
            const group = groups[0];
            const groupMeshId = group.meshid;

            findOrCreateInventoryFolder(domain, groupMeshId, function(err, inventoryFolderId) {
                if (err) {
                    response.message = `Erreur lors de la création du dossier d'inventaire : ${err.message}`;
                    return callback(response);
                }

                server.db.GetAllDevicesInGroup(domain, deviceGroupId, function(err, nodes) {
                    if (err) {
                        response.message = "Erreur lors de la récupération des appareils.";
                        return callback(response);
                    }
                    
                    const psScript = `$ErrorActionPreference = 'SilentlyContinue';$paths = @('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*');Get-ItemProperty $paths | Where-Object { $_.DisplayName -ne $null -and $_.DisplayName -ne "" } | Select-Object DisplayName, DisplayVersion, Publisher, InstallDate | Sort-Object DisplayName | ConvertTo-Csv -NoTypeInformation`;
                    const shScriptDebian = "dpkg-query -W -f='${Package},${Version},${Maintainer}\\n'";
                    const shScriptRhel = "rpm -qa --qf '%{NAME},%{VERSION},%{VENDOR}\\n'";

                    nodes.forEach(function(node) {
                        const agent = server.webserver.wsagents[node._id];
                        if (agent && agent.authenticated === 1) {
                            onlineAgents++;
                            let scriptToRun = '';
                            if (node.osdesc && node.osdesc.toLowerCase().includes('windows')) { scriptToRun = psScript; }
                            else if (node.osdesc && (node.osdesc.toLowerCase().includes('debian') || node.osdesc.toLowerCase().includes('ubuntu'))) { scriptToRun = shScriptDebian; }
                            else if (node.osdesc && (node.osdesc.toLowerCase().includes('centos') || node.osdesc.toLowerCase().includes('red hat'))) { scriptToRun = shScriptRhel; }
                            else { return; }

                            agent.runScript(scriptToRun, null, 60, function(agent, result) {
                                if (result.ret !== 0) { return console.error(`Erreur d'exécution du script sur ${node.name}`); }
                                const timestamp = new Date().toISOString().replace(/:/g, '-');
                                const deviceName = node.name.replace(/[^a-zA-Z0-9]/g, '_');
                                const fileName = `${deviceName}_${timestamp}.csv`;
                                const fileContent = Buffer.from(result.stdout, 'utf8');
                                server.db.CreateFile(domain, inventoryFolderId, node._id, fileName, fileContent, function(err) {
                                    if (err) { console.error(`Erreur d'écriture du fichier pour ${node.name}: ${err}`); }
                                    else { console.log(`Plugin App-Inventory: Inventaire pour ${node.name} sauvegardé.`); }
                                });
                            });
                        }
                    });

                    if (onlineAgents > 0) {
                        response.success = true;
                        response.message = `${onlineAgents} appareil(s) en ligne ont reçu la demande. Les résultats seront dans le dossier 'Software Inventory' des fichiers du groupe.`;
                    } else {
                        response.message = "Aucun appareil n'est actuellement en ligne dans ce groupe.";
                    }
                    callback(response);
                });
            });
        });
    };

    return obj;
};

/*
 * MeshCentral-SoftwareInventory plugin
 * @author Gemini
 */

module.exports.server_main = function (obj) {
    const _obj = obj;
    _obj.path = require('path');

    /**
     * Converts an array of objects into a CSV string.
     * @param {Array<Object>} data The array of objects to convert.
     * @returns {string} The CSV formatted string.
     */
    function toCsv(data) {
        if (!data || data.length === 0) return '';
        const headers = Object.keys(data[0]);
        const csvRows = [];
        csvRows.push(headers.join(','));

        for (const row of data) {
            const values = headers.map(header => {
                const val = row[header] === null || row[header] === undefined ? '' : row[header];
                // Escape double quotes by doubling them and wrap value in double quotes
                const escaped = ('' + val).replace(/"/g, '""');
                return `"${escaped}"`;
            });
            csvRows.push(values.join(','));
        }
        return csvRows.join('\n');
    }

    /**
     * Parses the CSV output from PowerShell.
     * @param {string} csvString The raw CSV string from PowerShell.
     * @param {string} computerName The name of the computer this data is from.
     * @returns {Array<Object>} An array of software objects.
     */
    function parsePsCsv(csvString, computerName) {
        // Sanitize and split lines
        const lines = csvString.replace(/\r/g, '').split('\n').filter(line => line.trim() !== '');
        if (lines.length < 2) return []; // No data if less than header + 1 row

        // Parse headers, removing quotes
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const data = [];

        // Parse each data row
        for (let i = 1; i < lines.length; i++) {
            // This is a simple parser; a robust one would handle quotes in values.
            const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
            const row = { 'ComputerName': computerName };
            for (let j = 0; j < headers.length; j++) {
                if (headers[j]) {
                    row[headers[j]] = values[j];
                }
            }
            // Only add the row if it has a display name.
            if (row.DisplayName) {
                data.push(row);
            }
        }
        return data;
    }

    // --- Main Plugin Action, exposed to the front-end ---
    _obj.exports.startInventory = async function (args, user, req) {
        const meshId = args.meshId;
        if (!meshId) {
            return { success: false, message: "ID de groupe (meshId) manquant." };
        }

        const mesh = _obj.meshserver.meshes[meshId];
        if (!mesh) {
            return { success: false, message: "Groupe d'appareils introuvable." };
        }

        // Check if user has rights to run commands on this device group
        const rights = await _obj.meshserver.db.getMeshUserRights(meshId, user._id).catch(() => null);
        if (!rights || !(rights.rights & _obj.meshserver.db.MESH_RIGHTS.REMOTECONTROL)) {
            return { success: false, message: "Permissions insuffisantes pour exécuter des commandes sur ce groupe." };
        }

        // Get all nodes for the mesh and filter for online Windows agents
        const allNodes = await _obj.meshserver.db.getNodesByMesh(meshId).catch(() => []);
        const onlineWindowsAgents = allNodes.filter(node => {
            const session = _obj.meshserver.nodes[node._id];
            // conn & 1 means connected, agent.id 4 is Windows Desktop
            return session && (session.conn & 1) && session.agent && session.agent.id === 4;
        });

        if (onlineWindowsAgents.length === 0) {
            return { success: false, message: "Aucun appareil Windows n'est actuellement en ligne dans ce groupe." };
        }

        const allSoftware = [];
        // This PowerShell command gets software from both 32-bit and 64-bit registry locations
        // and filters out entries without a DisplayName.
        const command = `powershell -Command "Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Where-Object { $_.DisplayName -ne $null -and $_.DisplayName -ne '' } | Select-Object DisplayName, DisplayVersion, Publisher | ConvertTo-Csv -NoTypeInformation"`;

        // Create a promise for each agent command
        const promises = onlineWindowsAgents.map(node => new Promise((resolve) => {
            const nodeSession = _obj.meshserver.nodes[node._id];
            if (!nodeSession) return resolve();

            // Failsafe timeout for each command
            const timeout = setTimeout(() => {
                console.log(`Plugin-Inventory: Commande expirée pour ${node.name}`);
                resolve();
            }, 90000); // 90 second timeout

            _obj.meshserver.agent.runCommand(command, node._id, null, nodeSession.domain, (id, exitCode, data) => {
                clearTimeout(timeout);
                if (exitCode === 0 && data) {
                    try {
                        // PowerShell with ConvertTo-Csv should be UTF-8
                        const csvData = Buffer.from(data).toString('utf8');
                        const parsed = parsePsCsv(csvData, node.name);
                        allSoftware.push(...parsed);
                    } catch (ex) {
                        console.error(`Plugin-Inventory: Erreur de parsing pour ${node.name}:`, ex);
                    }
                }
                resolve(); // Always resolve to not block the entire process
            });
        }));

        await Promise.all(promises);

        if (allSoftware.length === 0) {
            return { success: false, message: "Impossible de récupérer les informations logicielles. Les appareils n'ont retourné aucune donnée." };
        }

        // Rename columns for the final CSV
        const finalData = allSoftware.map(item => ({
            'NomOrdinateur': item.ComputerName,
            'NomLogiciel': item.DisplayName,
            'Version': item.DisplayVersion,
            'Editeur': item.Publisher
        }));

        const csvContent = toCsv(finalData);

        // --- Save the file to MeshCentral Files tab ---
        const folderName = "Software Inventory";
        const date = new Date();
        const fileName = `Inventory-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}_${date.getHours()}${date.getMinutes()}${date.getSeconds()}.csv`;
        // Use forward slashes for cross-platform compatibility in paths
        const fullPath = _obj.path.join(folderName, fileName).replace(/\\/g, '/');

        try {
            // Get the full mesh object to get the domain
            const fullMesh = _obj.meshserver.meshes[meshId];

            // Create the folder. MeshCentral handles this gracefully if it already exists.
            await new Promise((resolve, reject) => {
                _obj.meshserver.db.CreateFileFolder(fullMesh.domain, meshId, folderName, user, (err) => {
                    if (err) {
                        // This error can sometimes be ignored if the folder exists, but we log it.
                        console.error('Plugin-Inventory: Erreur lors de la création du dossier (peut-être normal s\'il existe déjà):', err);
                    }
                    resolve();
                });
            });

            // Prepare the file descriptor and save the file
            const fileDescriptor = { name: fileName, parentid: folderName, size: Buffer.byteLength(csvContent, 'utf8') };
            await new Promise((resolve, reject) => {
                _obj.meshserver.db.SetFile(fullMesh.domain, meshId, fileDescriptor, Buffer.from(csvContent, 'utf8'), user, (err) => {
                    if (err) return reject(new Error("Impossible de sauvegarder le fichier CSV."));
                    resolve();
                });
            });

            return { success: true, filePath: fullPath };

        } catch (e) {
            console.error("Plugin-Inventory: Erreur de sauvegarde de fichier:", e);
            return { success: false, message: e.message || "Une erreur est survenue lors de la sauvegarde du fichier." };
        }
    };

    return _obj;
};

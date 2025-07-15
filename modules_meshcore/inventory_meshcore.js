/**
 * @description Module agent pour le plugin d'inventaire
 */

// On écoute les messages venant du serveur
parent.AddCommandHandler(function (data) {
    if (data.plugin !== 'inventory') return false;

    switch (data.pluginaction) {
        case 'getInventory':
            // Commande PowerShell pour lister les applications installées (32-bit et 64-bit) et les convertir en JSON
            const command = `
                $ErrorActionPreference = 'SilentlyContinue';
                $apps = @();
                Get-ItemProperty HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | ForEach-Object { $apps += [PSCustomObject]@{ DisplayName = $_.DisplayName; DisplayVersion = $_.DisplayVersion; Publisher = $_.Publisher; InstallDate = $_.InstallDate } };
                Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | ForEach-Object { $apps += [PSCustomObject]@{ DisplayName = $_.DisplayName; DisplayVersion = $_.DisplayVersion; Publisher = $_.Publisher; InstallDate = $_.InstallDate } };
                $uniqueApps = $apps | Where-Object { $_.DisplayName } | Sort-Object -Property DisplayName -Unique;
                $uniqueApps | ConvertTo-Json -Compress;
            `;

            const child_process = require('child_process');
            child_process.exec('powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "' + command + '"', function (err, stdout, stderr) {
                if (err) {
                    // En cas d'erreur, on notifie le serveur
                    parent.send(JSON.stringify({ plugin: 'inventory', action: 'inventoryResults', results: { error: err.message } }));
                    return;
                }
                try {
                    const results = JSON.parse(stdout);
                    // On envoie les résultats au serveur
                    parent.send(JSON.stringify({ plugin: 'inventory', action: 'inventoryResults', results: results }));
                } catch (e) {
                    parent.send(JSON.stringify({ plugin: 'inventory', action: 'inventoryResults', results: { error: 'Failed to parse PowerShell output.' } }));
                }
            });
            break;
        default:
            return false;
    }
    return true; // On indique qu'on a traité la commande
});
# PowerShell script to replace string literals with Features enum
# Run from: c:\Users\Hyvnt\T\Discord\pyebot

$replacements = @{
    '"tickets"' = 'Features.Tickets'
    '"autoroles"' = 'Features.Autoroles'
    '"roles"' = 'Features.Roles'
    '"reputationDetection"' = 'Features.ReputationDetection'
    '"automod"' = 'Features.Automod'
}

$files = @(
    "src/systems/tickets/index.ts",
    "src/systems/autorole/service.ts",
    "src/systems/autorole/scheduler.ts",
    "src/systems/autorole/antiquity.ts",
    "src/modules/guild-roles/index.ts",
    "src/middlewares/moderationLimit.ts",
    "src/events/listeners/reputationDetection.ts",
    "src/events/listeners/autorole.ts",
    "src/events/listeners/autoModSystem.ts"
)

foreach ($file in $files) {
    $content = Get-Content $file -Raw
    $originalContent = $content
    
    foreach ($key in $replacements.Keys) {
        $content = $content -replace $key, $replacements[$key]
    }
    
    if ($content -ne $originalContent) {
        # Add import if not present
        if ($content -notmatch 'import.*Features.*from.*@/modules/features') {
            $content = $content -replace '(import.*from\s+"@/modules/features")', '$1`nimport { Features } from "@/modules/features";'
            $content = $content -replace 'import { isFeatureEnabled } from "@/modules/features";', 'import { isFeatureEnabled, Features } from "@/modules/features";'
        }
        
        Set-Content -Path $file -Value $content -NoNewline
        Write-Host "Updated: $file"
    }
}

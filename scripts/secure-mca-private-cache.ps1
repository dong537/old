# 仅收紧本项目 MCA 原始缓存；不接受外部路径，避免误改其他目录。
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$root = (Resolve-Path -LiteralPath (Join-Path $repoRoot 'data/private/mca-institutions-2026-11-18')).Path
$items = @((Get-Item -LiteralPath $root -Force)) + @(Get-ChildItem -LiteralPath $root -Recurse -Force)

# 跟随目录链接会越过授权范围，因此有重解析点就停止。
foreach ($item in $items) {
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw "拒绝处理重解析点: $($item.FullName)"
    }
}

$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$allowedSids = @(
    $currentSid,
    [Security.Principal.SecurityIdentifier]::new('S-1-5-18'),
    [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
)
$allowedValues = @($allowedSids | ForEach-Object { $_.Value })
$inheritance = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
    [Security.AccessControl.InheritanceFlags]::ObjectInherit

# 先封闭目标目录，再让现有与新增子项继承这三项权限。
$acl = Get-Acl -LiteralPath $root
$existingRules = @($acl.Access)
$alreadySecure = $acl.AreAccessRulesProtected -and $existingRules.Count -eq $allowedValues.Count
if ($alreadySecure) {
    foreach ($rule in $existingRules) {
        $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if (($sid -notin $allowedValues) -or $rule.IsInherited -or
            ($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) -or
            (($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl) -or
            (($rule.InheritanceFlags -band $inheritance) -ne $inheritance)) {
            $alreadySecure = $false
            break
        }
    }
}
if (-not $alreadySecure) {
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) {
        if (-not $rule.IsInherited) {
            [void]$acl.RemoveAccessRuleSpecific($rule)
        }
    }
    foreach ($sid in $allowedSids) {
        $rule = [Security.AccessControl.FileSystemAccessRule]::new(
            $sid,
            [Security.AccessControl.FileSystemRights]::FullControl,
            $inheritance,
            [Security.AccessControl.PropagationFlags]::None,
            [Security.AccessControl.AccessControlType]::Allow
        )
        [void]$acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $root -AclObject $acl
}

# 正常子项会自动继承；只有存在独立 ACL 时才清理该子项的额外规则。
foreach ($item in $items | Select-Object -Skip 1) {
    $childAcl = Get-Acl -LiteralPath $item.FullName
    $explicit = @($childAcl.Access | Where-Object { -not $_.IsInherited })
    if ($childAcl.AreAccessRulesProtected -or $explicit.Count -gt 0) {
        $childAcl.SetAccessRuleProtection($false, $true)
        foreach ($rule in @($childAcl.Access | Where-Object { -not $_.IsInherited })) {
            [void]$childAcl.RemoveAccessRuleSpecific($rule)
        }
        Set-Acl -LiteralPath $item.FullName -AclObject $childAcl
    }
}

function Assert-PrivateAcl([string]$path, [bool]$isRoot) {
    $actual = Get-Acl -LiteralPath $path
    if ($actual.AreAccessRulesProtected -ne $isRoot) {
        throw "ACL 继承状态异常: $path"
    }
    $rules = @($actual.Access)
    if ($rules.Count -ne $allowedValues.Count) {
        throw "ACL 规则数量异常: $path ($($rules.Count))"
    }
    foreach ($rule in $rules) {
        $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if (($sid -notin $allowedValues) -or
            ($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) -or
            (($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl) -or
            ($rule.IsInherited -eq $isRoot)) {
            throw "ACL 规则异常: $path ($sid)"
        }
    }
}

Assert-PrivateAcl -path $root -isRoot $true
foreach ($item in $items | Select-Object -Skip 1) {
    Assert-PrivateAcl -path $item.FullName -isRoot $false
}

# 新建文件也必须只继承允许的主体。
$probePath = Join-Path $root ('.acl-inheritance-probe-' + [guid]::NewGuid().ToString('N'))
try {
    [IO.File]::WriteAllBytes($probePath, [byte[]]@())
    Assert-PrivateAcl -path $probePath -isRoot $false
} finally {
    if (Test-Path -LiteralPath $probePath) { Remove-Item -LiteralPath $probePath -Force }
}

[pscustomobject]@{ root = $root; verifiedObjects = $items.Count; newFileInheritance = 'verified'; allowedSids = $allowedValues } |
    ConvertTo-Json -Compress

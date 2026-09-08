[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$RepositoryRoot,

    [Parameter(Mandatory = $true)]
    [string]$PathListBase64
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$limits = [ordered]@{
    cyclomatic = 10
    abcMagnitude = 30
    cognitive = 15
    functionLines = 80
    maxNesting = 4
}
$loopTypes = @('DoUntilStatementAst', 'DoWhileStatementAst', 'ForEachStatementAst', 'ForStatementAst', 'WhileStatementAst')
$controlTypes = @('CatchClauseAst', 'IfStatementAst', 'SwitchStatementAst', 'TernaryExpressionAst', 'TrapStatementAst') + $loopTypes
$logicalOperators = @('And', 'Or', 'Xor')
$comparisonOperators = @(
    'Contains', 'CContains', 'CEq', 'CGe', 'CGt', 'CIn', 'CLe', 'CLike', 'CLt', 'CMatch', 'CNe', 'CNotContains', 'CNotIn', 'CNotLike', 'CNotMatch',
    'Eq', 'Ge', 'Gt', 'In', 'IContains', 'IEq', 'IGe', 'IGt', 'IIn', 'ILe', 'ILike', 'ILt', 'IMatch', 'INe', 'INotContains', 'INotIn', 'INotLike', 'INotMatch',
    'Is', 'IsNot', 'Le', 'Like', 'Lt', 'Match', 'Ne', 'NotContains', 'NotIn', 'NotLike', 'NotMatch'
)

function Get-Sha256 {
    param([string]$Text)
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
        return ([System.BitConverter]::ToString($algorithm.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
    } finally {
        $algorithm.Dispose()
    }
}

function Get-TypeName {
    param([System.Management.Automation.Language.Ast]$Node)
    return $Node.GetType().Name
}

function Test-IsNestedFunctionNode {
    param(
        [System.Management.Automation.Language.Ast]$Node,
        [System.Management.Automation.Language.FunctionDefinitionAst]$Owner
    )
    $parent = $Node.Parent
    while ($null -ne $parent -and $parent -ne $Owner) {
        if ($parent -is [System.Management.Automation.Language.FunctionDefinitionAst]) { return $true }
        $parent = $parent.Parent
    }
    return $false
}

function Get-ControlDepth {
    param(
        [System.Management.Automation.Language.Ast]$Node,
        [System.Management.Automation.Language.FunctionDefinitionAst]$Owner
    )
    $depth = 0
    $current = $Node
    while ($null -ne $current -and $current -ne $Owner) {
        if ($controlTypes -contains (Get-TypeName $current)) { $depth += 1 }
        $current = $current.Parent
    }
    return $depth
}

function Get-DecisionIncrement {
    param([System.Management.Automation.Language.Ast]$Node)
    $type = Get-TypeName $Node
    if ($type -eq 'IfStatementAst') { return @($Node.Clauses).Count }
    if ($type -eq 'SwitchStatementAst') { return @($Node.Clauses).Count }
    if ($loopTypes -contains $type) { return 1 }
    if ($type -in @('CatchClauseAst', 'TernaryExpressionAst', 'TrapStatementAst')) { return 1 }
    if ($type -eq 'BinaryExpressionAst' -and $logicalOperators -contains [string]$Node.Operator) { return 1 }
    if ($type -eq 'PipelineChainAst') { return 1 }
    return 0
}

function Get-ConditionIncrement {
    param([System.Management.Automation.Language.Ast]$Node)
    $type = Get-TypeName $Node
    if ($type -eq 'IfStatementAst') { return @($Node.Clauses).Count }
    if ($type -eq 'SwitchStatementAst') { return @($Node.Clauses).Count }
    if ($loopTypes -contains $type) { return 1 }
    if ($type -in @('CatchClauseAst', 'TernaryExpressionAst', 'TrapStatementAst', 'PipelineChainAst')) { return 1 }
    if ($type -eq 'BinaryExpressionAst' -and ([string]$Node.Operator -in ($logicalOperators + $comparisonOperators))) { return 1 }
    return 0
}

function Get-StructuralCognitiveIncrement {
    param(
        [System.Management.Automation.Language.Ast]$Node,
        [System.Management.Automation.Language.FunctionDefinitionAst]$Owner
    )
    $type = Get-TypeName $Node
    $parentDepth = [Math]::Max(0, (Get-ControlDepth $Node $Owner) - 1)
    if ($type -eq 'IfStatementAst') { return (1 + $parentDepth) + [Math]::Max(0, @($Node.Clauses).Count - 1) }
    if ($type -eq 'SwitchStatementAst' -or $loopTypes -contains $type -or $type -in @('CatchClauseAst', 'TernaryExpressionAst', 'TrapStatementAst')) {
        return 1 + $parentDepth
    }
    return 0
}

function Get-LogicalCognitiveIncrement {
    param([System.Management.Automation.Language.Ast]$Node)
    $type = Get-TypeName $Node
    if ($type -eq 'BinaryExpressionAst' -and $logicalOperators -contains [string]$Node.Operator) {
        $parent = $Node.Parent
        if ((Get-TypeName $parent) -ne 'BinaryExpressionAst' -or [string]$parent.Operator -ne [string]$Node.Operator) { return 1 }
    }
    return 0
}

function Get-JumpCognitiveIncrement {
    param([System.Management.Automation.Language.Ast]$Node)
    $type = Get-TypeName $Node
    if ($type -in @('BreakStatementAst', 'ContinueStatementAst') -and $null -ne $Node.Label) { return 1 }
    return 0
}

function Get-CognitiveIncrement {
    param(
        [System.Management.Automation.Language.Ast]$Node,
        [System.Management.Automation.Language.FunctionDefinitionAst]$Owner
    )
    return (Get-StructuralCognitiveIncrement $Node $Owner) + (Get-LogicalCognitiveIncrement $Node) + (Get-JumpCognitiveIncrement $Node)
}

function Get-FunctionMeasurement {
    param(
        [string]$RelativePath,
        [System.Management.Automation.Language.FunctionDefinitionAst]$Function,
        [int]$Ordinal
    )
    $nodes = @($Function.Body.FindAll({ param($candidate) $true }, $true) | Where-Object { -not (Test-IsNestedFunctionNode $_ $Function) })
    $cyclomatic = 1
    $assignments = 0
    $branches = 0
    $conditions = 0
    $cognitive = 0
    $maxNesting = 0
    $statements = 0
    foreach ($node in $nodes) {
        $type = Get-TypeName $node
        $cyclomatic += Get-DecisionIncrement $node
        $conditions += Get-ConditionIncrement $node
        $cognitive += Get-CognitiveIncrement $node $Function
        $maxNesting = [Math]::Max($maxNesting, (Get-ControlDepth $node $Function))
        if ($type -eq 'AssignmentStatementAst' -or ($type -eq 'UnaryExpressionAst' -and [string]$node.TokenKind -in @('MinusMinus', 'PlusPlus'))) { $assignments += 1 }
        if ($type -in @('CommandAst', 'InvokeMemberExpressionAst')) { $branches += 1 }
        if ($type.EndsWith('StatementAst', [System.StringComparison]::Ordinal)) { $statements += 1 }
    }
    $abcMagnitude = [Math]::Round([Math]::Sqrt(($assignments * $assignments) + ($branches * $branches) + ($conditions * $conditions)), 2)
    $functionLines = $Function.Extent.EndLineNumber - $Function.Extent.StartLineNumber + 1
    $observed = [ordered]@{
        cyclomatic = $cyclomatic
        abcMagnitude = $abcMagnitude
        cognitive = $cognitive
        functionLines = $functionLines
        maxNesting = $maxNesting
    }
    $violations = @()
    foreach ($metric in $limits.Keys) {
        if ($observed[$metric] -gt $limits[$metric]) {
            $violations += [pscustomobject][ordered]@{ metric = $metric; observed = $observed[$metric]; maximum = $limits[$metric] }
        }
    }
    $parameters = @($Function.Parameters).Count
    return [pscustomobject][ordered]@{
        functionId = "$RelativePath::$($Function.Name)#$Ordinal"
        path = $RelativePath
        name = $Function.Name
        kind = 'FunctionDefinitionAst'
        startLine = $Function.Extent.StartLineNumber
        endLine = $Function.Extent.EndLineNumber
        functionLines = $functionLines
        parameters = $parameters
        sourceSha256 = Get-Sha256 $Function.Extent.Text
        cyclomatic = $cyclomatic
        assignments = $assignments
        branches = $branches
        conditions = $conditions
        abcMagnitude = $abcMagnitude
        cognitive = $cognitive
        maxNesting = $maxNesting
        statements = $statements
        thresholdViolations = @($violations)
    }
}

function Get-Maximum {
    param([object[]]$Rows, [string]$Property)
    if ($Rows.Count -eq 0) { return 0 }
    return ($Rows | Measure-Object -Property $Property -Maximum).Maximum
}

$resolvedRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$rootPrefix = $resolvedRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$pathListJson = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($PathListBase64))
$decodedPaths = ConvertFrom-Json -InputObject $pathListJson
if ($decodedPaths -is [string]) {
    $paths = @($decodedPaths)
} else {
    $paths = @(for ($pathIndex = 0; $pathIndex -lt @($decodedPaths).Count; $pathIndex += 1) { [string]$decodedPaths[$pathIndex] })
}
$rows = @()
$parseErrors = @()
foreach ($relativePathValue in $paths) {
    $relativePath = ([string]$relativePathValue).Replace('\', '/')
    if ([System.IO.Path]::IsPathRooted($relativePath) -or $relativePath.Split('/') -contains '..') { throw "Unsafe relative path: $relativePath" }
    $absolutePath = (Resolve-Path -LiteralPath (Join-Path $resolvedRoot $relativePath)).Path
    if (-not $absolutePath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Path escapes repository root: $relativePath" }
    $tokens = $null
    $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($absolutePath, [ref]$tokens, [ref]$errors)
    foreach ($errorRecord in @($errors)) {
        $parseErrors += [pscustomobject][ordered]@{
            path = $relativePath
            line = $errorRecord.Extent.StartLineNumber
            column = $errorRecord.Extent.StartColumnNumber
            message = $errorRecord.Message
        }
    }
    $ordinals = @{}
    $functions = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true))
    foreach ($function in $functions) {
        $ordinal = 1 + [int]$ordinals[$function.Name]
        $ordinals[$function.Name] = $ordinal
        $rows += Get-FunctionMeasurement $relativePath $function $ordinal
    }
}
$rows = @($rows | Sort-Object path, startLine, functionId)
$violationRows = @($rows | Where-Object { @($_.thresholdViolations).Count -gt 0 })
$violationCounts = [ordered]@{}
foreach ($metric in $limits.Keys) { $violationCounts[$metric] = @($rows | Where-Object { $_.$metric -gt $limits[$metric] }).Count }
$report = [pscustomobject][ordered]@{
    contract = [ordered]@{
        id = 'MATH_QUEST_POWERSHELL_FUNCTION_QUALITY_V1'
        parser = 'SYSTEM_MANAGEMENT_AUTOMATION_AST'
        cyclomatic = 'ONE_PLUS_IF_CLAUSES_SWITCH_CLAUSES_LOOPS_CATCH_TRAP_TERNARY_LOGICAL_AND_PIPELINE_CHAINS'
        abc = 'ASSIGNMENTS_COMMAND_OR_METHOD_BRANCHES_AND_BOOLEAN_CONDITIONS_EUCLIDEAN_MAGNITUDE'
        cognitive = 'NESTED_CONTROL_FLOW_LOGICAL_CHAINS_AND_LABELED_JUMPS'
        functionLoc = 'PHYSICAL_INCLUSIVE_SOURCE_LINES'
        nesting = 'CONTROL_AST_ANCESTOR_DEPTH'
    }
    limits = $limits
    files = $paths.Count
    functions = $rows.Count
    parseErrors = @($parseErrors)
    maxima = [ordered]@{
        cyclomatic = Get-Maximum $rows 'cyclomatic'
        abcMagnitude = Get-Maximum $rows 'abcMagnitude'
        cognitive = Get-Maximum $rows 'cognitive'
        functionLines = Get-Maximum $rows 'functionLines'
        maxNesting = Get-Maximum $rows 'maxNesting'
    }
    violationFunctions = $violationRows.Count
    violationCounts = $violationCounts
    rows = @($rows)
}
$report | ConvertTo-Json -Depth 12 -Compress

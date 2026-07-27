param()
function Write-ToneWav {
  param(
    [string]$Path,
    [double]$Freq,
    [double]$DurationSec,
    [double]$Amp = 0.25,
    [int]$SampleRate = 22050
  )
  $samples = [int]($SampleRate * $DurationSec)
  $ms = New-Object System.IO.MemoryStream
  $bw = New-Object System.IO.BinaryWriter($ms)
  $dataSize = $samples * 2
  $bw.Write([char[]]@('R', 'I', 'F', 'F'))
  $bw.Write([int](36 + $dataSize))
  $bw.Write([char[]]@('W', 'A', 'V', 'E', 'f', 'm', 't', ' '))
  $bw.Write([int]16)
  $bw.Write([int16]1)
  $bw.Write([int16]1)
  $bw.Write([int]$SampleRate)
  $bw.Write([int]($SampleRate * 2))
  $bw.Write([int16]2)
  $bw.Write([int16]16)
  $bw.Write([char[]]@('d', 'a', 't', 'a'))
  $bw.Write([int]$dataSize)
  for ($i = 0; $i -lt $samples; $i++) {
    $t = $i / $SampleRate
    $env = [Math]::Min(1.0, $t / 0.02) * [Math]::Min(1.0, ($DurationSec - $t) / 0.08)
    $val = [int16]($Amp * $env * [Math]::Sin(2 * [Math]::PI * $Freq * $t) * 32767)
    $bw.Write($val)
  }
  $dir = [IO.Path]::GetDirectoryName($Path)
  if (-not [IO.Directory]::Exists($dir)) {
    [IO.Directory]::CreateDirectory($dir) | Out-Null
  }
  [IO.File]::WriteAllBytes($Path, $ms.ToArray())
}

$dir = $PSScriptRoot
Write-ToneWav (Join-Path $dir 'tap.wav') 880 0.06 0.18
Write-ToneWav (Join-Path $dir 'confirm.wav') 660 0.12 0.22
Write-ToneWav (Join-Path $dir 'incorrect.wav') 440 0.18 0.15
Write-ToneWav (Join-Path $dir 'close.wav') 523 0.25 0.12
Get-ChildItem $dir | Format-Table Name, Length

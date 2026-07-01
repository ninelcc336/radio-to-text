param(
  [string]$OutputPath = "E:\ai-list\radio-to-text\tools\sample-meeting.wav"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Speech

$root = Split-Path -Parent $OutputPath
if (-not (Test-Path $root)) {
  New-Item -ItemType Directory -Path $root | Out-Null
}

$tempDir = Join-Path $root "tmp-sample-meeting"
if (Test-Path $tempDir) {
  Remove-Item -Recurse -Force $tempDir
}
New-Item -ItemType Directory -Path $tempDir | Out-Null

$segments = @(
  @{ Voice = "Microsoft Huihui Desktop"; Rate = 0; Text = "大家先确认一下今天会议的重点，我们先讨论第一阶段的范围。" },
  @{ Voice = "Microsoft Kangkang"; Rate = -1; Text = "我建议先做本地转写和说话人区分，摘要能力可以后面再补。" },
  @{ Voice = "Microsoft Huihui Desktop"; Rate = 1; Text = "可以，那我们先把隐私优先这个原则落实到本地处理链路里。" },
  @{ Voice = "Microsoft Kangkang"; Rate = 0; Text = "没问题，我再补充一点，导出结果至少要支持文本和 Markdown。" }
)

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$sampleRate = 16000
$concatList = Join-Path $tempDir "concat.txt"
$concatLines = New-Object System.Collections.Generic.List[string]

for ($i = 0; $i -lt $segments.Count; $i++) {
  $segment = $segments[$i]
  $segmentPath = Join-Path $tempDir ("segment-{0}.wav" -f $i)
  $synth.SelectVoice($segment.Voice)
  $synth.Rate = $segment.Rate
  $synth.SetOutputToWaveFile($segmentPath)
  $synth.Speak($segment.Text)
  $synth.SetOutputToNull()
  $concatLines.Add(("file '{0}'" -f $segmentPath.Replace("\", "/")))
}

$concatLines | Set-Content -Encoding UTF8 $concatList
$ffmpeg = python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"
& $ffmpeg -y -f concat -safe 0 -i $concatList -ar $sampleRate -ac 1 $OutputPath | Out-Null

Remove-Item -Recurse -Force $tempDir
Write-Output $OutputPath

param(
  [int]$Port = 8080
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$mimeMap = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".ico"  = "image/x-icon"
}

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII)
      $requestLine = $reader.ReadLine()
      while (($line = $reader.ReadLine()) -and $line -ne "") { }

      $path = "/index.html"
      if ($requestLine -match '^\S+\s+(\S+)\s') {
        $rawPath = $Matches[1].Split('?')[0]
        if ($rawPath -ne "/") { $path = $rawPath }
      }
      $path = [System.Uri]::UnescapeDataString($path)
      $filePath = Join-Path $root ($path.TrimStart("/"))

      $writer = New-Object System.IO.StreamWriter($stream, [System.Text.Encoding]::ASCII)
      $writer.AutoFlush = $true

      if (Test-Path $filePath -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($filePath)
        $contentType = $mimeMap[$ext]
        if (-not $contentType) { $contentType = "application/octet-stream" }
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $writer.Write("HTTP/1.1 200 OK`r`n")
        $writer.Write("Content-Type: $contentType`r`n")
        $writer.Write("Content-Length: $($bytes.Length)`r`n")
        $writer.Write("Connection: close`r`n`r`n")
        $writer.Flush()
        $stream.Write($bytes, 0, $bytes.Length)
      } else {
        $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
        $writer.Write("HTTP/1.1 404 Not Found`r`n")
        $writer.Write("Content-Type: text/plain; charset=utf-8`r`n")
        $writer.Write("Content-Length: $($body.Length)`r`n")
        $writer.Write("Connection: close`r`n`r`n")
        $writer.Flush()
        $stream.Write($body, 0, $body.Length)
      }
      $stream.Flush()
    } catch {
      Write-Host "Request error: $_"
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}

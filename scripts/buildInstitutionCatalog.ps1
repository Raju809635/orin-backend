function First-Value {
  param([object[]]$Values)
  foreach ($v in $Values) {
    if ($null -ne $v -and -not [string]::IsNullOrWhiteSpace([string]$v)) {
      return [string]$v
    }
  }
  return ""
}
function Norm([string]$v) {
  if ([string]::IsNullOrWhiteSpace($v)) { return "" }
  return (($v.ToLower() -replace '[^a-z0-9]+',' ') -replace '\s+',' ').Trim()
}
function Canon([string]$category) {
  $n = Norm $category
  if (-not $n) { return 'Institution' }
  if ($n.Contains('school')) { return 'School' }
  if ($n.Contains('intermediate') -or $n.Contains('junior')) { return 'Junior College' }
  if ($n.Contains('degree')) { return 'Degree College' }
  if ($n.Contains('engineering') -or $n -eq 'iit' -or $n -eq 'iiit' -or $n -eq 'nit') { return 'Engineering College' }
  if ($n.Contains('university')) { return 'University' }
  if ($n.Contains('law')) { return 'Law College' }
  if ($n.Contains('health') -or $n.Contains('medical')) { return 'Health College' }
  if ($n.Contains('diploma')) { return 'Diploma College' }
  return $category
}
function StateName([string]$v) {
  if ([string]::IsNullOrWhiteSpace($v)) { return '' }
  return (($v.Trim() -replace '\s+',' ').Split(' ') | ForEach-Object {
    if ($_.Length -gt 0) { $_.Substring(0,1).ToUpper() + $_.Substring(1).ToLower() }
  }) -join ' '
}
function Add-Row {
  param($Rows, $Seen, [string]$Id, [string]$Name, [string]$Type, [string]$District, [string]$State, [string]$Source)
  if ([string]::IsNullOrWhiteSpace($Name)) { return }
  $item = [pscustomobject]@{
    id = $Id
    name = $Name.Trim()
    institutionType = $Type
    district = $District
    state = $State
    source = $Source
  }
  $key = Norm ($item.name + '|' + $item.state + '|' + $item.district + '|' + $item.institutionType)
  if ([string]::IsNullOrWhiteSpace($key)) { return }
  if ($Seen.Add($key)) { [void]$Rows.Add($item) }
}
New-Item -ItemType Directory -Force -Path "c:/Users/rbomm/Downloads/ORIN/orin-backend/data" | Out-Null
$ts = Get-Content -Raw -Path "c:/Users/rbomm/Downloads/ORIN/education/Telangana_Education_Data/master/ts_educational_master.json" | ConvertFrom-Json
$india = Get-Content -Raw -Path "c:/Users/rbomm/Downloads/ORIN/education/India_Engineering_Data/master/india_engineering_master.json" | ConvertFrom-Json
$rows = New-Object System.Collections.Generic.List[object]
$seen = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($item in $ts) {
  Add-Row $rows $seen (First-Value @($item.id, $item.College_Code, $item.UDISECode, $item.name)) (First-Value @($item.name, $item.Institution_Name)) (Canon (First-Value @($item.category, $item.type, $item.Category, 'Institution'))) (First-Value @($item.district, $item.District)) 'Telangana' (First-Value @($item.source, 'Telangana Education'))
}
foreach ($prop in $india.PSObject.Properties) {
  $stateName = StateName $prop.Name
  foreach ($item in $prop.Value) {
    Add-Row $rows $seen (First-Value @($item.i, $item.id, $item.n)) (First-Value @($item.n, $item.name)) (Canon (First-Value @($item.t, 'Engineering'))) (First-Value @($item.c, $item.district)) $stateName 'India Engineering Master'
  }
}
$rows | ConvertTo-Json -Depth 4 -Compress | Set-Content -Path "c:/Users/rbomm/Downloads/ORIN/orin-backend/data/institutionCatalog.json" -Encoding UTF8
Get-Item "c:/Users/rbomm/Downloads/ORIN/orin-backend/data/institutionCatalog.json" | Select-Object Length
$rows.Count

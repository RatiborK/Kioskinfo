# DESKTOP-OBLAKO — развёртывание (план, НЕ выполнено)

Сервером выбран постоянно работающий ПК `DESKTOP-OBLAKO`, ранее использовавшийся как файловый сервер в сети ДК. Не нарушать работу SMB, принтера и других задач.

## Перед установкой

1. Установить ОС, доступные ресурсы CPU/RAM/диск, права, свободные TCP-порты, резервное копирование и текущие службы.
2. Сохранить сведения о текущей конфигурации; не менять рабочие SMB-права и пароли.
3. Определить папку программы и папку данных на отдельном свободном диске/каталоге.
4. Убедиться, что выбранный порт не занят и разрешён локальным брандмауэром; HTTPS с сертификатом, доверенным рабочими ПК.
5. Разворачивать сначала в тестовом режиме на loopback; только после включения входа и ограничения прав открыть для LAN.

## Команда preflight (одна строка, PowerShell 7 / Windows PowerShell)

Вставлять только содержимое команды, **без префикса `PS C:\...>`**:

```powershell
[pscustomobject]@{Computer=$env:COMPUTERNAME;OS=(Get-CimInstance Win32_OperatingSystem).Caption;Version=(Get-CimInstance Win32_OperatingSystem).Version;RAM_GB=[math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB,1);CPU=(Get-CimInstance Win32_Processor|Select-Object -First 1 -ExpandProperty Name)}|Format-List;Get-PSDrive -PSProvider FileSystem|Select-Object Name,@{N='FreeGB';E={[math]::Round($_.Free/1GB,1)}}|Format-Table -AutoSize;Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue|Group-Object LocalPort|Sort-Object {[int]$_.Name}|Select-Object -First 40 Name,Count|Format-Table -AutoSize
```

Команда только читает данные. Не запускает установку и не меняет настройки.

## Планируемые адреса

Пока **не действуют**: `https://navikultura.local/screen`, `https://navikultura.local/editor`, `https://navikultura.local/admin`. Название внутри LAN и сертификат требуют настройки DNS/hosts в инфраструктуре ДК. На старте localhost:5173 используется исключительно для разработки.

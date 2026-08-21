# Настройка Docker Desktop (WSL2) — запуск от администратора

Docker Desktop не запускается, потому что на Windows не настроен **WSL2**.

## Шаг 1 — включить функции Windows (PowerShell от администратора)

```powershell
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
```

## Шаг 2 — перезагрузить компьютер

Обязательно.

## Шаг 3 — установить WSL2 и дистрибутив Ubuntu (PowerShell от администратора)

```powershell
wsl --set-default-version 2
wsl --install -d Ubuntu
```

После `wsl --install -d Ubuntu` откроется консоль Ubuntu — задайте имя пользователя и пароль.

## Шаг 4 — проверить WSL2

```powershell
wsl -l -v
```
Должен показать `Ubuntu ... VERSION 2`.

## Шаг 5 — запустить Docker Desktop

1. Откройте **Docker Desktop**.
2. В настройках **Settings → General** включите «Use the WSL 2 based engine».
3. Дождитесь статуса «Docker engine running».

## Шаг 6 — проверить Docker

```powershell
docker ps
```
Должно вывести пустой список (без ошибок 500).

## Шаг 7 — развернуть Postiz

```powershell
cd C:\tool\opencode\dcl_X_content_factory\postiz
# создать .env (см. postiz/README.md)
docker compose up -d
```

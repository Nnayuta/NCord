@echo off
title LoveChat Desktop
cd /d "%~dp0"

echo ============================================================
echo                    LoveChat Desktop
echo ============================================================
echo.

:: 1. Verificar se o Node.js esta instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] O Node.js nao foi encontrado no sistema!
    echo Por favor, instale o Node.js em: https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: 2. Verificar dependencias (node_modules)
if not exist "node_modules\" (
    echo [INFO] Instalando dependencias necessarias...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao instalar dependencias.
        pause
        exit /b 1
    )
    echo [OK] Dependencias instaladas com sucesso!
    echo.
)

:: 3. Garantir que o frontend React esta atualizado e compilado
echo [INFO] Compilando frontend React...
call npm run build
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao compilar frontend.
    pause
    exit /b 1
)

echo [OK] Abrindo LoveChat Desktop...
echo.

:: 4. Iniciar o Electron (que inicia o servidor automaticamente em segundo plano)
call npx electron .

if %errorlevel% neq 0 (
    echo.
    echo [AVISO] O aplicativo foi encerrado com codigo %errorlevel%.
    pause
)

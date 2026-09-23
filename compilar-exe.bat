@echo off
title LoveChat - Compilar Executavel .EXE
cd /d "%~dp0"

echo ============================================================
echo           LoveChat - Compilando Executavel (.exe)
echo ============================================================
echo.
echo [INFO] Aguarde, empacotando o LoveChat em um executavel unico...
echo.

call npm run dist

if %errorlevel% equ 0 (
    echo.
    echo ============================================================
    echo [SUCESSO] O arquivo executavel foi gerado na pasta "dist\":
    echo    -> dist\LoveChat.exe
    echo.
    echo Voce pode enviar o arquivo "LoveChat.exe" diretamente para a
    echo outra pessoa! Ela so precisa dar 2 cliques para abrir.
    echo ============================================================
) else (
    echo.
    echo [ERRO] Falha durante a compilacao (codigo: %errorlevel%).
)

pause

@echo off
title NCord - Compilar Executavel .EXE
cd /d "%~dp0"

echo ============================================================
echo            NCord - Compilando Executavel (.exe)
echo ============================================================
echo.
echo [INFO] Aguarde, empacotando o NCord em um executavel unico...
echo.

call npm run dist

if %errorlevel% equ 0 (
    echo.
    echo ============================================================
    echo [SUCESSO] O arquivo executavel foi gerado na pasta "dist\":
    echo    -> dist\NCord.exe
    echo.
    echo Voce pode enviar o arquivo "NCord.exe" diretamente para a
    echo outra pessoa! Ela so precisa dar 2 cliques para abrir.
    echo ============================================================
) else (
    echo.
    echo [ERRO] Falha durante a compilacao (codigo: %errorlevel%).
)

pause

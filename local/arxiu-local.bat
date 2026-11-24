@echo off
rem Arrenca l'Arxiu en local (nomes aquest ordinador) per pujar-hi documents.
rem Doble clic per obrir-lo; tanca la finestra o prem Ctrl+C per aturar-lo.
rem Opcio: "arxiu-local.bat reconstruir" torna a compilar la web (despres d'actualitzar el codi).
setlocal
chcp 65001 >nul
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo No s'ha trobat Node.js. Instal.la la versio 22 LTS des de https://nodejs.org i torna-ho a provar.
  pause & exit /b 1
)

if not exist node_modules (
  echo Instal.lant dependencies...
  call npm install || (pause & exit /b 1)
)

if /i "%~1"=="reconstruir" if exist dist rmdir /s /q dist
if not exist dist\index.html (
  echo Compilant la web...
  call npm run build || (pause & exit /b 1)
)

rem Dades sempre a la mateixa carpeta (arxiu\data), escoltant nomes a aquest ordinador.
set HOST=127.0.0.1
set PORT=3000
set PUBLIC_URL=http://localhost:3000
if "%DATA_DIR%"=="" set DATA_DIR=%CD%\data

echo.
echo Arxiu en marxa a http://localhost:3000   (dades a %DATA_DIR%)
echo Primera vegada: busca a sota l'enllac "configura?token=..." per crear el compte.
echo.
start "" /b cmd /c "timeout /t 3 >nul & start http://localhost:3000"
call npm start
pause

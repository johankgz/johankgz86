@echo off
REM ====================================================================
REM  LANCER LE SITE SUR VOTRE ORDINATEUR  (Windows)
REM  ------------------------------------------------------------------
REM  Double-cliquez ce fichier. Le site s'ouvre dans le navigateur.
REM  Fermez cette fenetre pour l'arreter.
REM ====================================================================
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe.
  echo Installez-le depuis https://nodejs.org ^(version 20 ou plus^), puis relancez.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Premiere fois : installation de la dependance...
  call npm install --omit=dev --no-audit --no-fund
)

if "%PORT%"=="" set PORT=8080
echo.
echo Le site demarre sur http://localhost:%PORT%
echo Connexion : societe tle, identifiant johan
echo Pour arreter : fermez cette fenetre.
echo.
start "" "http://localhost:%PORT%"
call npm start

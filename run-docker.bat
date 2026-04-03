@echo off
setlocal

set IMAGE_NAME=drones-project-gemini
set CONTAINER_NAME=drones-project-gemini

docker build -t %IMAGE_NAME% -f Dockerfile .
if errorlevel 1 exit /b 1

docker ps -a --format "{{.Names}}" | findstr /x /c:"%CONTAINER_NAME%" >nul
if not errorlevel 1 (
    docker rm -f %CONTAINER_NAME% >nul 2>&1
)

docker run --rm -p 4173:4173 --name %CONTAINER_NAME% %IMAGE_NAME%
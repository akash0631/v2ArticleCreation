#!/bin/sh
# Azure App Service custom startup script
# Set this as the startup command in Azure: /home/site/wwwroot/startup.sh
exec node --max-old-space-size=2048 dist/index.js

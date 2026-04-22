@echo off
echo Running Data Refresh...
call npm install
node update-data.js
echo.
echo Committing to Git...
git add .
git commit -m "Automated data refresh by update.bat"
git push
echo Done!
pause

# WaWp Gateway Starter (Baileys + Express)
خطوات سريعة:
1) نزّل المشروع، افتح التيرمنال داخل المجلد.
2) `npm i`
3) `cp .env.example .env` ثم افتح `.env` وغيّر `WAWP_TOKEN` لأي قيمة قوية (مثال: RAYMON-123456).
4) `npm start` ثم افتح من المتصفح `http://localhost:3000/status`
5) في البلجن:
   - API Base URL = عنوان السيرفر (مثال: http://YOUR_SERVER:3000)
   - API Token = نفس القيمة الموجودة في .env
Endpoints:
  GET  /status
  POST /connect
  POST /logout
  POST /send   body: { "to":"<phone>", "message":"..." }

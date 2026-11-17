// Force Node.js server process timezone to Indian Standard Time (Asia/Kolkata, UTC+05:30)
// Imported as the very first module in server.ts so all libraries initialize under IST.
process.env.TZ = 'Asia/Kolkata';

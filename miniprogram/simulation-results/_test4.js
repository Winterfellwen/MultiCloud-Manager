const a = require("miniprogram-automator");
a.connect({wsEndpoint:"ws://localhost:9420"}).then(async function(mp) {
  await new Promise(function(r) { setTimeout(r, 2000); });
  await mp.evaluate("wx.switchTab({ url: '/pages/agent/chat' })");
  await new Promise(function(r) { setTimeout(r, 2000); });
  const p = await mp.currentPage();
  console.log("Page:", p.path);
  mp.disconnect();
}).catch(function(e) { console.log("Err:", e.message); });

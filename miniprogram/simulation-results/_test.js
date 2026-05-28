const a = require("miniprogram-automator");
a.connect({wsEndpoint:"ws://localhost:9420"}).then(async mp => {
  await new Promise(r => setTimeout(r, 2000));
  await mp.evaluate("wx.switchTab({ url: '/pages/index/index' })");
  await new Promise(r => setTimeout(r, 2000));
  const p = await mp.currentPage();
  console.log("Page:", p.path);
  mp.disconnect();
}).catch(e => console.log("Err:", e.message));

const a = require("miniprogram-automator");
const fs = require("fs");
async function main() {
  const mp = await a.connect({wsEndpoint:"ws://localhost:9420"});
  await new Promise(r => setTimeout(r, 2000));
  // Home page
  await mp.evaluate("wx.switchTab({ url: '/pages/index/index' })");
  await new Promise(r => setTimeout(r, 2000));
  let p = await mp.currentPage();
  console.log("HOME:", p.path);
  let data = await p.data();
  console.log("stats:", JSON.stringify(data.stats));
  let ss = await mp.screenshot();
  fs.writeFileSync("simulation-results/screenshots/s-home.png", Buffer.from(ss, "base64"));
  console.log("OK");
  mp.disconnect();
}
main().catch(e => console.log("Error:", e.message));

const a = require("miniprogram-automator");
const fs = require("fs");
const DIR = "simulation-results/screenshots";
async function main() {
  const mp = await a.connect({wsEndpoint:"ws://localhost:9420"});
  await new Promise(r => setTimeout(r, 1000));
  const info = await mp.systemInfo();
  console.log("System:", info.platform, info.system);
  // Home page
  await mp.switchTab("/pages/index/index");
  await new Promise(r => setTimeout(r, 2000));
  let p = await mp.currentPage();
  console.log("Page:", p.path);
  // Get page data
  let data = await p.data();
  console.log("Stats:", JSON.stringify(data.stats).substring(0,100));
  console.log("Home lang:", data.lang ? Object.keys(data.lang).slice(0,5).join(",") : "none");
  // Screenshot
  await mp.screenshot().then(ss => fs.writeFileSync(DIR+"/s1-index.png", Buffer.from(ss, "base64")));
  // Navigate via tab to resources
  await mp.switchTab("/pages/resources/list");
  await new Promise(r => setTimeout(r, 2000));
  p = await mp.currentPage();
  console.log("Tab to resources:", p.path);
  await mp.screenshot().then(ss => fs.writeFileSync(DIR+"/s2-resources.png", Buffer.from(ss, "base64")));
  // Navigate to chat
  await mp.switchTab("/pages/agent/chat");
  await new Promise(r => setTimeout(r, 2000));
  p = await mp.currentPage();
  console.log("Tab to chat:", p.path);
  await mp.screenshot().then(ss => fs.writeFileSync(DIR+"/s3-chat.png", Buffer.from(ss, "base64")));
  // Navigate to profile
  await mp.switchTab("/pages/user/profile");
  await new Promise(r => setTimeout(r, 2000));
  p = await mp.currentPage();
  console.log("Tab to profile:", p.path);
  await mp.screenshot().then(ss => fs.writeFileSync(DIR+"/s4-profile.png", Buffer.from(ss, "base64")));
  console.log("Tab nav done");
  mp.disconnect();
}
main().catch(e => { console.error("Error:", e.message); process.exit(1); });

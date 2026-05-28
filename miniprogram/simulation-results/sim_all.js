const a = require("miniprogram-automator");
const fs = require("fs");
const DIR = "simulation-results/screenshots";
async function nav(mp, url) {
  await mp.evaluate(`wx.switchTab({ url: "${url}" })`);
  await new Promise(r => setTimeout(r, 2000));
  const p = await mp.currentPage();
  return p;
}
async function main() {
  const mp = await a.connect({wsEndpoint:"ws://localhost:9420"});
  await new Promise(r => setTimeout(r, 2000));
  const info = await mp.systemInfo();
  console.log("System:", info.platform, info.system);
  
  // 1. HOME PAGE
  let p = await nav(mp, "/pages/index/index");
  console.log("HOME:", p.path);
  let data = await p.data();
  console.log("  stats:", JSON.stringify(data.stats).substring(0,120));
  let navs = await p.$$("navigator");
  console.log("  navigators:", navs.length);
  for (let i = 0; i < navs.length; i++) {
    console.log("    nav["+i+"]:", (await navs[i].text()).substring(0,30));
  }
  
  // 2. CHAT PAGE
  p = await nav(mp, "/pages/agent/chat");
  console.log("CHAT:", p.path);
  data = await p.data();
  console.log("  messages:", data.messages.length);
  let btns = await p.$$("button");
  console.log("  buttons:", btns.length);
  for (let i = 0; i < btns.length; i++) {
    try { console.log("    btn["+i+"]:", await btns[i].text()); } catch(e) {}
  }
  let inputs = await p.$$("input");
  console.log("  inputs:", inputs.length);
  for (let i = 0; i < inputs.length; i++) {
    try { console.log("    inp["+i+"] pl:", await inputs[i].attribute("placeholder")); } catch(e) {}
  }
  
  // Type message
  if (inputs.length > 0) {
    await inputs[0].input("列出所有腾讯云资源");
    await new Promise(r => setTimeout(r, 500));
    console.log("  typed message");
  }
  // Tap send
  for (const b of btns) {
    try {
      const t = await b.text();
      if (t.includes("发送") || t.includes("Send")) {
        await b.tap();
        console.log("  tapped send");
        await new Promise(r => setTimeout(r, 2000));
        break;
      }
    } catch(e) {}
  }
  // Screenshot after send
  let ss = await mp.screenshot();
  fs.writeFileSync(DIR+"/chat-sent.png", Buffer.from(ss, "base64"));
  console.log("  screenshot chat-sent.png");
  
  // Toggle quick actions
  let headerBtns = await p.$$(".header-btn");
  if (headerBtns.length > 0) {
    await headerBtns[0].tap();
    await new Promise(r => setTimeout(r, 800));
    console.log("  toggled quick actions");
    
    // Check QA buttons
    let qaBtns = await p.$$(".qa-btn");
    console.log("  qa-buttons:", qaBtns.length);
    for (let i = 0; i < qaBtns.length; i++) {
      console.log("    qa["+i+"]:", await qaBtns[i].text());
    }
    
    // Open config (3rd qa button)
    if (qaBtns.length >= 3) {
      await qaBtns[2].tap();
      await new Promise(r => setTimeout(r, 1000));
      console.log("  opened config");
      
      // Fill config fields
      let allInputs = await p.$$("input");
      console.log("  all inputs after config:", allInputs.length);
      for (let i = 0; i < allInputs.length; i++) {
        try {
          let pl = await allInputs[i].attribute("placeholder");
          console.log("    inp["+i+"]:", pl);
          if (pl && pl.includes("provider")) await allInputs[i].input("OpenRouter");
          else if (pl && pl.includes("model")) await allInputs[i].input("gpt-4");
          else if (pl && pl.includes("key")) await allInputs[i].input("sk-test-key");
        } catch(e) { console.log("    inp["+i+"] err:", e.message); }
      }
      await new Promise(r => setTimeout(r, 500));
      ss = await mp.screenshot();
      fs.writeFileSync(DIR+"/chat-config.png", Buffer.from(ss, "base64"));
      console.log("  screenshot chat-config.png");
    }
  }
  
  // 3. RESOURCES PAGE
  p = await nav(mp, "/pages/resources/list");
  console.log("RESOURCES:", p.path);
  data = await p.data();
  console.log("  resources:", data.resources ? data.resources.length : 0);
  btns = await p.$$("button");
  console.log("  buttons:", btns.length);
  for (let i = 0; i < btns.length; i++) {
    try { console.log("    btn["+i+"]:", await btns[i].text()); } catch(e) {}
  }
  inputs = await p.$$("input");
  console.log("  inputs:", inputs.length);
  for (let i = 0; i < inputs.length; i++) {
    try { console.log("    inp["+i+"] pl:", await inputs[i].attribute("placeholder")); } catch(e) {}
  }
  
  // Type in search
  if (inputs.length > 0) {
    await inputs[0].input("azure");
    await new Promise(r => setTimeout(r, 500));
    console.log("  typed search");
  }
  
  // Tap sync button
  for (const b of btns) {
    try {
      const t = await b.text();
      if (t.includes("Sync") || t.includes("同步")) {
        await b.tap();
        console.log("  tapped sync");
        await new Promise(r => setTimeout(r, 2000));
        break;
      }
    } catch(e) {}
  }
  ss = await mp.screenshot();
  fs.writeFileSync(DIR+"/resources-sync.png", Buffer.from(ss, "base64"));
  console.log("  screenshot resources-sync.png");
  
  // 4. PROFILE PAGE
  p = await nav(mp, "/pages/user/profile");
  console.log("PROFILE:", p.path);
  data = await p.data();
  console.log("  userInfo:", data.userInfo ? "present" : "null");
  let switches = await p.$$("switch");
  console.log("  switches:", switches.length);
  for (let i = 0; i < Math.min(switches.length, 2); i++) {
    try {
      let checked = await switches[i].attribute("checked");
      console.log("    switch["+i+"] checked:", checked);
    } catch(e) {}
  }
  
  // Toggle dark mode
  if (switches.length > 0) {
    await switches[0].tap();
    await new Promise(r => setTimeout(r, 500));
    console.log("  toggled dark mode");
  }
  
  // Navigate to team via navigator
  navs = await p.$$("navigator");
  console.log("  navigators:", navs.length);
  for (let i = 0; i < navs.length; i++) {
    try { console.log("    nav["+i+"]:", (await navs[i].text()).substring(0,20)); } catch(e) {}
  }
  ss = await mp.screenshot();
  fs.writeFileSync(DIR+"/profile.png", Buffer.from(ss, "base64"));
  console.log("  screenshot profile.png");
  
  // 5. TERRAFORM UPLOAD (via redirectTo, not tab)
  try {
    await mp.evaluate("wx.redirectTo({ url: '/pages/terraform/upload' })");
    await new Promise(r => setTimeout(r, 2000));
    p = await mp.currentPage();
    console.log("UPLOAD:", p.path);
    data = await p.data();
    console.log("  fileName:", data.fileName || "none");
    btns = await p.$$("button");
    console.log("  buttons:", btns.length);
    for (let i = 0; i < btns.length; i++) {
      try { console.log("    btn["+i+"]:", await btns[i].text()); } catch(e) {}
    }
    inputs = await p.$$("input");
    console.log("  inputs:", inputs.length);
    for (let i = 0; i < inputs.length; i++) {
      try { console.log("    inp["+i+"] pl:", await inputs[i].attribute("placeholder")); } catch(e) {}
    }
    
    // Fill config name
    if (inputs.length > 0) {
      await inputs[0].input("我的Terraform配置");
      await new Promise(r => setTimeout(r, 500));
      console.log("  typed config name");
    }
    
    // Tap upload area
    let uploadArea = await p.$$(".upload-area");
    if (uploadArea.length > 0) {
      await uploadArea[0].tap();
      await new Promise(r => setTimeout(r, 1000));
      console.log("  tapped upload area");
    }
    ss = await mp.screenshot();
    fs.writeFileSync(DIR+"/upload.png", Buffer.from(ss, "base64"));
    console.log("  screenshot upload.png");
  } catch(e) {
    console.log("UPLOAD error:", e.message);
  }
  
  console.log("\nDONE - All pages simulated");
  mp.disconnect();
}
main().catch(e => { console.log("Fatal:", e.message); });

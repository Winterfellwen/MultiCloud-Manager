const a = require("miniprogram-automator");
const fs = require("fs");
const DIR = "simulation-results/screenshots";

let step = 0;
async function ss(mp, label) {
  step++;
  const buf = await mp.screenshot();
  fs.writeFileSync(DIR + "/" + step.toString().padStart(2,"0") + "-" + label + ".png", Buffer.from(buf, "base64"));
  console.log("  [ss] " + label);
}

async function timeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(function(_, rej) { setTimeout(function() { rej(new Error("timeout")); }, ms); })
  ]);
}

async function navTab(mp, url) {
  try {
    await timeout(mp.switchTab(url), 10000);
  } catch(e) {
    try {
      await timeout(mp.callWxMethod("switchTab", { url: url }), 5000);
    } catch(e2) {
      try { await timeout(mp.evaluate('wx.switchTab({ url: "' + url + '" })'), 5000); } catch(e3) {}
    }
  }
  await new Promise(r => setTimeout(r, 2000));
  let p;
  try { p = await timeout(mp.currentPage(), 5000); } catch(e) { p = null; }
  console.log("[nav] " + (p && p.path ? p.path : "(null)"));
  return p;
}

async function main() {
  console.log("=== Full Miniprogram Simulation ===");
  const mp = await a.connect({wsEndpoint:"ws://localhost:9420"});
  await new Promise(r => setTimeout(r, 2000));
  const info = await mp.systemInfo();
  console.log("[sys] " + info.platform + " " + info.system + " SDK=" + info.SDKVersion);

  // ======== 1. HOME ========
  let p = await navTab(mp, "/pages/index/index");
  let d = await p.data();
  console.log("  stats: " + JSON.stringify(d.stats));
  await ss(mp, "home");

  // Navigators
  const navs1 = await p.$$("navigator");
  console.log("  navs: " + navs1.length);
  if (navs1.length > 0) {
    await navs1[0].tap();
    await new Promise(r => setTimeout(r, 2000));
    p = await mp.currentPage();
    console.log("  tapped nav -> " + p.path);
    await ss(mp, "home-nav-resources");
    // back to home
    await navTab(mp, "/pages/index/index");
  }

  // ======== 2. CHAT ========
  p = await navTab(mp, "/pages/agent/chat");
  d = await p.data();
  console.log("  messages: " + d.messages.length + " mode: " + d.executionMode);

  // Type & send
  const inpChat = await p.$$("input");
  console.log("  inputs: " + inpChat.length);
  if (inpChat.length > 0) {
    await inpChat[0].input("列出所有腾讯云资源");
    await new Promise(r => setTimeout(r, 500));
    await ss(mp, "chat-typed");
    // Tap send
    const btnsChat = await p.$$("button");
    for (const b of btnsChat) {
      const t = await b.text();
      if (t.indexOf("发送") >= 0 || t.indexOf("Send") >= 0) {
        await b.tap();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 2000));
    await ss(mp, "chat-sent");
  }

  // Re-get page (send may navigate away if API fails)
  try { p = await timeout(mp.currentPage(), 5000); } catch(e) { p = null; }
  if (!p || !p.path || p.path !== "pages/agent/chat") {
    console.log("  chat page lost after send, re-navigating...");
    p = await navTab(mp, "/pages/agent/chat");
  }
  if (!p || !p.path) {
    console.log("  cannot get chat page, skipping chat interactions");
  } else {
  // Toggle quick actions
  let hBtns;
  try { hBtns = await p.$$(".header-btn"); } catch(e) { hBtns = []; }
  if (hBtns.length > 0) {
    await hBtns[0].tap();
    await new Promise(r => setTimeout(r, 800));
    await ss(mp, "chat-qa-open");
    let qaBtns;
    try { qaBtns = await p.$$(".qa-btn"); } catch(e) { qaBtns = []; }
    console.log("  qa-btns: " + qaBtns.length);
    for (let i = 0; i < qaBtns.length; i++) {
      try { console.log("    qa[" + i + "]: " + (await qaBtns[i].text())); } catch(e) {}
    }
    // Open config (3rd qa btn)
    if (qaBtns.length >= 3) {
      try { await qaBtns[2].tap(); } catch(e) { console.log("  config tap err: " + e.message); }
      await new Promise(r => setTimeout(r, 1000));
      await ss(mp, "chat-config-open");
      try { p = await mp.currentPage(); } catch(e) {}
      let allInp;
      try { allInp = await p.$$("input"); } catch(e) { allInp = []; }
      for (const inp of allInp) {
        try {
          const pl = await inp.attribute("placeholder");
          if (pl) {
            if (pl.indexOf("provider") >= 0) await inp.input("OpenRouter");
            else if (pl.indexOf("model") >= 0) await inp.input("gpt-4");
            else if (pl.indexOf("key") >= 0) await inp.input("sk-test-key");
          }
        } catch(e) {}
      }
      await new Promise(r => setTimeout(r, 500));
      await ss(mp, "chat-config-filled");
      // Tap save
      let saveBtn;
      try { saveBtn = await p.$$(".config-save-btn"); } catch(e) { saveBtn = []; }
      if (saveBtn.length > 0) {
        try { await saveBtn[0].tap(); } catch(e) { console.log("  save err: " + e.message); }
        await new Promise(r => setTimeout(r, 1000));
        await ss(mp, "chat-config-saved");
      }
    }
  } // end else (chat page loaded)

  // ======== 3. RESOURCES LIST ========
  p = await navTab(mp, "/pages/resources/list");
  if (p && p.path) {
    try { d = await p.data(); console.log("  filtered: " + (d.filteredResources ? d.filteredResources.length : "N/A")); } catch(e) {}
    await ss(mp, "resources");

    // Search
    let inpRes;
    try { inpRes = await p.$$("input"); } catch(e) { inpRes = []; }
    if (inpRes.length > 0) {
      try { await inpRes[0].input("azure"); await new Promise(r => setTimeout(r, 500)); } catch(e) {}
      try { await inpRes[0].input(""); await new Promise(r => setTimeout(r, 300)); } catch(e) {}
      await ss(mp, "resources-search");
    }

    // Sync
    try { p = await timeout(mp.currentPage(), 5000); } catch(e) {}
    let btnsRes;
    try { btnsRes = await p.$$("button"); } catch(e) { btnsRes = []; }
    for (const b of btnsRes) {
      try {
        const t = await b.text();
        if (t.indexOf("Sync") >= 0 || t.indexOf("同步") >= 0) {
          const disabled = await b.attribute("disabled");
          if (disabled !== "true" && disabled !== "") {
            await b.tap();
            await new Promise(r => setTimeout(r, 2000));
            await ss(mp, "resources-sync");
            break;
          }
        }
      } catch(e) {}
    }
  }

  // ======== 4. PROFILE ========
  p = await navTab(mp, "/pages/user/profile");
  if (p && p.path) {
    try { d = await p.data(); console.log("  userInfo: " + (d.userInfo ? "present" : "null")); } catch(e) {}
    await ss(mp, "profile");

    // Toggle switches
    let sw;
    try { sw = await p.$$("switch"); } catch(e) { sw = []; }
    console.log("  switches: " + sw.length);
    if (sw.length > 0) {
      try { await sw[0].tap(); await new Promise(r => setTimeout(r, 500)); } catch(e) {}
      try { await sw[0].tap(); await new Promise(r => setTimeout(r, 500)); } catch(e) {}
      console.log("  toggled dark mode twice");
    }
    if (sw.length > 1) {
      try { await sw[1].tap(); await new Promise(r => setTimeout(r, 500)); } catch(e) {}
      console.log("  toggled notifications");
    }
    await ss(mp, "profile-switches");

    // Navigate to terraform from profile
    let navs2;
    try { navs2 = await p.$$("navigator"); } catch(e) { navs2 = []; }
    for (const nv of navs2) {
      try {
        const t = await nv.text();
        if (t.indexOf("Terraform") >= 0 || t.indexOf("terraform") >= 0) {
          await nv.tap();
          await new Promise(r => setTimeout(r, 2000));
          p = await timeout(mp.currentPage(), 5000);
          console.log("  profile nav -> " + (p ? p.path : "null"));
          break;
        }
      } catch(e) {}
    }
    try { await ss(mp, "profile-nav-terraform"); } catch(e) {}
  }

  // ======== 5. TERRAFORM UPLOAD ========
  try {
    await mp.redirectTo("/pages/terraform/upload");
  } catch(e) {
    console.log("  redirectTo() failed, using callWxMethod...");
    await mp.callWxMethod("redirectTo", { url: "/pages/terraform/upload" });
  }
  await new Promise(r => setTimeout(r, 2000));
  p = await mp.currentPage();
  console.log("[nav] " + p.path);
  await ss(mp, "upload");

  const inpUp = await p.$$("input");
  if (inpUp.length > 0) {
    await inpUp[0].input("我的Terraform配置");
    await new Promise(r => setTimeout(r, 500));
  }

  // Tap upload area
  const upArea = await p.$$(".upload-area");
  if (upArea.length > 0) {
    await upArea[0].tap();
    await new Promise(r => setTimeout(r, 1000));
  }
  await ss(mp, "upload-filled");

  console.log("\n=== SIMULATION COMPLETE ===");
  mp.disconnect();
  console.log("Disconnected.");
}

main().catch(e => {
  console.error("FATAL: " + e.message);
  console.error(e.stack ? e.stack.substring(0, 300) : "");
  process.exit(1);
});

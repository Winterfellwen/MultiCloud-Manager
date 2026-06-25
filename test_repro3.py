#!/usr/bin/env python3
"""
关键复现：AI 运行中切换会话，AI 完成后再切回
"""

from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:8099"
USERNAME = "admin"
PASSWORD = "Admin123!"


def get_detailed_messages(page):
    """获取详细的消息内容"""
    return page.evaluate("""
        () => {
            const msgs = document.querySelectorAll('#chatMessages > *');
            return Array.from(msgs).map((m, idx) => {
                const toolCards = m.querySelectorAll('.timeline-tool-card').length;
                const toolEls = m.querySelectorAll('.tool-call-block, .msg.tool, .msg.tool-result').length;
                const isRunEvents = m.classList.contains('run-events');
                const isStreaming = m.classList.contains('streaming');
                return {
                    idx: idx + 1,
                    class: m.className,
                    id: m.id || '',
                    text: m.innerText.substring(0, 200).replace(/\\n/g, ' | '),
                    toolCards: toolCards,
                    toolEls: toolEls,
                    isRunEvents: isRunEvents,
                    isStreaming: isStreaming
                };
            });
        }
    """)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        
        # 登录
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")
        page.locator('input[name="username"], input[type="text"]').first.fill(USERNAME)
        page.locator('input[name="password"], input[type="password"]').first.fill(PASSWORD)
        page.locator('button[type="submit"]').first.click()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)
        
        # 进入聊天
        page.locator('.nav-item[data-page="chat"]').first.click()
        page.wait_for_timeout(2000)
        
        # 创建新会话
        page.locator('.chat-new-btn').first.click()
        page.wait_for_timeout(2000)
        print("=== 创建新会话 ===")
        
        # 发送一个会调用工具的消息
        page.locator('#chatInput').fill("列出所有可用的云资源")
        page.locator('#chatSendBtn').click()
        
        # 等待 AI 开始处理
        page.wait_for_timeout(2000)
        
        # 切到第一个会话
        sessions = page.locator('.chat-session-item')
        count = sessions.count()
        print(f"\n=== 当前会话数: {count} ===")
        
        if count >= 2:
            sessions.nth(1).click()
            page.wait_for_timeout(5000)  # 等 AI 完成
            
            print("\n=== 切到第一个会话（AI 已完成）===")
            
            # 切回新会话
            sessions.nth(0).click()
            page.wait_for_timeout(2000)
            
            print("\n=== 切回新会话后详细分析 ===")
            msgs = get_detailed_messages(page)
            print(f"消息容器中的子元素数: {len(msgs)}")
            for m in msgs:
                print(f"  [{m['idx']}] tag-class='{m['class']}' id='{m['id']}'")
                print(f"      text: {m['text'][:200]}")
                print(f"      toolCards: {m['toolCards']}, toolEls: {m['toolEls']}, run-events: {m['isRunEvents']}, streaming: {m['isStreaming']}")
                print()
            
            # 计算重复的工具调用
            all_tool_names = page.evaluate("""
                () => {
                    const toolNames = document.querySelectorAll('.msg.agent, .run-events');
                    const all = [];
                    toolNames.forEach(el => {
                        const tcs = el.querySelectorAll('.timeline-tool-card, .msg.tool');
                        tcs.forEach(tc => {
                            const name = tc.querySelector('.role-label')?.textContent || '';
                            if (name) all.push(name);
                        });
                    });
                    return all;
                }
            """)
            print(f"\n所有工具调用（共 {len(all_tool_names)} 个）:")
            for i, name in enumerate(all_tool_names):
                print(f"  {i+1}. {name}")
        
        browser.close()


if __name__ == "__main__":
    main()
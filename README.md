# Nanobana Remix

<img width="750" alt="image" src="https://github.com/user-attachments/assets/2b3cdd27-0286-4756-b927-5a655b0f6472" />

## 🌟 App 簡介

* 這是一款讓你輕鬆「**重新演繹角色造型**」的圖片生成 App！  
* 只要選擇角色的 **姿勢（Pose）**、**場景（Scene）**、**心情（Mood）** 和 **風格（Art Style）**，  
* 就能自動產生一張風格統一、表情生動的插畫。  
* 你也可以直接修改提示詞（Prompt），微調角色動作或表情，打造專屬版本！



---

## 🎨 使用教學：快速上手你的角色生成器！

1. **等App準備好再開始**  
　打開App後，先稍等一下讓它初始化。  
　等到 **「Generate New」按鈕亮起**，就表示一切準備就緒！

2. **點一下就能產生角色**  
　直接按下 **「Generate New」**，App會幫你隨機挑選一組變化（包含姿勢、場景、心情、風格）並生成圖片。

3. **想換風格？先選分類再生成**  
　如果想看不同變化，可以先點上方的分類標籤（Pose / Scene / Mood / Art Style），  
　選好喜歡的選項後再按 **「Generate New」**，就能馬上看到新圖片。

4. **微調提示詞再試一次**  
　圖片生成後，最下方會出現這張圖片的 **提示詞（Prompt）**。  
　你可以修改這段文字（例如加些細節或換掉部分描述），  
　然後點 **「Re-generate」**，就能根據新的提示詞重新生成圖片！

💡 小提示：  
　想不到靈感時，可以重新載入App，每次都會出現不一樣的驚喜組合！

## Run and deploy your AI Studio app
<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1M5cPeKGErCeAtQ3HglSGfhvv8SsXScmm

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

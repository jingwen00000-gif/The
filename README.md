# 宝贝练习本

给 1–6 岁孩子出练习题的手机应用（英文名 Little Learner，支持中文 / English 切换）。家长选好年龄和题型，应用会生成 A4 练习页，可以直接打印，也可以存成 PDF。iPhone 和安卓都能用。

## 功能

- **中英文切换**：右上角切换语言，界面、题目说明、页眉页脚和答案页都会跟着变。首次打开时按手机系统语言自动选择。已生成的题目切换语言后题目不变，只换文字。
- **按年龄出题**：每种题型都标了适用年龄，不适合当前年龄的会变灰。
- **16 种题型，分 4 大类**

| 类别 | 题型（适用年龄） |
|---|---|
| 数学启蒙 | 数一数 (2–6)、比多少 (3–6)、加减法 (4–6)、数字填空 (4–6)、认识钟表 (4–6) |
| 语言识字 | 汉字描红（田字格 + 拼音，4–6）、拼音书写（四线三格，5–6）、英文字母描写 (3–6)、英文单词描写（看图，5–6） |
| 精细动作 | 形状涂色 (1–3)、描线练习 (1–4)、数字描红 (3–5)、走迷宫 (3–6) |
| 认知逻辑 | 连一连 / 找影子 (1–4)、比大小 (1–3)、找规律 (2–6) |

- 难度跟着年龄变。比如数数：2–3 岁数 5 以内并圈出答案，6 岁数到 15 并写出数字。迷宫从 5×6 格逐步加到 13×16 格。
- 每次生成的题都是随机的，点“换一批”可以重新出题。
- 可以附一页给家长看的参考答案，迷宫的答案会画出路线。
- 每页抬头会印上孩子的姓名。
- 打开过一次后，没有网络也能用（PWA）。

## 使用

1. 把整个目录放到任意静态网站上（GitHub Pages、Netlify、Vercel 等都行），用手机浏览器打开。
2. 添加到主屏幕：iPhone 用 Safari 点“分享 → 添加到主屏幕”；安卓用 Chrome 点“菜单 → 安装应用”。
3. 选择年龄和题型，点“生成练习题”，再点“打印 / 存为 PDF”。
   - **iPhone**：在打印预览上双指放大，点“分享”，选“存储到文件”，就得到 PDF。
   - **安卓**：打印机选“另存为 PDF”，或者直接选连在网络上的打印机。

本地预览：`python3 -m http.server 8000`，然后打开 http://localhost:8000

## 结构

```
index.html            页面结构
styles.css            界面与 A4 打印样式
app.js                题目生成器（每种题型一个 gen 函数）+ 界面逻辑
sw.js                 离线缓存
manifest.webmanifest  PWA 配置
samples/              生成好的示例 PDF（中文版、英文版）
```

**新增题型**：在 `app.js` 的 `GENS` 数组里加一个对象 `{ id, name:['中文名','English name'], cat, ages:[最小,最大], gen(rand, age) }`，说明文字用 `tr('中文', 'English')`。界面文字在 `I18N` 里。`gen` 返回 `{ tip, body, answers? }`，其中 `body` 是一段 HTML，单位用 mm，这样打印尺寸才准确。

## 上架 App Store / Google Play（可选）

用 [Capacitor](https://capacitorjs.com/) 把现有网页原样打包成原生应用：

```bash
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init 宝贝练习本 com.example.bblx --web-dir .
npx cap add ios && npx cap add android
```

打包后网页里的 `window.print()` 不能直接用，要换成原生打印插件，比如 `@capacitor-community/printer`。iOS 包需要在 Mac 上用 Xcode 构建。

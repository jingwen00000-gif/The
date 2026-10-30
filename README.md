# FireTake 源代码

Electron 桌面版。`app/index.html` 是全部界面与计算逻辑；`main.js` 负责保存对话框、PDF 导出、Anthropic API、自动备份和在线更新。

运行（需安装 Node.js）：
    npm install electron@33 --save-dev
    npx electron .

打包 Windows / macOS：
    npm install @electron/packager --save-dev
    npx @electron/packager . FireTake --platform=win32 --arch=x64 --icon=icon.ico
    npx @electron/packager . FireTake --platform=darwin --arch=arm64 --icon=icon.png

发布在线更新：
1. 修改代码后把 package.json 的 version 加一（例如 1.4.1）。
2. 运行  python3 make_update.py https://你的网址/firetake/
   生成 FireTake-update-1.4.1.ftupd 和 latest.json。
3. 把这两个文件上传到该 https 地址（例如 GitHub Releases、公司网站、Azure/AWS 存储）。
4. 每台电脑：设置 → 软件更新 → 更新地址 填 https://你的网址/firetake/latest.json。
   之后启动时自动检查，有新版本会提示“立即更新并重启”。
   没有网址时，也可以把 .ftupd 文件发给同事，用“从更新包安装…”手动更新。
更新包带 SHA-256 校验；只更新 FireTake 程序文件，不动项目数据。

# FireTake 源代码

Electron 桌面版。`app/index.html` 是全部界面与计算逻辑；`main.js` 负责保存对话框、PDF 导出、Anthropic API、自动备份和在线更新。

运行（需安装 Node.js）：
    npm install electron@33 --save-dev
    npx electron .

打包 Windows / macOS：
    npm install @electron/packager --save-dev
    npx @electron/packager . FireTake --platform=win32 --arch=x64 --icon=icon.ico --no-asar
    npx @electron/packager . FireTake --platform=darwin --arch=arm64 --icon=icon.icns --no-asar
（必须加 --no-asar：在线更新会把新文件写进程序目录，asar 包是只读的。
 在 Mac/Linux 上打 Windows 包时，--icon 需要 wine；没有 wine 就先不加 --icon，打包后用 resedit 写入 icon.ico。
 icon.icns 可由 icon.png 生成：python3 -c "from PIL import Image; Image.open('icon.png').save('icon.icns')"）

发布在线更新：
1. 修改代码后把 package.json 的 version 加一（例如 1.4.1）。
2. 运行  python3 make_update.py https://你的网址/firetake/
   生成 FireTake-update-1.4.1.ftupd 和 latest.json。
3. 把这两个文件上传到该 https 地址（例如 GitHub Releases、公司网站、Azure/AWS 存储）。
4. 每台电脑：设置 → 软件更新 → 更新地址 填 https://你的网址/firetake/latest.json。
   之后启动时自动检查，有新版本会提示“立即更新并重启”。
   没有网址时，也可以把 .ftupd 文件发给同事，用“从更新包安装…”手动更新。
更新包带 SHA-256 校验；只更新 FireTake 程序文件，不动项目数据。

## v2.10.0 识别计数改进（框选图标 · 全图搜索 / 图纸文字识别）

- **修正彩色符号漏检**：原来先把整页缩小再按颜色取线条，细的彩色 CAD 线条缩小后变成浅色，被当成背景丢掉（红色符号 40 个只找到 7 个）。现在先在原分辨率提取颜色通道再缩放。
- **PDF 矢量线条匹配**：CAD 导出的 PDF 直接用样例自身的线段做几何匹配，任意角度、镜像、±15% 大小都能精确找到；先在样例本身上自检通过才启用，否则退回图像匹配。图像匹配仍然并行运行，补上非矢量的符号。
- **图像匹配**：增加镜像和 45° 方向、0.9/1.1 倍尺寸；对称图形自动去掉重复方向；新增“线条缺失”和“多余线条”两项校验（穿过符号的水平/垂直管线不扣分），压低相似图形的误判。
- **图例 / 符号表自动排除**：识别出图例列（左对齐、≥3 行、≥2 行是设备说明），图例里的符号默认不计（可点回）；搜索命中图例时直接用该行文字确定设备类型。
- **文字识别**：跳过图例说明文字；HR / SD / HD / EL / FB / EXT / FH 等短缩写必须单独成标注（可带编号，如 SD-02），不再把“2 HR FIRE RATED”“EXT WALL”“EL 3.200”误计为构件。
- 自动阈值：分数明显分成两组（例如矢量精确匹配 vs 相似图形）时，在两组之间取阈值。

回归测试（需 Python reportlab、Node + Playwright）：

    cd tests/symbol-search && python3 gen.py && python3 gen.py black
    python3 ../../make_web.py $PWD/web.html
    node run.js $PWD/web.html $PWD/plan.pdf $PWD/plan_truth.json | python3 show.py

## v2.11.0 操作流程简化（参考 Countfire 等算量软件的“全套图纸一键计数”）

- **按图例一键计数（全部图纸）**：图纸算量页“自动识别”最上面的按钮，或按 `G`。软件读出图例里每种设备的符号和说明，在所有图纸页上用矢量匹配一次找全，汇总成一张表（图例缩略图、说明、统计为、数量、分页数量）；勾选 / 改类型后点“加入并逐个核对”，直接进入逐个核对（Enter 确认、Delete 删除、→ 跳过）。
  - 不同图纸页的图例里相同的符号只算一次；同一位置被两种符号命中时保留匹配更好的（平分时保留更完整的符号）。
  - 翻新装修项目按颜色自动标注新装 / 拆除等（与框选搜索相同的规则）。
- 打开 PDF 时如果这张图有图例，识别区直接提示并给出一键计数按钮。
- 修正：pdf.js 偶尔把一条路径拆成两条指令，矢量提取会丢掉其中的线段（影响符号匹配、按颜色提取管线、墙体识别）。
- 快捷键面板（?）增加 G 和核对按键；“开始使用”第 3 步改为先用图例一键计数。

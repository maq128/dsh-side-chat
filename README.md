# 侧边会话（Side chat）

DSH 插件：用 `/side <内容>` 从当前主会话派生一个侧边会话。它继承主会话的上下文以便复用主会话已产生的缓存，但以独立子会话运行，在右侧栏打开，不占用左侧栏。

## 使用

```
/side 解释一下这个模块的职责
```

- `/side` 后面必须跟内容；空内容会返回`用法：/side <内容>`，不会创建会话。
- 输入的内容就是侧边会话自己的第一条消息。
- 侧边会话自动在右侧栏以子代理聊天的标签页打开，标题为 `侧边：<主会话标题> #<序号>`。
- 关闭标签页**不会归档**，侧边会话保持存活；可以再从主会话的“子智能体”列表重新打开。
- 没有顶部按钮，只支持斜杠命令。

## 功能与设计

- **上下文继承与缓存复用**：用 `fork` 创建子会话，继承主会话最后一个完成轮次之前的完整前缀（字节一致），从而最大程度复用主会话已经产生的 provider 缓存。继承的历史在侧边会话中可见（fork 模式，无分隔行）。
- **隐藏的控制规则**：通过 scoped 运行时上下文（`side-chat:rules`）向模型注入以下规则，追加在继承前缀之后，因此不破坏前缀缓存，也不会渲染成聊天消息：
  - 父会话历史仅作为参考；
  - 默认只做只读或轻量探索；
  - 除非用户在当前侧边会话中明确要求修改，否则不得修改文件、Git 状态或配置；
  - 即使明确要求，也只做最小范围修改。
- **权限状态镜像**：创建时读取主会话当前的命名权限预设，并把它应用到侧边会话（sandbox 与 approval 都对齐），因此侧边会话输入框下方的权限选择器显示与主会话相同的预设，而不是 `Custom`。之后该选择器对 subagent 会话仍然不可切换，保持创建时的固定范围。
- **隐藏于左侧栏**：子会话以 `origin: 'subagent'` 创建，不显示在左侧栏。
- **右侧栏自动打开**：浏览器端监听主会话的子智能体目录，发现新的 `侧边会话` 子会话后，自动打开它已有的子代理聊天资源（`dsh-resource://subagentchat/...`）。

## 限制

- “控制规则”是提示级的，不是硬性工具限制。
- 权限选择器对 subagent 会话不可切换（DSH 的归属栅栏）；侧边会话只在创建时镜像主会话的预设。
- 侧边会话会作为一条记录出现在主会话的“子智能体”列表里；DSH 的 `subagentCatalog` 只增，不能移除。
- 如果主会话当前权限状态不匹配任何命名预设（`custom`），则没有可镜像的预设名，侧边会话保持 delegated 默认状态。

## 安装与更新

本目录是一个本地 DSH bundle（通过 `link:` 安装到 Desktop profile），**没有构建步骤**：纯 ESM JavaScript，无 TypeScript、打包器或第三方依赖。

- 在 DSH 的 **Plugins / 插件** 页面选择 **Add plugin**，选中本目录；或使用 `plugin_manager` 的 `install_bundle`。
- Host 直接加载 `index.js`，浏览器通过 `package.json` 里的 `dsh.client` 加载 `client.js`。
- 安装后确认插件行 `@local/dsh-side-chat` 为启用状态；如果没有立即生效，重启一次 DSH。
- 语法自检（可选）：

```sh
node --check index.js
node --check client.js
```

## 文件结构

| 文件 | 作用 |
|---|---|
| `index.js` | Host 插件：注册 `/side` 命令；fork 子会话、镜像权限预设、写标题、注入隐藏规则 |
| `client.js` | 浏览器插件：监听子智能体目录，自动在右侧栏打开侧边会话标签页 |
| `package.json` | 包名 `@local/dsh-side-chat`、版本、`dsh.bundle` 与 `dsh.client` 声明 |
| `cordis.patch.yml` | bundle 补丁：把插件行插入 profile |
| `locale/en.json`、`locale/zh.json` | 插件管理页的标题与描述 |
| `icon.svg` | 插件图标 |
| `README.md` | 本文件 |

## 版本

当前版本：`0.6.1`。

## 依赖的 DSH 能力

`commands`、`subagents`、`agents`、`sessionTitle`、`permissionPresets`、`slots`、`sidebarRight`，以及右侧栏子代理聊天资源。升级 DSH 大版本后建议先用 `/side` 验证一次。

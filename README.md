# 星光宠物纪念馆

用 Three.js 做的在线宠物纪念馆：沿着石头路走进没有屋顶的大厅，穿过通道来到纪念区，在夜空、流星和孔明灯下看看那些曾经陪伴过我们的小家伙。

## 启动

```bash
npm install
npm run dev      # 本地开发
npm run build    # 类型检查 + 打包到 dist/
npm run preview  # 预览打包结果
```

## 操作

| 操作 | 桌面端 | 触屏 |
| --- | --- | --- |
| 移动 | WASD / 方向键上下，Shift 加速 | 左下角摇杆 |
| 转视角 | 按住鼠标拖动，或 Q / E、方向键左右 | 滑动屏幕 |
| 查看宠物 | 点击相框 | 点击相框 |
| 关闭面板 | Esc、关闭按钮或点击场景 | 关闭按钮或点击场景 |

底部按钮可以一键传送到入口、大厅、纪念区，也可以查找宠物、放孔明灯。大厅接待台和台上的留言簿也可以点击。

## 目录结构

```
src/
  config.ts          尺寸、数量、颜色等可调参数
  strings.ts         所有文案
  main.ts            入口：渲染器、后期、主循环、各系统的连接
  data/
    pets.ts          宠物数据（示例数据生成 + 自定义宠物）
    store.ts         数据层：献花、蜡烛、留言（localStorage）
  world/
    World.ts         场景总管：灯光、碰撞体、可交互物体、搭建步骤
    Kit.ts           积木工具箱（方块 / 圆柱 / 圆锥 / 球，全部实例化渲染）
    Batches.ts       照片图集与名牌图集
    Sky.ts           天穹、星星、月亮、流星、孔明灯
    Outdoor.ts       石头路、树、路灯、花草、萤火虫
    Hall.ts          大厅：照片墙、休息区、接待台
    Corridor.ts      通道：壁灯、短句、发光爪印
    Memorial.ts      纪念区：纪念柜、纪念树、长椅
    parts.ts         通用部件：拱门墙、沙发、长椅、盆栽、壁灯
    textures.ts      用 Canvas 生成的纹理与宠物占位画像
  systems/
    Player.ts        第一人称移动、碰撞、镜头聚焦
    Interaction.ts   悬停与点击拾取
    Guide.ts         地面光点指引
    AudioSystem.ts   环境音
  ui/
    UI.ts            界面逻辑
    style.css        界面样式
```

## 常见修改

### 添加自己的宠物

编辑 `src/data/pets.ts` 顶部的 `CUSTOM_PETS`。排在前面的宠物会优先出现在大厅照片墙上：

```ts
export const CUSTOM_PETS = [
  {
    name: '豆豆',
    species: '狗',            // 猫 | 狗 | 兔子 | 仓鼠 | 鸟
    breed: '柯基',
    birthDate: '2012-03-01',
    passedDate: '2025-06-18',
    photoUrl: '/photos/doudou.jpg',
    message: '下辈子还做我的小狗。',
  },
];
```

### 替换照片

把图片放进 `public/photos/`，然后在宠物数据里填 `photoUrl: '/photos/文件名.jpg'`。照片会被裁成正方形。没有 `photoUrl` 的宠物使用程序生成的卡通画像。使用其他域名的图片时，对方服务器需要允许跨域（CORS）。

### 替换音乐

把音乐文件放到 `public/audio/bgm.mp3`，会自动循环播放。没有这个文件时，程序会用 WebAudio 现场合成一段舒缓的环境音乐，所以不放文件也不会报错。

### 调整场景

`src/config.ts` 里可以改纪念馆名字、大厅和纪念区的尺寸、柜子数量与行列数、宠物数量、星星和孔明灯数量、流星间隔、主要颜色等。界面与场景里的文字都在 `src/strings.ts`。

宠物总数上限是 100（照片图集是 10 × 10 格）。需要更多时，调大 `src/world/Batches.ts` 里 `PhotoBatch` 的图集尺寸。

### 接入后端

献花、蜡烛、留言的读写都封装在 `src/data/store.ts`，目前存在浏览器的 localStorage 里。接后端时只需要替换这个文件里的实现。

## 画质

右上角可以切换画质。「低」会关闭辉光后期和月光阴影，并降低渲染分辨率；触屏设备默认使用低画质。

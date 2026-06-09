// ✅ 适配你本地文件的导入方式
import GarminConnect from "@gooin/garmin-connect";
import * as fs from "fs";
import * as path from "path";
// ✅ 改成你本地实际有的变量/函数名
import { SYNC_NUM } from "./constant";  // 改成你constant.ts里实际的名字
import { getGarminCN } from "./rq";      // 改成你rq.ts里实际导出的名字

// 格式化日期
function formatDate(dateStr: string) {
  if (!dateStr) return "";
  return new Date(dateStr).toISOString().split("T")[0];
}

// 获取国际区客户端 + 精准捕获限流/密码错误
async function getGaminGlobalClient() {
  try {
    console.log("🔐 正在登录佳明国际区...");
    // ✅ 适配新版本包：去掉new，直接调用
    const client = await GarminConnect({
      username: process.env.GARMIN_GLOBAL_USERNAME!,
      password: process.env.GARMIN_GLOBAL_PASSWORD!
    });
    console.log("✅ 佳明国际区 登录成功");
    return client;
  } catch (e: any) {
    // 精准区分错误类型
    if (e.message?.includes("429") || e.message?.includes("Rate limited") || e.message?.includes("Too Many Requests")) {
      console.error("⚠️ 错误：触发佳明接口限流(429)，等待后会自动重试");
    } else if (e.message?.includes("401") || e.message?.includes("Invalid credentials") || e.message?.includes("Login failed")) {
      console.error("❌ 错误：国际区账号/密码错误！请检查GitHub Secrets配置");
    } else {
      console.error("❌ 登录未知错误：", e.message || e);
    }
    throw e; // 抛出错误，让工作流触发重试
  }
}

// 核心同步逻辑
export async function syncGarminGlobal2GarminCN() {
  console.log("🚀 开始执行：佳明国际区 → 中国区 数据同步");

  // 1. 获取国际区客户端（带容错）
  let clientGlobal;
  try {
    clientGlobal = await getGaminGlobalClient();
  } catch (e) {
    console.error("❌ 国际区客户端初始化失败，终止本次同步");
    process.exitCode = 1;
    return;
  }

  // ✅ 关键修复：空值判断，彻底解决 undefined 报错
  if (!clientGlobal) {
    console.error("❌ 严重错误：clientGlobal 为空，无法继续执行");
    process.exitCode = 1;
    return;
  }

  // 2. 获取中国区客户端 ✅ 适配你本地函数名
  let clientCN;
  try {
    clientCN = await getGarminCN();
    console.log("✅ 佳明中国区 登录成功");
  } catch (e) {
    console.error("❌ 中国区登录失败：", e);
    process.exitCode = 1;
    return;
  }

  try {
    // 3. 获取国际区运动数据 ✅ 适配你本地变量名
    console.log(`📥 从国际区获取最近 ${SYNC_NUM || 10} 条运动记录...`);
    const globalActs = await clientGlobal.getActivities(0, Number(SYNC_NUM || 10));
    console.log(`✅ 获取成功，共 ${globalActs.length} 条记录`);

    if (globalActs.length === 0) {
      console.log("ℹ️ 国际区没有新数据，同步结束");
      return;
    }

    // 4. 获取中国区已存在的记录ID，避免重复上传
    console.log("🔍 检查中国区已存在记录，避免重复...");
    const cnActs = await clientCN.getActivities(0, 200);
    const cnIds = new Set(cnActs.map((a: any) => a.activityId));

    // 5. 过滤 + 上传
    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;

    for (const act of globalActs) {
      const actId = act.activityId;
      const actDate = formatDate(act.startTimeLocal);
      console.log(`\n处理记录 [${actDate}] ID:${actId}`);

      if (cnIds.has(actId)) {
        console.log("⏭️ 已存在，跳过");
        skipCount++;
        continue;
      }

      try {
        console.log("📤 正在上传到中国区...");
        // 获取原始数据并上传
        const original = await clientGlobal.getActivity(actId);
        await clientCN.uploadActivity(original);
        console.log("✅ 上传成功");
        successCount++;
        // ✅ 上传间加小延迟，进一步降低限流概率
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (e: any) {
        console.error("❌ 上传失败：", e.message || e);
        failCount++;
      }
    }

    // 6. 汇总结果
    console.log("\n📊 同步完成 汇总：");
    console.log(`✅ 成功：${successCount} 条`);
    console.log(`⏭️ 跳过：${skipCount} 条`);
    console.log(`❌ 失败：${failCount} 条`);

    // 保存会话（保持原有逻辑）
    const sessionPath = path.resolve(__dirname, "../../.garmin-session");
    fs.writeFileSync(sessionPath, JSON.stringify({ global: clientGlobal.getSession?.() || {}, cn: clientCN.getSession?.() || {} }));
    console.log("💾 会话信息已保存");

  } catch (e: any) {
    console.error("❌ 同步过程出错：", e.message || e);
    process.exitCode = 1;
  }
}

// 执行
syncGarminGlobal2GarminCN();

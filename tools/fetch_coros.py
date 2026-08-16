#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_coros.py —— 从高驰(Coros)账号直接拉取最新活动（FIT 文件）。

这是 workouts-page 的「接入高驰」核心脚本，复用 running_page 已验证的高驰
Training Hub 接口（CN 域名），只下载「尚未下载过」的活动，幂等可重复运行。

凭证获取顺序（都不会明文打印）：
  1. 环境变量 COROS_EMAIL / COROS_PASSWORD
  2. ~/github/running_page/config.yaml 里的 sync.coros.{email,password}
  3. 仍未找到则报错退出

用法：
  # 拉取最新活动到 ./coros_activities（首次会提示缺凭证）
  python3 tools/fetch_coros.py

  # 指定输出目录 / 凭证
  COROS_EMAIL=you@x.com COROS_PASSWORD=xxx python3 tools/fetch_coros.py --out-dir ./coros_activities

  # 拉取后直接同步进页面
  python3 tools/fetch_coros.py && python3 tools/sync_fit.py --parse ./coros_activities

依赖：pip install aiofiles httpx pyyaml
"""
import argparse
import asyncio
import glob
import hashlib
import json
import os
import sys

try:
    import aiofiles
    import httpx
    import yaml
except ImportError:
    sys.exit("❌ 缺少依赖，请先安装：pip install aiofiles httpx pyyaml")

COROS_URL = {
    "LOGIN_URL": "https://teamcnapi.coros.com/account/login",
    "DOWNLOAD_URL": "https://teamcnapi.coros.com/activity/detail/download",
    # 不传 modeList：拉取账号内全部运动类型（跑步/骑行/徒步/训练/健走…），
    # 之前写死 modeList=100,102,103 会漏掉骑行(200)、徒步(104)、训练、健走等。
    "ACTIVITY_LIST": "https://teamcnapi.coros.com/activity/query?",
}
TIMEOUT = httpx.Timeout(240.0, connect=360.0)


def _load_dotenv():
    """读取脚本同目录的 .env（KEY=VALUE，忽略 # 注释与空行）。不依赖第三方库。

    这样高驰凭据可以和 Keep 共用同一个 tools/.env，定时任务无需额外注入环境变量。
    """
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(p):
        return
    with open(p, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def load_credentials():
    _load_dotenv()  # 优先从同目录 .env 载入（若存在）
    email = os.environ.get("COROS_EMAIL")
    pwd = os.environ.get("COROS_PASSWORD")
    if email and pwd:
        return email, pwd
    # 回退：读取 running_page 的 config.yaml
    cfg = os.path.expanduser("~/github/running_page/config.yaml")
    if os.path.exists(cfg):
        try:
            with open(cfg, encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
            coros = data.get("sync", {}).get("coros", {})
            email = coros.get("email")
            pwd = coros.get("password")
            if email and pwd:
                return email, pwd
        except Exception:
            pass
    sys.exit("❌ 未找到高驰凭证：请设置环境变量 COROS_EMAIL / COROS_PASSWORD，或在 ~/github/running_page/config.yaml 配置 sync.coros。")


class Coros:
    def __init__(self, account, password):
        self.account = account
        self.password = hashlib.md5(password.encode()).hexdigest()
        self.headers = None
        self.req = None

    async def login(self):
        headers = {
            "accept": "application/json, text/plain, */*",
            "content-type": "application/json;charset=UTF-8",
            "origin": "https://t.coros.com",
            "referer": "https://t.coros.com/",
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        }
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                COROS_URL["LOGIN_URL"],
                json={"account": self.account, "accountType": 2, "pwd": self.password},
                headers=headers,
            )
            j = resp.json()
            token = j.get("data", {}).get("accessToken")
            if not token:
                raise Exception("高驰登录失败，请检查账号/密码（config.yaml 或环境变量）。")
            self.headers = {
                "accesstoken": token,
                "cookie": f"CPL-coros-region=2; CPL-coros-token={token}",
            }
            self.req = httpx.AsyncClient(timeout=TIMEOUT, headers=self.headers)

    async def fetch_activities(self):
        """返回账号内全部活动 [(labelId, sportType, name), ...]，翻页拉全。"""
        out, page = [], 1
        while True:
            r = await self.req.get(f"{COROS_URL['ACTIVITY_LIST']}&pageNumber={page}&size=50")
            items = r.json().get("data", {}).get("dataList") or []
            if not items:
                break
            for a in items:
                if a.get("labelId"):
                    out.append((a["labelId"], a.get("sportType"), a.get("name")))
            page += 1
        return out

    async def download(self, label_id, sport_type, name, folder):
        # 关键修复：下载时 sportType 必须传「该活动自身的类型」，不能写死 100。
        # 写死 100 会让骑行/徒步/训练等全部被高驰返回成 running 型 FIT。
        url = f"{COROS_URL['DOWNLOAD_URL']}?labelId={label_id}&sportType={sport_type}&fileType=4"
        try:
            r = await self.req.post(url)
            file_url = r.json().get("data", {}).get("fileUrl")
            if not file_url:
                return None
            # 以 labelId 命名，保证增量同步时按活动去重（幂等）
            path = os.path.join(folder, f"{label_id}.fit")
            async with self.req.stream("GET", file_url) as resp:
                resp.raise_for_status()
                async with aiofiles.open(path, "wb") as f:
                    async for chunk in resp.aiter_bytes():
                        await f.write(chunk)
            # 侧车元数据：高驰 sportType + 活动名，供 sync_fit.py 正确分类/命名
            meta = {"sportType": sport_type, "name": name or ""}
            async with aiofiles.open(path + ".meta.json", "w", encoding="utf-8") as mf:
                await mf.write(json.dumps(meta, ensure_ascii=False))
            return label_id
        except Exception as e:
            print(f"  ⚠️  下载 {label_id}(sportType={sport_type}) 失败: {e}")
            return None


async def run(out_dir):
    email, pwd = load_credentials()
    os.makedirs(out_dir, exist_ok=True)
    existing = {os.path.splitext(os.path.basename(p))[0] for p in glob.glob(os.path.join(out_dir, "*.fit"))}

    c = Coros(email, pwd)
    await c.login()
    acts = await c.fetch_activities()
    print(f"高驰账号共有 {len(acts)} 个活动；本地已存在 {len(existing)} 个")

    todo = [(lid, st, nm) for lid, st, nm in acts if lid not in existing]
    if not todo:
        print("✅ 已是最新，无需下载。")
        await c.req.aclose()
        return 0

    sem = asyncio.Semaphore(10)

    async def task(lid, st, nm):
        async with sem:
            return await c.download(lid, st, nm, out_dir)

    results = await asyncio.gather(*(task(lid, st, nm) for lid, st, nm in todo))
    await c.req.aclose()
    ok = sum(1 for r in results if r)
    skip = len(results) - ok
    print(f"✅ 本次新增下载 {ok} 个活动到 {out_dir}（部分活动无 FIT 文件，已跳过 {skip} 个）")
    return ok


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description="从高驰账号拉取最新活动 FIT 文件")
    ap.add_argument("--out-dir", default=os.path.join(here, "..", "coros_activities"),
                    help="FIT 输出目录（默认 ./coros_activities，已 gitignore）")
    args = ap.parse_args()
    out = os.path.abspath(args.out_dir)
    try:
        n = asyncio.run(run(out))
        sys.exit(0 if n is not None else 1)
    except Exception as e:
        print(f"❌ 拉取失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

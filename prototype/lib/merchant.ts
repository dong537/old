import "server-only";

import { cookies } from "next/headers";
import { MERCHANT_ACCOUNTS, getProvider } from "./store";

/** 机构后台当前登录的示例账号：一家养老机构、一家上门服务商，可以切换 */
export async function currentMerchant() {
  const id = (await cookies()).get("merchant")?.value;
  const pick = (MERCHANT_ACCOUNTS as readonly string[]).includes(id ?? "") ? id! : MERCHANT_ACCOUNTS[0];
  return getProvider(pick)!;
}

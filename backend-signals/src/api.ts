import { checkLiquidityDrop } from "./signals/liquidity.js";
import { checkRiskChange } from "./signals/risk.js";

export async function getSignals(chainId: number, token: string) {
  const [liquidity, risk] = await Promise.all([
    checkLiquidityDrop(chainId, token),
    checkRiskChange(chainId, token)
  ]);

  return {
    ...(liquidity && { liquidity }),
    ...(risk && { risk }),
    timestamp: Date.now()
  };
}

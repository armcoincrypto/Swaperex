/**
 * Token Configuration
 *
 * Extracted from Telegram bot routing logic (oneinch.py, jupiter.py).
 * ONLY contains public token data - NO private keys, NO signing logic.
 */

export interface TokenInfo {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  chainId: number;
  logo?: string;
}

/**
 * Native token address placeholder (used by 1inch and other aggregators)
 */
export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

/**
 * Token addresses by chain
 * Source: 1inch API compatible addresses
 */
export const TOKEN_ADDRESSES: Record<string, Record<string, string>> = {
  ethereum: {
    ETH: NATIVE_TOKEN_ADDRESS,
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    DAI: '0x6B175474E89094C44Da98b954EedcdeCB5BE3830',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    LINK: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    UNI: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    AAVE: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
    LDO: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',
    MKR: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',
    COMP: '0xc00e94Cb662C3520282E6f5717214004A7f26888',
    SNX: '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F',
    CRV: '0xD533a949740bb3306d119CC777fa900bA034cd52',
    SUSHI: '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2',
    '1INCH': '0x111111111117dC0aa78b770fA6A738034120C302',
    GRT: '0xc944E90C64B2c07662A292be6244BDf05Cda44a7',
    ENS: '0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72',
    PEPE: '0x6982508145454Ce325dDbE47a25d4ec3d2311933',
    SHIB: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
    YFI: '0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e',
    BAL: '0xba100000625a3754423978a60c9317c58a424e3D',
    OMG: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
    LRC: '0xBBbbCA6A901c926F240b89EacB641d8Aec7AEafD',
    BAT: '0x0D8775F648430679A709E98d2b0Cb6250d2887EF',
    ZRX: '0xE41d2489571d322189246DaFA5ebDe1F4699F498',
  },
  bsc: {
    BNB: NATIVE_TOKEN_ADDRESS,
    WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
    CAKE: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
    BTCB: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
    ETH: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
    XRP: '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE',
    DOGE: '0xbA2aE424d960c26247Dd6c32edC70B295c744C43',
    ADA: '0x3EE2200Efb3400fAbb9AacF31297cBdD1d435D47',
    DOT: '0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402',
    FDUSD: '0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409',
    FLOKI: '0xfb5B838b6cfEEdC2873aB27866079AC55363D37E',
    BABYDOGE: '0xc748673057861a797275CD8A068AbB95A902e8de',
    XVS: '0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63',
    GMT: '0x3019BF2a2eF8040C242C9a4c5c4BD4C81678b2A1',
    SFP: '0xD41FDb03Ba84762dD66a0af1a6C8540FF1ba5dfb',
    ALPACA: '0x8F0528cE5eF7B51152A59745bEfDD91D97091d2F',
  },
  polygon: {
    MATIC: NATIVE_TOKEN_ADDRESS,
    WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    QUICK: '0xB5C064F955D8e7F38fE0460C556a72987494eE17',
    AAVE: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B',
    LINK: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39',
    UNI: '0xb33EaAd8d922B1083446DC23f610c2567fB5180f',
    SUSHI: '0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a',
    CRV: '0x172370d5Cd63279eFa6d502DAB29171933a610AF',
  },
  avalanche: {
    AVAX: NATIVE_TOKEN_ADDRESS,
    WAVAX: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    USDT: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
    USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    WETH: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB',
    JOE: '0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd',
    PNG: '0x60781C2586D68229fde47564546784ab3fACA982',
    GMX: '0x62edc0692BD897D2295872a9FFCac5425011c661',
    LINK: '0x5947BB275c521040051D82396192181b413227A3',
    AAVE: '0x63a72806098Bd3D9520cC43356dD78afe5D386D9',
  },
};

/**
 * Token decimals by chain
 * Note: Most ERC20 tokens use 18 decimals, but USDT/USDC use 6 on Ethereum
 */
export const TOKEN_DECIMALS: Record<string, Record<string, number>> = {
  ethereum: {
    ETH: 18,
    WETH: 18,
    USDT: 6,
    USDC: 6,
    DAI: 18,
    WBTC: 8,
    // Default to 18 for others
  },
  bsc: {
    BNB: 18,
    WBNB: 18,
    USDT: 18, // BSC uses 18 decimals for USDT
    USDC: 18, // BSC uses 18 decimals for USDC
    BUSD: 18,
    // Default to 18 for others
  },
  polygon: {
    MATIC: 18,
    WMATIC: 18,
    USDT: 6,
    USDC: 6,
    // Default to 18 for others
  },
  avalanche: {
    AVAX: 18,
    WAVAX: 18,
    USDT: 6,
    USDC: 6,
    // Default to 18 for others
  },
};

/**
 * Solana token mint addresses (for Jupiter integration)
 */
export const SOLANA_TOKENS: Record<string, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  SRM: 'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt',
  ORCA: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  PYTH: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
  SAMO: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  MNDE: 'MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey',
  HNT: 'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux',
  STEP: 'StepAscQoEioFxxWGnh2sLBDFp9d8rvKz2Yp39iDpyT',
};

/**
 * Solana token decimals
 */
export const SOLANA_DECIMALS: Record<string, number> = {
  SOL: 9,
  USDT: 6,
  USDC: 6,
  RAY: 6,
  SRM: 6,
  ORCA: 6,
  JUP: 6,
  BONK: 5,
  WIF: 6,
  PYTH: 6,
  SAMO: 9,
  MNDE: 9,
  HNT: 8,
  STEP: 9,
};

/**
 * Get token address for a chain
 */
export function getTokenAddress(
  chainName: string,
  symbol: string
): string | undefined {
  const chainTokens = TOKEN_ADDRESSES[chainName.toLowerCase()];
  return chainTokens?.[symbol.toUpperCase()];
}

/**
 * Get token decimals for a chain
 */
export function getTokenDecimals(
  chainName: string,
  symbol: string
): number {
  const chainDecimals = TOKEN_DECIMALS[chainName.toLowerCase()];
  return chainDecimals?.[symbol.toUpperCase()] ?? 18; // Default to 18
}

/**
 * Get all tokens for a chain
 */
export function getChainTokens(chainName: string): string[] {
  const chainTokens = TOKEN_ADDRESSES[chainName.toLowerCase()];
  return chainTokens ? Object.keys(chainTokens) : [];
}

/**
 * Check if token is native (ETH, BNB, MATIC, etc.)
 */
export function isNativeToken(chainName: string, symbol: string): boolean {
  const address = getTokenAddress(chainName, symbol);
  return address === NATIVE_TOKEN_ADDRESS;
}

/**
 * Common token list for UI display
 */
export const COMMON_TOKENS: TokenInfo[] = [
  // Ethereum
  { symbol: 'ETH', name: 'Ethereum', address: NATIVE_TOKEN_ADDRESS, decimals: 18, chainId: 1 },
  { symbol: 'USDT', name: 'Tether USD', address: TOKEN_ADDRESSES.ethereum.USDT, decimals: 6, chainId: 1 },
  { symbol: 'USDC', name: 'USD Coin', address: TOKEN_ADDRESSES.ethereum.USDC, decimals: 6, chainId: 1 },
  { symbol: 'DAI', name: 'Dai Stablecoin', address: TOKEN_ADDRESSES.ethereum.DAI, decimals: 18, chainId: 1 },
  { symbol: 'WBTC', name: 'Wrapped Bitcoin', address: TOKEN_ADDRESSES.ethereum.WBTC, decimals: 8, chainId: 1 },
  { symbol: 'LINK', name: 'Chainlink', address: TOKEN_ADDRESSES.ethereum.LINK, decimals: 18, chainId: 1 },
  { symbol: 'UNI', name: 'Uniswap', address: TOKEN_ADDRESSES.ethereum.UNI, decimals: 18, chainId: 1 },
  // BSC
  { symbol: 'BNB', name: 'BNB', address: NATIVE_TOKEN_ADDRESS, decimals: 18, chainId: 56 },
  { symbol: 'CAKE', name: 'PancakeSwap', address: TOKEN_ADDRESSES.bsc.CAKE, decimals: 18, chainId: 56 },
  // Polygon
  { symbol: 'MATIC', name: 'Polygon', address: NATIVE_TOKEN_ADDRESS, decimals: 18, chainId: 137 },
];

export default TOKEN_ADDRESSES;

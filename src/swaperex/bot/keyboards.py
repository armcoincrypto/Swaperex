"""Telegram keyboard builders."""

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, KeyboardButton


def main_menu_keyboard() -> ReplyKeyboardMarkup:
    """Create main menu keyboard."""
    keyboard = [
        [KeyboardButton(text="💰 Wallet"), KeyboardButton(text="💱 Swap")],
        [KeyboardButton(text="📥 Deposit"), KeyboardButton(text="📤 Withdraw")],
        [KeyboardButton(text="📊 History"), KeyboardButton(text="⚙️ Settings")],
    ]
    return ReplyKeyboardMarkup(keyboard=keyboard, resize_keyboard=True)


def asset_selection_keyboard(assets: list[str], callback_prefix: str) -> InlineKeyboardMarkup:
    """Create asset selection inline keyboard."""
    buttons = []
    row = []

    for i, asset in enumerate(assets):
        row.append(InlineKeyboardButton(text=asset, callback_data=f"{callback_prefix}:{asset}"))
        if len(row) == 3:
            buttons.append(row)
            row = []

    if row:
        buttons.append(row)

    buttons.append([InlineKeyboardButton(text="❌ Cancel", callback_data="cancel")])

    return InlineKeyboardMarkup(inline_keyboard=buttons)


def confirm_swap_keyboard(swap_id: str) -> InlineKeyboardMarkup:
    """Create swap confirmation keyboard."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ Confirm", callback_data=f"confirm_swap:{swap_id}"),
                InlineKeyboardButton(text="❌ Cancel", callback_data="cancel_swap"),
            ]
        ]
    )


def back_keyboard(callback_data: str = "back") -> InlineKeyboardMarkup:
    """Create a simple back button keyboard."""
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="⬅️ Back", callback_data=callback_data)]]
    )


def deposit_chain_keyboard() -> InlineKeyboardMarkup:
    """Create deposit chain selection keyboard.

    Deposit Dashboard with chain-specific options organized by network.
    """
    buttons = [
        [InlineKeyboardButton(
            text="🟠 Bitcoin Network (BTC, LTC, DASH...)",
            callback_data="deposit_chain:bitcoin"
        )],
        [InlineKeyboardButton(
            text="🔵 Ethereum (ETH, USDT, USDC...)",
            callback_data="deposit_chain:ethereum"
        )],
        [InlineKeyboardButton(
            text="🟡 BNB Chain (BNB, BUSD, CAKE...)",
            callback_data="deposit_chain:bnb"
        )],
        [InlineKeyboardButton(
            text="🔴 Tron (TRX, USDT-TRC20...)",
            callback_data="deposit_chain:tron"
        )],
        [InlineKeyboardButton(
            text="🟣 Solana (SOL, BONK, JUP...)",
            callback_data="deposit_chain:solana"
        )],
        [InlineKeyboardButton(
            text="🔷 Polygon (MATIC, USDT...)",
            callback_data="deposit_chain:polygon"
        )],
        [InlineKeyboardButton(
            text="🔺 Avalanche (AVAX, GMX...)",
            callback_data="deposit_chain:avalanche"
        )],
        [InlineKeyboardButton(
            text="⚛️ Cosmos (ATOM, OSMO, INJ...)",
            callback_data="deposit_chain:cosmos"
        )],
        [InlineKeyboardButton(
            text="🌐 Other L1s (TON, NEAR, XRP...)",
            callback_data="deposit_chain:other"
        )],
        [InlineKeyboardButton(text="❌ Cancel", callback_data="cancel")],
    ]

    return InlineKeyboardMarkup(inline_keyboard=buttons)


def deposit_asset_keyboard(chain: str = None) -> InlineKeyboardMarkup:
    """Create deposit asset selection keyboard.

    Args:
        chain: Optional chain filter for assets.

    Organized by chain (80+ coins total):
    - bitcoin: BTC, LTC, DASH, BCH, DOGE, ZEC, DGB, RVN, BTG, etc.
    - ethereum: ETH, USDT, USDC, DAI, WBTC, LDO, MKR, etc.
    - bnb: BNB, BUSD, CAKE, BTCB, FLOKI, etc.
    - tron: TRX, USDT-TRC20, BTT, JST, etc.
    - solana: SOL
    - other: AVAX, MATIC, ATOM, XRP
    """
    # Chain-specific asset lists
    chain_assets = {
        # Bitcoin Network (UTXO-based)
        "bitcoin": [
            "BTC", "LTC", "DASH", "BCH", "DOGE", "ZEC", "DGB", "RVN",
            "BTG", "NMC", "VIA", "SYS", "KMD", "XEC", "MONA", "FIO"
        ],
        # Ethereum Network (ERC-20)
        "ethereum": [
            "ETH", "USDT", "USDC", "DAI", "WBTC", "LINK", "UNI", "AAVE",
            "LDO", "MKR", "COMP", "SNX", "CRV", "SUSHI", "1INCH", "GRT",
            "ENS", "PEPE", "SHIB", "LRC", "BAT", "ZRX", "YFI", "BAL", "OMG"
        ],
        # BNB Chain (BEP-20)
        "bnb": [
            "BNB", "BUSD", "CAKE", "USDT-BEP20", "USDC-BEP20", "TUSD-BEP20",
            "FDUSD", "BTCB", "ETH-BEP20", "XRP-BEP20", "ADA-BEP20",
            "DOGE-BEP20", "DOT-BEP20", "LTC-BEP20", "SHIB-BEP20",
            "FLOKI", "BABYDOGE", "ALPACA", "XVS", "GMT", "SFP"
        ],
        # Tron Network (TRC-20)
        "tron": [
            "TRX", "USDT-TRC20", "USDC-TRC20", "TUSD-TRC20", "USDJ",
            "BTT", "JST", "SUN", "WIN", "NFT-TRC20", "APENFT",
            "BTC-TRC20", "ETH-TRC20", "LTC-TRC20", "DOGE-TRC20",
            "XRP-TRC20", "ADA-TRC20", "EOS-TRC20", "DOT-TRC20", "FIL-TRC20"
        ],
        # Solana (SPL tokens)
        "solana": [
            "SOL", "USDT-SOL", "USDC-SOL", "RAY", "SRM", "ORCA", "JUP",
            "BONK", "SAMO", "PYTH", "WIF", "MNDE", "STEP", "ATLAS",
            "POLIS", "SLND", "GMT-SOL", "AUDIO-SOL", "HNT"
        ],
        # Polygon Network
        "polygon": [
            "MATIC", "USDT-POLYGON", "USDC-POLYGON", "WETH-POLYGON",
            "QUICK", "AAVE-POLYGON"
        ],
        # Avalanche Network
        "avalanche": [
            "AVAX", "USDT-AVAX", "USDC-AVAX", "JOE", "PNG", "GMX"
        ],
        # Cosmos Ecosystem
        "cosmos": [
            "ATOM", "OSMO", "INJ", "TIA", "JUNO", "SCRT"
        ],
        # Other L1 Networks
        "other": [
            "XRP", "XLM", "TON", "NEAR", "KAS", "ICP", "ALGO",
            "EGLD", "HBAR", "VET", "FTM", "ROSE"
        ],
    }

    if chain and chain.lower() in chain_assets:
        assets = chain_assets[chain.lower()]
    else:
        # Default: show major coins
        assets = [
            "BTC", "ETH", "LTC",
            "DASH", "TRX", "BNB",
            "USDT", "USDC",
            "USDT-TRC20",
        ]
    return asset_selection_keyboard(assets, "deposit")


def withdraw_chain_keyboard() -> InlineKeyboardMarkup:
    """Create withdrawal chain selection keyboard."""
    buttons = [
        [InlineKeyboardButton(
            text="🟠 Bitcoin Network",
            callback_data="withdraw_chain:bitcoin"
        )],
        [InlineKeyboardButton(
            text="🔵 Ethereum",
            callback_data="withdraw_chain:ethereum"
        )],
        [InlineKeyboardButton(
            text="🟡 BNB Chain",
            callback_data="withdraw_chain:bnb"
        )],
        [InlineKeyboardButton(
            text="🔴 Tron",
            callback_data="withdraw_chain:tron"
        )],
        [InlineKeyboardButton(
            text="🟣 Solana",
            callback_data="withdraw_chain:solana"
        )],
        [InlineKeyboardButton(
            text="🔷 Polygon",
            callback_data="withdraw_chain:polygon"
        )],
        [InlineKeyboardButton(
            text="🔺 Avalanche",
            callback_data="withdraw_chain:avalanche"
        )],
        [InlineKeyboardButton(
            text="⚛️ Cosmos",
            callback_data="withdraw_chain:cosmos"
        )],
        [InlineKeyboardButton(
            text="🌐 Other L1s",
            callback_data="withdraw_chain:other"
        )],
        [InlineKeyboardButton(text="❌ Cancel", callback_data="cancel")],
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def withdraw_asset_keyboard(chain: str = None) -> InlineKeyboardMarkup:
    """Create withdrawal asset selection keyboard."""
    # Chain-specific asset lists (same as deposit)
    chain_assets = {
        "bitcoin": [
            "BTC", "LTC", "DASH", "BCH", "DOGE", "ZEC", "DGB", "RVN",
            "BTG", "NMC", "VIA", "SYS", "KMD", "XEC", "MONA", "FIO"
        ],
        "ethereum": [
            "ETH", "USDT", "USDC", "DAI", "WBTC", "LINK", "UNI", "AAVE",
            "LDO", "MKR", "COMP", "SNX", "CRV", "SUSHI", "1INCH", "GRT",
            "ENS", "PEPE", "SHIB", "LRC", "BAT", "ZRX", "YFI", "BAL", "OMG"
        ],
        "bnb": [
            "BNB", "BUSD", "CAKE", "USDT-BEP20", "USDC-BEP20", "TUSD-BEP20",
            "FDUSD", "BTCB", "ETH-BEP20", "XRP-BEP20", "ADA-BEP20",
            "DOGE-BEP20", "DOT-BEP20", "LTC-BEP20", "SHIB-BEP20",
            "FLOKI", "BABYDOGE", "ALPACA", "XVS", "GMT", "SFP"
        ],
        "tron": [
            "TRX", "USDT-TRC20", "USDC-TRC20", "TUSD-TRC20", "USDJ",
            "BTT", "JST", "SUN", "WIN", "NFT-TRC20", "APENFT",
            "BTC-TRC20", "ETH-TRC20", "LTC-TRC20", "DOGE-TRC20",
            "XRP-TRC20", "ADA-TRC20", "EOS-TRC20", "DOT-TRC20", "FIL-TRC20"
        ],
        "solana": [
            "SOL", "USDT-SOL", "USDC-SOL", "RAY", "SRM", "ORCA", "JUP",
            "BONK", "SAMO", "PYTH", "WIF", "MNDE", "STEP", "ATLAS",
            "POLIS", "SLND", "GMT-SOL", "AUDIO-SOL", "HNT"
        ],
        "polygon": [
            "MATIC", "USDT-POLYGON", "USDC-POLYGON", "WETH-POLYGON",
            "QUICK", "AAVE-POLYGON"
        ],
        "avalanche": [
            "AVAX", "USDT-AVAX", "USDC-AVAX", "JOE", "PNG", "GMX"
        ],
        "cosmos": [
            "ATOM", "OSMO", "INJ", "TIA", "JUNO", "SCRT"
        ],
        "other": [
            "XRP", "XLM", "TON", "NEAR", "KAS", "ICP", "ALGO",
            "EGLD", "HBAR", "VET", "FTM", "ROSE"
        ],
    }

    if chain and chain.lower() in chain_assets:
        assets = chain_assets[chain.lower()]
    else:
        assets = [
            "BTC", "ETH", "LTC",
            "DASH", "TRX", "BNB",
            "USDT", "USDC",
            "USDT-TRC20",
        ]
    return asset_selection_keyboard(assets, "withdraw")


def confirm_withdraw_keyboard(withdraw_id: str) -> InlineKeyboardMarkup:
    """Create withdrawal confirmation keyboard."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ Confirm", callback_data=f"confirm_withdraw:{withdraw_id}"),
                InlineKeyboardButton(text="❌ Cancel", callback_data="cancel_withdraw"),
            ]
        ]
    )


def swap_from_keyboard(chain: str = None) -> InlineKeyboardMarkup:
    """Create swap 'from' asset selection keyboard.

    Args:
        chain: Optional DEX/chain filter. If provided, shows only assets
               supported by that chain.

    Supported chains:
        - pancakeswap: BNB Chain tokens
        - uniswap: Ethereum tokens
        - thorchain: Cross-chain
        - jupiter: Solana tokens
        - osmosis: Cosmos ecosystem
        - quickswap: Polygon tokens
        - traderjoe: Avalanche tokens
        - sunswap: Tron tokens
        - stonfi: TON tokens
        - ref_finance: NEAR tokens
    """
    # Chain-specific asset lists
    chain_assets = {
        # BNB Chain - PancakeSwap
        "pancakeswap": [
            "BNB", "USDT", "USDC", "BUSD", "CAKE", "BTCB", "ETH",
            "XRP-BEP20", "DOGE-BEP20", "ADA-BEP20", "DOT-BEP20",
            "FDUSD", "FLOKI", "BABYDOGE", "XVS", "GMT", "SFP", "ALPACA"
        ],
        # Ethereum - Uniswap V3
        "uniswap": [
            "ETH", "USDT", "USDC", "DAI", "WBTC", "LINK", "UNI", "AAVE",
            "LDO", "MKR", "COMP", "SNX", "CRV", "SUSHI", "1INCH",
            "GRT", "ENS", "PEPE", "SHIB", "YFI", "BAL", "OMG", "LRC", "BAT", "ZRX"
        ],
        # Cross-Chain - THORChain
        "thorchain": [
            "BTC", "ETH", "BNB", "ATOM", "LTC", "DASH", "AVAX",
            "BCH", "DOGE", "RUNE"
        ],
        # Solana - Jupiter
        "jupiter": [
            "SOL", "USDT", "USDC", "RAY", "SRM", "ORCA", "JUP",
            "BONK", "WIF", "PYTH", "SAMO", "MNDE", "HNT"
        ],
        # Cosmos - Osmosis
        "osmosis": ["ATOM", "OSMO", "USDC", "JUNO", "INJ", "TIA", "SCRT", "STARS"],
        # Polygon - QuickSwap
        "quickswap": [
            "MATIC", "USDT", "USDC", "WETH", "QUICK", "AAVE",
            "LINK", "UNI", "SUSHI", "CRV"
        ],
        # Avalanche - TraderJoe
        "traderjoe": [
            "AVAX", "USDT", "USDC", "WETH", "JOE", "PNG", "GMX", "LINK", "AAVE"
        ],
        # Tron - SunSwap
        "sunswap": [
            "TRX", "USDT", "USDC", "BTT", "JST", "SUN", "WIN", "USDJ"
        ],
        # TON - STON.fi
        "stonfi": ["TON", "USDT", "USDC"],
        # NEAR - Ref Finance
        "ref_finance": ["NEAR", "USDT", "USDC"],
    }

    if chain and chain.lower() in chain_assets:
        assets = chain_assets[chain.lower()]
    else:
        # Default: show all major supported assets
        assets = [
            "BTC", "ETH", "BNB", "SOL",
            "LTC", "DASH", "TRX", "TON",
            "ATOM", "AVAX", "NEAR", "MATIC",
            "USDT", "USDC",
        ]
    return asset_selection_keyboard(assets, "swap_from")


def swap_to_keyboard(exclude_asset: str, chain: str = None) -> InlineKeyboardMarkup:
    """Create swap 'to' asset selection keyboard.

    Args:
        exclude_asset: Asset to exclude (the 'from' asset)
        chain: Optional DEX/chain filter for available assets
    """
    # Chain-specific asset lists (same as swap_from_keyboard)
    chain_assets = {
        # BNB Chain - PancakeSwap
        "pancakeswap": [
            "BNB", "USDT", "USDC", "BUSD", "CAKE", "BTCB", "ETH",
            "XRP-BEP20", "DOGE-BEP20", "ADA-BEP20", "DOT-BEP20",
            "FDUSD", "FLOKI", "BABYDOGE", "XVS", "GMT", "SFP", "ALPACA"
        ],
        # Ethereum - Uniswap V3
        "uniswap": [
            "ETH", "USDT", "USDC", "DAI", "WBTC", "LINK", "UNI", "AAVE",
            "LDO", "MKR", "COMP", "SNX", "CRV", "SUSHI", "1INCH",
            "GRT", "ENS", "PEPE", "SHIB", "YFI", "BAL", "OMG", "LRC", "BAT", "ZRX"
        ],
        # Cross-Chain - THORChain
        "thorchain": [
            "BTC", "ETH", "BNB", "ATOM", "LTC", "DASH", "AVAX",
            "BCH", "DOGE", "RUNE"
        ],
        # Solana - Jupiter
        "jupiter": [
            "SOL", "USDT", "USDC", "RAY", "SRM", "ORCA", "JUP",
            "BONK", "WIF", "PYTH", "SAMO", "MNDE", "HNT"
        ],
        # Cosmos - Osmosis
        "osmosis": ["ATOM", "OSMO", "USDC", "JUNO", "INJ", "TIA", "SCRT", "STARS"],
        # Polygon - QuickSwap
        "quickswap": [
            "MATIC", "USDT", "USDC", "WETH", "QUICK", "AAVE",
            "LINK", "UNI", "SUSHI", "CRV"
        ],
        # Avalanche - TraderJoe
        "traderjoe": [
            "AVAX", "USDT", "USDC", "WETH", "JOE", "PNG", "GMX", "LINK", "AAVE"
        ],
        # Tron - SunSwap
        "sunswap": [
            "TRX", "USDT", "USDC", "BTT", "JST", "SUN", "WIN", "USDJ"
        ],
        # TON - STON.fi
        "stonfi": ["TON", "USDT", "USDC"],
        # NEAR - Ref Finance
        "ref_finance": ["NEAR", "USDT", "USDC"],
    }

    if chain and chain.lower() in chain_assets:
        all_assets = chain_assets[chain.lower()]
    else:
        all_assets = [
            "BTC", "ETH", "BNB", "SOL",
            "LTC", "DASH", "TRX", "TON",
            "ATOM", "AVAX", "NEAR", "MATIC",
            "USDT", "USDC",
        ]
    assets = [a for a in all_assets if a != exclude_asset]
    return asset_selection_keyboard(assets, "swap_to")


def quote_comparison_keyboard(quotes: list[dict]) -> InlineKeyboardMarkup:
    """Create keyboard for comparing quotes from different providers."""
    buttons = []

    for i, quote in enumerate(quotes):
        provider = quote.get("provider", "unknown")
        to_amount = quote.get("to_amount", "?")
        fee = quote.get("fee_amount", "?")

        text = f"{provider}: {to_amount} (fee: ${fee})"
        buttons.append([InlineKeyboardButton(text=text, callback_data=f"select_quote:{i}")])

    buttons.append([InlineKeyboardButton(text="❌ Cancel", callback_data="cancel_swap")])

    return InlineKeyboardMarkup(inline_keyboard=buttons)


def swap_chain_keyboard() -> InlineKeyboardMarkup:
    """Create swap chain/DEX selection keyboard.

    Swap Dashboard with chain-specific DEXes:
    - BNB Chain: PancakeSwap
    - Ethereum: Uniswap V3
    - Cross-Chain: THORChain
    - Solana: Jupiter
    - Cosmos: Osmosis
    - Polygon: QuickSwap
    - Avalanche: TraderJoe
    - Tron: SunSwap
    - TON: STON.fi
    - NEAR: Ref Finance
    """
    buttons = [
        [InlineKeyboardButton(
            text="🟡 BNB Chain - PancakeSwap",
            callback_data="swap_chain:pancakeswap"
        )],
        [InlineKeyboardButton(
            text="🔵 Ethereum - Uniswap V3",
            callback_data="swap_chain:uniswap"
        )],
        [InlineKeyboardButton(
            text="🔗 Cross-Chain - THORChain",
            callback_data="swap_chain:thorchain"
        )],
        [InlineKeyboardButton(
            text="🟣 Solana - Jupiter",
            callback_data="swap_chain:jupiter"
        )],
        [InlineKeyboardButton(
            text="⚛️ Cosmos - Osmosis",
            callback_data="swap_chain:osmosis"
        )],
        [InlineKeyboardButton(
            text="💜 Polygon - QuickSwap",
            callback_data="swap_chain:quickswap"
        )],
        [InlineKeyboardButton(
            text="🔺 Avalanche - TraderJoe",
            callback_data="swap_chain:traderjoe"
        )],
        [InlineKeyboardButton(
            text="🔴 Tron - SunSwap",
            callback_data="swap_chain:sunswap"
        )],
        [InlineKeyboardButton(
            text="💎 TON - STON.fi",
            callback_data="swap_chain:stonfi"
        )],
        [InlineKeyboardButton(
            text="🌐 NEAR - Ref Finance",
            callback_data="swap_chain:ref_finance"
        )],
        [InlineKeyboardButton(text="❌ Cancel", callback_data="cancel_swap")],
    ]

    return InlineKeyboardMarkup(inline_keyboard=buttons)

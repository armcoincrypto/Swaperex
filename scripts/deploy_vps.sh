#!/bin/bash

# Swaperex VPS Deployment Script
# Run this on your VPS to deploy the bot alongside MM2

set -e

echo "=== Swaperex VPS Deployment ==="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root"
    exit 1
fi

# Install dependencies
echo "Installing system dependencies..."
apt-get update
apt-get install -y python3.11 python3.11-venv python3-pip git

# Create app directory
APP_DIR="/root/swaperex"
mkdir -p "$APP_DIR"
cd "$APP_DIR"

# Clone or update repo
if [ -d ".git" ]; then
    echo "Updating existing repo..."
    git pull origin main
else
    echo "Cloning repository..."
    git clone https://github.com/armcoincrypto/Swaperex.git .
fi

# Create virtual environment
echo "Setting up Python environment..."
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -e .

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cat > .env << 'ENVEOF'
# Swaperex Configuration

# Telegram Bot Token (from @BotFather)
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Admin Telegram IDs
ADMIN_USER_IDS=123456789
ADMIN_TELEGRAM_ID=123456789

# Environment
SWAPEREX_ENV=production
DEBUG=false
DRY_RUN=false

# MM2 (localhost - same VPS)
MM2_RPC_URL=http://127.0.0.1:7762
MM2_USERPASS=Testpass123#

# DASH XPUB
XPUB_DASH=xpub6C8NFKQJqBVnJVWdovEGBnfyA6eCcN6QxRte4ZC2XWoj9q8zokaAf1SMDmGpEMGkDgCCuzpqykLAz4im6jKbCNHTFdnfytzyZYcY4awucs8
ENVEOF

    echo ""
    echo "IMPORTANT: Edit .env and set your TELEGRAM_BOT_TOKEN!"
    echo "  nano $APP_DIR/.env"
fi

# Create systemd service
echo "Creating systemd service..."
cat > /etc/systemd/system/swaperex.service << 'SVCEOF'
[Unit]
Description=Swaperex Telegram Bot
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/swaperex
Environment=PATH=/root/swaperex/venv/bin
ExecStart=/root/swaperex/venv/bin/python -m swaperex.bot
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Next steps:"
echo "1. Edit .env with your Telegram bot token:"
echo "   nano $APP_DIR/.env"
echo ""
echo "2. Make sure MM2 is running:"
echo "   cd /root/mm2_setup && ./kdf &"
echo ""
echo "3. Activate coins in MM2:"
echo "   ./activate_coins.sh"
echo ""
echo "4. Start the bot:"
echo "   systemctl start swaperex"
echo "   systemctl enable swaperex  # auto-start on boot"
echo ""
echo "5. Check logs:"
echo "   journalctl -u swaperex -f"
echo ""
